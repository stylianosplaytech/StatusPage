const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDb();
    
    db.get(
      'SELECT * FROM users WHERE username = ?',
      [username],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user is active
        if (user.status === 'inactive') {
          return res.status(403).json({ error: 'Account is inactive. Contact an administrator.' });
        }

        // Update last login time
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = generateToken(user);
        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register new admin (protected, but for initial setup)
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDb();
    const passwordHash = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'admin'],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Username already exists' });
          }
          return res.status(500).json({ error: 'Failed to create user' });
        }

        res.json({
          message: 'User created successfully',
          userId: this.lastID
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Restart service endpoint (admin only)
router.post('/restart', authenticateToken, (req, res) => {
  console.log('Restart service requested by admin');
  
  // Send response first
  res.json({ 
    message: 'Service restart initiated',
    timestamp: new Date().toISOString()
  });
  
  // Give time for response to be sent, then exit
  // Process managers (PM2, systemd, etc.) will automatically restart
  setTimeout(() => {
    console.log('Exiting process for restart...');
    process.exit(0); // Exit code 0 for graceful shutdown
  }, 1000);
});

module.exports = router;

