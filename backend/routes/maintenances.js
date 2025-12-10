const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/maintenances - Get all maintenances
router.get('/', (req, res) => {
  const { status } = req.query;
  const db = getDb();

  let query = `
    SELECT m.*,
           GROUP_CONCAT(mc.component_id) as affected_component_ids
    FROM maintenances m
    LEFT JOIN maintenance_components mc ON m.id = mc.maintenance_id
  `;
  const params = [];

  if (status) {
    query += ' WHERE m.status = ?';
    params.push(status);
  }

  query += ' GROUP BY m.id ORDER BY m.window_start DESC';

  db.all(query, params, (err, maintenances) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch maintenances' });
    }

    maintenances.forEach(maintenance => {
      maintenance.affected_component_ids = maintenance.affected_component_ids
        ? maintenance.affected_component_ids.split(',').map(Number)
        : [];
    });

    res.json(maintenances);
  });
});

// GET /api/maintenances/:id - Get single maintenance
router.get('/:id', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM maintenances WHERE id = ?', [req.params.id], (err, maintenance) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch maintenance' });
    }
    if (!maintenance) {
      return res.status(404).json({ error: 'Maintenance not found' });
    }

    db.all(
      'SELECT component_id FROM maintenance_components WHERE maintenance_id = ?',
      [req.params.id],
      (err, components) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch components' });
        }
        maintenance.affected_component_ids = components.map(c => c.component_id);
        res.json(maintenance);
      }
    );
  });
});

// POST /api/maintenances - Create maintenance (admin only)
router.post('/', authenticateToken, (req, res) => {
  const { title, window_start, window_end, affected_component_ids, status } = req.body;

  if (!title || !window_start || !window_end) {
    return res.status(400).json({ error: 'Title, window_start, and window_end are required' });
  }

  const db = getDb();
  db.run(
    'INSERT INTO maintenances (title, window_start, window_end, status) VALUES (?, ?, ?, ?)',
    [title, window_start, window_end, status || 'scheduled'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create maintenance' });
      }

      const maintenanceId = this.lastID;

      // Link components if provided
      if (affected_component_ids && affected_component_ids.length > 0) {
        const stmt = db.prepare('INSERT INTO maintenance_components (maintenance_id, component_id) VALUES (?, ?)');
        affected_component_ids.forEach(componentId => {
          stmt.run(maintenanceId, componentId);
        });
        stmt.finalize();
      }

      db.get('SELECT * FROM maintenances WHERE id = ?', [maintenanceId], (err, maintenance) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch created maintenance' });
        }
        res.status(201).json(maintenance);
      });
    }
  );
});

// PATCH /api/maintenances/:id - Update maintenance (admin only)
router.patch('/:id', authenticateToken, (req, res) => {
  const { title, window_start, window_end, status, affected_component_ids } = req.body;
  const db = getDb();

  const updates = [];
  const values = [];

  if (title !== undefined) {
    updates.push('title = ?');
    values.push(title);
  }
  if (window_start !== undefined) {
    updates.push('window_start = ?');
    values.push(window_start);
  }
  if (window_end !== undefined) {
    updates.push('window_end = ?');
    values.push(window_end);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.run(
    `UPDATE maintenances SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update maintenance' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Maintenance not found' });
      }

      // Update affected components if provided
      if (affected_component_ids !== undefined) {
        db.run('DELETE FROM maintenance_components WHERE maintenance_id = ?', [req.params.id], (err) => {
          if (!err && affected_component_ids.length > 0) {
            const stmt = db.prepare('INSERT INTO maintenance_components (maintenance_id, component_id) VALUES (?, ?)');
            affected_component_ids.forEach(componentId => {
              stmt.run(req.params.id, componentId);
            });
            stmt.finalize();
          }
        });
      }

      db.get('SELECT * FROM maintenances WHERE id = ?', [req.params.id], (err, maintenance) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch updated maintenance' });
        }
        res.json(maintenance);
      });
    }
  );
});

// DELETE /api/maintenances/:id - Delete maintenance (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.run('DELETE FROM maintenances WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete maintenance' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Maintenance not found' });
    }
    res.json({ message: 'Maintenance deleted successfully' });
  });
});

module.exports = router;

