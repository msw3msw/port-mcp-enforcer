/**
 * ============================================================================
 * Port-MCP Enforcer — CLI Entrypoint
 * Location: src/ui/cli.js
 *
 * Responsibility:
 * - Orchestrate planner execution
 * - Handle ALL user interaction
 * - Collect explicit user intent
 *
 * HARD RULES:
 * - Classifier is pure
 * - Prompts live ONLY here
 * - No Docker mutation
 * ============================================================================
 */

"use strict";

const readline = require("readline");

const { loadState } = require("../planner/inputs/state-loader");
const classify = require("../planner/classify/classifier");

/* ============================================================================
   Configuration
============================================================================ */

const LOW_CONFIDENCE_THRESHOLD = 0.4;
const VALID_CATEGORIES = ["system", "apps", "games", "unknown"];

/* ============================================================================
   Prompt helpers
============================================================================ */

function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function promptForOverride(container) {
    console.log(
        `\nLow-confidence classification detected:\n` +
        `  Container : ${container.name}\n` +
        `  Image     : ${container.image}\n` +
        `  Category  : ${container.category}\n` +
        `  Confidence: ${container.confidence}\n`
    );

    const answer = await ask(
        `Select category [system/apps/games/unknown] ` +
        `(Enter to keep "${container.category}"): `
    );

    if (!answer) return null;

    const v = answer.toLowerCase();
    if (!VALID_CATEGORIES.includes(v)) {
        console.log(`Invalid choice "${answer}", keeping original classification.`);
        return null;
    }

    return v;
}

/* ============================================================================
   CLI Execution
============================================================================ */

async function run() {
    const state = await loadState({ baseUrl: "http://127.0.0.1:4100" });

    const classification = classify(state);

    const overrides = {};

    for (const c of classification.containers) {
    if (c.confidence < LOW_CONFIDENCE_THRESHOLD && c.category === "unknown") {
        const override = await promptForOverride(c);
        if (override) {
            overrides[c.name] = {
                category: override,
                source: "user",
                at: Date.now()
            };
        }
    }
}


    console.log("\nClassification summary:\n");

    for (const c of classification.containers) {
        const finalCategory = overrides[c.name]?.category || c.category;
        const suffix = overrides[c.name] ? " (user override)" : "";

        console.log(
            `- ${c.name.padEnd(30)} → ${finalCategory}${suffix}`
        );
    }

    console.log("\nUser overrides:");
    console.log(
        Object.keys(overrides).length
            ? JSON.stringify(overrides, null, 2)
            : "(none)"
    );

    return {
        classification,
        overrides
    };
}

/* ============================================================================
   Entrypoint
============================================================================ */

run().catch(err => {
    console.error("[CLI] Fatal error:", err);
    process.exit(1);
});
