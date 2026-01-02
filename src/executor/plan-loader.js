"use strict";

const fs = require("fs");

module.exports = async function loadPlan(opts) {
    if (opts.plan) {
        return JSON.parse(fs.readFileSync(opts.plan, "utf8"));
    }
    if (opts.planObject) {
        return opts.planObject;
    }
    throw new Error("No plan provided");
};
