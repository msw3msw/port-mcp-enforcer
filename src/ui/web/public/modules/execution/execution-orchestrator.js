/**
 * ============================================================================
 * Port-MCP Enforcer â€” Execution Orchestrator Module
 * Location: src/ui/web/public/modules/execution/execution-orchestrator.js
 *
 * Responsibility:
 * - Execute apply operations
 * - Poll job status (SSE + fallback)
 * - Manage execution state
 * - Handle job completion
 * ============================================================================
 */

"use strict";

window.ExecutionOrchestrator = (function() {
    /* ====================================================================
       Constants
    ==================================================================== */
    
    const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";
    
    /* ====================================================================
       Private State
    ==================================================================== */
    
    let isExecuting = false;
    let activeJobId = null;
    let lastExecutionJobs = new Map();
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    async function applySelected() {
        const selectedContainers = window.PolicyEnforcementUI?.getSelectedContainers() || [];
        
        if (!selectedContainers.length) {
            alert("No containers selected.");
            return;
        }
        
        const dryRun = document.getElementById("dryRunOnly")?.checked;
        const allowDockerMutation = document.getElementById("allowMutation")?.checked;
        
        if (!dryRun && !allowDockerMutation) {
            alert("Planned changes must be explicitly allowed.");
            return;
        }
        
        const confirmText = document.getElementById("confirmText")?.value || "";
        if (confirmText !== CONFIRM_PHRASE) {
            alert("Typed confirmation phrase does not match.");
            return;
        }
        
        isExecuting = true;
        
        if (typeof window.render === 'function') {
            window.render();
        }
        
        const res = await fetch("/api/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                selectedContainers,
                categoryOverrides: window.CategoryOverridesUI?.categoryOverrides || {},
                policyEnforcement: window.PolicyEnforcementUI?.getIntent() || {},
                allowDockerMutation,
                dryRun,
                confirmPhrase: confirmText
            })
        });
        
        const payload = await res.json();
        if (!payload?.jobId) {
            isExecuting = false;
            alert("Apply failed.");
            if (typeof window.render === 'function') {
                window.render();
            }
            return;
        }
        
        activeJobId = payload.jobId;
        await pollJobCompletion(payload.jobId);
    }
    
    function getIsExecuting() {
        return isExecuting;
    }
    
    /* ====================================================================
       Internal Helpers
    ==================================================================== */
    
    async function pollJobCompletion(jobId) {
        const eventSource = new EventSource(`/api/jobs/${jobId}/events`);
        
        eventSource.onmessage = (event) => {
            const evt = JSON.parse(event.data);
            console.log('[Job Event]', evt);
            
            if (evt.type === 'action:start') {
                console.log(`Executing action ${evt.index + 1}/${evt.total}: ${evt.actionType} on ${evt.container}`);
            }
            
            if (evt.type === 'job:completed') {
                eventSource.close();
                handleJobComplete(jobId, 'completed');
            }
            
            if (evt.type === 'job:failed') {
                eventSource.close();
                handleJobComplete(jobId, 'failed', evt.error);
            }
        };
        
        eventSource.onerror = () => {
            eventSource.close();
            pollJobCompletionFallback(jobId);
        };
    }
    
    async function pollJobCompletionFallback(jobId) {
        const maxAttempts = 60;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const job = await res.json();
                
                if (job.status === 'completed') {
                    handleJobComplete(jobId, 'completed');
                    return;
                }
                
                if (job.status === 'failed') {
                    handleJobComplete(jobId, 'failed', job.error);
                    return;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
                
            } catch (err) {
                console.error('Job polling error:', err);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        isExecuting = false;
        alert('Job execution timeout - check server logs');
        
        if (typeof window.scan === 'function') {
            await window.scan();
        }
    }
    
    async function handleJobComplete(jobId, status, error = null) {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();
        
        lastExecutionJobs.set(jobId, job);
        
        isExecuting = false;
        
        if (status === 'completed') {
            alert(`Execution completed!\n\nJob ID: ${jobId}\n\nRefresh to see changes.`);
            
            // Auto-refresh after successful execution
            if (typeof window.scan === 'function') {
                setTimeout(() => {
                    console.log('[Execution] Auto-scanning after port change...');
                    window.scan();
                }, 2000);
            }
        } else {
            alert(`Execution failed!\n\nError: ${error || 'Unknown error'}`);
        }
        
        if (typeof window.scan === 'function') {
            await window.scan();
        }
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        applySelected,
        isExecuting: getIsExecuting
    };
})();

/* ============================================================================
   Global Shortcuts
============================================================================ */

window.applySelected = () => window.ExecutionOrchestrator.applySelected();
