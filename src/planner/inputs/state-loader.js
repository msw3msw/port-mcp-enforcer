/**
 * ============================================================================
 * Port-MCP Enforcer — State Loader
 * Location: src/planner/inputs/state-loader.js
 *
 * Responsibility:
 * - Fetch authoritative state from Port-MCP
 * - Validate MCP contract envelopes (loosely)
 * - Normalize into planner-safe structures
 * ============================================================================
 */

const { createMcpClient } = require("./mcp-client");

async function loadState(options = {}) {
    const {
        baseUrl = "http://127.0.0.1:4100"
    } = options;

    const client = createMcpClient({ baseUrl });

    const [
        containersRes,
        portsRes,
        networksRes,
        registryRes
    ] = await Promise.all([
        client.getContainers(),
        client.getPorts(),
        client.getNetworks(),
        client.getRegistry()
    ]);

    /* ============================
       CONTRACT VALIDATION
    ============================ */

    if (!containersRes || !Array.isArray(containersRes.containers)) {
        throw new Error("Invalid containers response from Port-MCP");
    }

    if (!portsRes || !Array.isArray(portsRes.ports)) {
        throw new Error("Invalid ports response from Port-MCP");
    }

    if (!networksRes || !Array.isArray(networksRes.networks)) {
        throw new Error("Invalid networks response from Port-MCP");
    }

    /* ============================
       REGISTRY NORMALIZATION
    ============================ */

    let registryEntries = null;

    // Case 1: raw array
    if (Array.isArray(registryRes)) {
        registryEntries = registryRes;
    }

    // Case 2: known envelopes
    if (!registryEntries && Array.isArray(registryRes?.registry)) {
        registryEntries = registryRes.registry;
    }

    if (!registryEntries && Array.isArray(registryRes?.entries)) {
        registryEntries = registryRes.entries;
    }

    // Case 3: defensive discovery (authoritative)
    if (!registryEntries && registryRes && typeof registryRes === "object") {
        for (const value of Object.values(registryRes)) {
            if (Array.isArray(value)) {
                registryEntries = value;
                break;
            }
        }
    }

    if (!registryEntries) {
        throw new Error("Invalid registry response from Port-MCP");
    }

    /* ============================
       NORMALIZED STATE
    ============================ */

    return {
        fetchedAt: Date.now(),

        containers: containersRes.containers,
        ports: portsRes.ports,
        networks: networksRes.networks,
        registry: registryEntries
    };
}

module.exports = {
    loadState
};
