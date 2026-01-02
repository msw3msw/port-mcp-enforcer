/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Action: release-port
 * Location: src/executor/actions/release-port.js
 *
 * Responsibility:
 * - Release ports owned by a container via Port-MCP
 *
 * HARD RULES:
 * - NO Docker mutation
 * ============================================================================
 */

"use strict";

module.exports = async function releasePort(action, opts = {}) {
    if (!action || !action.container) {
        throw new Error("release-port action requires { container }");
    }

    const baseUrl = opts.baseUrl || "http://127.0.0.1:4100";

    const payload = {
        owner: {
            type: "enforcer",
            id: action.container
        }
    };

    if (opts.dryRun) {
        console.log("[executor] DRY-RUN release-port:", payload);
        return { status: "validated" };
    }

    const res = await fetch(`${baseUrl}/api/v1/ports/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Port-MCP release failed (${res.status}): ${text}`);
    }

    return res.json();
};
