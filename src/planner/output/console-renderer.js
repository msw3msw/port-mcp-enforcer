/**
 * ============================================================================
 * Port-MCP Enforcer — Console Output Renderer
 * Location: src/planner/output/console-renderer.js
 *
 * Responsibility:
 * - Render a human-readable plan summary
 * - NO mutation
 * - NO execution
 * ============================================================================
 */

"use strict";

function renderAction(action, idx) {
    const base =
        `${String(idx + 1).padStart(2, " ")}. ` +
        `${action.type.padEnd(20)} ` +
        `${action.container}`;

    if (action.reason) {
        return base + `\n    Reason    : ${action.reason}` +
            (action.confidence !== undefined
                ? `\n    Confidence: ${action.confidence}`
                : "");
    }

    return base;
}

module.exports = function renderConsole(plan) {
    if (!plan || typeof plan !== "object") {
        throw new Error("Console renderer requires a plan object");
    }

    console.log("\n=== Port-MCP Enforcer — Proposed Plan (DRY-RUN) ===\n");

    if (plan.summary) {
        console.log(plan.summary);
        console.log();
    }

    if (!Array.isArray(plan.actions) || plan.actions.length === 0) {
        console.log("No actions proposed.");
        return;
    }

    console.log(`Proposed actions (${plan.actionCount}):\n`);

    plan.actions.forEach((a, i) => {
        console.log(renderAction(a, i));
        console.log();
    });

    console.log("NOTE: This is a dry-run only. No changes have been made.\n");
};
