/**
 * ============================================================================
 * Port-MCP Enforcer — Plan Builder (DRY-RUN)
 * Location: src/planner/plan/plan-builder.js
 *
 * Responsibility:
 * - Convert analysis + classification into a proposed plan
 * - NO Docker mutation
 * - NO allocation
 * - NO execution
 *
 * HARD RULES:
 * - Output must be explainable
 * - Output must be auditable
 * - Planner ≠ Executor
 * ============================================================================
 */

"use strict";

/* ============================================================================
   Helpers
============================================================================ */

function summarize(classification) {
    const counts = {
        system: 0,
        apps: 0,
        games: 0,
        unknown: 0
    };

    for (const c of classification.containers) {
        counts[c.category] = (counts[c.category] || 0) + 1;
    }

    return (
        `Detected ${classification.containers.length} containers ` +
        `(system=${counts.system}, apps=${counts.apps}, ` +
        `games=${counts.games}, unknown=${counts.unknown})`
    );
}

/* ============================================================================
   Plan builder
============================================================================ */

module.exports = function buildPlan(context) {
    if (!context || !context.classification) {
        throw new Error("Plan builder requires classification in context");
    }

    const { classification, overrides } = context;

    const actions = [];

    for (const c of classification.containers) {
        const finalCategory =
            overrides?.[c.name]?.category || c.category;

        // Only describe potential actions — no decisions yet
        if (finalCategory === "games") {
            actions.push({
                type: "review-game-ports",
                container: c.name,
                reason: "container classified as game server",
                confidence: c.confidence,
                proposed: true
            });
        }

        if (finalCategory === "unknown") {
            actions.push({
                type: "manual-review",
                container: c.name,
                reason: "container classification unresolved",
                confidence: c.confidence,
                proposed: true
            });
        }
    }

    return {
        dryRun: true,
        summary: summarize(classification),
        actionCount: actions.length,
        actions
    };
};
