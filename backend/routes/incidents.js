const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to directly update specific components based on incident impact
const updateComponentsForIncident = (db, incidentId, impact, componentIds, callback) => {
  if (!componentIds || componentIds.length === 0) {
    if (callback) callback();
    return;
  }

  // Determine status based on impact
  const newStatus = impact === 'P1' ? 'major_outage' : 'partial_outage';
  
  // Update each component directly
  let updateCount = 0;
  const totalUpdates = componentIds.length;
  
  componentIds.forEach(componentId => {
    db.run(
      'UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, componentId],
      (err) => {
        if (err) {
          console.error(`Error updating component ${componentId}:`, err);
        } else {
          console.log(`Updated component ${componentId} to ${newStatus} due to incident ${incidentId}`);
        }
        updateCount++;
        if (updateCount === totalUpdates && callback) {
          callback();
        }
      }
    );
  });
};

// Helper function to update component statuses based on active incidents
const updateComponentStatuses = (db, callback) => {
  // Get all active incidents (not resolved) with their affected components
  db.all(`
    SELECT i.id, i.impact, ic.component_id
    FROM incidents i
    JOIN incident_components ic ON i.id = ic.incident_id
    WHERE i.resolved_at IS NULL
  `, [], (err, incidentComponents) => {
    if (err) {
      console.error('Error fetching active incident components:', err);
      if (callback) callback();
      return;
    }

    // Group by component_id and find the most severe impact
    const componentImpacts = {};
    incidentComponents.forEach(item => {
      const compId = item.component_id;
      if (!componentImpacts[compId]) {
        componentImpacts[compId] = [];
      }
      componentImpacts[compId].push(item.impact);
    });

    // Determine status for each component
    // P1 impact -> major_outage
    // P2 impact -> partial_outage
    const componentStatuses = {};
    Object.keys(componentImpacts).forEach(compId => {
      const impacts = componentImpacts[compId];
      if (impacts.includes('P1')) {
        componentStatuses[compId] = 'major_outage';
      } else {
        componentStatuses[compId] = 'partial_outage';
      }
    });

    // Get all components that are currently affected
    const affectedComponentIds = Object.keys(componentStatuses).map(Number);
    
    if (affectedComponentIds.length > 0) {
      // Update affected components
      const placeholders = affectedComponentIds.map(() => '?').join(',');
      db.all(`SELECT id FROM components WHERE id IN (${placeholders})`, affectedComponentIds, (err, components) => {
        if (err) {
          console.error('Error fetching components:', err);
          if (callback) callback();
          return;
        }

        // Update each affected component
        let updateCount = 0;
        const totalUpdates = components.length;
        
        if (totalUpdates === 0) {
          if (callback) callback();
          return;
        }

        components.forEach(comp => {
          const newStatus = componentStatuses[comp.id];
          db.run(
            'UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, comp.id],
            (err) => {
              if (err) {
                console.error(`Error updating component ${comp.id}:`, err);
              } else {
                console.log(`Updated component ${comp.id} to ${newStatus}`);
              }
              updateCount++;
              if (updateCount === totalUpdates && callback) {
                callback();
              }
            }
          );
        });
      });
    } else {
      // No active incidents affecting components, but we should check if any components
      // that were previously affected should be set back to operational
      // This is handled by checking components that are not operational
      db.all('SELECT id FROM components WHERE status != ?', ['operational'], (err, nonOperationalComponents) => {
        if (err) {
          console.error('Error fetching non-operational components:', err);
          if (callback) callback();
          return;
        }

        // Check each non-operational component to see if it should be set back to operational
        let checkCount = 0;
        const totalChecks = nonOperationalComponents.length;
        
        if (totalChecks === 0) {
          if (callback) callback();
          return;
        }

        nonOperationalComponents.forEach(comp => {
          // Check if this component is affected by any active incident
          db.get(`
            SELECT COUNT(*) as count FROM incident_components ic
            JOIN incidents i ON ic.incident_id = i.id
            WHERE ic.component_id = ? AND i.resolved_at IS NULL
          `, [comp.id], (err, result) => {
            if (err) {
              console.error(`Error checking component ${comp.id}:`, err);
            } else if (result.count === 0) {
              // No active incidents affecting this component, set to operational
              db.run(
                'UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['operational', comp.id],
                (err) => {
                  if (err) {
                    console.error(`Error setting component ${comp.id} to operational:`, err);
                  }
                }
              );
            }
            checkCount++;
            if (checkCount === totalChecks && callback) {
              callback();
            }
          });
        });
      });
    }
  });
};

