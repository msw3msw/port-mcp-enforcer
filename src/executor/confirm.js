/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Confirmation Gate
 * Location: src/executor/confirm.js
 *
 * Responsibility:
 * - Explicit user approval before mutation
 * ============================================================================
 */

"use strict";

const readline = require("readline");

module.exports = async function confirm(plan) {
    console.log("\nYou are about to APPLY the following actions:\n");

    plan.actions.forEach((a, i) => {
        console.log(` ${i + 1}. ${a.type} → ${a.container}`);
    });

    console.log(
        "\nThis will modify Port-MCP registry and/or Docker state.\n" +
        'Type "APPLY" to continue:'
    );

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question("> ", answer => {
            rl.close();
            resolve(answer.trim() === "APPLY");
        });
    });
};
