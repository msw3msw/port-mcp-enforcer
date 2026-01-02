"use strict";

const { loadState } = require("../planner/inputs/state-loader");
const classify = require("../planner/classify/classifier");
const buildPlan = require("../planner/plan/plan-builder");

const savePlan = require("../executor/plan-saver");
const loadPlan = require("../executor/plan-loader");

const renderConsole = require("../planner/output/console-renderer");
const renderDiff = require("../planner/output/diff-renderer");

const runExecutor = require("../executor");

const cmd = process.argv[2];

async function main() {
    if (cmd === "plan") {
        const sub = process.argv[3];

        if (sub === "save") {
            const file = process.argv[4];
            if (!file) throw new Error("Usage: plan save <file>");

            const state = await loadState({ baseUrl: "http://127.0.0.1:4100" });
            const classification = classify(state);
            const plan = buildPlan({ classification, overrides: {} });

            savePlan(plan, file);
            console.log(`Plan saved to ${file}`);
            return;
        }

        if (sub === "diff") {
            const file = process.argv[4];
            if (!file) throw new Error("Usage: plan diff <file>");

            const plan = await loadPlan({ plan: file });
            renderDiff(plan);
            return;
        }
    }

    if (cmd === "apply") {
        await runExecutor({
            apply: true,
            yes: process.argv.includes("--yes"),
            plan: process.argv.includes("--from-plan")
                ? process.argv[process.argv.indexOf("--from-plan") + 1]
                : undefined
        });
        return;
    }

    console.log("Commands:");
    console.log("  plan save <file>");
    console.log("  plan diff <file>");
    console.log("  apply [--from-plan <file>] [--yes]");
}

main().catch(err => {
    console.error("[CLI] Error:", err.message);
    process.exit(1);
});
