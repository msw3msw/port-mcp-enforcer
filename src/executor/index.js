"use strict";

const loadPlan = require("./plan-loader");
const preflight = require("./preflight");
const { confirmApply, confirmDockerDowntime } = require("./confirm");
const actions = require("./actions");
const audit = require("./audit-log");

function planHasDockerMutation(plan) {
    return plan.actions.some(a => a.type === "update-container-ports");
}

/**
 * Optional progress emitter (non-breaking).
 * If opts.onProgress is not supplied, this is a no-op.
 */
function emitProgress(opts, evt) {
    try {
        if (opts && typeof opts.onProgress === "function") {
            opts.onProgress({
                ...evt,
                ts: Date.now()
            });
        }
    } catch {
        // Never allow progress listeners to break execution
    }
}

module.exports = async function runExecutor(opts = {}) {
    if (!opts.apply) {
        throw new Error("Refusing to execute without --apply");
    }

    emitProgress(opts, { type: "job:start" });

    const plan = await loadPlan(opts);

    // IMPORTANT: inherit dryRun from plan if not explicitly supplied
    if (opts.dryRun === undefined && plan && plan.dryRun === true) {
        opts.dryRun = true;
    }

    emitProgress(opts, {
        type: "plan:loaded",
        actionCount: Array.isArray(plan?.actions) ? plan.actions.length : 0,
        dryRun: opts.dryRun === true
    });

    await preflight(plan);

    emitProgress(opts, { type: "preflight:complete" });

    if (!opts.yes) {
        const ok = await confirmApply(plan);
        if (!ok) {
            emitProgress(opts, { type: "job:aborted", reason: "apply-not-confirmed" });
            audit({ status: "aborted", reason: "apply-not-confirmed", plan });
            return { status: "aborted" };
        }
    }

    const requiresDocker = planHasDockerMutation(plan);

    if (requiresDocker) {
        if (!opts.allowDockerMutation) {
            throw new Error(
                "Plan contains Docker mutation but --allow-docker-mutation was not provided"
            );
        }

        const ok = await confirmDockerDowntime();
        if (!ok) {
            emitProgress(opts, { type: "job:aborted", reason: "docker-downtime-not-confirmed" });
            audit({ status: "aborted", reason: "docker-downtime-not-confirmed", plan });
            return { status: "aborted" };
        }
    }

    const results = [];

    for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i];
        const handler = actions[action.type];
        if (!handler) throw new Error(`No handler for ${action.type}`);

        emitProgress(opts, {
            type: "action:start",
            index: i,
            total: plan.actions.length,
            actionType: action.type,
            container: action.container
        });

        try {
            const result = await handler(action, opts);
            results.push({ action: action.type, container: action.container, result });

            emitProgress(opts, {
                type: "action:success",
                index: i,
                total: plan.actions.length,
                actionType: action.type,
                container: action.container
            });
        } catch (err) {
            emitProgress(opts, {
                type: "action:error",
                index: i,
                total: plan.actions.length,
                actionType: action.type,
                container: action.container,
                error: err instanceof Error ? err.message : String(err)
            });
            throw err;
        }
    }

    audit({
        status: "success",
        actions: plan.actions,
        results
    });

    emitProgress(opts, {
        type: "job:complete",
        status: "success",
        actionCount: plan.actions.length
    });

    return { status: "success", results };
};
