/**
 * ============================================================================
 * VERSION B: CHECKBOX COLUMN (Clear & Explicit)
 * - Dedicated first column for exclusion checkboxes
 * - Clear visual state with checkboxes
 * - Traditional, familiar UI pattern
 * ============================================================================
 */

"use strict";

window.RenderTableUI = {
    renderContainersTable
};

function renderContainersTable({
    containers,
    portsByContainer,
    actionsByContainer,
    categoryOverrides,
    isExecuting,
    CONF_OVERRIDE_THRESHOLD,
    plan,
    renderPorts
}) {
    // FIX: Use correct method name getExcluded() not getExclusions()
    const excludedArray = window.ExclusionManager?.getExcluded() || [];
    const exclusions = new Set(excludedArray);
    
    let html = `
<div class="panel">
<table>
<thead>
<tr>
  <th class="exclude-column-header">
    <div class="exclude-header-content">
      <span>🚫</span>
      <span>EXCLUDE</span>
    </div>
  </th>
  <th>Apply</th>
  <th>Container</th>
  <th>Category</th>
  <th>Confidence</th>
  <th>Ports<br><span style="font-size:10px;opacity:0.7;font-weight:400;">Host:Container/Proto</span></th>
  <th>Status</th>
</tr>
</thead>
<tbody>
`;

    for (const c of containers) {
        const name = c.name;
        const actions = actionsByContainer[name] || [];
        const ports = portsByContainer[name] || [];
        const isExcluded = exclusions.has(name);

        const override = categoryOverrides[name];
        const confidence = override ? 1.0 : c.confidence;

        const blocking = actions.find(a => 
            a.policyContext?.status === "blocking"
        );
        const enforceable = actions.find(a => 
            a.policyContext?.status === "enforceable-opt-in"
        );
        const policyInfo = actions.find(a => 
            a.policyContext?.status === "present-not-enforced"
        );

        let statusText = "OK";
        let statusClass = "status-ok";
        let title = "";

        if (blocking) {
            statusText = "Manual review";
            statusClass = "status-error";
            title = formatPolicyTitle(blocking);
        } else if (enforceable) {
            statusText = "Policy (opt-in)";
            statusClass = "status-warn";
            title = formatPolicyTitle(enforceable);
        } else if (policyInfo) {
            statusText = "Policy present";
            statusClass = "status-info";
            title = formatPolicyTitle(policyInfo);
        }

        const showCheckbox =
            !blocking &&
            enforceable &&
            enforceable.policyContext?.enforceable === true &&
            !isExecuting &&
            !isExcluded;

        const applyCell = showCheckbox
            ? `<input type="checkbox"
                     class="apply-box"
                     data-container="${name}"
                     title="Allow policy enforcement for this container"
                     onchange="window.setPolicyEnforcementIntent('${name}', this.checked)">`
            : "";

        const confHtml = renderConfidenceCell({
            name,
            confidence,
            override,
            CONF_OVERRIDE_THRESHOLD
        });

        // VERSION B: Dedicated checkbox column
        // FIX: Use correct method name toggle() not toggleExclusion()
        const excludeCheckbox = `
            <input type="checkbox" 
                   class="exclude-checkbox"
                   ${isExcluded ? 'checked' : ''}
                   onchange="window.ExclusionManager.toggle('${name}')"
                   title="${isExcluded ? 'Click to include in automation' : 'Click to exclude from automation'}">
        `;

        html += `
<tr data-category="${c.category}" data-container="${name}" class="${isExcluded ? 'row-excluded' : ''}">
  <td class="exclude-column">${excludeCheckbox}</td>
  <td>${applyCell}</td>
  <td><strong>${name}</strong></td>
  <td>${c.category}</td>
  <td>${confHtml}</td>
  <td class="container-ports">${renderPorts(ports, c)}</td>
  <td class="${statusClass}" title="${escape(title)}">
    ${statusText}
  </td>
</tr>
`;
    }

    html += `
</tbody>
</table>
</div>
`;

    return html;
}

function renderConfidenceCell({
    name,
    confidence,
    override,
    CONF_OVERRIDE_THRESHOLD
}) {
    if (override) {
        return `
<span class="conf-high"
      style="cursor:pointer; text-decoration:underline;"
      title="User override applied - Click to change"
      onclick="window.CategoryOverridesUI.openCategoryOverride('${name}', event)">
  1.00*
</span>`;
    }

    if (confidence === null || confidence === undefined) {
        return clickable("—", name);
    }

    const cls =
        confidence >= CONF_OVERRIDE_THRESHOLD
            ? "conf-high"
            : confidence >= 0.7
                ? "conf-med"
                : "conf-low";

    return clickable(confidence.toFixed(2), name, cls);
}

function clickable(text, name, cls = "conf-med") {
    return `
<span class="${cls}"
      style="cursor:pointer; text-decoration:underline;"
      title="Click to override classification"
      onclick="window.CategoryOverridesUI.openCategoryOverride('${name}', event)">
  ${text}
</span>`;
}

function formatPolicyTitle(action) {
    const parts = [];
    const ctx = action.policyContext || {};
    
    if (ctx.id) parts.push(`Policy: ${ctx.id}`);
    if (ctx.status) parts.push(`Status: ${ctx.status}`);
    if (ctx.reason) parts.push(`Reason: ${ctx.reason}`);
    if (typeof ctx.confidenceUsed === "number") {
        parts.push(`Confidence: ${ctx.confidenceUsed.toFixed(2)}`);
    }
    
    return parts.join(" • ");
}

function escape(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
