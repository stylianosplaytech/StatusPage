const express = require('express');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { checkSingleComponent, checkSingleComponentShadow, checkAllVersions, fetchVersionInfo } = require('../services/versionChecker');

const router = express.Router();

// GET /api/components - Get all components (public)
router.get('/', (req, res) => {
  const db = getDb();
  db.all('SELECT * FROM components ORDER BY sort_order, name', [], (err, components) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch components' });
    }
    res.json(components);
  });
});

// GET /api/components/:id - Get single component
router.get('/:id', (req, res) => {
  const db = getDb();
  db.get('SELECT * FROM components WHERE id = ?', [req.params.id], (err, component) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch component' });
    }
    if (!component) {
      return res.status(404).json({ error: 'Component not found' });
    }
    res.json(component);
  });
});

// POST /api/components - Create component (admin only)
router.post('/', authenticateToken, (req, res) => {
  const { name, group_name, status, sort_order, version, visible, version_url, shadow_version_url } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Component name is required' });
  }

  const db = getDb();
  const isVisible = visible !== undefined ? (visible ? 1 : 0) : 1;
  db.run(
    'INSERT INTO components (name, group_name, status, sort_order, version, visible, version_url, shadow_version_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, group_name || null, status || 'operational', sort_order || 0, version || null, isVisible, version_url || null, shadow_version_url || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create component' });
      }
      res.status(201).json({
        id: this.lastID,
        name,
        group_name,
        status: status || 'operational',
        sort_order: sort_order || 0,
        version: version || null,
        visible: isVisible,
        version_url: version_url || null,
        shadow_version_url: shadow_version_url || null
      });
    }
  );
});

// PATCH /api/components/:id - Update component (admin only)
router.patch('/:id', authenticateToken, (req, res) => {
  const { 
    name, group_name, status, sort_order, version, visible, 
    version_url, namespace, detected_version, version_last_checked,
    shadow_version_url, shadow_namespace, shadow_detected_version, shadow_version_last_checked, shadow_status
  } = req.body;
  const db = getDb();

  const updates = [];
  const values = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (group_name !== undefined) {
    updates.push('group_name = ?');
    values.push(group_name);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (sort_order !== undefined) {
    updates.push('sort_order = ?');
    values.push(sort_order);
  }
  if (version !== undefined) {
    updates.push('version = ?');
    values.push(version === '' ? null : version);
  }
  if (visible !== undefined) {
    updates.push('visible = ?');
    values.push(visible ? 1 : 0);
  }
  if (version_url !== undefined) {
    updates.push('version_url = ?');
    values.push(version_url === '' ? null : version_url);
  }
  if (namespace !== undefined) {
    updates.push('namespace = ?');
    values.push(namespace === '' ? null : namespace);
  }
  if (detected_version !== undefined) {
    updates.push('detected_version = ?');
    values.push(detected_version === '' ? null : detected_version);
  }
  if (version_last_checked !== undefined) {
    updates.push('version_last_checked = ?');
    values.push(version_last_checked);
  }
  // Shadow fields
  if (shadow_version_url !== undefined) {
    updates.push('shadow_version_url = ?');
    values.push(shadow_version_url === '' ? null : shadow_version_url);
  }
  if (shadow_namespace !== undefined) {
    updates.push('shadow_namespace = ?');
    values.push(shadow_namespace === '' ? null : shadow_namespace);
  }
  if (shadow_detected_version !== undefined) {
    updates.push('shadow_detected_version = ?');
    values.push(shadow_detected_version === '' ? null : shadow_detected_version);
  }
  if (shadow_version_last_checked !== undefined) {
    updates.push('shadow_version_last_checked = ?');
    values.push(shadow_version_last_checked);
  }
  if (shadow_status !== undefined) {
    updates.push('shadow_status = ?');
    values.push(shadow_status === '' ? null : shadow_status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.run(
    `UPDATE components SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update component' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Component not found' });
      }
      db.get('SELECT * FROM components WHERE id = ?', [req.params.id], (err, component) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch updated component' });
        }
        res.json(component);
      });
    }
  );
});

// DELETE /api/components/:id - Delete component (admin only)
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.run('DELETE FROM components WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete component' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Component not found' });
    }
    res.json({ message: 'Component deleted successfully' });
  });
});

// POST /api/components/:id/check-version - Manually trigger production version check for a component
router.post('/:id/check-version', authenticateToken, async (req, res) => {
  try {
    const result = await checkSingleComponent(req.params.id);
    res.json({
      message: 'Production version check completed',
      component: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to check production version' });
  }
});

// POST /api/components/:id/check-shadow-version - Manually trigger shadow version check for a component
router.post('/:id/check-shadow-version', authenticateToken, async (req, res) => {
  try {
    const result = await checkSingleComponentShadow(req.params.id);
    res.json({
      message: 'Shadow version check completed',
      component: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to check shadow version' });
  }
});

// POST /api/components/check-all-versions - Manually trigger version check for all components
router.post('/check-all-versions', authenticateToken, async (req, res) => {
  try {
    const results = await checkAllVersions();
    res.json({
      message: 'Version check completed for all components',
      updated: results.length,
      components: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to check versions' });
  }
});

// POST /api/components/preview-version-url - Preview what data a version URL returns (without saving)
router.post('/preview-version-url', authenticateToken, async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const versionInfo = await fetchVersionInfo(url);
    
    if (!versionInfo) {
      return res.status(400).json({ error: 'Failed to fetch version info from URL' });
    }

    res.json({
      success: true,
      data: versionInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to preview URL' });
  }
});

module.exports = router;

