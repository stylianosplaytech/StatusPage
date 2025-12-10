const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Webhook endpoint for monitoring integrations
// POST /api/webhooks/incident
router.post('/incident', (req, res) => {
  const { token, action, component_id, title, impact, message } = req.body;

  // Simple token authentication (use environment variable in production)
  const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'webhook-secret-token';
  if (token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Invalid webhook token' });
  }

  const db = getDb();

  if (action === 'create') {
    // Create new incident
    const started_at = new Date().toISOString();
    db.run(
      'INSERT INTO incidents (title, impact, started_at, current_status, visibility) VALUES (?, ?, ?, ?, ?)',
      [title || 'Automated Incident', impact || 'P2', started_at, 'identified', 'public'],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create incident' });
        }

        const incidentId = this.lastID;

        // Link component if provided
        if (component_id) {
          db.run('INSERT INTO incident_components (incident_id, component_id) VALUES (?, ?)',
            [incidentId, component_id]);
          
          // Update component status
          db.run('UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [impact === 'P1' ? 'major_outage' : 'partial_outage', component_id]);
        }

        // Add initial update
        if (message) {
          db.run('INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)',
            [incidentId, message, 'identified']);
        }

        res.json({ message: 'Incident created', incident_id: incidentId });
      }
    );
  } else if (action === 'resolve') {
    // Resolve incident (find by component_id or title)
    const resolved_at = new Date().toISOString();
    
    if (component_id) {
      // Find active incident for this component
      db.get(`
        SELECT i.id FROM incidents i
        JOIN incident_components ic ON i.id = ic.incident_id
        WHERE ic.component_id = ? AND i.resolved_at IS NULL
        ORDER BY i.started_at DESC LIMIT 1
      `, [component_id], (err, incident) => {
        if (err || !incident) {
          return res.status(404).json({ error: 'No active incident found for component' });
        }

        db.run('UPDATE incidents SET resolved_at = ?, current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [resolved_at, 'resolved', incident.id]);

        // Update component back to operational
        db.run('UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['operational', component_id]);

        if (message) {
          db.run('INSERT INTO incident_updates (incident_id, message, status) VALUES (?, ?, ?)',
            [incident.id, message, 'resolved']);
        }

        res.json({ message: 'Incident resolved', incident_id: incident.id });
      });
    } else {
      res.status(400).json({ error: 'component_id required for resolve action' });
    }
  } else if (action === 'update_component') {
    // Update component status directly
    if (!component_id) {
      return res.status(400).json({ error: 'component_id required' });
    }

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status required' });
    }

    db.run('UPDATE components SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, component_id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update component' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Component not found' });
        }
        res.json({ message: 'Component updated', component_id });
      }
    );
  } else {
    res.status(400).json({ error: 'Invalid action. Use: create, resolve, or update_component' });
  }
});

module.exports = router;

