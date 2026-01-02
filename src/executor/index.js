"use strict";

const loadPlan = require("./plan-loader");
const preflight = require("./preflight");
const confirm = require("./confirm");
const actions = require("./actions");
const audit = require("./audit-log");

module.exports = async function runExecutor(opts = {}) {
    if (!opts.apply) {
        throw new Error("Refusing to execute without --apply");
    }

    const plan = await loadPlan(opts);
    await preflight(plan);

    if (!opts.yes) {
        const ok = await confirm(plan);
        if (!ok) {
            audit({ status: "aborted", plan });
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