// GET /api/incidents - Get all incidents (with pagination)
router.get('/', (req, res) => {
  const { page = 1, limit = 20, visibility = 'public' } = req.query;
  const offset = (page - 1) * limit;
  const db = getDb();

  db.all(`
    SELECT i.*,
           GROUP_CONCAT(ic.component_id) as affected_component_ids
    FROM incidents i
    LEFT JOIN incident_components ic ON i.id = ic.incident_id
    WHERE i.visibility = ?
    GROUP BY i.id
    ORDER BY i.started_at DESC
    LIMIT ? OFFSET ?
  `, [visibility, parseInt(limit), offset], (err, incidents) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch incidents' });
    }

    // Get updates for each incident
    const incidentIds = incidents.map(inc => inc.id);
    if (incidentIds.length > 0) {
      const placeholders = incidentIds.map(() => '?').join(',');
      db.all(`
        SELECT * FROM incident_updates 
        WHERE incident_id IN (${placeholders})
        ORDER BY timestamp ASC
      `, incidentIds, (err, updates) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch updates' });
        }

        // Process incidents and attach updates
        incidents.forEach(incident => {
          incident.updates = updates.filter(u => u.incident_id === incident.id);
          incident.affected_component_ids = incident.affected_component_ids 
            ? incident.affected_component_ids.split(',').map(Number)
            : [];
        });

        // Fix any resolved incidents that don't have resolved_at set
        const resolvedWithoutDate = incidents.filter(inc => inc.current_status === 'resolved' && !inc.resolved_at);
        if (resolvedWithoutDate.length > 0) {
          // Fix all resolved incidents without resolved_at
          let fixedCount = 0;
          const totalToFix = resolvedWithoutDate.length;
          
          resolvedWithoutDate.forEach(incident => {
            db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ? AND resolved_at IS NULL", [incident.id], (err, row) => {
              if (!err) {
                // Fetch the updated resolved_at from database
                db.get("SELECT resolved_at FROM incidents WHERE id = ?", [incident.id], (err, result) => {
                  if (!err && result && result.resolved_at) {
                    incident.resolved_at = result.resolved_at;
                  }
                  fixedCount++;
                  // When all fixes are done, send response
                  if (fixedCount === totalToFix) {
                    res.json(incidents);
                  }
                });
              } else {
                fixedCount++;
                if (fixedCount === totalToFix) {
                  res.json(incidents);
                }
              }
            });
          });
        } else {
          res.json(incidents);
        }
      });
    } else {
      incidents.forEach(incident => {
        incident.updates = [];
        incident.affected_component_ids = [];
        
        // Fix: If incident is resolved but resolved_at is null, set it now
        if (incident.current_status === 'resolved' && !incident.resolved_at) {
          db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ? AND resolved_at IS NULL", [incident.id], (err) => {
            if (!err) {
              // Update the incident object with the resolved_at timestamp
              incident.resolved_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            }
          });
        }
      });
      res.json(incidents);
    }
  });
});

