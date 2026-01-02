/**
 * ============================================================================
 * Port-MCP Enforcer — Executor (SKELETON)
 * Location: src/executor/index.js
 *
 * Responsibility:
 * - Execute an approved plan transactionally
 *
 * HARD RULES:
 * - Requires explicit --apply
 * - NO implicit execution
 * - NO background jobs
 * ============================================================================
 */

"use strict";

const loadPlan = require("./plan-loader");
const preflight = require("./preflight");
const confirm = require("./confirm");

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

    console.log("\n=== Executor (SKELETON) ===");
    console.log("No actions have been executed.");
    console.log("The following actions WOULD be applied:\n");

    plan.actions.forEach((a, i) => {
        console.log(
            `${i + 1}. ${a.type} → ${a.container} (${a.reason || "no reason"})`
        );
    });

    return {
        status: "dry-skeleton",
        actions: plan.actions.length
    };
};
