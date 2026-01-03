/**
 * ============================================================================
 * Port-MCP Enforcer â€” Web UI Controller
 * Location: src/ui/web/public/app.js
 *
 * Responsibility:
 * - Orchestrate Scan â†’ Plan â†’ Apply
 * - Wire UI helpers
 *
 * HARD RULES:
 * - UI only
 * - No planner logic
 * - No silent refactors
 * ============================================================================
 */

"use strict";

const HOST_IP = "192.168.0.100";
const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";
const CONF_OVERRIDE_THRESHOLD = 0.9;

let lastScanData = null;
let lastPlanData = null;
let lastExecutionJobs = new Map(); // Track completed jobs for history tab

let isExecuting = false;
let activeJobId = null;
let lastExecutionJob = null;
let liveEvents = [];

/* ============================================================================
   STEP 4C â€” Policy Enforcement Intent (UI-only, non-executing)
============================================================================ */

window.__policyEnforcementIntent = window.__policyEnforcementIntent || {};

window.PolicyEnforcementUI = {
    getIntent() {
        return window.__policyEnforcementIntent || {};
    },
    isEnforced(containerName) {
        return window.__policyEnforcementIntent?.[containerName] === true;
    },
    set(containerName, enabled) {
        if (!containerName) return;
        if (enabled) window.__policyEnforcementIntent[containerName] = true;
        else delete window.__policyEnforcementIntent[containerName];
        plan().catch(() => {});
    },
    clearAll() {
        window.__policyEnforcementIntent = {};
        plan().catch(() => {});
    },
    count() {
        return Object.keys(window.__policyEnforcementIntent || {}).length;
    }
};

window.setPolicyEnforcementIntent = (name, enabled) =>
    window.PolicyEnforcementUI.set(name, enabled);
window.clearPolicyEnforcementIntent = () =>
    window.PolicyEnforcementUI.clearAll();

/* ============================================================================
   Scan â†’ Plan â†’ Render
============================================================================ */

async function scan() {
    await CategoryOverridesUI.loadPersistedOverrides();

    const out = document.getElementById("output");
    if (out) out.textContent = "Scanning Docker...";

    const res = await fetch("/api/scan");
    lastScanData = await res.json();

    // Also fetch recent jobs for history tab
    await fetchRecentJobs();

    await plan();
}

async function fetchRecentJobs() {
    try {
        // This endpoint would need to be added to server.js
        // For now, we'll track jobs from apply operations
        // In a real implementation, server would expose GET /api/jobs endpoint
    } catch (err) {
        console.log('Could not fetch job history:', err);
    }
}

async function plan() {
    const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            categoryOverrides: CategoryOverridesUI.categoryOverrides,
            policyEnforcement: window.__policyEnforcementIntent
        })
    });

    lastPlanData = await res.json();
    render();
}

/* ============================================================================
   Render
============================================================================ */

