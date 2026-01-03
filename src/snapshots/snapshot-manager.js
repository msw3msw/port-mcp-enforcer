/**
 * ============================================================================
 * Port-MCP Enforcer — Snapshot Manager
 * Location: src/snapshots/snapshot-manager.js
 *
 * Responsibility:
 * - Save job snapshots to disk (JSON files)
 * - Load snapshots from disk
 * - Restore from snapshot (rollback to any point in time)
 * - Cleanup old snapshots
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Snapshot directory
const SNAPSHOTS_DIR = path.join(__dirname, "../../snapshots");

/**
 * Initialize snapshot directory
 */
function ensureSnapshotDir() {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
        fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
}

/**
 * Save job snapshot to disk
 * Creates a directory with pre/post state and diff
 */
function saveJobSnapshot(job) {
    ensureSnapshotDir();
    
    if (!job || !job.id) {
        throw new Error("Invalid job for snapshot");
    }
    
    // Skip dry-run jobs
    if (job.dryRun === true) {
        console.log(`[Snapshot] Skipping dry-run job ${job.id}`);
        return null;
    }
    
    // Require both snapshots
    if (!job.preState || !job.postState) {
        console.log(`[Snapshot] Job ${job.id} missing pre/post state`);
        return null;
    }
    
    // Create job directory with timestamp
    const timestamp = new Date(job.finishedAt || Date.now())
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
    
    const jobDir = path.join(SNAPSHOTS_DIR, `${job.id}-${timestamp}`);
    
    if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
    }
    
    // Save pre-state
    fs.writeFileSync(
        path.join(jobDir, "pre.json"),
        JSON.stringify(job.preState, null, 2)
    );
    
    // Save post-state
    fs.writeFileSync(
        path.join(jobDir, "post.json"),
        JSON.stringify(job.postState, null, 2)
    );
    
    // Generate and save diff
    const diff = generatePortDiff(
        job.preState.ports || [],
        job.postState.ports || []
    );
    
    fs.writeFileSync(
        path.join(jobDir, "diff.json"),
        JSON.stringify(diff, null, 2)
    );
    
    // Save metadata
    const metadata = {
        jobId: job.id,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        duration: job.finishedAt - job.startedAt,
        selectedContainers: job.selectedContainers || [],
        dryRun: job.dryRun || false,
        kind: job.kind || "execution"
    };
    
    fs.writeFileSync(
        path.join(jobDir, "metadata.json"),
        JSON.stringify(metadata, null, 2)
    );
    
    console.log(`[Snapshot] Saved: ${jobDir}`);
    
    return jobDir;
}

/**
 * Generate port diff showing what changed
 */
function generatePortDiff(prePorts, postPorts) {
    const changes = [];
    
    const preMap = new Map();
    const postMap = new Map();
    
    // Build maps
    for (const p of prePorts) {
        const key = `${p.container}:${p.containerPort}/${p.protocol}`;
        preMap.set(key, p);
    }
    
    for (const p of postPorts) {
        const key = `${p.container}:${p.containerPort}/${p.protocol}`;
        postMap.set(key, p);
    }
    
    // Find changes
    for (const [key, post] of postMap.entries()) {
        const pre = preMap.get(key);
        
        if (!pre) {
            // Added
            changes.push({
                type: "added",
                container: post.container,
                containerPort: post.containerPort,
                protocol: post.protocol,
                from: null,
                to: post.host
            });
        } else if (pre.host !== post.host) {
            // Changed
            changes.push({
                type: "changed",
                container: post.container,
                containerPort: post.containerPort,
                protocol: post.protocol,
                from: pre.host,
                to: post.host
            });
        }
    }
    
    // Find removed
    for (const [key, pre] of preMap.entries()) {
        if (!postMap.has(key)) {
            changes.push({
                type: "removed",
                container: pre.container,
                containerPort: pre.containerPort,
                protocol: pre.protocol,
                from: pre.host,
                to: null
            });
        }
    }
    
    return {
        generatedAt: Date.now(),
        totalChanges: changes.length,
        changes
    };
}

/**
 * List all saved snapshots
 */
function listSnapshots() {
    ensureSnapshotDir();
    
    const dirs = fs.readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
        .reverse(); // Most recent first
    
    const snapshots = [];
    
    for (const dir of dirs) {
        const metadataPath = path.join(SNAPSHOTS_DIR, dir, "metadata.json");
        
        if (!fs.existsSync(metadataPath)) continue;
        
        try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
            
            snapshots.push({
                directory: dir,
                path: path.join(SNAPSHOTS_DIR, dir),
                ...metadata
            });
        } catch (err) {
            console.error(`[Snapshot] Error reading ${dir}:`, err.message);
        }
    }
    
    return snapshots;
}

