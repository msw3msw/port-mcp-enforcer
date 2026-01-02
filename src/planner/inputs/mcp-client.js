/**
 * ============================================================================
 * Port-MCP Enforcer — MCP Client (Fetch-based)
 * Location: src/planner/inputs/mcp-client.js
 *
 * Responsibility:
 * - Read-only Port-MCP access
 * - Match state-loader contract
 * ============================================================================
 */

"use strict";

function createMcpClient({ baseUrl }) {
    const API_BASE = `${baseUrl}/api/v1`;

    async function get(path) {
        const res = await fetch(`${API_BASE}${path}`);
        if (!res.ok) {
            throw new Error(`Port-MCP ${path} failed (${res.status})`);
        }
        return res.json();
    }

    return {
        getContainers() {
            return get("/containers");
        },

        getPorts() {
            return get("/ports");
        },

        getNetworks() {
            return get("/networks");
        },

        getRegistry() {
            return get("/registry");
        }
    };
}

module.exports = {
    createMcpClient
};
