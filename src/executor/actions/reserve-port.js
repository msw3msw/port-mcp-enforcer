/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Action: reserve-port
 * Location: src/executor/actions/reserve-port.js
 *
 * Responsibility:
 * - Reserve host ports via Port-MCP API
 *
 * HARD RULES:
 * - NO Docker inspection
 * - NO Docker mutation
 * - All authority delegated to Port-MCP
 * ============================================================================
 */

"use strict";

module.exports = async function reservePort(action, opts = {}) {
    if (!action || !action.container || !Array.isArray(action.ports)) {
        throw new Error("reserve-port action requires { container, ports[] }");
    }

    const baseUrl = opts.baseUrl || "http://127.0.0.1:4100";

    const payload = {
        owner: {
            type: "enforcer",
            id: action.container
        },
        ports: action.ports
    };

    // Dry-run: do not call MCP
    if (opts.dryRun) {
        console.log("[executor] DRY-RUN reserve-port:", payload);
        return { status: "validated" };
    }

    const res = await fetch(`${baseUrl}/api/v1/ports/allocate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `Port-MCP allocate failed (${res.status}): ${text}`
        );
    }

    return res.json();
};
