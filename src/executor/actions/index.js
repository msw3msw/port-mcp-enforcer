/**
 * ============================================================================
 * Port-MCP Enforcer — Executor Actions Registry
 * Location: src/executor/actions/index.js
 *
 * Responsibility:
 * - Map action types to handlers
 * ============================================================================
 */

"use strict";

module.exports = {
    "reserve-port": require("./reserve-port")
};
