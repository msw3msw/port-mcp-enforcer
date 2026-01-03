#!/usr/bin/env node

const { runPlanner } = require("../src/planner");

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    if (!command || command === "help") {
        console.log("Usage:");
        console.log("  port-mcp-enforcer plan");
        process.exit(0);
    }

    if (command === "plan") {
        try {
            await runPlanner({});
            console.log("Planner executed (no logic yet).");
            process.exit(0);
        } catch (err) {
            console.error("Planner error:", err.message);
            process.exit(1);
        }
    }

    console.error(`Unknown command: ${command}`);
    process.exit(1);
}

main();
