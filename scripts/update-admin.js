const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'status_page.db');

const updateAdmin = async () => {
  const username = 'stylianos.phedonos';
  const password = 'Stylianos1!';

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Connected to database');

      // Hash the password
      bcrypt.hash(password, 10, async (err, passwordHash) => {
        if (err) {
          db.close();
          reject(err);
          return;
        }

        // Check if user exists
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
          if (err) {
            db.close();
            reject(err);
            return;
          }

          if (user) {
            // Update existing user
            db.run(
              'UPDATE users SET password_hash = ? WHERE username = ?',
              [passwordHash, username],
              function(updateErr) {
                if (updateErr) {
                  db.close();
                  reject(updateErr);
                  return;
                }
                console.log(`✓ Admin user "${username}" password updated successfully`);
                db.close();
                resolve();
              }
            );
          } else {
            // Create new user
            db.run(
              'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
              [username, passwordHash, 'admin'],
              function(insertErr) {
                if (insertErr) {
                  db.close();
                  reject(insertErr);
                  return;
                }
                console.log(`✓ Admin user "${username}" created successfully`);
                db.close();
                resolve();
              }
            );
          }
        });
      });
    });
  });
};

// Run the script
updateAdmin()
  .then(() => {
    console.log('Admin credentials updated successfully!');
    console.log(`Username: stylianos.phedonos`);
    console.log(`Password: Stylianos1!`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error updating admin credentials:', err);
    process.exit(1);
  });




