/**
 * ============================================================================
 * Port-MCP Enforcer — Executor
 * Location: src/executor/index.js
 *
 * Responsibility:
 * - Execute an approved plan transactionally
 *
 * HARD RULES:
 * - Requires explicit --apply
 * - NO implicit execution
 * ============================================================================
 */

"use strict";

const loadPlan = require("./plan-loader");
const preflight = require("./preflight");
const confirm = require("./confirm");
const actions = require("./actions");

module.exports = async function runExecutor(opts = {}) {
    if (!opts.apply) {
        throw new Error(
            "Refusing to execute without --apply flag (executor is opt-in only)"
        );
    }

    const plan = await loadPlan(opts);

    if (plan.dryRun !== true) {
        throw new Error("Executor only accepts dry-run plans");
    }

    await preflight(plan);

    if (!opts.yes) {
        const ok = await confirm(plan);
        if (!ok) {
            console.log("Execution aborted by user.");
            return { status: "aborted" };
        }
    }

    console.log("\n=== Executing Plan ===\n");

    const results = [];

    for (const action of plan.actions) {
        const handler = actions[action.type];

        if (!handler) {
            throw new Error(`No executor handler for action: ${action.type}`);
        }

        console.log(`→ Executing ${action.type} for ${action.container}`);

        const res = await handler(action, {
            baseUrl: opts.baseUrl,
            dryRun: opts.dryRun
        });

        results.push({
            action: action.type,
            container: action.container,
            result: res
        });
    }

    return {
        status: "success",
        results
    };
};
