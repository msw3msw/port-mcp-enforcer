/**
 * ============================================================================
 * Port-MCP Enforcer — Container Classifier (READ-ONLY)
 * Location: src/planner/classify/classifier.js
 *
 * Responsibility:
 * - Deterministically classify containers
 * - Conservative labeling with explicit uncertainty
 *
 * HARD RULES:
 * - NO Docker mutation
 * - NO policy inference
 * - NO port planning
 * - Prefer "unknown" over incorrect classification
 *
 * Stage 3 add-on (minimal):
 * - If caller provides overrides, they are authoritative:
 *   category forced + confidence = 1.0 + reason "user override"
 * ============================================================================
 */

"use strict";

/* ============================================================================
   Heuristic keywords (v1, conservative)
============================================================================ */

const GAME_KEYWORDS = [
    "7dtd",
    "seven-days",
    "valheim",
    "minecraft",
    "factorio",
    "satisfactory",
    "conan",
    "rust",
    "icarus",
    "ark"
];

const SYSTEM_KEYWORDS = [
    "traefik",
    "nginx",
    "caddy",
    "port-mcp",
    "docker",
    "watchtower",
    "unraid",
    "grafana",
    "prometheus"
];

const APP_KEYWORDS = [
    "postgres",
    "mysql",
    "redis",
    "mongo",
    "node",
    "api",
    "web",
    "ui",
    "dashboard"
];

/* ============================================================================
   Helpers
============================================================================ */

function norm(v) {
    return String(v || "").toLowerCase();
}

function containsAny(haystack, needles) {
    return needles.some(n => haystack.includes(n));
}

function hasUdpPorts(container) {
    return Array.isArray(container.ports)
        && container.ports.some(p => norm(p.protocol) === "udp");
}

function hasTcpOnlyPorts(container) {
    return Array.isArray(container.ports)
        && container.ports.length > 0
        && container.ports.every(p => norm(p.protocol) === "tcp");
}

function gamePortSignal(container) {
    if (!Array.isArray(container.ports)) return false;
    return container.ports.some(p => Number(p.host) >= 20000);
}

/**
 * Overrides can be:
 * - { "container-name": "games" }
 * - { "container-name": { category: "games", ... } }
 * - { "container-name": { category: "games", source: "user", setAt: ... } }
 */
function getOverrideCategory(overrides, containerName) {
    if (!overrides || typeof overrides !== "object") return null;
    const v = overrides[containerName];
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v.category === "string") return v.category;
    return null;
}

/* ============================================================================
   Core classification logic
============================================================================ */

function classifyContainer(container, overrides) {
    const overrideCategory = getOverrideCategory(overrides, container.name);
    if (overrideCategory) {
        return {
            id: container.id,
            name: container.name,
            image: container.image,
            category: overrideCategory,
            confidence: 1.0,
            reasons: ["user override"],
            tags: []
        };
    }

    const name = norm(container.name);
    const image = norm(container.image);

    const reasons = [];
    const score = {
        system: 0,
        apps: 0,
        games: 0
    };

    // Keyword signals
    if (containsAny(name, GAME_KEYWORDS) || containsAny(image, GAME_KEYWORDS)) {
        score.games += 2;
        reasons.push("matches known game keywords");
    }

    if (containsAny(name, SYSTEM_KEYWORDS) || containsAny(image, SYSTEM_KEYWORDS)) {
        score.system += 2;
        reasons.push("matches infrastructure keywords");
    }

    if (containsAny(name, APP_KEYWORDS) || containsAny(image, APP_KEYWORDS)) {
        score.apps += 1;
        reasons.push("matches application keywords");
    }

    // Port-based signals
    if (hasUdpPorts(container)) {
        score.games += 2;
        reasons.push("exposes UDP ports");
    }

    if (hasTcpOnlyPorts(container)) {
        score.apps += 1;
        reasons.push("TCP-only exposure");
    }

    if (gamePortSignal(container)) {
        score.games += 1;
        reasons.push("host ports in typical game range");
    }

    // Conservative decision
    let category = "unknown";
    let confidence = 0.2;

    const ordered = Object.entries(score)
        .sort((a, b) => b[1] - a[1]);

    if (ordered[0][1] > 0 && ordered[0][1] >= ordered[1][1] + 1) {
        category = ordered[0][0];
        confidence = Math.min(0.95, ordered[0][1] / 5);
    }

    return {
        id: container.id,
        name: container.name,
        image: container.image,
        category,
        confidence,
        reasons,
        tags: []
    };
}

/* ============================================================================
   Public API
============================================================================ */

/**
 * Backward compatible:
 * - classify(state)
 * - classify(state, { overrides })
 */
module.exports = function classify(state, options = {}) {
    if (!state || !Array.isArray(state.containers)) {
        throw new Error("Classifier requires normalized state with containers[]");
    }

    const overrides = options?.overrides || {};

    return {
        containers: state.containers.map(c => classifyContainer(c, overrides))
    };
};
