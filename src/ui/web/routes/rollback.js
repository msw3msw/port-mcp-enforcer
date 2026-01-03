/**
 * ============================================================================
 * Port-MCP Enforcer — Rollback Routes (ACTIVE UI TREE)
 * Location: src/ui/web/routes/rollback.js
 *
 * Phases:
 * - 3.1.B  Rollback plan preview (read-only)
 * - 3.2    Rollback execution (ports-only)
 *
 * HARD RULES:
 * - Rollback is just another plan
 * - Same executor, same safety gates
 * - NO rollback for dry-run jobs
 * ============================================================================
 */

"use strict";

// Planner is authoritative and lives at src/planner/output
const { buildRollbackPlan } = require("../../../planner/output/rollback-plan-builder");

/**
 * Factory to create rollback route handlers.
 *
 * All state and helpers are dependency-injected from server.js
 */
function createRollbackRoutes({
    jobs,
    loadState,
    runExecutor,
    snapshotPortsOnly,
    createJob,
    completeJob,
    failJob,
    pushJobEvent,
    confirmPhrase
}) {

    /* =====================================================================
       Helpers
    ===================================================================== */

    function findExistingRollback(sourceJobId) {
        for (const job of jobs.values()) {
            if (job.kind === "rollback" && job.sourceJobId === sourceJobId) {
                return job;
            }
        }
        return null;
    }

    /* =====================================================================
       POST /api/rollback/plan   (PREVIEW ONLY)
    ===================================================================== */

    async function handleRollbackPlan(req, res, send) {
        let body = "";

        req.on("data", chunk => (body += chunk));
        req.on("end", () => {
            let input;
            try {
                input = JSON.parse(body || "{}");
            } catch {
                return send(res, 400, { error: "Invalid JSON" });
            }

            const { jobId, selectedContainers } = input;

            if (!jobId) {
                return send(res, 400, { error: "jobId is required" });
            }

            const job = jobs.get(jobId);
            if (!job) {
                return send(res, 404, { error: "Job not found" });
            }

            // 🔒 RULE: dry-run jobs never need rollback
            if (job.dryRun === true) {
                return send(res, 200, {
                    jobId,
                    actions: [],
                    reason: "Dry-run job — rollback not applicable"
                });
            }

            if (!job.preState || !job.postState) {
                return send(res, 400, {
                    error: "Job does not have rollback snapshots"
                });
            }

            const containers =
                Array.isArray(selectedContainers) && selectedContainers.length
                    ? selectedContainers
                    : null;

            const plan = buildRollbackPlan({
                prePorts: job.preState.ports,
                postPorts: job.postState.ports,
                selectedContainers: containers
            });

            send(res, 200, {
                jobId,
                actions: Array.isArray(plan?.actions) ? plan.actions : []
            });
        });
    }

    /* =====================================================================
       POST /api/rollback/apply  (EXECUTION)
    ===================================================================== */

    async function handleRollbackApply(req, res, send) {
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
                jobId,
                selectedContainers,
                allowDockerMutation,
                confirmPhrase: typedPhrase,
                dryRun
            } = input;

            if (!jobId) {
                return send(res, 400, { error: "jobId is required" });
            }

            const sourceJob = jobs.get(jobId);
            if (!sourceJob) {
                return send(res, 404, { error: "Source job not found" });
            }

            // 🔒 RULE: dry-run jobs cannot be rolled back
            if (sourceJob.dryRun === true) {
                return send(res, 400, {
                    error: "Rollback is not applicable to dry-run jobs"
                });
            }

            if (!sourceJob.preState || !sourceJob.postState) {
                return send(res, 400, {
                    error: "Source job does not have rollback snapshots"
                });
            }

            const existing = findExistingRollback(sourceJob.id);
            if (existing) {
                return send(res, 409, {
                    error: "Rollback already exists for this job",
                    rollbackJobId: existing.id
                });
            }

            if (!dryRun && !allowDockerMutation) {
                return send(res, 400, {
                    error: "Docker mutation not allowed"
                });
            }

            if (typedPhrase !== confirmPhrase) {
                return send(res, 400, {
                    error: "Confirmation phrase mismatch"
                });
            }

            const containers =
                Array.isArray(selectedContainers) && selectedContainers.length
                    ? selectedContainers
                    : null;

            const job = createJob({
                selectedContainers: containers || []
            });

            job.kind = "rollback";
            job.sourceJobId = sourceJob.id;

            send(res, 202, { jobId: job.id });

            try {
                pushJobEvent(job, {
                    type: "rollback:planning:start",
                    ts: Date.now(),
                    sourceJobId: sourceJob.id
                });

                const preFull = await loadState({ baseUrl: "http://127.0.0.1:4100" });
                job.preState = snapshotPortsOnly(preFull);

                pushJobEvent(job, {
                    type: "job:snapshot:pre",
                    ts: Date.now(),
                    ports: job.preState.ports.length
                });

                const plan = buildRollbackPlan({
                    prePorts: sourceJob.preState.ports,
                    postPorts: sourceJob.postState.ports,
                    selectedContainers: containers
                });

                pushJobEvent(job, {
                    type: "rollback:planning:complete",
                    ts: Date.now(),
                    actionCount: Array.isArray(plan?.actions)
                        ? plan.actions.length
                        : 0,
                    dryRun: dryRun === true
                });

                const result = await runExecutor({
                    apply: true,
                    yes: true,
                    allowDockerMutation: dryRun ? false : true,
                    dryRun: dryRun === true,
                    planObject: plan,
                    onProgress: evt => pushJobEvent(job, evt)
                });

                const postFull = await loadState({ baseUrl: "http://127.0.0.1:4100" });
                job.postState = snapshotPortsOnly(postFull);

                pushJobEvent(job, {
                    type: "job:snapshot:post",
                    ts: Date.now(),
                    ports: job.postState.ports.length
                });

                completeJob(job, result);
            } catch (err) {
                failJob(job, err);
            }
        });
    }

    return {
        handleRollbackPlan,
        handleRollbackApply
    };
}

module.exports = {
    createRollbackRoutes
};
