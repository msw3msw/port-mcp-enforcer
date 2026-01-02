function createMcpClient(config) {
    return {
        getContainers: async () => {
            throw new Error("getContainers not implemented");
        },
        getPorts: async () => {
            throw new Error("getPorts not implemented");
        },
        getNetworks: async () => {
            throw new Error("getNetworks not implemented");
        },
        getRegistry: async () => {
            throw new Error("getRegistry not implemented");
        },
        getPolicy: async () => {
            throw new Error("getPolicy not implemented");
        }
    };
}

module.exports = {
    createMcpClient
};
