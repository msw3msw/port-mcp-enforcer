/**
 * ============================================================================
 * Port-MCP Enforcer — Minimal Web UI Server (PHASE 1.3)
 * Location: src/ui/web/server.js
 *
 * PHASE 1.3:
 * - Add SSE endpoint: GET /api/jobs/:id/events
 * - Replay buffered job.events on connect
 * - Stream new events as they arrive
 *
 * HARD RULES:
 * - UI never supplies a plan
 * - Server re-plans authoritatively
 * - Docker mutation is double-gated
 * - Executor behavior matches CLI exactly
 * ============================================================================
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

const { loadState } = require("../../planner/inputs/state-loader");
const classify = require("../../planner/classify/classifier");
const buildPlan = require("../../planner/plan/plan-builder");
const runExecutor = require("../../executor");

const PORT = 4200;
const PUBLIC_DIR = path.join(__dirname, "public");

const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";

/* ============================================================================
   Phase 1.x — Job Registry (in-memory)
============================================================================ */

const jobs = new Map();
const MAX_JOB_EVENTS = 500;

/**
 * Each job has:
 * - events[] (buffer)
 * - listeners: Set<{ res }>
 */
function ensureListeners(job) {
    if (!job.listeners) job.listeners = new Set();
}

function sseWrite(res, evt) {
    // SSE format: event + data payload as JSON
    // event name is optional but useful for clients
    const eventName = evt.type || "message";
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
}

function broadcastJobEvent(job, evt) {
    ensureListeners(job);
    for (const client of job.listeners) {
        try {
            sseWrite(client.res, evt);
        } catch {
            // ignore broken connections; cleanup occurs on 'close'
        }
    }
}

function pushJobEvent(job, evt) {
    if (!job.events) job.events = [];
    job.events.push(evt);
    if (job.events.length > MAX_JOB_EVENTS) {
        job.events.splice(0, job.events.length - MAX_JOB_EVENTS);
    }
    broadcastJobEvent(job, evt);
}

function createJob({ selectedContainers }) {
    const id = crypto.randomUUID();
    const job = {
        id,
        status: "running",
        startedAt: Date.now(),
        finishedAt: undefined,
        selectedContainers,
        events: [],
        listeners: new Set()
    };
    jobs.set(id, job);

    pushJobEvent(job, {
        type: "job:created",
        ts: Date.now(),
        selectedContainers
    });

    return job;
}

function completeJob(job, result) {
    job.status = "success";
    job.finishedAt = Date.now();
    job.result = result;

    pushJobEvent(job, {
        type: "job:stored",
        ts: Date.now(),
        status: "success"
    });
}

function failJob(job, err) {
    job.status = "failed";
    job.finishedAt = Date.now();
    job.error = err instanceof Error ? err.message : String(err);

    pushJobEvent(job, {
        type: "job:stored",
        ts: Date.now(),
        status: "failed",
        error: job.error
    });
}

/* ============================================================================
   Helpers
============================================================================ */

function send(res, status, data, type = "application/json") {
    res.writeHead(status, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(data, null, 2) : data);
}

function serveStatic(req, res) {
    const reqPath = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(PUBLIC_DIR, reqPath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        return send(res, 403, { error: "Forbidden" });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            return send(res, 404, { error: "Not found" });
        }

        const ext = path.extname(filePath);
        const type =
            ext === ".html" ? "text/html" :
            ext === ".js"   ? "text/javascript" :
            "text/plain";

        send(res, 200, data, type);
    });
}

/* ============================================================================
   SSE Handler
============================================================================ */