// GET /api/incidents/:id - Get single incident
router.get('/:id', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
    if (err) {
      console.error('Error fetching incident:', err);
      return res.status(500).json({ error: 'Failed to fetch incident' });
    }
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    console.log('=== FETCHING INCIDENT ===');
    console.log('Incident ID:', incident.id);
    console.log('Incident fields:', {
      summary: incident.summary,
      affected_services: incident.affected_services,
      root_cause: incident.root_cause,
      resolution_notes: incident.resolution_notes,
      incident_number: incident.incident_number
    });

    // Get affected components
    db.all(
      'SELECT component_id FROM incident_components WHERE incident_id = ?',
      [req.params.id],
      (err, components) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch components' });
        }
        incident.affected_component_ids = components.map(c => c.component_id);

        // Get updates
        db.all(
          'SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY timestamp ASC',
          [req.params.id],
          (err, updates) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to fetch updates' });
            }
            incident.updates = updates;
            console.log('Returning incident with all fields');
            res.json(incident);
          }
        );
      }
    );
  });
});

// POST /api/incidents - Create incident (admin only)
router.post('/', authenticateToken, (req, res) => {
  const { 
    title, 
    summary, 
    incident_number,
    affected_services,
    root_cause,
    resolution_notes,
    domain_distribution,
    impact, 
    affected_component_ids, 
    started_at, 
    current_status, 
    visibility 
  } = req.body;

  if (!title || !started_at) {
    return res.status(400).json({ error: 'Title and started_at are required' });
  }

  const db = getDb();
  
  // Auto-generate incident number if not provided
  const finalIncidentNumber = incident_number || `PRB${String(Date.now()).slice(-6)}`;
  
  db.run(
    'INSERT INTO incidents (incident_number, title, summary, affected_services, root_cause, resolution_notes, domain_distribution, impact, started_at, current_status, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      finalIncidentNumber,
      title,
      summary || null,
      affected_services || null,
      root_cause || null,
      resolution_notes || null,
      domain_distribution || null,
      impact || 'P2',
      started_at,
      current_status || 'identified',
      visibility || 'public'
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create incident' });
      }

      const incidentId = this.lastID;

      // Link components if provided
      if (affected_component_ids && affected_component_ids.length > 0) {
        // Use serialize to ensure operations happen in order
        db.serialize(() => {
          // First, insert all component links
          let linkCount = 0;
          const totalLinks = affected_component_ids.length;
          
        affected_component_ids.forEach(componentId => {
            db.run('INSERT INTO incident_components (incident_id, component_id) VALUES (?, ?)',
              [incidentId, componentId],
              (err) => {
                if (err) {
                  console.error(`Error linking component ${componentId} to incident:`, err);
                } else {
                  console.log(`Linked component ${componentId} to incident ${incidentId}`);
                }
                linkCount++;
                
                // When all links are inserted, update component statuses
                if (linkCount === totalLinks) {
                  console.log(`All ${totalLinks} components linked, updating component statuses...`);
                  
                  // Immediately update component statuses for this incident
                  const incidentImpact = impact || 'P2';
                  updateComponentsForIncident(db, incidentId, incidentImpact, affected_component_ids, () => {
                    console.log(`Component statuses updated for incident ${incidentId}, running full status check...`);
                    // Also run full update to ensure all components are correctly set
                    updateComponentStatuses(db, () => {
                      // Create initial update
                      db.run(
                        'INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)',
                        [incidentId, `Incident created: ${title}`, current_status || 'identified'],
                        (err) => {
                          if (err) {
                            console.error('Failed to create initial update:', err);
                          }

                          db.get('SELECT * FROM incidents WHERE id = ?', [incidentId], (err, incident) => {
                            if (err) {
                              return res.status(500).json({ error: 'Failed to fetch created incident' });
                            }
                            res.status(201).json(incident);
                          });
                        }
                      );
                    });
                  });
                }
              }
            );
          });
        });
      } else {
        // No components to link, but still run full status check to ensure consistency
        updateComponentStatuses(db, () => {
      // Create initial update
      db.run(
        'INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)',
        [incidentId, `Incident created: ${title}`, current_status || 'identified'],
        (err) => {
          if (err) {
            console.error('Failed to create initial update:', err);
          }

          db.get('SELECT * FROM incidents WHERE id = ?', [incidentId], (err, incident) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to fetch created incident' });
            }
            res.status(201).json(incident);
          });
        }
      );
        });
      }
    }
  );
});

