"use strict";

const HOST_IP = "192.168.0.100";
const LOW_CONFIDENCE = 0.4;
const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";

let lastScanData = null;
let isExecuting = false;
let lastExecutionResult = null;
let activeJobId = null;
let eventSource = null;

/**
 * UI-only, per-session category overrides.
 */
const categoryOverrides = {};

/* ============================================================================
   Scan + render
============================================================================ */

async function scan() {
    const out = document.getElementById("output");
    out.textContent = "Scanning Docker...";

    const res = await fetch("/api/scan");
    const data = await res.json();

    lastScanData = data;
    renderTable();
}

function renderTable() {
    if (!lastScanData) {
        document.getElementById("output").textContent = "No scan data.";
        return;
    }

    const data = lastScanData;
    const containers = data.classification?.containers || [];
    const actions = data.plan?.actions || [];
    const stateContainers = data.state?.containers || [];

    const actionsByContainer = {};
    for (const a of actions) {
        if (!actionsByContainer[a.container]) {
            actionsByContainer[a.container] = [];
        }
        actionsByContainer[a.container].push(a);
    }

    const portsByContainer = {};
    const ports = data.state?.ports || [];
    for (const p of ports) {
        if (!portsByContainer[p.container]) {
            portsByContainer[p.container] = [];
        }
        portsByContainer[p.container].push(p);
    }

    const networksByContainer = {};
    for (const c of stateContainers) {
        networksByContainer[c.name] = Array.isArray(c.networks)
            ? c.networks
            : [];
    }

    let html = `
<table border="1" cellpadding="6" cellspacing="0">
<thead>
<tr>
  <th>Apply</th>
  <th>Container</th>
  <th>Category</th>
  <th>Confidence</th>
  <th>Ports</th>
  <th>Networks</th>
  <th>Status</th>
</tr>
</thead>
<tbody>
`;

    for (const c of containers) {
        const name = c.name;
        const effectiveCategory = categoryOverrides[name] || c.category;
        const effectiveConfidence =
            categoryOverrides[name] ? 1.0 : c.confidence;

        const containerActions = actionsByContainer[name] || [];
        const containerPorts = portsByContainer[name] || [];
        const containerNetworks = networksByContainer[name] || [];

        const hasPlan = containerActions.length > 0;

        const checkbox =
            hasPlan && !isExecuting
                ? `<input type="checkbox"
                           class="apply-box"
                           data-container="${name}">`
                : "";

        html += `
<tr>
  <td align="center">${checkbox}</td>
  <td>${name}</td>
  <td>${effectiveCategory}</td>
  <td>${effectiveConfidence.toFixed(2)}</td>
  <td>${renderPorts(containerPorts)}</td>
  <td>${
      containerNetworks.length
          ? containerNetworks.map(n => n.name).join(", ")
          : "-"
  }</td>
  <td>${hasPlan ? "🛠 Plan" : "OK"}</td>
</tr>
`;
    }

    html += `
</tbody>
</table>

<br>

<div>
  <label>
    <input type="checkbox" id="dryRunOnly" ${isExecuting ? "disabled" : ""}>
    Dry-run only (no Docker changes)
  </label>
</div>

<div>
  <label>
    <input type="checkbox" id="allowMutation" ${isExecuting ? "disabled" : ""}>
    Allow Docker mutation
  </label>
</div>

<div>
  <input type="text"
         id="confirmText"
         placeholder="${CONFIRM_PHRASE}"
         size="42"
         ${isExecuting ? "disabled" : ""}>
</div>

<br>

<button onclick="applySelected()" ${isExecuting ? "disabled" : ""}>
  ${isExecuting ? "Executing..." : "Apply Selected"}
</button>
`;

    if (activeJobId) {
        html += `
<hr>
<h3>Execution Progress</h3>
<div id="job-events"
     style="border:1px solid #ccc; padding:8px; max-height:240px; overflow:auto; font-family:monospace; font-size:12px;">
</div>
`;
    }

    if (lastExecutionResult) {
        html += `
<hr>
<h3>Last Execution Result</h3>
<pre>${JSON.stringify(lastExecutionResult, null, 2)}</pre>
`;
    }

    document.getElementById("output").innerHTML = html;
}

/* ============================================================================
   Helpers
============================================================================ */

function renderPorts(ports) {
    if (!ports.length) return "-";

    return ports
        .map(p => {
            const label = `${p.host}:${p.container}/${p.protocol}`;
            if (p.protocol === "tcp") {
                return `<a href="http://${HOST_IP}:${p.host}" target="_blank">${label}</a>`;
            }
            return label;
        })
        .join("<br>");
}

function appendJobEvent(evt) {
    const box = document.getElementById("job-events");
    if (!box) return;

    const line = document.createElement("div");
    line.textContent = `[${evt.type}] ${evt.container || ""} ${evt.actionType || ""} ${evt.error || ""}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
}

/* ============================================================================
   Apply + SSE wiring
============================================================================ */

async function applySelected() {
    const selectedContainers = Array.from(
        document.querySelectorAll(".apply-box:checked")
    ).map(cb => cb.dataset.container);

    if (!selectedContainers.length) {
        alert("No containers selected.");
        return;
    }

    const dryRun = document.getElementById("dryRunOnly")?.checked;
    const allowDockerMutation =
        document.getElementById("allowMutation")?.checked;

    if (!dryRun && !allowDockerMutation) {
        alert("Docker mutation must be explicitly allowed.");
        return;
    }

    const confirmText = document.getElementById("confirmText")?.value || "";
    if (confirmText !== CONFIRM_PHRASE) {
        alert("Typed confirmation phrase does not match.");
        return;
    }

    isExecuting = true;
    lastExecutionResult = null;
    activeJobId = null;
    renderTable();

    const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            selectedContainers,
            categoryOverrides,
            allowDockerMutation,
            dryRun,
            confirmPhrase: confirmText
        })
    });

    const { jobId } = await res.json();
    activeJobId = jobId;
    renderTable();

    // Open SSE stream
    eventSource = new EventSource(`/api/jobs/${jobId}/events`);

    eventSource.onmessage = (e) => {
        const evt = JSON.parse(e.data);
        appendJobEvent(evt);

        if (evt.type === "job:stored" || evt.type === "job:complete") {
            eventSource.close();
            eventSource = null;
            activeJobId = null;
            isExecuting = false;

            // Refresh state after completion
            scan();
        }
    };

    eventSource.onerror = () => {
        eventSource.close();
        eventSource = null;
        isExecuting = false;
        scan();
    };
}

/* ============================================================================
   Auto-start scan
============================================================================ */

window.addEventListener("load", scan);
