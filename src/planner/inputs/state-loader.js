/**
 * ============================================================================
 * Port-MCP Enforcer — State Loader (FINAL)
 * Location: src/planner/inputs/state-loader.js
 *
 * Responsibility:
 * - Fetch authoritative state from Port-MCP
 * - Normalize containers, ports, and networks
 * - Guarantee planner/UI-safe contracts
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
       CONTAINER NORMALIZATION
    ============================ */

    const containers = containersRes.containers.map(c => ({
        id: c.id,
        name: c.name,
        image: c.image || null,
        state: c.state || null,
        running: Boolean(c.running),

        // Guaranteed arrays
        ports: Array.isArray(c.ports) ? c.ports : [],
        networks: Array.isArray(c.networks)
            ? c.networks.map(n => ({
                  name: n.name,
                  ip: n.ip || null,
                  gateway: n.gateway || null
              }))
            : []
    }));

    /* ============================
       PORT NORMALIZATION (HOST VIEW)
    ============================ */

    const ports = portsRes.ports.map(p => ({
        container: p.containerName || null,
        containerId: p.containerId || null,
        host: Number(p.host),
        containerPort: Number(p.container),
        protocol: p.protocol || "tcp"
    }));

    /* ============================
       REGISTRY NORMALIZATION
    ============================ */

    let registryEntries = null;

    if (Array.isArray(registryRes)) {
        registryEntries = registryRes;
    }

    if (!registryEntries && Array.isArray(registryRes?.registry)) {
        registryEntries = registryRes.registry;
    }

    if (!registryEntries && Array.isArray(registryRes?.entries)) {
        registryEntries = registryRes.entries;
    }

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
       FINAL STATE
    ============================ */

    return {
        fetchedAt: Date.now(),

        containers,
        ports,
        networks: networksRes.networks,
        registry: registryEntries
    };
}

module.exports = {
    loadState
};
