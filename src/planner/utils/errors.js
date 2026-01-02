class PlannerError extends Error {
    constructor(message) {
        super(message);
        this.name = "PlannerError";
    }
}

module.exports = {
    PlannerError
};
