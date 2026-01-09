/**
 * ============================================================================
 * Port-MCP Enforcer – Executor Action: update-container-ports
 * v1.0.8 - VPN Capabilities + Multi-Network Fix
 * 
 * FIXES:
 * - Preserve --cap-add=NET_ADMIN (VPN routing)
 * - Preserve --device /dev/net/tun (VPN tunnel)
 * - Preserve --privileged mode
 * - Preserve --sysctl settings
 * - Handle multiple networks properly
 * ============================================================================
 */

"use strict";

const Docker = require("../docker/docker-cli");

function reqArray(v, name) {
    if (!Array.isArray(v) || v.length === 0) {
        throw new Error(`update-container-ports requires non-empty ${name}[]`);
    }
}

function normProto(p) {
    return String(p || "").toLowerCase();
}

function portFlag(binding) {
    const proto = normProto(binding.protocol);
    if (!["tcp", "udp"].includes(proto)) {
        throw new Error(`invalid protocol "${binding.protocol}" (expected tcp/udp)`);
    }
    const host = Number(binding.host);
    const cont = Number(binding.container);

    if (!Number.isInteger(host) || host < 1 || host > 65535) {
        throw new Error(`invalid host port "${binding.host}"`);
    }
    if (!Number.isInteger(cont) || cont < 1 || cont > 65535) {
        throw new Error(`invalid container port "${binding.container}"`);
    }

    return `${host}:${cont}/${proto}`;
}

function samePortList(a, b) {
    const sa = new Set(a.map(x => `${x.host}:${x.container}/${normProto(x.protocol)}`));
    const sb = new Set(b.map(x => `${x.host}:${x.container}/${normProto(x.protocol)}`));
    if (sa.size !== sb.size) return false;
    for (const v of sa) if (!sb.has(v)) return false;
    return true;
}

function extractPublishedPortsFromInspect(inspect) {
    const ports = [];
    const pb = inspect?.NetworkSettings?.Ports || {};
    for (const key of Object.keys(pb)) {
        const [containerPortStr, proto] = key.split("/");
        const containerPort = Number(containerPortStr);
        const bindings = pb[key];
        if (!Array.isArray(bindings)) continue;
        for (const b of bindings) {
            const hostPort = Number(b.HostPort);
            ports.push({
                host: hostPort,
                container: containerPort,
                protocol: proto
            });
        }
    }
    return ports;
}

