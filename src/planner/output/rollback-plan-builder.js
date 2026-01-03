/**
 * ============================================================================
 * Port-MCP Enforcer — Rollback Plan Builder (PORTS ONLY)
 * Location: src/planner/output/rollback-plan-builder.js
 *
 * Phase 3.1
 *
 * Responsibility:
 * - Build a rollback plan that reverts port bindings
 *   from postState -> preState
 * - Emit executor-compatible actions ONLY
 *
 * HARD RULES:
 * - Ports only (no networks, no env, no volumes)
 * - No Docker access
 * - No side effects
 * - Output must be indistinguishable from a normal plan
 * ============================================================================
 */

"use strict";

/**
 * Build a rollback plan.
 *
 * @param {Object} params
 * @param {Array}  params.prePorts   Ports before execution (desired state)
 * @param {Array}  params.postPorts  Ports after execution (current state)
 * @param {Array}  params.selectedContainers Containers allowed to rollback
 *
 * @returns {Object} rollback plan
 */
function buildRollbackPlan({ prePorts, postPorts, selectedContainers }) {
    const actions = [];

    const allowed = new Set(selectedContainers || []);

    function key(p) {
        // container + protocol + containerPort uniquely identify intent
        return `${p.container}::${p.protocol}::${p.containerPort}`;
    }

    const preMap = new Map();
    const postMap = new Map();

    for (const p of Array.isArray(prePorts) ? prePorts : []) {
        if (!allowed.has(p.container)) continue;
        preMap.set(key(p), p);
    }

    for (const p of Array.isArray(postPorts) ? postPorts : []) {
        if (!allowed.has(p.container)) continue;
        postMap.set(key(p), p);
    }

    /* ---------------------------------------------------------------------
       REMOVE: exists now, but did not exist before
       ------------------------------------------------------------------ */

    for (const [k, post] of postMap.entries()) {
        if (!preMap.has(k)) {
            actions.push({
                type: "update-container-ports",
                container: post.container,
                protocol: post.protocol,
                from: post.host,
                to: null
            });
        }
    }

    /* ---------------------------------------------------------------------
       ADD or CHANGE: existed before, but missing or different now
       ------------------------------------------------------------------ */

    for (const [k, pre] of preMap.entries()) {
        const post = postMap.get(k);

        // ADD (missing entirely)
        if (!post) {
            actions.push({
                type: "update-container-ports",
                container: pre.container,
                protocol: pre.protocol,
                from: null,
                to: pre.host
            });
            continue;
        }

        // CHANGE (same port, different host binding)
        if (post.host !== pre.host) {
            actions.push({
                type: "update-container-ports",
                container: pre.container,
                protocol: pre.protocol,
                from: post.host,
                to: pre.host
            });
        }
    }

    return {
        kind: "rollback",
        dryRun: true,
        summary: `Rollback ${actions.length} port change(s)`,
        actions
    };
}

module.exports = {
    buildRollbackPlan
};
