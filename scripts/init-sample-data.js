const db = require('../backend/database');

const initSampleData = async () => {
  const database = db.getDb();

  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // Insert sample components
      const components = [
        { name: 'API Server', group_name: 'API / EU', status: 'operational', sort_order: 1 },
        { name: 'Database', group_name: 'Infrastructure', status: 'operational', sort_order: 2 },
        { name: 'CDN', group_name: 'Infrastructure', status: 'operational', sort_order: 3 },
        { name: 'Payment Gateway', group_name: 'API / EU', status: 'operational', sort_order: 4 },
        { name: 'Authentication Service', group_name: 'API / EU', status: 'operational', sort_order: 5 }
      ];

      const stmt = database.prepare('INSERT INTO components (name, group_name, status, sort_order) VALUES (?, ?, ?, ?)');
      
      components.forEach(comp => {
        stmt.run(comp.name, comp.group_name, comp.status, comp.sort_order);
      });
      
      stmt.finalize(() => {
        console.log('Sample components created');
        resolve();
      });
    });
  });
};

// Run if called directly
if (require.main === module) {
  db.init()
    .then(() => {
      console.log('Database initialized');
      return initSampleData();
    })
    .then(() => {
      console.log('Sample data initialized successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { initSampleData };