function buildCreateArgsFromInspect(inspect, newPortFlags) {
    const args = [];

    const name = inspect?.Name?.replace(/^\//, "");
    if (!name) throw new Error("cannot derive container name from inspect");

    args.push("--name", name);

    // restart policy
    const restart = inspect?.HostConfig?.RestartPolicy;
    if (restart?.Name) {
        if (restart.Name === "no") {
            // omit
        } else if (restart.Name === "on-failure") {
            const max = restart.MaximumRetryCount || 0;
            args.push("--restart", `on-failure:${max}`);
        } else {
            args.push("--restart", restart.Name);
        }
    }

    // network mode - primary network
    const netMode = inspect?.HostConfig?.NetworkMode;
    if (netMode && netMode !== "default") {
        args.push("--network", netMode);
    }
    
    // Collect additional networks for post-create connection
    const networks = inspect?.NetworkSettings?.Networks || {};
    const additionalNetworks = [];
    
    for (const netName of Object.keys(networks)) {
        // Skip the primary network (already added via NetworkMode)
        if (netName === netMode) continue;
        additionalNetworks.push(netName);
    }

    // env
    const env = inspect?.Config?.Env || [];
    for (const e of env) args.push("-e", e);

    // labels
    const labels = inspect?.Config?.Labels || {};
    for (const [k, v] of Object.entries(labels)) {
        args.push("--label", `${k}=${v}`);
    }

    // volumes/binds
    const binds = inspect?.HostConfig?.Binds || [];
    for (const b of binds) args.push("-v", b);

    // mounts (named volumes)
    const mounts = inspect?.Mounts || [];
    for (const m of mounts) {
        if (m.Type === "volume") {
            const mode = m.RW ? "rw" : "ro";
            args.push("-v", `${m.Name}:${m.Destination}:${mode}`);
        }
    }

    // working dir
    if (inspect?.Config?.WorkingDir) {
        args.push("-w", inspect.Config.WorkingDir);
    }

    // entrypoint - FIXED: Use first element only, not joined
    if (Array.isArray(inspect?.Config?.Entrypoint) && inspect.Config.Entrypoint.length) {
        args.push("--entrypoint", inspect.Config.Entrypoint[0]);
    }

    // user
    if (inspect?.Config?.User) {
        args.push("-u", inspect.Config.User);
    }

    // ========================================================================
    // CRITICAL VPN FIXES - v1.0.8
    // ========================================================================

    // capabilities (CRITICAL for VPN - NET_ADMIN for routing)
    const capAdd = inspect?.HostConfig?.CapAdd || [];
    for (const cap of capAdd) {
        args.push("--cap-add", cap);
    }

    // devices (CRITICAL for VPN - /dev/net/tun for tunnel)
    const devices = inspect?.HostConfig?.Devices || [];
    for (const dev of devices) {
        if (dev.PathOnHost && dev.PathInContainer) {
            args.push("--device", `${dev.PathOnHost}:${dev.PathInContainer}`);
        }
    }

    // privileged mode
    if (inspect?.HostConfig?.Privileged === true) {
        args.push("--privileged");
    }

    // sysctls (kernel parameters for VPN)
    const sysctls = inspect?.HostConfig?.Sysctls || {};
    for (const [k, v] of Object.entries(sysctls)) {
        args.push("--sysctl", `${k}=${v}`);
    }

    // ========================================================================
    // END VPN FIXES
    // ========================================================================

    // published ports (THIS IS THE MUTATION)
    for (const pf of newPortFlags) {
        args.push("-p", pf);
    }

    // image
    const image = inspect?.Config?.Image;
    if (!image) throw new Error("cannot derive image from inspect");
    args.push(image);

    // cmd
    const cmd = inspect?.Config?.Cmd || [];
    for (const c of cmd) args.push(c);

    return { args, additionalNetworks };
}

module.exports = async function updateContainerPorts(action, opts = {}) {
    if (!action || !action.container) {
        throw new Error("update-container-ports requires { container, from[], to[] }");
    }

    reqArray(action.from, "from");
    reqArray(action.to, "to");

    const name = action.container;

    // DRY-RUN: validate only, show what would happen
    if (opts.dryRun) {
        const flags = action.to.map(portFlag);
        console.log("[executor] DRY-RUN update-container-ports:", {
            container: name,
            from: action.from,
            to: action.to,
            dockerFlags: flags
        });
        return { status: "validated" };
    }

    // Preflight: container exists and running
    const exists = await Docker.containerExists(name);
    if (!exists) throw new Error(`container not found: ${name}`);

    const running = await Docker.isRunning(name);
    if (!running) {
        throw new Error(`container is not running: ${name} (refusing to mutate)`);
    }

    // Inspect current state
    const inspect = await Docker.inspectContainer(name);

    const currentPublished = extractPublishedPortsFromInspect(inspect);

    // Hard check: "from" must match current published ports exactly
    if (!samePortList(currentPublished, action.from)) {
        throw new Error(
            `preflight mismatch: plan.from does not match current published ports for ${name}`
        );
    }

    // Stop → remove → recreate → reconnect networks → start
    const newPortFlags = action.to.map(portFlag);

    // Build docker create args from inspect with updated -p flags
    const { args: createArgs, additionalNetworks } = buildCreateArgsFromInspect(inspect, newPortFlags);

    // IMPORTANT: remove old container only after stop
    await Docker.stop(name);
    await Docker.remove(name);
    await Docker.create(createArgs);
    
    // Reconnect additional networks before starting (v1.0.8)
    for (const netName of additionalNetworks) {
        console.log(`[executor] Reconnecting network: ${netName}`);
        await Docker.runDocker(["network", "connect", netName, name]);
    }
    
    await Docker.start(name);

    return { status: "success", container: name };
};
