/**
 * ============================================================================
 * Port-MCP Enforcer â€” Policy Registry (AUTHORITATIVE, READ-ONLY)
 * Location: src/planner/policy/policies.js
 *
 * Purpose:
 * - Define all known port and classification policies
 * - Describe desired state without enforcing it (yet)
 *
 * HARD RULES:
 * - NO execution
 * - NO Docker mutation
 * - NO planner side effects
 * - Policies may be informational only
 * ============================================================================
 */

"use strict";

/**
 * Policy definitions.
 *
 * Each policy describes:
 * - who it applies to
 * - what the desired state is
 * - whether it is currently enforceable
 *
 * Enforcement is intentionally deferred.
 */
const POLICIES = [
    {
        id: "apps-port-layout",
        appliesTo: "apps",
        description:
            "Applications should use a fixed incremental TCP port layout for consistency",
        mode: "incremental",
        startPort: 5000,
        protocol: "tcp",
        enforceable: true,  // ← CHANGED FROM false
        rationale:
            "Provides predictable ports for dashboards, bookmarks, and proxies"
    },

    {
        id: "games-port-review",
        appliesTo: "games",
        description:
            "Game servers require explicit review of port assignments",
        mode: "manual",
        enforceable: true,
        rationale:
            "Game servers often require wide or dynamic port ranges"
    },

    {
        id: "system-protection",
        appliesTo: "system",
        description:
            "System containers must never have ports modified automatically",
        mode: "protected",
        enforceable: true,
        rationale:
            "Prevents breaking core infrastructure services"
    },

    {
        id: "unknown-classification",
        appliesTo: "unknown",
        description:
            "Unclassified containers require human review before any action",
        mode: "manual",
        enforceable: true,
        rationale:
            "Insufficient information to safely apply policies"
    }
];

/**
 * Helper: get policies by category
 */
function getPoliciesForCategory(category) {
    return POLICIES.filter(p => p.appliesTo === category);
}

/**
 * Helper: get policy by id
 */
function getPolicyById(id) {
    return POLICIES.find(p => p.id === id) || null;
}

module.exports = {
    POLICIES,
    getPoliciesForCategory,
    getPolicyById
};