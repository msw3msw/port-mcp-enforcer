/**
 * ============================================================================
 * Port-MCP Enforcer — Diff Renderer (READ-ONLY)
 * Location: src/planner/output/diff-renderer.js
 *
 * Responsibility:
 * - Render a preview of proposed plan changes
 * - NO execution
 * - NO mutation
 * ============================================================================
 */

"use strict";

module.exports = function renderDiff(plan) {
    if (!plan || !Array.isArray(plan.actions)) {
        throw new Error("Diff renderer requires a plan with actions[]");
    }

    console.log("\n=== Proposed Changes (DIFF / DRY-RUN) ===\n");

    if (plan.actions.length === 0) {
        console.log("No changes proposed.");
        return;
    }

    plan.actions.forEach((a, i) => {
        console.log(`${i + 1}. ${a.type}`);
        console.log(`   container : ${a.container}`);
        if (a.reason) console.log(`   reason    : ${a.reason}`);
        if (a.from !== undefined) console.log(`   from      : ${a.from}`);
        if (a.to !== undefined) console.log(`   to        : ${a.to}`);
        console.log();
    });

    console.log("NOTE: Preview only. No changes have been made.\n");
};