// PATCH /api/incidents/:id - Update incident (admin only)
router.patch('/:id', authenticateToken, (req, res) => {
  console.log('=== PATCH REQUEST RECEIVED ===');
  console.log('Request body exists?', !!req.body);
  console.log('Request body (raw):', req.body);
  console.log('Request body type:', typeof req.body);
  console.log('Request body (stringified):', JSON.stringify(req.body, null, 2));
  console.log('Request body keys:', Object.keys(req.body || {}));
  console.log('Request headers content-type:', req.headers['content-type']);
  
  // Ensure req.body exists
  if (!req.body) {
    console.error('ERROR: req.body is null or undefined!');
    return res.status(400).json({ error: 'Request body is missing' });
  }
  
  console.log('Has summary?', 'summary' in req.body);
  console.log('Has affected_services?', 'affected_services' in req.body);
  console.log('Has root_cause?', 'root_cause' in req.body);
  console.log('Has resolution_notes?', 'resolution_notes' in req.body);
  
  const { 
    title, 
    summary, 
    incident_number,
    affected_services,
    root_cause,
    resolution_notes,
    domain_distribution,
    impact, 
    affected_component_ids, 
    resolved_at, 
    current_status, 
    visibility 
  } = req.body || {};
  
  console.log('Destructured values:', {
    title: title !== undefined ? (title === null ? 'null' : title) : 'undefined',
    summary: summary !== undefined ? (summary === null ? 'null' : summary) : 'undefined',
    incident_number: incident_number !== undefined ? (incident_number === null ? 'null' : incident_number) : 'undefined',
    affected_services: affected_services !== undefined ? (affected_services === null ? 'null' : affected_services) : 'undefined',
    root_cause: root_cause !== undefined ? (root_cause === null ? 'null' : root_cause) : 'undefined',
    resolution_notes: resolution_notes !== undefined ? (resolution_notes === null ? 'null' : resolution_notes) : 'undefined'
  });
  
  const db = getDb();

  const updates = [];
  const values = [];

  if (title !== undefined) {
    updates.push('title = ?');
    values.push(title);
  }
  // Check if summary is in the request body (including null values)
  // Use both checks: 'in' operator and undefined check for maximum compatibility
  const hasSummary = ('summary' in (req.body || {})) || (summary !== undefined);
  if (hasSummary) {
    updates.push('summary = ?');
    // Keep the value as-is (can be string, null, or empty string)
    // Convert empty string to null for database consistency
    const summaryValue = (summary === '' || summary === null) ? null : String(summary);
    console.log('✓ Adding summary to updates:', summaryValue, '(original:', summary, ', type:', typeof summary, ')');
    values.push(summaryValue);
  } else {
    console.log('✗ Summary NOT in req.body');
    console.log('  Check 1 - "summary" in req.body:', 'summary' in (req.body || {}));
    console.log('  Check 2 - summary !== undefined:', summary !== undefined);
    console.log('  req.body:', req.body);
    console.log('  summary value:', summary);
  }
  // Check if incident_number is in the request body (including null values)
  if ('incident_number' in (req.body || {})) {
    updates.push('incident_number = ?');
    const incidentNumberValue = incident_number === '' ? null : (incident_number || null);
    console.log('✓ Adding incident_number to updates:', incidentNumberValue);
    values.push(incidentNumberValue);
  }
  // Check if affected_services is in the request body (including null values)
  // Use both checks: 'in' operator and undefined check for maximum compatibility
  const hasAffectedServices = ('affected_services' in (req.body || {})) || (affected_services !== undefined);
  if (hasAffectedServices) {
    updates.push('affected_services = ?');
    const affectedServicesValue = (affected_services === '' || affected_services === null) ? null : String(affected_services);
    console.log('✓ Adding affected_services to updates:', affectedServicesValue, '(original:', affected_services, ', type:', typeof affected_services, ')');
    values.push(affectedServicesValue);
  } else {
    console.log('✗ affected_services NOT in req.body');
    console.log('  Check 1 - "affected_services" in req.body:', 'affected_services' in (req.body || {}));
    console.log('  Check 2 - affected_services !== undefined:', affected_services !== undefined);
    console.log('  req.body keys:', Object.keys(req.body || {}));
    console.log('  req.body:', JSON.stringify(req.body, null, 2));
  }
  // Check if root_cause is in the request body (including null values)
  // Use both checks: 'in' operator and undefined check for maximum compatibility
  const hasRootCause = ('root_cause' in (req.body || {})) || (root_cause !== undefined);
  if (hasRootCause) {
    updates.push('root_cause = ?');
    const rootCauseValue = (root_cause === '' || root_cause === null) ? null : String(root_cause);
    console.log('✓ Adding root_cause to updates:', rootCauseValue);
    values.push(rootCauseValue);
  }
  // Check if resolution_notes is in the request body (including null values)
  // Use both checks: 'in' operator and undefined check for maximum compatibility
  const hasResolutionNotes = ('resolution_notes' in (req.body || {})) || (resolution_notes !== undefined);
  if (hasResolutionNotes) {
    updates.push('resolution_notes = ?');
    const resolutionNotesValue = (resolution_notes === '' || resolution_notes === null) ? null : String(resolution_notes);
    console.log('✓ Adding resolution_notes to updates:', resolutionNotesValue);
    values.push(resolutionNotesValue);
  }
  // Check if domain_distribution is in the request body (including null values)
  const hasDomainDistribution = ('domain_distribution' in (req.body || {})) || (domain_distribution !== undefined);
  if (hasDomainDistribution) {
    updates.push('domain_distribution = ?');
    const domainDistributionValue = (domain_distribution === '' || domain_distribution === null) ? null : String(domain_distribution);
    console.log('✓ Adding domain_distribution to updates:', domainDistributionValue);
    values.push(domainDistributionValue);
  }
  
  console.log('Updates count before impact check:', updates.length);
  if (impact !== undefined) {
    updates.push('impact = ?');
    values.push(impact);
  }
  if (current_status !== undefined) {
    updates.push('current_status = ?');
    values.push(current_status);
    
    // If status is being set to 'resolved', also set resolved_at if not already set
    if (current_status === 'resolved' && resolved_at === undefined) {
      // Set resolved_at to UTC timestamp if not already set
      // Use a CASE statement to only set if NULL
      updates.push("resolved_at = CASE WHEN resolved_at IS NULL THEN datetime('now') ELSE resolved_at END");
    }
  }
  if (resolved_at !== undefined) {
    updates.push('resolved_at = ?');
    values.push(resolved_at);
  }
  if (visibility !== undefined) {
    updates.push('visibility = ?');
    values.push(visibility);
  }

  // Always add updated_at timestamp
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  // Check if we have any actual field updates (excluding updated_at and resolved_at CASE statement)
  const fieldUpdates = updates.filter(u => 
    !u.includes('updated_at') && 
    !u.includes('resolved_at = CASE') &&
    !u.includes('resolved_at = ?')
  );
  
  console.log('=== FINAL CHECK ===');
  console.log('Total updates:', updates.length);
  console.log('Updates array:', updates);
  console.log('Field updates (excluding timestamps):', fieldUpdates.length);
  console.log('Field updates array:', fieldUpdates);
  
  if (fieldUpdates.length === 0) {
    console.error('=== NO FIELDS TO UPDATE ===');
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('Request body keys:', Object.keys(req.body));
    console.error('Destructured fields:', {
      title: title !== undefined ? (title === null ? 'null' : title) : 'undefined',
      summary: summary !== undefined ? (summary === null ? 'null' : summary) : 'undefined',
      incident_number: incident_number !== undefined ? (incident_number === null ? 'null' : incident_number) : 'undefined',
      affected_services: affected_services !== undefined ? (affected_services === null ? 'null' : affected_services) : 'undefined',
      root_cause: root_cause !== undefined ? (root_cause === null ? 'null' : root_cause) : 'undefined',
      resolution_notes: resolution_notes !== undefined ? (resolution_notes === null ? 'null' : resolution_notes) : 'undefined'
    });
    console.error('Field checks:', {
      'summary in req.body': 'summary' in req.body,
      'affected_services in req.body': 'affected_services' in req.body,
      'root_cause in req.body': 'root_cause' in req.body,
      'resolution_notes in req.body': 'resolution_notes' in req.body
    });
    return res.status(400).json({ error: 'No fields to update' });
  }

  const sqlQuery = `UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`;
  console.log('=== UPDATING INCIDENT ===');
  console.log('Incident ID:', req.params.id);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Updates array:', updates);
  console.log('Values array (before ID):', values.slice(0, -1));
  console.log('SQL Query:', sqlQuery);
  console.log('Values for SQL (including ID):', values);
  console.log('Current status:', current_status);

  db.run(
    sqlQuery,
    values,
    function(err) {
      if (err) {
        console.error('Error updating incident:', err);
        return res.status(500).json({ error: 'Failed to update incident', details: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      // If incident was resolved, ensure resolved_at is set (double-check in case COALESCE didn't work)
      // Then update component statuses to reset affected components back to operational
      if (current_status === 'resolved') {
        // Double-check that resolved_at is set (in case COALESCE didn't work due to SQLite quirks)
        // Use datetime('now') which returns UTC in SQLite
        db.run("UPDATE incidents SET resolved_at = COALESCE(resolved_at, datetime('now')) WHERE id = ? AND resolved_at IS NULL", [req.params.id], (err) => {
          if (err) {
            console.error('Error setting resolved_at:', err);
          } else {
            console.log('Ensured resolved_at is set for incident', req.params.id);
          }
          // After ensuring resolved_at is set, update component statuses
          // This will reset components back to operational since the incident is now resolved
          updateComponentStatuses(db, () => {
            console.log('Component statuses updated after resolving incident');
            // Continue with the rest of the update logic
            continueUpdate();
          });
        });
      } else {
        continueUpdate();
      }
      
      function continueUpdate() {
        // Fetch the updated incident to ensure we have the latest data including resolved_at
        db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, updatedIncident) => {
          if (err) {
            console.error('Error fetching updated incident:', err);
            return res.status(500).json({ error: 'Failed to fetch updated incident' });
          }
          
          // If this was a resolved incident, make absolutely sure resolved_at is set
          if (updatedIncident && updatedIncident.current_status === 'resolved' && !updatedIncident.resolved_at) {
            // One more attempt to set it
            db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ?", [req.params.id], (err) => {
              if (!err) {
                // Fetch again after setting resolved_at
                db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, finalIncident) => {
                  if (!err && finalIncident) {
                    updatedIncident = finalIncident;
                  }
                  processComponentUpdates(updatedIncident);
                });
              } else {
                processComponentUpdates(updatedIncident);
              }
            });
          } else {
            processComponentUpdates(updatedIncident);
          }
        });
      }
      
      function processComponentUpdates(incident) {
        // Define returnIncident function first
        function returnIncident() {
          // Always fetch fresh incident data to ensure all fields are included
          db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, finalIncident) => {
          if (err) {
            console.error('Error fetching updated incident:', err);
            return res.status(500).json({ error: 'Failed to fetch updated incident' });
          }
          
          console.log('Final incident data before returning:', {
            id: finalIncident.id,
            title: finalIncident.title,
            summary: finalIncident.summary,
            affected_services: finalIncident.affected_services,
            root_cause: finalIncident.root_cause,
            resolution_notes: finalIncident.resolution_notes,
            incident_number: finalIncident.incident_number
          });
          
          // Final check: if status is resolved but resolved_at is still null, set it now
          if (finalIncident && finalIncident.current_status === 'resolved' && !finalIncident.resolved_at) {
            db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ?", [req.params.id], (err) => {
              if (!err) {
                // Fetch one more time to get the updated resolved_at
                db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, updatedFinal) => {
                  if (!err && updatedFinal) {
                    console.log('Returning updated incident with resolved_at');
                    res.json(updatedFinal);
                  } else {
                    console.log('Returning final incident (fallback)');
                    res.json(finalIncident);
                  }
                });
              } else {
                console.log('Returning final incident (resolved_at update failed)');
                res.json(finalIncident);
              }
            });
          } else {
            console.log('Returning final incident');
            res.json(finalIncident);
          }
          });
        }
        
        // Update affected components if provided
        if (affected_component_ids !== undefined) {
          // First, delete all existing component links for this incident
          db.run('DELETE FROM incident_components WHERE incident_id = ?', [req.params.id], (err) => {
            if (err) {
              console.error('Error deleting old component links:', err);
              return res.status(500).json({ error: 'Failed to update component links' });
            }
            
            console.log(`Deleted old component links for incident ${req.params.id}`);
            
            // Then insert new component links if any
            if (affected_component_ids.length > 0) {
              // Insert component links one by one to ensure they complete
              let linkCount = 0;
              const totalLinks = affected_component_ids.length;
              
              affected_component_ids.forEach(componentId => {
                db.run('INSERT INTO incident_components (incident_id, component_id) VALUES (?, ?)',
                  [req.params.id, componentId],
                  (err) => {
                    if (err) {
                      console.error(`Error linking component ${componentId} to incident:`, err);
                    } else {
                      console.log(`Linked component ${componentId} to incident ${req.params.id}`);
                    }
                    linkCount++;
                    
                    // When all links are inserted, update component statuses
                    if (linkCount === totalLinks) {
                    console.log(`All ${totalLinks} components linked, updating component statuses...`);
                    
                    // Get the incident impact to update components correctly
                    db.get('SELECT impact FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
                      if (err) {
                        console.error('Error fetching incident impact:', err);
                      }
                      
                      const incidentImpact = impact !== undefined ? impact : (incident ? incident.impact : 'P2');
                      console.log(`Updating components with impact: ${incidentImpact}`);
                      
                      // Immediately update component statuses for this incident
                      updateComponentsForIncident(db, req.params.id, incidentImpact, affected_component_ids, () => {
                        console.log(`Component statuses updated, running full status check...`);
                        // Run full update to handle any components that should be set back to operational
                        // (e.g., components that were removed from this incident)
                        updateComponentStatuses(db, () => {
                          db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
                            if (err) {
                              return res.status(500).json({ error: 'Failed to fetch updated incident' });
                            }
                            res.json(incident);
                          });
                        });
                      });
                    });
                    }
                  }
                );
              });
          } else {
            // No components to link (all were removed), update statuses to set removed components back to operational
            console.log('All components removed from incident, running full status check...');
            updateComponentStatuses(db, () => {
              returnIncident();
            });
          }
          });
      } else {
          // Even if components weren't explicitly updated, we should still check component statuses
          // because the incident impact or resolved status might have changed
          // IMPORTANT: Always run updateComponentStatuses to handle resolved incidents
          // This will reset components back to operational if the incident was resolved
          // But only if we haven't already called it above (when current_status === 'resolved')
          if (current_status !== 'resolved') {
            updateComponentStatuses(db, () => {
              returnIncident();
            });
          } else {
            // If incident was resolved, we already called updateComponentStatuses above
            // Just return the incident
            returnIncident();
          }
        }
      } // End of processComponentUpdates function
    } // End of db.run callback
  );
});

