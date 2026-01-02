/**
 * Network Analysis (READ-ONLY)
 *
 * Step 6: no policy enforcement.
 * We produce a posture report that later phases can compare against policy.
 */

function normalizeContainers(state) {
    const containers = Array.isArray(state?.containers) ? state.containers : [];
    return containers.map((c) => ({
        id: c?.id ?? c?.containerId ?? null,
        name: c?.name ?? c?.containerName ?? null,
        image: c?.image ?? null,
        running: !!c?.running,
        state: c?.state ?? null,
        networks: Array.isArray(c?.networks) ? c.networks.map((n) => ({
            name: n?.name ?? null,
            ip: n?.ip ?? null,
            gateway: n?.gateway ?? null
        })) : []
    }));
}

function normalizeNetworks(state) {
    const networks = Array.isArray(state?.networks) ? state.networks : [];
    return networks.map((n) => ({
        id: n?.id ?? null,
        name: n?.name ?? null,
        driver: n?.driver ?? null,
        scope: n?.scope ?? null,
        internal: !!n?.internal,
        attachable: !!n?.attachable
    }));
}

function analyzeNetworks(state) {
    const containers = normalizeContainers(state);
    const networks = normalizeNetworks(state);

    const usage = new Map(); // networkName -> {containers:[], count}
    const multiNetworkContainers = [];
    const hostNetContainers = [];
    const br0LikeContainers = [];
    const bridgeContainers = [];
    const customBridgeContainers = [];

    for (const c of containers) {
        const netNames = (c.networks || []).map((n) => n.name).filter(Boolean);

        if (netNames.length > 1) {
            multiNetworkContainers.push({
                id: c.id,
                name: c.name,
                networks: netNames
            });
        }

        for (const nn of netNames) {
            if (!usage.has(nn)) usage.set(nn, []);
            usage.get(nn).push({ id: c.id, name: c.name, running: c.running });
        }

        if (netNames.includes("host")) {
            hostNetContainers.push({ id: c.id, name: c.name });
        }

        // common Unraid macvlan/ipvlan names often br0, br1, etc
        for (const nn of netNames) {
            if (nn && /^br\d+$/i.test(nn)) {
                br0LikeContainers.push({ id: c.id, name: c.name, network: nn });
            }
        }

        if (netNames.includes("bridge")) {
            bridgeContainers.push({ id: c.id, name: c.name });
        }

        // anything that looks like a custom bridge network (not bridge/host/brX/none)
        for (const nn of netNames) {
            if (!nn) continue;
            if (nn === "bridge" || nn === "host" || nn === "none" || /^br\d+$/i.test(nn)) continue;
            customBridgeContainers.push({ id: c.id, name: c.name, network: nn });
        }
    }

    const usageList = Array.from(usage.entries())
        .map(([network, arr]) => ({
            network,
            totalContainers: arr.length,
            runningContainers: arr.filter((x) => x.running).length,
            containers: arr
        }))
        .sort((a, b) => b.totalContainers - a.totalContainers || a.network.localeCompare(b.network));

    return {
        totals: {
            networks: networks.length,
            containers: containers.length,
            multiNetworkContainers: multiNetworkContainers.length,
            hostNetContainers: hostNetContainers.length,
            bridgeContainers: bridgeContainers.length,
            br0LikeContainers: br0LikeContainers.length,
            customBridgeContainers: customBridgeContainers.length
        },
        usage: usageList,
        posture: {
            multiNetworkContainers,
            hostNetContainers,
            br0LikeContainers,
            bridgeContainers,
            customBridgeContainers
        },
        _debug: {
            networks,
            containers
        }
    };
}

module.exports = {
    analyzeNetworks
};
