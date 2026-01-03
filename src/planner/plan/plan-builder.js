/**
 * ============================================================================
 * Port-MCP Enforcer — Plan Builder (AUTHORITATIVE)
 * Location: src/planner/plan/plan-builder.js
 *
 * Responsibility:
 * - Transform classification + overrides into planner output
 * - Emit policy context per container
 * - Promote enforceable policies into executable actions (opt-in only)
 *
 * HARD RULES:
 * - NO Docker mutation
 * - NO executor calls
 * - Manual-review actions are NEVER executable
 * ============================================================================
 */

"use strict";

const { getPoliciesForCategory } = require("../policy/policies");

/**
 * Build a port lookup map from state.
 * Maps container name -> array of port bindings
 */
function buildPortMap(state) {
    const portMap = new Map();
    
    if (!state || !Array.isArray(state.ports)) {
        return portMap;
    }
    
    for (const port of state.ports) {
        if (!port.container) continue;
        
        if (!portMap.has(port.container)) {
            portMap.set(port.container, []);
        }
        
        portMap.get(port.container).push({
            host: port.host,
            container: port.containerPort,
            protocol: port.protocol || "tcp"
        });
    }
    
    return portMap;
}

/**
 * Build a container lookup map from state.
 * Maps container name -> container object
 */
function buildContainerMap(state) {
    const containerMap = new Map();
    
    if (!state || !Array.isArray(state.containers)) {
        return containerMap;
    }
    
    for (const container of state.containers) {
        if (container.name) {
            containerMap.set(container.name, container);
        }
    }
    
    return containerMap;
}

/**
 * Generate port assignments for apps using incremental layout.
 * Returns { container -> [{ host, container, protocol }] }
 */
function generateIncrementalLayout(containers, portMap, startPort = 5000) {
    const assignments = new Map();
    let nextPort = startPort;
    
    // Sort containers by name for deterministic assignment
    const sortedContainers = [...containers].sort((a, b) => 
        a.name.localeCompare(b.name)
    );
    
    for (const container of sortedContainers) {
        const currentPorts = portMap.get(container.name) || [];
        const newPorts = [];
        
        // Only reassign TCP ports; preserve UDP unchanged
        const tcpPorts = currentPorts.filter(p => p.protocol === "tcp");
        const udpPorts = currentPorts.filter(p => p.protocol === "udp");
        
        // Assign new sequential TCP host ports
        for (const tcpPort of tcpPorts) {
            newPorts.push({
                host: nextPort++,
                container: tcpPort.container,
                protocol: "tcp"
            });
        }
        
        // Preserve UDP ports unchanged
        newPorts.push(...udpPorts);
        
        if (newPorts.length > 0) {
            assignments.set(container.name, newPorts);
        }
    }
    
    return assignments;
}

/**
 * Compare two port arrays to detect changes.
 * Returns true if ports are different.
 */
function portsChanged(fromPorts, toPorts) {
    if (fromPorts.length !== toPorts.length) return true;
    
    // Create normalized key for comparison
    const key = (p) => `${p.host}:${p.container}/${p.protocol}`;
    
    const fromSet = new Set(fromPorts.map(key));
    const toSet = new Set(toPorts.map(key));
    
    if (fromSet.size !== toSet.size) return true;
    
    for (const k of fromSet) {
        if (!toSet.has(k)) return true;
    }
    
    return false;
}

/**
 * Main plan builder function.
 * 
 * @param {Object} params
 * @param {Object} params.classification - Classification result from classifier
 * @param {Object} params.state - Current state from state-loader (optional)
 * @param {Object} params.overrides - Category overrides (optional)
 * @param {Object} params.policyEnforcement - User opt-in enforcement map (optional)
 * @returns {Object} Plan with actions array
 */
