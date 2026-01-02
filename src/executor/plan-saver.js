"use strict";

const fs = require("fs");

module.exports = function savePlan(plan, file) {
    if (!file) throw new Error("plan file path required");
    fs.writeFileSync(file, JSON.stringify(plan, null, 2), "utf8");
    return file;
};
