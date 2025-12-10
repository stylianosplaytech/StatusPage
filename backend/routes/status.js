const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// GET /api/status - Get overall status summary
router.get('/', (req, res) => {
  const db = getDb();

  // Get all components
  db.all('SELECT * FROM components ORDER BY sort_order, name', [], (err, components) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch components' });
    }

    // Get active incidents (not resolved)
    db.all(`
      SELECT i.*, 
             GROUP_CONCAT(ic.component_id) as affected_component_ids
      FROM incidents i
      LEFT JOIN incident_components ic ON i.id = ic.incident_id
      WHERE i.resolved_at IS NULL AND i.visibility = 'public'
      GROUP BY i.id
      ORDER BY i.started_at DESC
    `, [], (err, activeIncidents) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch incidents' });
      }

      // Get incident updates for active incidents
      const incidentIds = activeIncidents.map(inc => inc.id);
      if (incidentIds.length > 0) {
        const placeholders = incidentIds.map(() => '?').join(',');
        db.all(`
          SELECT * FROM incident_updates 
          WHERE incident_id IN (${placeholders})
          ORDER BY timestamp DESC
        `, incidentIds, (err, updates) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch updates' });
          }

          // Attach updates to incidents
          activeIncidents.forEach(incident => {
            incident.updates = updates.filter(u => u.incident_id === incident.id);
          });

          // Get current maintenances
          db.all(`
            SELECT m.*,
                   GROUP_CONCAT(mc.component_id) as affected_component_ids
            FROM maintenances m
            LEFT JOIN maintenance_components mc ON m.id = mc.maintenance_id
            WHERE m.status IN ('scheduled', 'in_progress')
            GROUP BY m.id
            ORDER BY m.window_start ASC
          `, [], (err, maintenances) => {
            if (err) {
              return res.status(500).json({ error: 'Failed to fetch maintenances' });
            }

            // Calculate overall status
            const hasMajorOutage = components.some(c => c.status === 'major_outage');
            const hasPartialOutage = components.some(c => c.status === 'partial_outage');
            const hasDegraded = components.some(c => c.status === 'degraded');
            
            let overallStatus = 'operational';
            if (hasMajorOutage) {
              overallStatus = 'major_outage';
            } else if (hasPartialOutage) {
              overallStatus = 'partial_outage';
            } else if (hasDegraded) {
              overallStatus = 'degraded';
            }

            res.json({
              status: overallStatus,
              components,
              active_incidents: activeIncidents,
              maintenances
            });
          });
        });
      } else {
        // No active incidents, just get maintenances
        db.all(`
          SELECT m.*,
                 GROUP_CONCAT(mc.component_id) as affected_component_ids
          FROM maintenances m
          LEFT JOIN maintenance_components mc ON m.id = mc.maintenance_id
          WHERE m.status IN ('scheduled', 'in_progress')
          GROUP BY m.id
          ORDER BY m.window_start ASC
        `, [], (err, maintenances) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch maintenances' });
          }

          const hasMajorOutage = components.some(c => c.status === 'major_outage');
          const hasPartialOutage = components.some(c => c.status === 'partial_outage');
          const hasDegraded = components.some(c => c.status === 'degraded');
          
          let overallStatus = 'operational';
          if (hasMajorOutage) {
            overallStatus = 'major_outage';
          } else if (hasPartialOutage) {
            overallStatus = 'partial_outage';
          } else if (hasDegraded) {
            overallStatus = 'degraded';
          }

          res.json({
            status: overallStatus,
            components,
            active_incidents: [],
            maintenances
          });
        });
      }
    });
  });
});

module.exports = router;

