/**
 * Analyzer (READ-ONLY)
 *
 * Orchestrates analysis modules. Produces findings only.
 * No policy application in Step 6.
 */

const { analyzePorts } = require("./port-analysis");
const { analyzeNetworks } = require("./network-analysis");

function summarize(portsResult, networksResult) {
    return {
        fetchedAt: Date.now(),
        ports: portsResult?.totals || null,
        networks: networksResult?.totals || null
    };
}

async function runAnalysis(input = {}) {
    const { state } = input;

    if (!state || typeof state !== "object") {
        throw new Error("Analyzer requires { state }");
    }

    const ports = analyzePorts(state);
    const networks = analyzeNetworks(state);

    return {
        summary: summarize(ports, networks),
        ports,
        networks
    };
}

module.exports = {
    runAnalysis
};
