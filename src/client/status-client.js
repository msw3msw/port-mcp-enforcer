"use strict";

const MCP_BASE =
    process.env.PORT_MCP_URL || "http://localhost:4100";

async function getJson(path) {
    const res = await fetch(`${MCP_BASE}${path}`, {
        headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${path}`);
    }

    return res.json();
}

async function fetchStatus() {
    const [ports, containers, networks, reconcile] = await Promise.all([
        getJson("/api/v1/ports"),
        getJson("/api/v1/containers"),
        getJson("/api/v1/networks"),
        getJson("/api/v1/reconcile")
    ]);

    return {
        ports,
        containers,
        networks,
        reconciliation: reconcile
    };
}

module.exports = { fetchStatus };

