/**
 * ============================================================================
 * Port-MCP Enforcer — Diff Renderer (UI, READ-ONLY)
 * Location: src/ui/web/public/diff-renderer.js
 *
 * Phase 2.3:
 * - Canonicalize diffs (stable, order-independent)
 * - Eliminate false positives
 * - Prepare for rollback safety
 *
 * HARD RULE:
 * - Derived views only; planner/executor remain authoritative
 * ============================================================================
 */

"use strict";

/* ============================================================================
   Helpers — canonicalization
============================================================================ */

function canonicalPortKey(p) {
    return `${p.container}::${p.protocol}::${p.host}::${p.containerPort}`;
}

function sortDiffs(list) {
    return list.sort((a, b) => {
        const ka = `${a.protocol}:${a.host}:${a.containerPort || a.from || ""}`;
        const kb = `${b.protocol}:${b.host}:${b.containerPort || b.from || ""}`;
        return ka.localeCompare(kb);
    });
}

/* ============================================================================
   Phase 2.1 — Plan (intent) diff
============================================================================ */

function renderPlanDiff(plan) {
    const diffs = {};

    if (!plan || !Array.isArray(plan.actions)) return diffs;

    for (const action of plan.actions) {
        if (action.type !== "update-container-ports") continue;

        const name = action.container;
        if (!diffs[name]) diffs[name] = [];

        const kind =
            action.from === null ? "ADD" :
            action.to === null ? "REMOVE" :
            "CHANGE";

        diffs[name].push({
            kind,
            protocol: action.protocol,
            from: action.from,
            to: action.to
        });
    }

    // Canonicalize per container
    for (const c of Object.keys(diffs)) {
        diffs[c] = sortDiffs(diffs[c]);
    }

    return diffs;
}

/* ============================================================================
   Phase 2.2 — State (actual) diff
============================================================================ */

function renderStateDiff(preState, postState) {
    const diffs = {};

    const prePorts = Array.isArray(preState?.ports) ? preState.ports : [];
    const postPorts = Array.isArray(postState?.ports) ? postState.ports : [];

    const preMap = new Map(prePorts.map(p => [canonicalPortKey(p), p]));
    const postMap = new Map(postPorts.map(p => [canonicalPortKey(p), p]));

    // ADDs
    for (const [k, p] of postMap.entries()) {
        if (!preMap.has(k)) {
            if (!diffs[p.container]) diffs[p.container] = [];
            diffs[p.container].push({
                kind: "ADD",
                protocol: p.protocol,
                host: p.host,
                containerPort: p.containerPort
            });
        }
    }

    // REMOVEs
    for (const [k, p] of preMap.entries()) {
        if (!postMap.has(k)) {
            if (!diffs[p.container]) diffs[p.container] = [];
            diffs[p.container].push({
                kind: "REMOVE",
                protocol: p.protocol,
                host: p.host,
                containerPort: p.containerPort
            });
        }
    }

    // Canonicalize per container
    for (const c of Object.keys(diffs)) {
        diffs[c] = sortDiffs(diffs[c]);
    }

    return diffs;
}

/* ============================================================================
   Exports
============================================================================ */

window.renderPlanDiff = renderPlanDiff;
window.renderStateDiff = renderStateDiff;
