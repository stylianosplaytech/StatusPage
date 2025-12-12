const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const db = require('./backend/database');
const authRoutes = require('./backend/routes/auth');
const statusRoutes = require('./backend/routes/status');
const componentsRoutes = require('./backend/routes/components');
const incidentsRoutes = require('./backend/routes/incidents');
const maintenancesRoutes = require('./backend/routes/maintenances');
const webhooksRoutes = require('./backend/routes/webhooks');
const usersRoutes = require('./backend/routes/users');
const { initVersionChecker } = require('./backend/services/versionChecker');

// App version - update this when deploying new versions
const APP_VERSION = '1.0.7';
const BUILD_DATE = new Date().toISOString();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/components', componentsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/maintenances', maintenancesRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/users', usersRoutes);

// Version endpoint
app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    nodeVersion: process.version
  });
});

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  }
});

// Initialize database and start server
db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Status Page Server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
    console.log(`Default admin credentials: admin / admin123`);
    
    // Initialize version checker service
    initVersionChecker();
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