// POST /api/incidents/:id/updates - Add update to incident (admin only)
router.post('/:id/updates', authenticateToken, (req, res) => {
  const { message, status } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const db = getDb();
  db.run(
    'INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)',
    [req.params.id, message, status || 'monitoring'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create update' });
      }

      // Update incident status if provided
      if (status) {
        db.run('UPDATE incidents SET current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, req.params.id], (err) => {
            if (err) {
              console.error('Error updating incident status:', err);
            }
            
            // If status is resolved, also set resolved_at if not already set
            if (status === 'resolved') {
              db.get('SELECT resolved_at FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
                if (!err && incident && !incident.resolved_at) {
                  // Use datetime('now') which returns UTC in SQLite
                  db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ?", [req.params.id]);
                }
                // Update component statuses
                updateComponentStatuses(db, () => {
                  db.get('SELECT * FROM incident_updates WHERE id = ?', [this.lastID], (err, update) => {
                    if (err) {
                      return res.status(500).json({ error: 'Failed to fetch created update' });
                    }
                    res.status(201).json(update);
                  });
                });
              });
            } else {
              // Update component statuses even if not resolved
              updateComponentStatuses(db, () => {
                db.get('SELECT * FROM incident_updates WHERE id = ?', [this.lastID], (err, update) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to fetch created update' });
                  }
                  res.status(201).json(update);
                });
              });
            }
          });
      } else {
      db.get('SELECT * FROM incident_updates WHERE id = ?', [this.lastID], (err, update) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch created update' });
        }
        res.status(201).json(update);
      });
      }
    }
  );
});