function buildPlan({
    classification,
    state = null,
    overrides = {},
    policyEnforcement = {}
}) {
    const actions = [];
    
    // Build lookup maps from state
    const portMap = buildPortMap(state);
    const containerMap = buildContainerMap(state);
    
    // Handle both old format (object with container keys) and new format (containers array)
    let containers = [];
    if (classification && Array.isArray(classification.containers)) {
        containers = classification.containers;
    } else if (classification && typeof classification === "object") {
        // Legacy support: convert object format to array
        containers = Object.entries(classification).map(([name, info]) => ({
            name,
            ...info
        }));
    }
    
    // Group containers by category for batch processing
    const byCategory = new Map();
    for (const container of containers) {
        const category = container.category || "unknown";
        if (!byCategory.has(category)) {
            byCategory.set(category, []);
        }
        byCategory.get(category).push(container);
    }
    
    // Pre-calculate port assignments for apps (if needed)
    const appsContainers = byCategory.get("apps") || [];
    const appsWithEnforcement = appsContainers.filter(c => 
        policyEnforcement?.[c.name] === true
    );
    
    let incrementalAssignments = new Map();
    if (appsWithEnforcement.length > 0 && state) {
        incrementalAssignments = generateIncrementalLayout(
            appsWithEnforcement,
            portMap,
            5000
        );
    }
    
    // Process each container
    for (const container of containers) {
        const { name, category, confidence } = container;
        
        const override = overrides[name];
        const effectiveCategory = override?.category || category;
        const confidenceUsed = override?.category ? 1.0 : confidence ?? null;
        
        const policies = getPoliciesForCategory(effectiveCategory);
        const primaryPolicy = policies[0] || null;
        
        const userEnforced = policyEnforcement?.[name] === true;
        const containerState = containerMap.get(name);
        
        /* =================================================================
           Policy: Unknown classification
        ================================================================= */
        
        if (!effectiveCategory || effectiveCategory === "unknown") {
            actions.push({
                type: "manual-review",
                container: name,
                executable: false,
                policyContext: {
                    id: "unknown-classification",
                    status: "blocking",
                    enforceable: false,
                    reason: "Container could not be confidently classified",
                    confidenceUsed
                }
            });
            continue;
        }
        
        /* =================================================================
           Policy: Low confidence
        ================================================================= */
        
        if (confidenceUsed !== null && confidenceUsed < 0.9) {
            actions.push({
                type: "manual-review",
                container: name,
                executable: false,
                policyContext: {
                    id: "low-confidence-classification",
                    status: "blocking",
                    enforceable: false,
                    reason: "Classifier confidence below safe threshold",
                    confidenceUsed
                }
            });
            continue;
        }
        
        /* =================================================================
           Policy: Games require explicit review
        ================================================================= */
        
        if (effectiveCategory === "games") {
            actions.push({
                type: "review-game-ports",
                container: name,
                executable: false,
                policyContext: {
                    id: "games-port-review",
                    status: "blocking",
                    enforceable: false,
                    reason: "Game servers require explicit review of port assignments",
                    confidenceUsed
                }
            });
            continue;
        }
        
        /* =================================================================
           Policy: System (protected - never mutate)
        ================================================================= */
        
        if (effectiveCategory === "system") {
            const systemPolicy = policies.find(p => p.id === "system-protection");
            
            actions.push({
                type: "no-op",
                container: name,
                executable: false,
                policyContext: {
                    id: "system-protection",
                    status: "protected",
                    enforceable: true,
                    reason: "System containers are protected from automatic mutation",
                    confidenceUsed
                }
            });
            continue;
        }
        
        /* =================================================================
           Policy: Apps (incremental layout - enforceable when enabled)
        ================================================================= */
        
        if (effectiveCategory === "apps" && primaryPolicy) {
            const enforceable = Boolean(primaryPolicy.enforceable);
            const enforced = enforceable && userEnforced;
            
            // Check if we can actually execute this
            const canExecute = enforced && 
                               containerState?.running && 
                               incrementalAssignments.has(name);
            
            if (canExecute) {
                const currentPorts = portMap.get(name) || [];
                const desiredPorts = incrementalAssignments.get(name) || [];
                
                // Only create action if ports actually need to change
                if (portsChanged(currentPorts, desiredPorts)) {
                    actions.push({
                        type: "update-container-ports",
                        container: name,
                        executable: true,
                        from: currentPorts,
                        to: desiredPorts,
                        policyContext: {
                            id: primaryPolicy.id,
                            status: "enforced",
                            enforceable: true,
                            reason: "Applying incremental port layout per user opt-in",
                            confidenceUsed
                        }
                    });
                } else {
                    // Already compliant
                    actions.push({
                        type: "no-op",
                        container: name,
                        executable: false,
                        policyContext: {
                            id: primaryPolicy.id,
                            status: "compliant",
                            enforceable: true,
                            reason: "Container already complies with incremental layout",
                            confidenceUsed
                        }
                    });
                }
            } else if (enforced && !containerState?.running) {
                // User wants enforcement but container not running
                actions.push({
                    type: "no-op",
                    container: name,
                    executable: false,
                    policyContext: {
                        id: primaryPolicy.id,
                        status: "blocked-not-running",
                        enforceable: true,
                        reason: "Container must be running for policy enforcement",
                        confidenceUsed
                    }
                });
            } else {
                // Enforceable but not enforced (waiting for user opt-in)
                actions.push({
                    type: "no-op",
                    container: name,
                    executable: false,
                    policyContext: {
                        id: primaryPolicy.id,
                        status: enforceable ? "enforceable-opt-in" : "present-not-enforced",
                        enforceable,
                        reason: enforceable
                            ? "Policy may be enforced if user opts in"
                            : "Policy exists but enforcement is disabled",
                        confidenceUsed
                    }
                });
            }
            continue;
        }
        
        /* =================================================================
           No policy or unhandled category
        ================================================================= */
        
        actions.push({
            type: "no-op",
            container: name,
            executable: false,
            policyContext: {
                id: "no-policy",
                status: "no-action-required",
                enforceable: false,
                reason: "No applicable policy",
                confidenceUsed
            }
        });
    }
    
    return {
        generatedAt: Date.now(),
        actionCount: actions.length,
        executableCount: actions.filter(a => a.executable === true).length,
        actions
    };
}

module.exports = buildPlan;