function createEmptyPlan(metadata = {}) {
    return {
        metadata,
        containers: [],
        summary: {
            compliant: 0,
            nonCompliant: 0,
            unclassified: 0
        }
    };
}

module.exports = {
    createEmptyPlan
};
