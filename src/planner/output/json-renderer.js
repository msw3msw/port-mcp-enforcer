/**
 * ============================================================================
 * Port-MCP Enforcer — JSON Output Renderer
 * Location: src/planner/output/json-renderer.js
 *
 * Responsibility:
 * - Emit machine-readable plan output
 * - NO mutation
 * - NO execution
 * ============================================================================
 */

"use strict";

module.exports = function renderJson(plan) {
    if (!plan || typeof plan !== "object") {
        throw new Error("JSON renderer requires a plan object");
    }

    console.log(JSON.stringify(plan, null, 2));
};
