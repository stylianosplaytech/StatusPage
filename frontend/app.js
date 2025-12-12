const API_BASE = '/api';

// Helper function to parse date as UTC
function parseUTCDate(dateString) {
    if (!dateString) return null;
    // If date string doesn't end with Z or have timezone, treat it as UTC
    if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
        // SQLite datetime format: YYYY-MM-DD HH:MM:SS - treat as UTC
        return new Date(dateString + 'Z');
    }
    return new Date(dateString);
}

// Load status on page load
document.addEventListener('DOMContentLoaded', () => {
    loadStatus();
    loadAppVersion();
    setInterval(loadStatus, 30000); // Refresh every 30 seconds
    
    // Also listen for storage events to refresh when admin panel makes changes
    window.addEventListener('storage', (e) => {
        if (e.key === 'statusPageRefresh') {
            loadStatus();
        }
    });
    
    // Also check localStorage periodically for same-window updates
    let lastRefresh = localStorage.getItem('statusPageRefresh');
    setInterval(() => {
        const currentRefresh = localStorage.getItem('statusPageRefresh');
        if (currentRefresh && currentRefresh !== lastRefresh) {
            lastRefresh = currentRefresh;
            loadStatus();
        }
    }, 1000); // Check every second
});

// Load and display app version
async function loadAppVersion() {
    const versionEl = document.getElementById('appVersion');
    if (!versionEl) return;
    
    try {
        const response = await fetch(`${API_BASE}/version`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const buildDate = new Date(data.buildDate).toLocaleString();
        versionEl.textContent = `v${data.version} • Built: ${buildDate} • Node ${data.nodeVersion}`;
    } catch (error) {
        console.error('Failed to load version:', error);
        versionEl.textContent = `v1.0.5`;
    }
}

async function loadStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();

        renderComponents(data.components);
        
        // Filter out any resolved incidents from active_incidents (double-check)
        // An incident is considered resolved if resolved_at is set OR current_status is 'resolved'
        const activeIncidents = (data.active_incidents || []).filter(inc => 
            !inc.resolved_at && inc.current_status !== 'resolved'
        );
        
        // Always show active incidents section
        document.getElementById('activeIncidentsSection').style.display = 'block';
        if (activeIncidents.length > 0) {
            renderIncidents(activeIncidents, 'activeIncidentsList');
        } else {
            // Show message when no active incidents
            document.getElementById('activeIncidentsList').innerHTML = '<p class="loading">No active incidents</p>';
        }

        // Load resolved incidents
        await loadResolvedIncidents();

        if (data.maintenances && data.maintenances.length > 0) {
            document.getElementById('maintenanceSection').style.display = 'block';
            renderMaintenances(data.maintenances);
        } else {
            document.getElementById('maintenanceSection').style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

async function loadResolvedIncidents() {
    try {
        // Load all incidents and filter for resolved ones
        const [publicResponse, internalResponse] = await Promise.all([
            fetch(`${API_BASE}/incidents?visibility=public&limit=1000`),
            fetch(`${API_BASE}/incidents?visibility=internal&limit=1000`)
        ]);
        
        const publicIncidents = await publicResponse.json();
        const internalIncidents = await internalResponse.json();
        
        // Combine and filter to only resolved incidents
        // An incident is resolved if resolved_at is set OR current_status is 'resolved'
        const allIncidents = [...publicIncidents, ...internalIncidents];
        const resolvedIncidents = allIncidents.filter(inc => 
            inc.resolved_at !== null || inc.current_status === 'resolved'
        );
        
        // Remove duplicates by ID
        const uniqueResolved = resolvedIncidents.filter((inc, index, self) => 
            index === self.findIndex(i => i.id === inc.id)
        );
        
        // Sort by resolved date, most recent first (use resolved_at if available, otherwise started_at)
        uniqueResolved.sort((a, b) => {
            const dateA = a.resolved_at ? parseUTCDate(a.resolved_at) : parseUTCDate(a.started_at);
            const dateB = b.resolved_at ? parseUTCDate(b.resolved_at) : parseUTCDate(b.started_at);
            return dateB - dateA;
        });
        
        // Always show resolved incidents section
        const resolvedSection = document.getElementById('resolvedIncidentsSection');
        if (resolvedSection) {
            resolvedSection.style.display = 'block';
            
            if (uniqueResolved.length > 0) {
                renderResolvedIncidents(uniqueResolved);
            } else {
                document.getElementById('resolvedIncidentsList').innerHTML = '<p class="loading">No resolved incidents</p>';
            }
        }
    } catch (error) {
        console.error('Failed to load resolved incidents:', error);
    }
}

function renderComponents(components) {
    const grid = document.getElementById('componentsGrid');
    
    if (!components || components.length === 0) {
        grid.innerHTML = '<p class="loading">No components configured</p>';
        return;
    }

    // Filter to only show visible components
    const visibleComponents = components.filter(comp => comp.visible !== 0 && comp.visible !== false);
    
    if (visibleComponents.length === 0) {
        grid.innerHTML = '<p class="loading">No components configured</p>';
        return;
    }

    // Group components by group_name
    const grouped = {};
    visibleComponents.forEach(comp => {
        const group = comp.group_name || 'Other';
        if (!grouped[group]) {
            grouped[group] = [];
        }
        grouped[group].push(comp);
    });

    let html = '';
    Object.keys(grouped).sort().forEach(group => {
        if (group !== 'Other') {
            html += `<div style="grid-column: 1 / -1; font-weight: 600; color: #4a5568; margin-top: 16px; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">${group}</div>`;
        }
        grouped[group].forEach(comp => {
            // Production: Use detected_version if available, otherwise fall back to manual version
            const prodVersion = comp.detected_version || comp.version;
            const prodNamespaceClass = comp.namespace ? `namespace-${comp.namespace.toLowerCase()}` : '';
            
            // Shadow version
            const shadowVersion = comp.shadow_detected_version;
            const shadowNamespaceClass = comp.shadow_namespace ? `namespace-${comp.shadow_namespace.toLowerCase()}` : '';
            
            // Check if shadow data exists
            const hasShadow = comp.shadow_version_url || comp.shadow_namespace || shadowVersion;
            
            // Check if shadow is unreachable (show outdated info instead of rescan)
            const shadowUnreachable = comp.shadow_status === 'potential_outage';
            
            // Check if component has potential outage (show rescan button) - EXCLUDE shadow status
            const hasPotentialOutage = comp.status === 'potential_outage' || comp.website_status === 'potential_outage';
            
            // Website link button
            const websiteButton = comp.website_url ? 
                `<a href="${escapeHtml(comp.website_url)}" target="_blank" rel="noopener noreferrer" class="website-link-btn" title="Open ${escapeHtml(comp.name)} website" onclick="event.stopPropagation();">🌐</a>` : '';
            
            // Website status indicator
            const websiteStatusBadge = comp.website_url && comp.website_status === 'potential_outage' ? 
                `<span class="website-status-badge unreachable" title="Website unreachable">🌐❌</span>` : '';
            
            // Calculate next check time for this component
            const hasAnyUrl = comp.version_url || comp.shadow_version_url || comp.website_url;
            const lastChecked = comp.version_last_checked || comp.shadow_version_last_checked || comp.website_last_checked;
            const checkStatusHtml = hasAnyUrl ? getComponentCheckStatus(comp.id, lastChecked) : '';
            
            html += `
                <div class="component-card" data-component-id="${comp.id}">
                    <div class="component-header">
                        <div class="component-name">
                            <span style="margin-right: 8px;">${escapeHtml(comp.name)}</span>
                            ${websiteButton}
                        </div>
                        <div class="component-status-wrapper">
                            ${websiteStatusBadge}
                            <span class="component-status ${comp.status}">${comp.status.replace('_', ' ')}</span>
                            ${hasPotentialOutage ? `<button class="rescan-btn" onclick="rescanComponent(${comp.id}, this)" title="Rescan now">🔄 Rescan</button>` : ''}
                        </div>
                    </div>
                    <div class="component-versions">
                        <div class="version-row production">
                            <span class="env-label prod-label">PROD</span>
                            ${comp.namespace ? `<span class="component-namespace ${prodNamespaceClass}">${escapeHtml(comp.namespace)}</span>` : ''}
                            ${prodVersion ? `<span class="component-version">v${escapeHtml(prodVersion)}</span>` : '<span class="component-version no-data">-</span>'}
                        </div>
                        ${hasShadow ? `
                        <div class="version-row shadow">
                            <span class="env-label shadow-label">SHADOW${shadowUnreachable ? ' ⚠️' : ''}</span>
                            ${comp.shadow_namespace ? `<span class="component-namespace ${shadowNamespaceClass}">${escapeHtml(comp.shadow_namespace)}</span>` : ''}
                            ${shadowVersion ? `<span class="component-version">v${escapeHtml(shadowVersion)}</span>` : '<span class="component-version no-data">-</span>'}
                        </div>
                        ` : ''}
                    </div>
                    ${checkStatusHtml}
                </div>
            `;
        });
    });

    grid.innerHTML = html;
}

function renderIncidents(incidents, containerId) {
    const container = document.getElementById(containerId);
    
    if (!incidents || incidents.length === 0) {
        container.innerHTML = '<p class="loading">No incidents</p>';
        return;
    }

    const isActiveIncidents = containerId === 'activeIncidentsList';
    
    let html = '';
    incidents.forEach(incident => {
        const startedAt = parseUTCDate(incident.started_at);
        const resolvedAt = parseUTCDate(incident.resolved_at);
        
        // Get updates/comments
        const updates = incident.updates || [];
        const sortedUpdates = [...updates].sort((a, b) => parseUTCDate(a.timestamp) - parseUTCDate(b.timestamp));
        const lastUpdateIndex = sortedUpdates.length - 1;
        
        // Active incidents - full display
        html += `
            <div class="incident-card ${incident.impact}" onclick="showIncidentDetail(${incident.id})">
                <div class="incident-header">
                    <div class="incident-title">${escapeHtml(incident.title)}</div>
                    <span class="incident-impact ${incident.impact}">${incident.impact}</span>
                </div>
                <div class="incident-meta">
                    Started: ${formatDate(startedAt)}
                    ${resolvedAt ? ` • Resolved: ${formatDate(resolvedAt)}` : ''}
                </div>
                <span class="incident-status ${incident.current_status}">${incident.current_status}</span>
                ${isActiveIncidents && sortedUpdates.length > 0 ? `
                    <div class="incident-updates" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                        <div style="font-size: 12px; font-weight: 600; color: #718096; margin-bottom: 10px; text-transform: uppercase;">Updates</div>
                        ${sortedUpdates.map((update, index) => {
                            const updateTime = parseUTCDate(update.timestamp);
                            const isLast = index === lastUpdateIndex;
                            return `
                                <div class="incident-update-item" style="margin-bottom: ${isLast ? '0' : '12px'}; padding: ${isLast ? '10px' : '8px'}; background-color: ${isLast ? '#f7fafc' : 'transparent'}; border-radius: 6px; ${isLast ? 'border-left: 3px solid #4299e1;' : ''}">
                                    <div style="font-size: 11px; color: #718096; margin-bottom: 4px;">
                                        ${formatDate(updateTime)}
                                    </div>
                                    <div style="font-size: 14px; color: #1a202c; ${isLast ? 'font-weight: 600;' : ''}">
                                        ${escapeHtml(update.message)}
                                    </div>
                                    ${update.status ? `<span class="incident-status ${update.status}" style="margin-top: 6px; display: inline-block;">${update.status}</span>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderResolvedIncidents(incidents) {
    const container = document.getElementById('resolvedIncidentsList');
    
    if (!incidents || incidents.length === 0) {
        container.innerHTML = '<p class="loading">No resolved incidents</p>';
        return;
    }
    
    let html = '';
    incidents.forEach(incident => {
        const startedAt = parseUTCDate(incident.started_at);
        // If resolved_at is null but status is resolved, try to get it from the last update
        let resolvedAt = parseUTCDate(incident.resolved_at);
        if (!resolvedAt && incident.current_status === 'resolved') {
            // If no resolved_at but status is resolved, use last update timestamp as fallback
            const updates = incident.updates || [];
            if (updates.length > 0) {
                const sortedUpdates = [...updates].sort((a, b) => parseUTCDate(a.timestamp) - parseUTCDate(b.timestamp));
                const lastUpdate = sortedUpdates[sortedUpdates.length - 1];
                resolvedAt = parseUTCDate(lastUpdate.timestamp);
            }
        }
        
        // Get updates/comments
        const updates = incident.updates || [];
        const sortedUpdates = [...updates].sort((a, b) => parseUTCDate(a.timestamp) - parseUTCDate(b.timestamp));
        
        html += `
            <div class="resolved-incident-item" data-incident-id="${incident.id}">
                <div class="resolved-incident-header" onclick="toggleResolvedIncident(${incident.id})">
                    <div class="resolved-incident-summary">
                        <span class="resolved-incident-title">${escapeHtml(incident.title)}</span>
                        <span class="resolved-incident-meta">
                            ${formatDate(startedAt)} - ${resolvedAt ? formatDate(resolvedAt) : 'Unknown'}
                        </span>
                    </div>
                    <div class="resolved-incident-badges">
                        <span class="incident-impact ${incident.impact}">${incident.impact}</span>
                        <span class="incident-status resolved">Resolved</span>
                        <span class="expand-icon" id="expand-icon-resolved-${incident.id}">▼</span>
                    </div>
                </div>
                <div class="resolved-incident-details" id="details-resolved-${incident.id}" style="display: none;">
                    <div class="resolved-incident-content">
                        <div class="incident-timeline">
                            <h4>Timeline</h4>
                            ${sortedUpdates.length > 0 ? sortedUpdates.map((update) => {
                                const updateTime = parseUTCDate(update.timestamp);
                                return `
                                    <div class="timeline-item">
                                        <div class="timeline-time">${formatDate(updateTime)}</div>
                                        <div class="timeline-message">${escapeHtml(update.message)}</div>
                                        <span class="incident-status ${update.status}">${update.status}</span>
                                    </div>
                                `;
                            }).join('') : '<p>No updates available</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function toggleResolvedIncident(incidentId) {
    const details = document.getElementById(`details-resolved-${incidentId}`);
    const icon = document.getElementById(`expand-icon-resolved-${incidentId}`);
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        icon.textContent = '▲';
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
    }
}

function renderMaintenances(maintenances) {
    const container = document.getElementById('maintenanceList');
    
    if (!maintenances || maintenances.length === 0) {
        container.innerHTML = '<p class="loading">No scheduled maintenance</p>';
        return;
    }

    let html = '';
    maintenances.forEach(maintenance => {
        const start = parseUTCDate(maintenance.window_start);
        const end = parseUTCDate(maintenance.window_end);
        
        html += `
            <div class="maintenance-card">
                <div class="maintenance-title">${escapeHtml(maintenance.title)}</div>
                <div class="maintenance-time">
                    ${formatDate(start)} - ${formatDate(end)}
                </div>
                <span class="maintenance-status ${maintenance.status}">${maintenance.status.replace('_', ' ')}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}


async function showIncidentDetail(incidentId) {
    try {
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`);
        const incident = await response.json();

        const modal = document.getElementById('incidentModal');
        const detail = document.getElementById('incidentDetail');

        const startedAt = new Date(incident.started_at);
        const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null;

        let html = `
            <h2>${escapeHtml(incident.title)}</h2>
            <div style="margin: 20px 0;">
                <span class="incident-impact ${incident.impact}">${incident.impact}</span>
                <span class="incident-status ${incident.current_status}" style="margin-left: 10px;">${incident.current_status}</span>
            </div>
            <div style="color: #718096; margin-bottom: 20px;">
                Started: ${formatDate(startedAt)}
                ${resolvedAt ? `<br>Resolved: ${formatDate(resolvedAt)}` : ''}
            </div>
        `;

        if (incident.updates && incident.updates.length > 0) {
            html += '<div class="incident-timeline"><h3>Updates</h3>';
            incident.updates.forEach(update => {
                const time = parseUTCDate(update.timestamp);
                html += `
                    <div class="timeline-item">
                        <div class="timeline-time">${formatDate(time)}</div>
                        <div class="timeline-message">${escapeHtml(update.message)}</div>
                        <span class="incident-status ${update.status}" style="margin-top: 8px; display: inline-block;">${update.status}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        detail.innerHTML = html;
        modal.style.display = 'block';
    } catch (error) {
        console.error('Failed to load incident detail:', error);
        alert('Failed to load incident details');
    }
}

function closeIncidentModal() {
    document.getElementById('incidentModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('incidentModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

function formatDate(date) {
    // Format as UTC
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    }) + ' UTC';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Per-Component Check Status Functions
const CHECK_CYCLE_SECONDS = 5 * 60; // Server checks every 5 minutes (300 seconds)

function getComponentCheckStatus(componentId, lastChecked) {
    const nextCheck = getComponentNextCheck(lastChecked);
    const lastCheckedText = lastChecked ? formatLastChecked(lastChecked) : 'Never';
    
    return `
        <div class="component-check-status" data-last-checked="${lastChecked || ''}">
            <div class="component-check-info">
                <span class="component-check-dot"></span>
                <span class="component-last-checked">Last: ${lastCheckedText}</span>
                <span class="component-check-separator">•</span>
                <span class="component-next-check" data-component-id="${componentId}">Next: ${nextCheck}</span>
            </div>
        </div>
    `;
}

function getComponentNextCheck(lastChecked) {
    if (!lastChecked) return '--:--';
    
    const lastCheckTime = parseUTCDate(lastChecked);
    if (!lastCheckTime) return '--:--';
    
    const now = new Date();
    const elapsed = Math.floor((now - lastCheckTime) / 1000);
    const remaining = Math.max(0, CHECK_CYCLE_SECONDS - elapsed);
    
    if (remaining === 0) return 'Soon';
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatLastChecked(dateStr) {
    const date = parseUTCDate(dateStr);
    if (!date) return 'Unknown';
    
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Update all component countdowns every second
setInterval(() => {
    document.querySelectorAll('.component-check-status').forEach(status => {
        const lastChecked = status.getAttribute('data-last-checked');
        const nextCheckEl = status.querySelector('.component-next-check');
        if (nextCheckEl && lastChecked) {
            nextCheckEl.textContent = getComponentNextCheck(lastChecked);
        }
    });
}, 1000);

// Rescan a component with potential outage
async function rescanComponent(componentId, buttonElement) {
    // Disable button and show loading state
    const originalText = buttonElement.textContent;
    buttonElement.textContent = '⏳ Scanning...';
    buttonElement.disabled = true;
    buttonElement.classList.add('scanning');
    
    // Update the component's check dot to show checking state
    const componentCard = buttonElement.closest('.component-card');
    const checkDot = componentCard?.querySelector('.component-check-dot');
    if (checkDot) checkDot.classList.add('checking');
    
    try {
        const response = await fetch(`${API_BASE}/components/${componentId}/rescan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            buttonElement.textContent = '✓ Done!';
            if (checkDot) checkDot.classList.remove('checking');
            setTimeout(() => {
                loadStatus();
            }, 500);
        } else {
            buttonElement.textContent = '❌ Failed';
            console.error('Rescan failed:', result.error);
            if (checkDot) {
                checkDot.classList.remove('checking');
                checkDot.classList.add('error');
            }
            setTimeout(() => {
                buttonElement.textContent = originalText;
                buttonElement.disabled = false;
                buttonElement.classList.remove('scanning');
                if (checkDot) checkDot.classList.remove('error');
            }, 2000);
        }
    } catch (error) {
        console.error('Rescan error:', error);
        buttonElement.textContent = '❌ Error';
        if (checkDot) {
            checkDot.classList.remove('checking');
            checkDot.classList.add('error');
        }
        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
            buttonElement.classList.remove('scanning');
            if (checkDot) checkDot.classList.remove('error');
        }, 2000);
    }
}

