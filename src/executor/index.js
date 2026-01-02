"use strict";

const loadPlan = require("./plan-loader");
const preflight = require("./preflight");
const { confirmApply, confirmDockerDowntime } = require("./confirm");
const actions = require("./actions");
const audit = require("./audit-log");

function planHasDockerMutation(plan) {
    return plan.actions.some(a => a.type === "update-container-ports");
}

module.exports = async function runExecutor(opts = {}) {
    if (!opts.apply) {
        throw new Error("Refusing to execute without --apply");
    }

    const plan = await loadPlan(opts);

    // IMPORTANT: inherit dryRun from plan if not explicitly supplied
    if (opts.dryRun === undefined && plan && plan.dryRun === true) {
        opts.dryRun = true;
    }

    await preflight(plan);

    if (!opts.yes) {
        const ok = await confirmApply(plan);
        if (!ok) {
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
            audit({ status: "aborted", reason: "docker-downtime-not-confirmed", plan });
            return { status: "aborted" };
        }
    }

    const results = [];

    for (const action of plan.actions) {
        const handler = actions[action.type];
        if (!handler) throw new Error(`No handler for ${action.type}`);

        const result = await handler(action, opts);
        results.push({ action: action.type, container: action.container, result });
    }

    audit({
        status: "success",
        actions: plan.actions,
        results
    });

    return { status: "success", results };
};
