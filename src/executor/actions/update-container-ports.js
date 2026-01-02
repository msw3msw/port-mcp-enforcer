/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Action: update-container-ports (HIGH RISK)
 * Location: src/executor/actions/update-container-ports.js
 *
 * Responsibility:
 * - Stop and recreate a container with updated published ports only
 *
 * HARD RULES:
 * - Ports-only changes (no image/env/volume/network modifications beyond what
 *   is required to recreate existing settings)
 * - No retries
 * - Fail fast
 * - Requires external gating (handled in executor)
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
    // binding: { host, container, protocol }
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
        // key like "26900/udp"
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

    // network mode handling: if user-defined network, we will attach after create
    // using --network is safe when a single network is present. Many containers
    // are on one custom network; keep it simple and explicit.
    const netMode = inspect?.HostConfig?.NetworkMode;
    if (netMode && netMode !== "default") {
        // "bridge" should still be passed explicitly
        args.push("--network", netMode);
    }

    // env
    const env = inspect?.Config?.Env || [];
    for (const e of env) args.push("-e", e);

    // labels
    const labels = inspect?.Config?.Labels || {};
    for (const [k, v] of Object.entries(labels)) {
        // preserve as-is
        args.push("--label", `${k}=${v}`);
    }

    // volumes/binds
    const binds = inspect?.HostConfig?.Binds || [];
    for (const b of binds) args.push("-v", b);

    // mounts (named volumes etc.)
    const mounts = inspect?.Mounts || [];
    for (const m of mounts) {
        // Skip bind mounts already represented in HostConfig.Binds.
        // For named volumes, add -v source:dest[:mode]
        if (m.Type === "volume") {
            const mode = m.RW ? "rw" : "ro";
            args.push("-v", `${m.Name}:${m.Destination}:${mode}`);
        }
    }

    // working dir
    if (inspect?.Config?.WorkingDir) {
        args.push("-w", inspect.Config.WorkingDir);
    }

    // entrypoint
    if (Array.isArray(inspect?.Config?.Entrypoint) && inspect.Config.Entrypoint.length) {
        args.push("--entrypoint", inspect.Config.Entrypoint.join(" "));
    }

    // user
    if (inspect?.Config?.User) {
        args.push("-u", inspect.Config.User);
    }

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

    return args;
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

    // Stop → remove → recreate → start
    const newPortFlags = action.to.map(portFlag);

    // Build docker create args from inspect with updated -p flags
    const createArgs = buildCreateArgsFromInspect(inspect, newPortFlags);

    // IMPORTANT: remove old container only after stop
    await Docker.stop(name);
    await Docker.remove(name);
    await Docker.create(createArgs);
    await Docker.start(name);

    return { status: "success", container: name };
};
