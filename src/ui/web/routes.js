"use strict";

/**
 * ============================================================================
 * Port-MCP Enforcer — UI API Routes
 * Location: src/ui/web/routes.js
 *
 * NOTE:
 * - All routes are stubs in Step 1
 * - Logic will be added incrementally
 * ============================================================================
 */

const express = require("express");
const router = express.Router();

// Health check
router.get("/health", (req, res) => {
    res.json({
        status: "ok",
        ui: true,
        timestamp: Date.now()
    });
});

module.exports = router;
