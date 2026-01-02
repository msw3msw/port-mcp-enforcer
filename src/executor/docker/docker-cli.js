/**
 * ============================================================================
 * Port-MCP Enforcer — Docker CLI Helper (HIGH RISK)
 * Location: src/executor/docker/docker-cli.js
 *
 * Responsibility:
 * - Execute docker CLI commands in a controlled way
 *
 * HARD RULES:
 * - No retries
 * - Fail fast
 * - Return stdout/stderr for audit
 * ============================================================================
 */

"use strict";

const { spawn } = require("child_process");

function runDocker(args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
            cwd: process.cwd()
        });

        let out = "";
        let err = "";

        child.stdout.on("data", b => (out += b.toString("utf8")));
        child.stderr.on("data", b => (err += b.toString("utf8")));

        child.on("error", reject);
        child.on("close", code => {
            const result = { code, out: out.trim(), err: err.trim(), args };
            if (code !== 0) {
                const e = new Error(
                    `docker ${args.join(" ")} failed (code ${code}): ${result.err || result.out}`
                );
                e.result = result;
                return reject(e);
            }
            resolve(result);
        });
    });
}

async function inspectContainer(name) {
    const r = await runDocker(["inspect", name]);
    const parsed = JSON.parse(r.out);
    if (!Array.isArray(parsed) || !parsed[0]) {
        throw new Error(`docker inspect returned no object for container "${name}"`);
    }
    return parsed[0];
}

async function containerExists(name) {
    try {
        await runDocker(["inspect", name]);
        return true;
    } catch (_) {
        return false;
    }
}

async function isRunning(name) {
    const r = await runDocker(["inspect", "-f", "{{.State.Running}}", name]);
    return r.out.trim() === "true";
}

async function stop(name) {
    return runDocker(["stop", name]);
}

async function remove(name) {
    return runDocker(["rm", name]);
}

async function start(name) {
    return runDocker(["start", name]);
}

async function create(args) {
    return runDocker(["create", ...args]);
}

module.exports = {
    runDocker,
    inspectContainer,
    containerExists,
    isRunning,
    stop,
    remove,
    start,
    create
};
