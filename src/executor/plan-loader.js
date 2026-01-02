/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Plan Loader
 * Location: src/executor/plan-loader.js
 *
 * Responsibility:
 * - Load plan from file or memory
 * ============================================================================
 */

"use strict";

const fs = require("fs");

module.exports = async function loadPlan(opts) {
    if (opts.plan) {
        const raw = fs.readFileSync(opts.plan, "utf8");
        return JSON.parse(raw);
    }

    if (opts.planObject) {
        return opts.planObject;
    }

    throw new Error("No plan provided to executor");
};
