/**
 * ============================================================================
 * Port-MCP Enforcer â€” Web UI Server (Authoritative Orchestrator)
 * Location: src/ui/web/server.js
 *
 * Responsibilities:
 * - HTTP server (no Express)
 * - Route registration
 * - Job lifecycle + SSE
 * - Delegation to planner / executor
 *
 * HARD RULES:
 * - No business logic
 * - No planner mutation
 * - No executor logic
 * ============================================================================
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const url = require("url");

/* ============================================================================
   Planner / Executor Dependencies (AUTHORITATIVE)
============================================================================ */

const { loadState } = require("../../planner/inputs/state-loader");
const classify = require("../../planner/classify/classifier");
const buildPlan = require("../../planner/plan/plan-builder");
const runExecutor = require("../../executor");

/* ============================================================================
   Snapshot Manager
============================================================================ */

const {
    saveJobSnapshot,
    listSnapshots,
    loadSnapshot,
    createRestorePlan,
    cleanupOldSnapshots
} = require("../../snapshots/snapshot-manager");

/* ============================================================================
   Rollback Routes
============================================================================ */

const { createRollbackRoutes } = require("./routes/rollback");

/* ============================================================================
   In-memory Job Store (authoritative for UI)
============================================================================ */

const jobs = new Map();

/* ============================================================================
   Category Override Persistence (Stage 2)
============================================================================ */

const DATA_DIR = path.join(__dirname, "data");
const CATEGORY_OVERRIDES_FILE = path.join(DATA_DIR, "category-overrides.json");

function ensureOverridesFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CATEGORY_OVERRIDES_FILE)) {
        fs.writeFileSync(CATEGORY_OVERRIDES_FILE, "{}");
    }
}

function readCategoryOverrides() {
    ensureOverridesFile();
    try {
        return JSON.parse(fs.readFileSync(CATEGORY_OVERRIDES_FILE, "utf8"));
    } catch {
        return {};
    }
}

function writeCategoryOverrides(obj) {
    ensureOverridesFile();
    const tmp = CATEGORY_OVERRIDES_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, CATEGORY_OVERRIDES_FILE);
}

/* ============================================================================
   Helpers
============================================================================ */

function json(res, status, obj) {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
    });
    res.end(body);
}

function notFound(res) {
    res.writeHead(404);
    res.end("Not Found");
}

function badRequest(res, msg) {
    json(res, 400, { error: msg });
}

function uuid() {
    return crypto.randomUUID();
}

/* ============================================================================
   Job Lifecycle Helpers
============================================================================ */

function createJob(meta = {}) {
    const id = uuid();
    const job = {
        id,
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        events: [],
        listeners: {},
        ...meta
    };
    jobs.set(id, job);
    pushJobEvent(job, { type: "job:created", ts: Date.now(), ...meta });
    return job;
}

function completeJob(job, result) {
    job.status = "completed";
    job.finishedAt = Date.now();
    job.result = result;
    pushJobEvent(job, {
        type: "job:completed",
        ts: job.finishedAt
    });
}

function failJob(job, err) {
    job.status = "failed";
    job.finishedAt = Date.now();
    job.error = err?.message || String(err);
    pushJobEvent(job, {
        type: "job:failed",
        ts: job.finishedAt,
        error: job.error
    });
}

function pushJobEvent(job, evt) {
    job.events.push(evt);
    const listeners = job.listeners || {};
    for (const fn of Object.values(listeners)) {
        fn(evt);
    }
}

function snapshotPortsOnly(fullState) {
    return {
        ports: fullState.ports || [],
        containers: fullState.containers || []
    };
}

