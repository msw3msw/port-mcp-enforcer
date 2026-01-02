"use strict";

const fs = require("fs");

const LOG_PATH = "./executor-audit.log";

module.exports = function audit(entry) {
    const line = JSON.stringify(
        { time: Date.now(), ...entry }
    );
    fs.appendFileSync(LOG_PATH, line + "\n");
};