/**
 * Load a specific snapshot by job ID or directory
 */
function loadSnapshot(jobIdOrDir) {
    ensureSnapshotDir();
    
    // Find matching directory
    const dirs = fs.readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    
    const matchingDir = dirs.find(d => 
        d.startsWith(jobIdOrDir) || d === jobIdOrDir
    );
    
    if (!matchingDir) {
        throw new Error(`Snapshot not found: ${jobIdOrDir}`);
    }
    
    const snapshotDir = path.join(SNAPSHOTS_DIR, matchingDir);
    
    // Load all files
    const preState = JSON.parse(
        fs.readFileSync(path.join(snapshotDir, "pre.json"), "utf8")
    );
    
    const postState = JSON.parse(
        fs.readFileSync(path.join(snapshotDir, "post.json"), "utf8")
    );
    
    const diff = JSON.parse(
        fs.readFileSync(path.join(snapshotDir, "diff.json"), "utf8")
    );
    
    const metadata = JSON.parse(
        fs.readFileSync(path.join(snapshotDir, "metadata.json"), "utf8")
    );
    
    return {
        directory: matchingDir,
        path: snapshotDir,
        preState,
        postState,
        diff,
        metadata
    };
}

/**
 * Restore ports from a snapshot
 * Returns a rollback plan to restore the pre-state
 */
function createRestorePlan(snapshot, selectedContainers = null) {
    const { preState, postState } = snapshot;
    
    if (!preState || !postState) {
        throw new Error("Snapshot missing state data");
    }
    
    const prePorts = preState.ports || [];
    const postPorts = postState.ports || [];
    
    // Filter by selected containers if provided
    const allowed = selectedContainers 
        ? new Set(selectedContainers)
        : null;
    
    function shouldInclude(containerName) {
        return !allowed || allowed.has(containerName);
    }
    
    // Build restore actions (reverse the changes)
    const actions = [];
    
    const preMap = new Map();
    const postMap = new Map();
    
    for (const p of prePorts) {
        if (!shouldInclude(p.container)) continue;
        const key = `${p.container}:${p.containerPort}/${p.protocol}`;
        preMap.set(key, p);
    }
    
    for (const p of postPorts) {
        if (!shouldInclude(p.container)) continue;
        const key = `${p.container}:${p.containerPort}/${p.protocol}`;
        postMap.set(key, p);
    }
    
    // Group by container
    const byContainer = new Map();
    
    // Changes: restore to pre-state
    for (const [key, pre] of preMap.entries()) {
        const post = postMap.get(key);
        
        if (!byContainer.has(pre.container)) {
            byContainer.set(pre.container, { from: [], to: [] });
        }
        
        const container = byContainer.get(pre.container);
        
        if (post) {
            // Existed in both - restore old host port
            container.from.push({
                host: post.host,
                container: pre.containerPort,
                protocol: pre.protocol
            });
            container.to.push({
                host: pre.host,
                container: pre.containerPort,
                protocol: pre.protocol
            });
        } else {
            // Only in pre (was removed) - restore it
            container.from.push(null);
            container.to.push({
                host: pre.host,
                container: pre.containerPort,
                protocol: pre.protocol
            });
        }
    }
    
    // Build actions
    for (const [containerName, ports] of byContainer.entries()) {
        if (ports.to.length === 0) continue;
        
        actions.push({
            type: "update-container-ports",
            container: containerName,
            from: ports.from.filter(Boolean),
            to: ports.to,
            reason: `Restore from snapshot ${snapshot.metadata.jobId}`
        });
    }
    
    return {
        kind: "restore",
        source: snapshot.metadata.jobId,
        sourceTimestamp: snapshot.metadata.finishedAt,
        dryRun: true,
        summary: `Restore ${actions.length} container(s) to snapshot state`,
        actions
    };
}

/**
 * Cleanup old snapshots (keep last N days)
 */
function cleanupOldSnapshots(daysToKeep = 30) {
    ensureSnapshotDir();
    
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const snapshots = listSnapshots();
    
    let deletedCount = 0;
    
    for (const snapshot of snapshots) {
        if (snapshot.finishedAt < cutoffTime) {
            try {
                fs.rmSync(snapshot.path, { recursive: true, force: true });
                console.log(`[Snapshot] Deleted old: ${snapshot.directory}`);
                deletedCount++;
            } catch (err) {
                console.error(`[Snapshot] Delete failed: ${err.message}`);
            }
        }
    }
    
    console.log(`[Snapshot] Cleanup complete: ${deletedCount} removed`);
    return deletedCount;
}

module.exports = {
    saveJobSnapshot,
    listSnapshots,
    loadSnapshot,
    createRestorePlan,
    cleanupOldSnapshots
};
