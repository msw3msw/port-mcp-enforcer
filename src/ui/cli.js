"use strict";

const { loadState } = require("../planner/inputs/state-loader");
const classify = require("../planner/classify/classifier");
const buildPlan = require("../planner/plan/plan-builder");

const savePlan = require("../executor/plan-saver");
const loadPlan = require("../executor/plan-loader");

const renderDiff = require("../planner/output/diff-renderer");
const runExecutor = require("../executor");

const argv = process.argv.slice(2);
const cmd = argv[0];

function has(flag) {
    return argv.includes(flag);
}

function valueOf(flag) {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
    if (cmd === "plan") {
        const sub = argv[1];

        if (sub === "save") {
            const file = argv[2];
            if (!file) throw new Error("Usage: plan save <file>");

            const state = await loadState({ baseUrl: "http://127.0.0.1:4100" });
            const classification = classify(state);
            const plan = buildPlan({ classification, overrides: {} });

            savePlan(plan, file);
            console.log(`Plan saved to ${file}`);
            return;
        }

        if (sub === "diff") {
            const file = argv[2];
            if (!file) throw new Error("Usage: plan diff <file>");

            const plan = await loadPlan({ plan: file });
            renderDiff(plan);
            return;
        }
    }

    if (cmd === "apply") {
        await runExecutor({
            apply: true,
            yes: has("--yes"),
            allowDockerMutation: has("--allow-docker-mutation"),
            plan: valueOf("--from-plan")
        });
        return;
    }

    console.log("Commands:");
    console.log("  plan save <file>");
    console.log("  plan diff <file>");
    console.log("  apply --from-plan <file> [--yes] [--allow-docker-mutation]");
}

main().catch(err => {
    console.error("[CLI] Error:", err.message);
    process.exit(1);
});
