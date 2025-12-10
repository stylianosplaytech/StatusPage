const { getDb } = require('../database');

// Check interval: 5 minutes in milliseconds
const CHECK_INTERVAL = 5 * 60 * 1000;

let checkInterval = null;

/**
 * Fetch version info from a URL and parse the response
 * Expected JSON format: { "namespace": "mojito-888casino1-green", "staticImageTag": "25.10.2.0-5048fea" }
 */
async function fetchVersionInfo(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract namespace color (e.g., "mojito-888casino1-green" -> "green")
    let namespaceColor = null;
    if (data.namespace) {
      const parts = data.namespace.split('-');
      namespaceColor = parts[parts.length - 1]; // Get last part as color
    }

    // Extract version from staticImageTag (e.g., "25.10.2.0-5048fea" -> "25.10.2.0")
    let detectedVersion = null;
    if (data.staticImageTag) {
      const versionParts = data.staticImageTag.split('-');
      detectedVersion = versionParts[0]; // Get first part as version
    } else if (data.imageTag) {
      // Fallback to imageTag if staticImageTag is empty
      const versionParts = data.imageTag.split('-');
      detectedVersion = versionParts[0];
    }

    return {
      namespace: namespaceColor,
      detected_version: detectedVersion,
      full_namespace: data.namespace || null,
      full_version_tag: data.staticImageTag || data.imageTag || null
    };
  } catch (error) {
    console.error(`Failed to fetch version info from ${url}:`, error.message);
    return null;
  }
}

/**
 * Check and update PRODUCTION version info for a single component
 */
async function checkComponentVersion(component) {
  if (!component.version_url) {
    return null;
  }

  console.log(`[PRODUCTION] Checking version for "${component.name}" from ${component.version_url}`);
  
  const versionInfo = await fetchVersionInfo(component.version_url);
  
  if (!versionInfo) {
    console.log(`  - ⚠️ Failed to get PRODUCTION version info for "${component.name}" - Setting status to POTENTIAL OUTAGE`);
    
    // URL is not reachable - set status to potential_outage
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.run(
        `UPDATE components SET status = 'potential_outage', version_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [component.id],
        function(err) {
          if (err) {
            console.error(`  - Failed to update component "${component.name}" status:`, err);
            reject(err);
          } else {
            resolve({
              ...component,
              status: 'potential_outage',
              url_reachable: false
            });
          }
        }
      );
    });
  }

  console.log(`  - ✓ Production - Namespace: ${versionInfo.namespace}, Version: ${versionInfo.detected_version}`);

  // URL is reachable - update version info and set status to operational (if it was potential_outage)
  return new Promise((resolve, reject) => {
    const db = getDb();
    // Only restore to operational if current status is potential_outage (don't override manual status changes)
    const newStatus = component.status === 'potential_outage' ? 'operational' : component.status;
    
    db.run(
      `UPDATE components SET namespace = ?, detected_version = ?, status = ?, version_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [versionInfo.namespace, versionInfo.detected_version, newStatus, component.id],
      function(err) {
        if (err) {
          console.error(`  - Failed to update component "${component.name}":`, err);
          reject(err);
        } else {
          resolve({
            ...component,
            namespace: versionInfo.namespace,
            detected_version: versionInfo.detected_version,
            status: newStatus,
            url_reachable: true
          });
        }
      }
    );
  });
}

/**
 * Check and update SHADOW version info for a single component
 */
async function checkComponentShadowVersion(component) {
  if (!component.shadow_version_url) {
    return null;
  }

  console.log(`[SHADOW] Checking version for "${component.name}" from ${component.shadow_version_url}`);
  
  const versionInfo = await fetchVersionInfo(component.shadow_version_url);
  
  if (!versionInfo) {
    console.log(`  - ⚠️ Failed to get SHADOW version info for "${component.name}" - Setting shadow_status to POTENTIAL OUTAGE`);
    
    // URL is not reachable - set shadow_status to potential_outage
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.run(
        `UPDATE components SET shadow_status = 'potential_outage', shadow_version_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [component.id],
        function(err) {
          if (err) {
            console.error(`  - Failed to update component "${component.name}" shadow status:`, err);
            reject(err);
          } else {
            resolve({
              ...component,
              shadow_status: 'potential_outage',
              shadow_url_reachable: false
            });
          }
        }
      );
    });
  }

  console.log(`  - ✓ Shadow - Namespace: ${versionInfo.namespace}, Version: ${versionInfo.detected_version}`);

  // URL is reachable - update shadow version info
  return new Promise((resolve, reject) => {
    const db = getDb();
    // Only restore to operational if current shadow_status is potential_outage
    const newShadowStatus = component.shadow_status === 'potential_outage' ? 'operational' : (component.shadow_status || 'operational');
    
    db.run(
      `UPDATE components SET shadow_namespace = ?, shadow_detected_version = ?, shadow_status = ?, shadow_version_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [versionInfo.namespace, versionInfo.detected_version, newShadowStatus, component.id],
      function(err) {
        if (err) {
          console.error(`  - Failed to update component "${component.name}" shadow info:`, err);
          reject(err);
        } else {
          resolve({
            ...component,
            shadow_namespace: versionInfo.namespace,
            shadow_detected_version: versionInfo.detected_version,
            shadow_status: newShadowStatus,
            shadow_url_reachable: true
          });
        }
      }
    );
  });
}