// PATCH /api/incidents/:id/updates/:updateId - Update an incident update (admin only)
router.patch('/:id/updates/:updateId', authenticateToken, (req, res) => {
  const { message, status } = req.body;
  const db = getDb();

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  db.run(
    'UPDATE incident_updates SET message = ?, status = ? WHERE id = ? AND incident_id = ?',
    [message, status || 'monitoring', req.params.updateId, req.params.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Update not found' });
      }

      // Update incident status if provided
      if (status) {
        db.run('UPDATE incidents SET current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, req.params.id], (err) => {
            if (err) {
              console.error('Error updating incident status:', err);
            }
            
            // If status is resolved, also set resolved_at if not already set
            if (status === 'resolved') {
              db.get('SELECT resolved_at FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
                if (!err && incident && !incident.resolved_at) {
                  db.run("UPDATE incidents SET resolved_at = datetime('now') WHERE id = ?", [req.params.id]);
                }
                // Update component statuses
                updateComponentStatuses(db, () => {
                  db.get('SELECT * FROM incident_updates WHERE id = ?', [req.params.updateId], (err, update) => {
                    if (err) {
                      return res.status(500).json({ error: 'Failed to fetch updated update' });
                    }
                    res.json(update);
                  });
                });
              });
            } else {
              // Update component statuses even if not resolved
              updateComponentStatuses(db, () => {
                db.get('SELECT * FROM incident_updates WHERE id = ?', [req.params.updateId], (err, update) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to fetch updated update' });
                  }
                  res.json(update);
                });
              });
            }
          });
      } else {
        db.get('SELECT * FROM incident_updates WHERE id = ?', [req.params.updateId], (err, update) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch updated update' });
          }
          res.json(update);
        });
      }
    }
  );
});

