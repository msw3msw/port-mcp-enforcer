/**
 * ============================================================================
 * Port-MCP Enforcer — Rollback Routes
 * Location: src/ui/web/routes/rollback.js
 *
 * Phase 3.1.B + Phase 3.2
 *
 * Responsibility:
 * - Rollback plan preview (READ-ONLY)
 * - Rollback execution (ports-only)
 *
 * HARD RULES:
 * - Rollback is just another plan
 * - Same executor, same safety gates
 * - No Docker mutation without explicit consent
 * ============================================================================
 */

"use strict";

const { buildRollbackPlan } = require("../../planner/output/rollback-plan-builder");

/**
 * Factory to create rollback route handlers.
 *
 * @param {Object} deps
 * @param {Map}    deps.jobs
 * @param {Function} deps.loadState
 * @param {Function} deps.runExecutor
 * @param {Function} deps.snapshotPortsOnly
 * @param {Function} deps.createJob
 * @param {Function} deps.completeJob
 * @param {Function} deps.failJob
 * @param {Function} deps.pushJobEvent
 * @param {string}   deps.confirmPhrase
 *
 * @returns {Object}
 */
function createRollbackRoutes(deps) {
    const {
        jobs,
        loadState,
        runExecutor,
        snapshotPortsOnly,
        createJob,
        completeJob,
        failJob,
        pushJobEvent,
        confirmPhrase
    } = deps;

    /* =====================================================================
       POST /api/rollback/plan  (PREVIEW ONLY)
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

            send(res, 200, { jobId, plan });
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

            if (!sourceJob.preState || !sourceJob.postState) {
                return send(res, 400, {
                    error: "Source job does not have rollback snapshots"
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

            // Create rollback execution job
            const job = createJob({
                selectedContainers: containers || []
            });

            send(res, 202, { jobId: job.id });

            try {
                pushJobEvent(job, {
                    type: "rollback:planning:start",
                    ts: Date.now(),
                    sourceJobId: sourceJob.id
                });

                // Snapshot live ports at rollback start
                const preFull = await loadState({ baseUrl: "http://127.0.0.1:4100" });
                job.preState = snapshotPortsOnly(preFull);

                pushJobEvent(job, {
                    type: "job:snapshot:pre",
                    ts: Date.now(),
                    ports: job.preState.ports.length
                });

                // Build rollback plan
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

                // Execute rollback via same executor path
                const result = await runExecutor({
                    apply: true,
                    yes: true,
                    allowDockerMutation: dryRun ? false : true,
                    dryRun: dryRun === true,
                    planObject: plan,
                    onProgress: evt => pushJobEvent(job, evt)
                });

                // Snapshot ports after rollback
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