/**
 * Check all components with version URLs (Production and Shadow)
 */
async function checkAllVersions() {
  console.log('\n========================================');
  console.log('Starting version check for all components...');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  return new Promise((resolve, reject) => {
    const db = getDb();
    
    // Get all components that have either production OR shadow version URLs
    db.all('SELECT * FROM components WHERE (version_url IS NOT NULL AND version_url != "") OR (shadow_version_url IS NOT NULL AND shadow_version_url != "")', [], async (err, components) => {
      if (err) {
        console.error('Failed to fetch components for version check:', err);
        reject(err);
        return;
      }

      if (!components || components.length === 0) {
        console.log('No components with version URLs found.');
        resolve([]);
        return;
      }

      console.log(`Found ${components.length} component(s) with version URLs to check.`);

      const results = [];
      let prodSuccessCount = 0;
      let prodFailureCount = 0;
      let shadowSuccessCount = 0;
      let shadowFailureCount = 0;
      
      for (const component of components) {
        // Check Production URL
        if (component.version_url) {
          try {
            const result = await checkComponentVersion(component);
            if (result) {
              if (result.url_reachable === false) {
                prodFailureCount++;
              } else {
                prodSuccessCount++;
              }
            }
          } catch (error) {
            console.error(`Error checking production for ${component.name}:`, error);
            prodFailureCount++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Check Shadow URL
        if (component.shadow_version_url) {
          try {
            const shadowResult = await checkComponentShadowVersion(component);
            if (shadowResult) {
              results.push(shadowResult);
              if (shadowResult.shadow_url_reachable === false) {
                shadowFailureCount++;
              } else {
                shadowSuccessCount++;
              }
            }
          } catch (error) {
            console.error(`Error checking shadow for ${component.name}:`, error);
            shadowFailureCount++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      console.log(`\nVersion check complete.`);
      console.log(`  PRODUCTION:`);
      console.log(`    ✓ Reachable: ${prodSuccessCount} component(s)`);
      console.log(`    ✗ Unreachable: ${prodFailureCount} component(s)`);
      console.log(`  SHADOW:`);
      console.log(`    ✓ Reachable: ${shadowSuccessCount} component(s)`);
      console.log(`    ✗ Unreachable: ${shadowFailureCount} component(s)`);
      console.log('========================================\n');
      resolve(results);
    });
  });
}

/**
 * Initialize the version checker - runs immediately and then every 24 hours
 */
function initVersionChecker() {
  console.log('Initializing version checker service...');
  
  // Run initial check after a short delay to allow database to be ready
  setTimeout(() => {
    checkAllVersions().catch(err => {
      console.error('Initial version check failed:', err);
    });
  }, 5000);

  // Schedule periodic checks every 24 hours
  checkInterval = setInterval(() => {
    checkAllVersions().catch(err => {
      console.error('Scheduled version check failed:', err);
    });
  }, CHECK_INTERVAL);

  console.log(`Version checker will run every ${CHECK_INTERVAL / (60 * 1000)} minutes.`);
}

/**
 * Stop the version checker
 */
function stopVersionChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('Version checker stopped.');
  }
}

/**
 * Manually trigger a version check for a specific component (Production)
 */
async function checkSingleComponent(componentId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.get('SELECT * FROM components WHERE id = ?', [componentId], async (err, component) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!component) {
        reject(new Error('Component not found'));
        return;
      }

      if (!component.version_url) {
        reject(new Error('Component has no production version URL configured'));
        return;
      }

      try {
        const result = await checkComponentVersion(component);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Manually trigger a shadow version check for a specific component
 */
async function checkSingleComponentShadow(componentId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    db.get('SELECT * FROM components WHERE id = ?', [componentId], async (err, component) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!component) {
        reject(new Error('Component not found'));
        return;
      }

      if (!component.shadow_version_url) {
        reject(new Error('Component has no shadow version URL configured'));
        return;
      }

      try {
        const result = await checkComponentShadowVersion(component);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = {
  initVersionChecker,
  stopVersionChecker,
  checkAllVersions,
  checkSingleComponent,
  checkSingleComponentShadow,
  fetchVersionInfo
};