function handleJobEvents(req, res, jobId) {
    const job = jobs.get(jobId);
    if (!job) {
        return send(res, 404, { error: "Job not found" });
    }

    // SSE headers
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*" // safe for LAN UI; remove if undesired
    });

    // Initial comment to establish stream
    res.write(": connected\n\n");

    // Register listener
    ensureListeners(job);
    const client = { res };
    job.listeners.add(client);

    // Replay buffered events
    for (const evt of job.events || []) {
        sseWrite(res, evt);
    }

    // Heartbeat to keep proxies from closing idle connections
    const heartbeat = setInterval(() => {
        try {
            res.write(": heartbeat\n\n");
        } catch {
            // ignore; close handler will clean up
        }
    }, 15000);

    req.on("close", () => {
        clearInterval(heartbeat);
        job.listeners.delete(client);
    });
}

/* ============================================================================
   API Handlers
============================================================================ */

async function handleScan(req, res) {
    const state = await loadState({ baseUrl: "http://127.0.0.1:4100" });
    const classification = classify(state);
    const plan = buildPlan({ classification, overrides: {} });

    send(res, 200, {
        state,
        classification,
        plan
    });
}

async function handleApply(req, res) {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
        let input;
        try {
            input = JSON.parse(body || "{}");
        } catch {
            return send(res, 400, { error: "Invalid JSON" });
        }

        const {
            selectedContainers,
            categoryOverrides,
            allowDockerMutation,
            confirmPhrase,
            dryRun
        } = input;

        /* ----------------------------
           Server-side safety gates
        ---------------------------- */

        if (!dryRun && !allowDockerMutation) {
            return send(res, 400, {
                error: "Docker mutation not allowed"
            });
        }

        if (confirmPhrase !== CONFIRM_PHRASE) {
            return send(res, 400, {
                error: "Confirmation phrase mismatch"
            });
        }

        if (!Array.isArray(selectedContainers) || !selectedContainers.length) {
            return send(res, 400, {
                error: "No containers selected"
            });
        }

        /* ----------------------------
           Create job (Phase 1.x)
        ---------------------------- */

        const job = createJob({ selectedContainers });

        // Respond immediately with jobId
        send(res, 202, { jobId: job.id });

        /* ----------------------------
           Execute asynchronously + capture progress events
        ---------------------------- */

        try {
            pushJobEvent(job, { type: "job:planning:start", ts: Date.now() });

            const state = await loadState({ baseUrl: "http://127.0.0.1:4100" });

            const classification = classify(state, {
                overrides: categoryOverrides || {}
            });

            let plan = buildPlan({
                classification,
                overrides: categoryOverrides || {}
            });

            plan = {
                ...plan,
                actions: plan.actions.filter(a =>
                    selectedContainers.includes(a.container)
                )
            };

            pushJobEvent(job, {
                type: "job:planning:complete",
                ts: Date.now(),
                actionCount: Array.isArray(plan?.actions) ? plan.actions.length : 0,
                dryRun: dryRun === true
            });

            const result = await runExecutor({
                apply: true,
                yes: true,
                allowDockerMutation: dryRun ? false : true,
                dryRun: dryRun === true,
                planObject: plan,

                onProgress: (evt) => pushJobEvent(job, evt)
            });

            completeJob(job, result);

        } catch (err) {
            failJob(job, err);
        }
    });
}

/* ============================================================================
   HTTP Server
============================================================================ */

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);

    try {
        if (req.method === "GET" && parsed.pathname === "/api/scan") {
            return handleScan(req, res);
        }

        if (req.method === "POST" && parsed.pathname === "/api/apply") {
            return handleApply(req, res);
        }

        // Phase 1.3: SSE events endpoint
        // GET /api/jobs/:id/events
        if (req.method === "GET" && parsed.pathname.startsWith("/api/jobs/")) {
            const parts = parsed.pathname.split("/").filter(Boolean);
            // parts: ["api","jobs",":id","events"]
            if (parts.length === 4 && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "events") {
                const jobId = parts[2];
                return handleJobEvents(req, res, jobId);
            }
        }

        return serveStatic(req, res);
    } catch (err) {
        console.error("[UI] Error:", err);
        send(res, 500, { error: err.message });
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`[UI] Port-MCP Enforcer UI listening on http://0.0.0.0:${PORT}`);
});
