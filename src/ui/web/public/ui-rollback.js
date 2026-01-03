/**
 * ============================================================================
 * Port-MCP Enforcer — Rollback UI (CLIENT-SIDE ONLY)
 * Location: src/ui/web/public/ui-rollback.js
 *
 * Responsibility:
 * - Render rollback preview UI
 * - Call rollback preview API
 * - Display rollback intent (read-only)
 *
 * HARD RULES:
 * - NO require()
 * - NO planner access
 * - NO Docker access
 * - Browser-only
 * ============================================================================
 */

"use strict";

(function () {

    /**
     * Render rollback preview section for the last execution job.
     * Called by app.js if present.
     */
    function renderRollbackPreviewSection(lastJob) {
        if (!lastJob || !lastJob.id || lastJob.kind === "rollback") {
            return "";
        }

        return `
<div class="panel rollback-panel">
  <h3>Rollback</h3>
  <p style="font-size:12px; opacity:0.85;">
    Generate a rollback plan that restores container ports to their
    pre-execution state. This is a preview only.
  </p>

  <button onclick="generateRollbackPlan('${lastJob.id}')">
    Generate Rollback Plan
  </button>

  <div id="rollback-preview-${lastJob.id}"
       style="margin-top:10px; font-size:13px;">
  </div>
</div>
`;
    }

    /**
     * Fetch rollback plan preview and render it.
     */
    async function generateRollbackPlan(jobId) {
        const slot = document.getElementById(`rollback-preview-${jobId}`);
        if (!slot) return;

        slot.innerHTML = "<em>Generating rollback plan…</em>";

        try {
            const res = await fetch("/api/rollback/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Rollback preview failed");
            }

            const payload = await res.json();

            const actions = Array.isArray(payload.actions)
                ? payload.actions
                : [];

            if (actions.length === 0) {
                slot.innerHTML = "<em>No rollback actions required.</em>";
                return;
            }

            slot.innerHTML = `
<strong>Rollback actions (preview):</strong>
<ul style="margin:6px 0 0 18px; padding:0;">
  ${actions.map(a => `
    <li>
      <code>${a.type}</code>
      <strong>${a.container}</strong>
      ${a.protocol}
      ${a.from} → ${a.to}
    </li>
  `).join("")}
</ul>
`;
        } catch (err) {
            slot.innerHTML =
                `<span style="color:#e74c3c;">${err.message}</span>`;
        }
    }

    // Expose minimal globals for app.js
    window.renderRollbackPreviewSection = renderRollbackPreviewSection;
    window.generateRollbackPlan = generateRollbackPlan;

})();
