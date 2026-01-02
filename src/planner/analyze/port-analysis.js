/**
 * Port Analysis (READ-ONLY)
 *
 * Input: normalized state from state-loader
 * Output: findings about collisions and registry drift
 *
 * No policy assumptions in Step 6.
 */

function keyHostProto(host, protocol) {
    return `${String(host)}:${String(protocol || "").toLowerCase()}`;
}

function normalizeLivePorts(state) {
    const ports = Array.isArray(state?.ports) ? state.ports : [];
    return ports
        .map((p) => {
            const host = p?.host ?? p?.HostPort ?? p?.public ?? p?.publicPort;
            const protocol = (p?.protocol ?? p?.Protocol ?? p?.proto ?? "").toLowerCase() || "tcp";

            const containerId = p?.containerId ?? p?.id ?? p?.container?.id ?? null;
            const containerName = p?.containerName ?? p?.name ?? p?.container?.name ?? null;
            const containerPort = p?.container ?? p?.containerPort ?? p?.private ?? p?.privatePort ?? null;

            const ip = p?.ip ?? p?.hostIp ?? p?.HostIp ?? null;

            if (host === undefined || host === null) return null;

            return {
                host: Number(host),
                protocol,
                ip,
                containerId,
                containerName,
                containerPort: containerPort === null || containerPort === undefined ? null : Number(containerPort)
            };
        })
        .filter(Boolean);
}

function normalizeRegistry(state) {
    const reg = Array.isArray(state?.registry) ? state.registry : [];
    return reg
        .map((r) => {
            const host = r?.host ?? r?.port;
            const protocol = (r?.protocol ?? "").toLowerCase() || "tcp";
            if (host === undefined || host === null) return null;

            return {
                host: Number(host),
                protocol,
                owner: r?.owner ?? null,
                range: r?.range ?? null,
                createdAt: r?.createdAt ?? null,
                binding: r?.binding ?? null
            };
        })
        .filter(Boolean);
}

function analyzePortCollisions(livePorts) {
    const byKey = new Map();

    for (const p of livePorts) {
        const k = keyHostProto(p.host, p.protocol);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(p);
    }

    const collisions = [];

    for (const [k, arr] of byKey.entries()) {
        // collision = same host/protocol used by more than one container (ignore duplicate ipv4/ipv6 entries)
        const uniq = new Map();
        for (const p of arr) {
            const id = p.containerId || p.containerName || "unknown";
            if (!uniq.has(id)) uniq.set(id, p);
        }

        if (uniq.size > 1) {
            const sample = arr[0];
            collisions.push({
                host: sample.host,
                protocol: sample.protocol,
                usedBy: Array.from(uniq.values()).map((x) => ({
                    containerId: x.containerId,
                    containerName: x.containerName,
                    containerPort: x.containerPort,
                    ip: x.ip
                }))
            });
        }
    }

    collisions.sort((a, b) => (a.host - b.host) || a.protocol.localeCompare(b.protocol));
    return collisions;
}

function analyzeRegistryDrift(livePorts, registryEntries) {
    const liveSet = new Set(livePorts.map((p) => keyHostProto(p.host, p.protocol)));
    const regSet = new Set(registryEntries.map((r) => keyHostProto(r.host, r.protocol)));

    const unregisteredInUse = [];
    for (const p of livePorts) {
        const k = keyHostProto(p.host, p.protocol);
        if (!regSet.has(k)) {
            unregisteredInUse.push({
                host: p.host,
                protocol: p.protocol,
                containerId: p.containerId,
                containerName: p.containerName,
                containerPort: p.containerPort,
                ip: p.ip
            });
        }
    }

    const staleRegistry = [];
    for (const r of registryEntries) {
        const k = keyHostProto(r.host, r.protocol);
        if (!liveSet.has(k)) {
            staleRegistry.push({
                host: r.host,
                protocol: r.protocol,
                owner: r.owner,
                range: r.range,
                createdAt: r.createdAt,
                binding: r.binding || null
            });
        }
    }

    unregisteredInUse.sort((a, b) => (a.host - b.host) || a.protocol.localeCompare(b.protocol));
    staleRegistry.sort((a, b) => (a.host - b.host) || a.protocol.localeCompare(b.protocol));

    return {
        unregisteredInUse,
        staleRegistry
    };
}

function analyzePorts(state) {
    const livePorts = normalizeLivePorts(state);
    const registryEntries = normalizeRegistry(state);

    const collisions = analyzePortCollisions(livePorts);
    const drift = analyzeRegistryDrift(livePorts, registryEntries);

    return {
        totals: {
            livePorts: livePorts.length,
            registryEntries: registryEntries.length,
            collisions: collisions.length,
            unregisteredInUse: drift.unregisteredInUse.length,
            staleRegistry: drift.staleRegistry.length
        },
        collisions,
        drift,
        _debug: {
            // helpful for future: keep these internal, not for UI yet
            livePorts,
            registryEntries
        }
    };
}

module.exports = {
    analyzePorts
};
