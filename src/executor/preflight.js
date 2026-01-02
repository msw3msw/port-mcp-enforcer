/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Preflight (READ-ONLY)
 * Location: src/executor/preflight.js
 *
 * Responsibility:
 * - Validate plan safety before execution
 * - NO mutation
 * ============================================================================
 */

"use strict";

module.exports = async function preflight(plan) {
    if (!Array.isArray(plan.actions)) {
        throw new Error("Invalid plan: actions[] missing");
    }

    const allowedTypes = [
        "review-game-ports",
        "manual-review",
        "reserve-port",
        "release-port",
        "update-container-ports"
    ];

    for (const a of plan.actions) {
        if (!allowedTypes.includes(a.type)) {
            throw new Error(`Unsupported action type: ${a.type}`);
        }
    }

    console.log("Preflight checks passed.");
};
