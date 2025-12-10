const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const db = getDb();
    
    db.all(
        `SELECT id, username, role, status, email, created_at, last_login 
         FROM users 
         ORDER BY created_at DESC`,
        [],
        (err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            res.json(users);
        }
    );
});

// Get single user (admin only)
router.get('/:id', authenticateToken, requireAdmin, (req, res) => {
    const db = getDb();
    const { id } = req.params;
    
    db.get(
        `SELECT id, username, role, status, email, created_at, last_login 
         FROM users 
         WHERE id = ?`,
        [id],
        (err, user) => {
            if (err) {
                console.error('Error fetching user:', err);
                return res.status(500).json({ error: 'Failed to fetch user' });
            }
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        }
    );
});

// Create new user (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role, status, email } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const validRoles = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
    }
    
    try {
        const db = getDb();
        const passwordHash = await bcrypt.hash(password, 10);
        
        db.run(
            `INSERT INTO users (username, password_hash, role, status, email) 
             VALUES (?, ?, ?, ?, ?)`,
            [username, passwordHash, role || 'editor', status || 'active', email || null],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        return res.status(400).json({ error: 'Username already exists' });
                    }
                    console.error('Error creating user:', err);
                    return res.status(500).json({ error: 'Failed to create user' });
                }
                
                res.status(201).json({
                    id: this.lastID,
                    username,
                    role: role || 'editor',
                    status: status || 'active',
                    email: email || null,
                    message: 'User created successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user (admin only)
router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, password, role, status, email } = req.body;
    
    const validRoles = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
    }
    
    try {
        const db = getDb();
        
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (username) {
            updates.push('username = ?');
            values.push(username);
        }
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            const passwordHash = await bcrypt.hash(password, 10);
            updates.push('password_hash = ?');
            values.push(passwordHash);
        }
        if (role) {
            updates.push('role = ?');
            values.push(role);
        }
        if (status) {
            updates.push('status = ?');
            values.push(status);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            values.push(email || null);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(id);
        
        db.run(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            values,
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        return res.status(400).json({ error: 'Username already exists' });
                    }
                    console.error('Error updating user:', err);
                    return res.status(500).json({ error: 'Failed to update user' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                
                res.json({ message: 'User updated successfully' });
            }
        );
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Change user password (admin only, or user changing own password)
router.patch('/:id/password', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    // Only admin can change other users' passwords, or user can change their own
    if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
        return res.status(403).json({ error: 'Not authorized to change this password' });
    }
    
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    try {
        const db = getDb();
        const passwordHash = await bcrypt.hash(password, 10);
        
        db.run(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [passwordHash, id],
            function(err) {
                if (err) {
                    console.error('Error changing password:', err);
                    return res.status(500).json({ error: 'Failed to change password' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                
                res.json({ message: 'Password changed successfully' });
            }
        );
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    
    // Prevent deleting yourself
    if (req.user.userId === parseInt(id)) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const db = getDb();
    
    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Failed to delete user' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'User deleted successfully' });
    });
});

module.exports = router;

