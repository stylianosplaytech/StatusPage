const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'status_page.db');

let db = null;

const init = async () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
      // Enable foreign key constraints
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('Warning: Could not enable foreign keys:', err);
        } else {
          console.log('Foreign keys enabled');
        }
        createTables().then(resolve).catch(reject);
      });
    });
  });
};

const createTables = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Components table
      db.run(`CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        group_name TEXT,
        status TEXT NOT NULL DEFAULT 'operational',
        sort_order INTEGER DEFAULT 0,
        version TEXT,
        visible INTEGER DEFAULT 1,
        version_url TEXT,
        namespace TEXT,
        detected_version TEXT,
        version_last_checked DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (!err) {
          // Add version column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN version TEXT`, (alterErr) => {
            // Ignore error if column already exists
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding version column to components:', alterErr);
            }
          });
          // Add visible column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN visible INTEGER DEFAULT 1`, (alterErr) => {
            // Ignore error if column already exists
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding visible column to components:', alterErr);
            }
          });
          // Add version_url column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN version_url TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding version_url column to components:', alterErr);
            }
          });
          // Add namespace column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN namespace TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding namespace column to components:', alterErr);
            }
          });
          // Add detected_version column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN detected_version TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding detected_version column to components:', alterErr);
            }
          });
          // Add version_last_checked column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN version_last_checked DATETIME`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding version_last_checked column to components:', alterErr);
            }
          });
          // Add shadow_version_url column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN shadow_version_url TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding shadow_version_url column to components:', alterErr);
            }
          });
          // Add shadow_namespace column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN shadow_namespace TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding shadow_namespace column to components:', alterErr);
            }
          });
          // Add shadow_detected_version column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN shadow_detected_version TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding shadow_detected_version column to components:', alterErr);
            }
          });
          // Add shadow_version_last_checked column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN shadow_version_last_checked DATETIME`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding shadow_version_last_checked column to components:', alterErr);
            }
          });
          // Add shadow_status column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN shadow_status TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding shadow_status column to components:', alterErr);
            }
          });
          // Add website_url column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN website_url TEXT`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding website_url column to components:', alterErr);
            }
          });
          // Add website_status column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN website_status TEXT DEFAULT 'operational'`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding website_status column to components:', alterErr);
            }
          });
          // Add website_last_checked column if it doesn't exist (for existing databases)
          db.run(`ALTER TABLE components ADD COLUMN website_last_checked DATETIME`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('Error adding website_last_checked column to components:', alterErr);
            }
          });
        }
      });

      // Incidents table
      db.run(`CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_number TEXT,
        title TEXT NOT NULL,
        summary TEXT,
        affected_services TEXT,
        root_cause TEXT,
        resolution_notes TEXT,
        impact TEXT NOT NULL DEFAULT 'P2',
        current_status TEXT NOT NULL DEFAULT 'identified',
        visibility TEXT NOT NULL DEFAULT 'public',
        started_at DATETIME NOT NULL,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating incidents table:', err);
        } else {
          // Add new columns if they don't exist (for existing databases)
          const newColumns = [
            { name: 'summary', type: 'TEXT' },
            { name: 'incident_number', type: 'TEXT' },
            { name: 'affected_services', type: 'TEXT' },
            { name: 'root_cause', type: 'TEXT' },
            { name: 'resolution_notes', type: 'TEXT' },
            { name: 'domain_distribution', type: 'TEXT' }
          ];
          
          newColumns.forEach(col => {
            db.run(`ALTER TABLE incidents ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
              // Ignore error if column already exists
              if (alterErr && !alterErr.message.includes('duplicate column')) {
                console.error(`Error adding ${col.name} column:`, alterErr);
              }
            });
          });
        }
      });

      // Incident updates table
      db.run(`CREATE TABLE IF NOT EXISTS incident_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
      )`);

      // Incident-Component junction table
      db.run(`CREATE TABLE IF NOT EXISTS incident_components (
        incident_id INTEGER NOT NULL,
        component_id INTEGER NOT NULL,
        PRIMARY KEY (incident_id, component_id),
        FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
        FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
      )`);

      // Scheduled maintenance table
      db.run(`CREATE TABLE IF NOT EXISTS maintenances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        window_start DATETIME NOT NULL,
        window_end DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Maintenance-Component junction table
      db.run(`CREATE TABLE IF NOT EXISTS maintenance_components (
        maintenance_id INTEGER NOT NULL,
        component_id INTEGER NOT NULL,
        PRIMARY KEY (maintenance_id, component_id),
        FOREIGN KEY (maintenance_id) REFERENCES maintenances(id) ON DELETE CASCADE,
        FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
      )`);

      // Users table for admin authentication
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        status TEXT DEFAULT 'active',
        email TEXT,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, async (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Add new columns if they don't exist (for existing databases)
        const userColumns = [
          { name: 'status', type: 'TEXT DEFAULT \'active\'' },
          { name: 'email', type: 'TEXT' },
          { name: 'last_login', type: 'DATETIME' },
          { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
        ];
        
        userColumns.forEach(col => {
          db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            // Ignore error if column already exists
          });
        });
        
        // Create default admin user if it doesn't exist
        const defaultPassword = await bcrypt.hash('admin123', 10);
        db.run(`INSERT OR IGNORE INTO users (username, password_hash, role, status) 
                VALUES ('admin', ?, 'admin', 'active')`, [defaultPassword], (err) => {
          if (err) {
            console.error('Error creating default admin:', err);
          } else {
            console.log('Default admin user ready (username: admin, password: admin123)');
          }
          resolve();
        });
      });
    });
  });
};

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const close = () => {
  if (db) {
    db.close();
  }
};

module.exports = {
  init,
  getDb,
  close
};

