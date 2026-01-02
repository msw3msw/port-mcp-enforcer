/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Confirmation Gate
 * Location: src/executor/confirm.js
 *
 * Responsibility:
 * - Explicit user approval before mutation
 * - Separate gate for Docker downtime
 * ============================================================================
 */

"use strict";

const readline = require("readline");

function ask(prompt) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function confirmApply(plan) {
    console.log("\nYou are about to APPLY the following actions:\n");

    plan.actions.forEach((a, i) => {
        console.log(` ${i + 1}. ${a.type} → ${a.container}`);
    });

    console.log(
        "\nThis will modify Port-MCP registry and/or Docker state.\n" +
        'Type "APPLY" to continue:'
    );

    const answer = await ask("> ");
    return answer === "APPLY";
}

async function confirmDockerDowntime() {
    console.log(
        "\nWARNING: Docker mutation will STOP and RESTART containers.\n" +
        "Downtime is expected. Rollback is manual.\n\n" +
        "Type EXACTLY the following to continue:\n\n" +
        "I UNDERSTAND THIS WILL CAUSE DOWNTIME\n"
    );

    const answer = await ask("> ");
    return answer === "I UNDERSTAND THIS WILL CAUSE DOWNTIME";
}

module.exports = {
    confirmApply,
    confirmDockerDowntime
};