function render() {
    const out = document.getElementById("output");
    if (!out || !lastScanData || !lastPlanData) {
        if (out) out.textContent = "No data.";
        return;
    }

    const containers = lastScanData.containers.map(c => ({
        name: c.name || c.container || c.id || "(unknown)",
        category: lastPlanData.classification?.[c.name]?.category || "unknown",
        confidence: lastPlanData.classification?.[c.name]?.confidence ?? null,
        _raw: c
    }));

    const planObj = lastPlanData.plan || {};
    const actions = Array.isArray(planObj.actions) ? planObj.actions : [];

    const actionsByContainer = {};
    for (const a of actions) {
        if (!a?.container) continue;
        (actionsByContainer[a.container] ||= []).push(a);
    }

    const portsByContainer = {};
    for (const p of lastScanData.ports || []) {
        if (!p?.container) continue;
        (portsByContainer[p.container] ||= []).push(p);
    }

    // Filter out standardized containers from Overview
    let containersForOverview = containers;
    
    if (window.StandardizedTabUI) {
        const standardizedContainers = window.StandardizedTabUI.getStandardizedContainers(
            containers,
            portsByContainer,
            CategoryOverridesUI.categoryOverrides
        );
        
        const standardizedNames = new Set(standardizedContainers.map(c => c.name));
        containersForOverview = containers.filter(c => !standardizedNames.has(c.name));
    }

    // Render tab bar
    const tabBar = window.TabsUI ? window.TabsUI.renderTabBar() : '';
    
    // Render content based on active tab
    let content = '';
    
    if (!window.TabsUI || window.TabsUI.currentTab === 'overview') {
        // OVERVIEW TAB - Container table (excluding standardized)
        const leftHtml = RenderTableUI.renderContainersTable({
            containers: containersForOverview,  // Filtered list
            portsByContainer,
            actionsByContainer,
            categoryOverrides: CategoryOverridesUI.categoryOverrides,
            isExecuting,
            CONF_OVERRIDE_THRESHOLD,
            plan: planObj,
            renderPorts,
            openConfidenceOverride: CategoryOverridesUI.openCategoryOverride
        });

        /* ============================
           Apply button gating + reason
        ============================ */

        // Get selected container names
        const selectedContainers = new Set(
            Object.keys(window.__policyEnforcementIntent || {}).filter(
                k => window.__policyEnforcementIntent[k] === true
            )
        );

        // Only check executable/blocking status for SELECTED containers
        const selectedActions = actions.filter(a => 
            selectedContainers.has(a.container)
        );

        const hasExecutable = selectedActions.some(a => a.executable === true);
        const hasBlockingManual = selectedActions.some(
            a => a.executable === false && a.type !== "no-op"
        );

        let applyDisabled = false;
        let applyTitle = "";

        if (isExecuting) {
            applyDisabled = true;
            applyTitle = "Execution in progress";
        } else if (selectedContainers.size === 0) {
            applyDisabled = true;
            applyTitle = "No containers selected for enforcement";
        } else if (!hasExecutable) {
            applyDisabled = true;
            applyTitle = "Selected containers have no executable actions";
        } else if (hasBlockingManual) {
            applyDisabled = true;
            applyTitle =
                "Apply disabled: selected containers require manual review";
        }

        const enforcementCount = PolicyEnforcementUI.count();

        const rightHtml = `
<div class="panel">
  <h3>Execution Gates</h3>
  <div class="gates">
    <label><input type="checkbox" id="dryRunOnly"> Dry-run only</label>
    <label><input type="checkbox" id="allowMutation"> Apply planned changes</label>
    <input type="text" id="confirmText" placeholder="${CONFIRM_PHRASE}" size="36">
  </div>

  ${selectedContainers.size > 0 ? `
  <div style="margin: 12px 0; padding: 12px; background: rgba(88, 166, 255, 0.1); border: 1px solid rgba(88, 166, 255, 0.3); border-radius: 6px; font-size: 12px;">
    <strong style="color: #58a6ff;">Ready to execute:</strong>
    <div style="margin-top: 6px;">
      ${Array.from(selectedContainers).map(name => `
        <div style="color: #e6edf3; margin: 2px 0;">• ${name}</div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <button class="primary"
          onclick="applySelected()"
          ${applyDisabled ? "disabled" : ""}
          title="${applyTitle}">
    Apply Selected ${selectedContainers.size > 0 ? `(${selectedContainers.size})` : ''}
  </button>
</div>

<div class="panel">
  <h3>Policy Enforcement (Intent Only)</h3>
  <div style="font-size: 13px;">
    Selected for enforcement: <strong>${enforcementCount}</strong>
  </div>
  <div style="margin-top: 8px;">
    <button onclick="clearPolicyEnforcementIntent()"
            ${enforcementCount ? "" : "disabled"}>
      Clear enforcement intent
    </button>
  </div>
  <div style="margin-top: 6px; font-size: 12px; opacity: 0.8;">
    This does not apply changes. It only records intent.
  </div>
</div>
`;

        content = Layout.render({ left: leftHtml, right: rightHtml });
        
    } else if (window.TabsUI && window.TabsUI.currentTab === 'standardized') {
        // STANDARDIZED TAB - Show compliant containers only
        if (window.StandardizedTabUI) {
            content = window.StandardizedTabUI.renderStandardizedTab(
                containers,
                portsByContainer,
                CategoryOverridesUI.categoryOverrides,
                renderPorts
            );
        } else {
            content = '<div class="panel">Standardized tab not loaded</div>';
        }
        
    } else if (window.TabsUI && window.TabsUI.currentTab === 'history') {
        // HISTORY TAB - Show execution history with rollback options
        const historyHtml = window.TabsUI.renderHistoryView(
            lastExecutionJobs || new Map(),
            containers
        );
        content = historyHtml;
    }

    out.innerHTML = tabBar + content;
}

/* ============================================================================
   Helpers
============================================================================ */

function renderPorts(ports) {
    if (!ports || !ports.length) return "-";

    return ports.map(p => {
        const host = p.host || '?';
        const container = p.containerPort || '?';
        const proto = p.protocol || 'tcp';
        
        // Format: host:container/proto with tooltip
        const label = `<span style="color:#39d0d8;font-weight:600;">${host}</span>:<span style="color:#8b949e;">${container}</span>/<span style="opacity:0.7;font-size:11px;">${proto}</span>`;
        
        const title = `External: ${host} → Container: ${container} (${proto.toUpperCase()})`;
        
        return proto === "tcp"
            ? `<a href="http://${HOST_IP}:${host}" target="_blank" title="${title}">${label}</a>`
            : `<span title="${title}">${label}</span>`;
    }).join("<br>");
}

/* ============================================================================
   Apply
============================================================================ */

async function applySelected() {
    // Get selected containers from enforcement intent (not checkboxes)
    const selectedContainers = Object.keys(
        window.__policyEnforcementIntent || {}
    ).filter(name => window.__policyEnforcementIntent[name] === true);

    if (!selectedContainers.length) {
        alert("No containers selected.");
        return;
    }

    const dryRun = document.getElementById("dryRunOnly")?.checked;
    const allowDockerMutation = document.getElementById("allowMutation")?.checked;

    if (!dryRun && !allowDockerMutation) {
        alert("Planned changes must be explicitly allowed.");
        return;
    }

    const confirmText = document.getElementById("confirmText")?.value || "";
    if (confirmText !== CONFIRM_PHRASE) {
        alert("Typed confirmation phrase does not match.");
        return;
    }

    isExecuting = true;
    render();

    const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            selectedContainers,
            categoryOverrides: CategoryOverridesUI.categoryOverrides,
            policyEnforcement: window.__policyEnforcementIntent,
            allowDockerMutation,
            dryRun,
            confirmPhrase: confirmText
        })
    });

    const payload = await res.json();
    if (!payload?.jobId) {
        isExecuting = false;
        alert("Apply failed.");
        render();
        return;
    }

    activeJobId = payload.jobId;
    
    // Poll for job completion
    await pollJobCompletion(payload.jobId);
}