// DELETE /api/incidents/:id - Delete incident (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  
  // First check if incident exists
  db.get('SELECT id FROM incidents WHERE id = ?', [req.params.id], (err, incident) => {
    if (err) {
      console.error('Error checking incident:', err);
      return res.status(500).json({ error: 'Failed to delete incident' });
    }
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    
    // Delete the incident (CASCADE will handle related records)
    // But we'll manually delete to ensure proper cleanup and status updates
    db.serialize(() => {
      // Delete related incident_components first
      db.run('DELETE FROM incident_components WHERE incident_id = ?', [req.params.id], (err) => {
        if (err) {
          console.error('Error deleting incident_components:', err);
        }
        
        // Then delete related incident_updates
        db.run('DELETE FROM incident_updates WHERE incident_id = ?', [req.params.id], (err) => {
          if (err) {
            console.error('Error deleting incident_updates:', err);
          }
          
          // Finally, delete the incident itself
          db.run('DELETE FROM incidents WHERE id = ?', [req.params.id], function(err) {
            if (err) {
              console.error('Error deleting incident:', err);
              return res.status(500).json({ error: 'Failed to delete incident', details: err.message });
            }
            
            console.log(`Incident ${req.params.id} deleted successfully`);
            
            // After deletion, update component statuses to reset any affected components
            // that were only affected by this incident
            updateComponentStatuses(db, () => {
              res.json({ message: 'Incident deleted successfully' });
            });
          });
        });
      });
    });
  });
});

module.exports = router;