/* ============================================================================
   HTTP Server
============================================================================ */

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const method = req.method;

    /* =====================================================================
       Static files
    ===================================================================== */

    if (method === "GET" && parsed.pathname === "/") {
        return fs.createReadStream(
            path.join(__dirname, "public", "index.html")
        ).pipe(res);
    }

    if (method === "GET" && parsed.pathname.startsWith("/")) {
        const filePath = path.join(__dirname, "public", parsed.pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return fs.createReadStream(filePath).pipe(res);
        }
    }

    /* =====================================================================
       Category Overrides (Stage 2)
    ===================================================================== */

    if (method === "GET" && parsed.pathname === "/api/overrides/category") {
        return json(res, 200, readCategoryOverrides());
    }

    if (method === "POST" && parsed.pathname === "/api/overrides/category") {
        let body = "";
        req.on("data", c => (body += c));
        req.on("end", () => {
            let incoming;
            try {
                incoming = JSON.parse(body || "{}");
            } catch {
                return badRequest(res, "Invalid JSON");
            }

            const current = readCategoryOverrides();

            for (const [container, value] of Object.entries(incoming)) {
                if (value) {
                    current[container] = {
                        category: value,
                        source: "user",
                        setAt: Date.now()
                    };
                } else {
                    delete current[container];
                }
            }

            writeCategoryOverrides(current);
            return json(res, 200, current);
        });
        return;
    }

    /* =====================================================================
       GET /api/scan
    ===================================================================== */

    if (method === "GET" && parsed.pathname === "/api/scan") {
        try {
            const state = await loadState({
                baseUrl: "http://127.0.0.1:4100"
            });
            json(res, 200, state);
        } catch (err) {
            json(res, 500, { error: err.message });
        }
        return;
    }

    /* =====================================================================
       POST /api/plan  (READ-ONLY PLAN PREVIEW)
    ===================================================================== */

    if (method === "POST" && parsed.pathname === "/api/plan") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
            let input;
            try {
                input = JSON.parse(body || "{}");
            } catch {
                return badRequest(res, "Invalid JSON");
            }

            const sessionOverrides = input.categoryOverrides || {};
            const persistedOverrides = readCategoryOverrides();

            const mergedOverrides = {
                ...persistedOverrides,
                ...sessionOverrides
            };

            try {
                const state = await loadState({
                    baseUrl: "http://127.0.0.1:4100"
                });

                const classificationResult = classify(state, {
                    overrides: mergedOverrides
                });

                const classificationByName = {};
                for (const c of classificationResult.containers || []) {
                    classificationByName[c.name] = {
                        category: c.category,
                        confidence: c.confidence,
                        reason: c.reasons
                    };
                }

                const plan = buildPlan({
                    classification: classificationResult,
                    state: state,
                    overrides: mergedOverrides,
                    policyEnforcement: input.policyEnforcement || {}
                });

                return json(res, 200, {
                    classification: classificationByName,
                    plan
                });
            } catch (err) {
                return json(res, 500, { error: err.message });
            }
        });
        return;
    }

    /* =====================================================================
       POST /api/apply
    ===================================================================== */

    if (method === "POST" && parsed.pathname === "/api/apply") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
            let input;
            try {
                input = JSON.parse(body || "{}");
            } catch {
                return badRequest(res, "Invalid JSON");
            }

            const {
                selectedContainers = [],
                categoryOverrides = {},
                policyEnforcement = {},
                allowDockerMutation,
                dryRun
            } = input;

            const job = createJob({ selectedContainers });

            json(res, 202, { jobId: job.id });

            try {
                pushJobEvent(job, { type: "job:planning:start", ts: Date.now() });

                const preFull = await loadState({
                    baseUrl: "http://127.0.0.1:4100"
                });
                job.preState = preFull;

                const classification = classify(preFull, {
                    overrides: categoryOverrides || {}
                });

                const plan = buildPlan({
                    classification,
                    state: preFull,
                    overrides: categoryOverrides || {},
                    policyEnforcement: policyEnforcement || {}
                });

                // Filter to only executable actions
                const executablePlan = {
                    ...plan,
                    actions: plan.actions.filter(a => a.executable === true)
                };

                pushJobEvent(job, {
                    type: "plan:loaded",
                    ts: Date.now(),
                    actionCount: executablePlan.actions.length,
                    dryRun: dryRun === true
                });

                const result = await runExecutor({
                    apply: true,
                    yes: true,
                    allowDockerMutation: dryRun ? false : allowDockerMutation,
                    dryRun: dryRun === true,
                    planObject: executablePlan,
                    onProgress: evt => pushJobEvent(job, evt)
                });

                const postFull = await loadState({
                    baseUrl: "http://127.0.0.1:4100"
                });
                job.postState = postFull;

                completeJob(job, result);
                
                // Auto-save snapshot to disk
                try {
                    saveJobSnapshot(job);
                } catch (err) {
                    console.error("[Snapshot] Save failed:", err.message);
                }
            } catch (err) {
                failJob(job, err);
            }
        });
        return;
    }

    /* =====================================================================
       Rollback Routes
    ===================================================================== */

    const rollback = createRollbackRoutes({
        jobs,
        loadState,
        runExecutor,
        snapshotPortsOnly,
        createJob,
        completeJob,
        failJob,
        pushJobEvent,
        confirmPhrase: "ROLLBACK"
    });

    if (method === "POST" && parsed.pathname === "/api/rollback/plan") {
        return rollback.handleRollbackPlan(req, res, json);
    }

    if (method === "POST" && parsed.pathname === "/api/rollback/apply") {
        return rollback.handleRollbackApply(req, res, json);
    }

    /* =====================================================================
       GET /api/jobs/:id
    ===================================================================== */

    if (method === "GET" && parsed.pathname.startsWith("/api/jobs/")) {
        const id = parsed.pathname.split("/").pop();
        const job = jobs.get(id);
        if (!job) return notFound(res);
        return json(res, 200, job);
    }

    /* =====================================================================
       Snapshot Routes
    ===================================================================== */

    // GET /api/snapshots - List all saved snapshots
    if (method === "GET" && parsed.pathname === "/api/snapshots") {
        try {
            const snapshots = listSnapshots();
            return json(res, 200, { snapshots });
        } catch (err) {
            return json(res, 500, { error: err.message });
        }
    }

    // GET /api/snapshots/:id - Load specific snapshot
    if (method === "GET" && parsed.pathname.startsWith("/api/snapshots/")) {
        const snapshotId = parsed.pathname.split("/").pop();
        
        try {
            const snapshot = loadSnapshot(snapshotId);
            return json(res, 200, snapshot);
        } catch (err) {
            return json(res, 404, { error: err.message });
        }
    }

    // POST /api/restore - Restore from snapshot
    if (method === "POST" && parsed.pathname === "/api/restore") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
            let input;
            try {
                input = JSON.parse(body || "{}");
            } catch {
                return badRequest(res, "Invalid JSON");
            }
            
            const {
                snapshotId,
                selectedContainers,
                allowDockerMutation,
                confirmPhrase,
                dryRun
            } = input;
            
            if (!snapshotId) {
                return badRequest(res, "snapshotId required");
            }
            
            if (confirmPhrase !== "RESTORE") {
                return badRequest(res, "Confirmation phrase must be RESTORE");
            }
            
            try {
                // Load snapshot
                const snapshot = loadSnapshot(snapshotId);
                
                // Generate restore plan
                const plan = createRestorePlan(snapshot, selectedContainers);
                
                // Create job
                const job = createJob({
                    selectedContainers: selectedContainers || [],
                    kind: "restore",
                    sourceSnapshot: snapshotId
                });
                
                json(res, 202, { jobId: job.id });
                
                try {
                    pushJobEvent(job, {
                        type: "restore:start",
                        ts: Date.now(),
                        sourceSnapshot: snapshotId
                    });
                    
                    // Capture current state before restore
                    const preFull = await loadState({
                        baseUrl: "http://127.0.0.1:4100"
                    });
                    job.preState = preFull;
                    
                    pushJobEvent(job, {
                        type: "restore:plan:loaded",
                        ts: Date.now(),
                        actionCount: plan.actions.length,
                        dryRun: dryRun === true
                    });
                    
                    // Execute restore
                    const result = await runExecutor({
                        apply: true,
                        yes: true,
                        allowDockerMutation: dryRun ? false : allowDockerMutation,
                        dryRun: dryRun === true,
                        planObject: plan,
                        onProgress: evt => pushJobEvent(job, evt)
                    });
                    
                    // Capture state after restore
                    const postFull = await loadState({
                        baseUrl: "http://127.0.0.1:4100"
                    });
                    job.postState = postFull;
                    
                    completeJob(job, result);
                    
                    // Save restore job too
                    try {
                        saveJobSnapshot(job);
                    } catch (err) {
                        console.error("[Snapshot] Save failed:", err.message);
                    }
                    
                } catch (err) {
                    failJob(job, err);
                }
                
            } catch (err) {
                return json(res, 500, { error: err.message });
            }
        });
        return;
    }

    notFound(res);
});

/* ============================================================================
   Server start
============================================================================ */

server.listen(4200, "0.0.0.0", () => {
    console.log("[Port-MCP] Web UI listening on :4200");
    
    // Cleanup old snapshots (keep 30 days)
    try {
        const deleted = cleanupOldSnapshots(30);
        if (deleted > 0) {
            console.log(`[Snapshot] Cleaned up ${deleted} old snapshot(s)`);
        }
    } catch (err) {
        console.error("[Snapshot] Cleanup error:", err.message);
    }
});