async function pollJobCompletion(jobId) {
    // Use SSE for live updates
    const eventSource = new EventSource(`/api/jobs/${jobId}/events`);
    
    eventSource.onmessage = (event) => {
        const evt = JSON.parse(event.data);
        console.log('[Job Event]', evt);
        
        // Update UI with progress
        if (evt.type === 'action:start') {
            console.log(`Executing action ${evt.index + 1}/${evt.total}: ${evt.actionType} on ${evt.container}`);
        }
        
        if (evt.type === 'job:completed') {
            eventSource.close();
            handleJobComplete(jobId, 'completed');
        }
        
        if (evt.type === 'job:failed') {
            eventSource.close();
            handleJobComplete(jobId, 'failed', evt.error);
        }
    };
    
    eventSource.onerror = () => {
        eventSource.close();
        // Fallback to polling
        pollJobCompletionFallback(jobId);
    };
}

async function pollJobCompletionFallback(jobId) {
    const maxAttempts = 60;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        try {
            const res = await fetch(`/api/jobs/${jobId}`);
            const job = await res.json();
            
            if (job.status === 'completed') {
                handleJobComplete(jobId, 'completed');
                return;
            }
            
            if (job.status === 'failed') {
                handleJobComplete(jobId, 'failed', job.error);
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            
        } catch (err) {
            console.error('Job polling error:', err);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    isExecuting = false;
    alert('Job execution timeout - check server logs');
    await scan();
}

async function handleJobComplete(jobId, status, error = null) {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    
    // Store completed job for history tab
    lastExecutionJobs.set(jobId, job);
    
    isExecuting = false;
    
    if (status === 'completed') {
        alert(`Execution completed!\n\nJob ID: ${jobId}\n\nRefresh to see changes.`);
    } else {
        alert(`Execution failed!\n\nError: ${error || 'Unknown error'}`);
    }
    
    // Refresh data
    await scan();
}

/* ============================================================================
   Auto-start
============================================================================ */

window.addEventListener("load", scan);
