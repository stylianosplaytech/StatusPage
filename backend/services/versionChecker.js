const { getDb } = require('../database');
const https = require('https');

// Log Node.js version on load (helps diagnose deployment differences)
console.log(`[VersionChecker] Node.js version: ${process.version}`);
console.log(`[VersionChecker] Platform: ${process.platform} ${process.arch}`);

/**
 * Fallback HTTP GET using https module (more compatible than native fetch)
 */
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, statusText: res.statusMessage, text: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Check interval: 5 minutes in milliseconds
const CHECK_INTERVAL = 5 * 60 * 1000;

let checkInterval = null;

/**
 * Sleep helper for retries
 */
function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch version info from a URL and parse the response
 * Expected JSON format: { "namespace": "mojito-888casino1-green", "staticImageTag": "25.10.2.0-5048fea" }
 * Enhanced with retries, multiple User-Agents, and better error handling
 */
async function fetchVersionInfo(url) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds between retries
  
  // Different User-Agent strings to try
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (compatible; StatusPageBot/1.0)',
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userAgent = userAgents[attempt % userAgents.length];
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout (increased)

      console.log(`    - Attempt ${attempt + 1}/${MAX_RETRIES} for version info (URL: ${url})`);

      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          // Removed 'br' (Brotli) - Node.js native fetch may not handle it well
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': userAgent,
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);
      console.log(`    - Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        console.log(`    - HTTP ${response.status}: ${response.statusText}`);
        if (attempt < MAX_RETRIES - 1) {
          await sleepMs(RETRY_DELAY);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Try to parse as JSON
      let data;
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.log(`    - Failed to parse JSON response, trying to extract version info from text`);
        // Try to extract version from plain text if JSON parsing fails
        const versionMatch = text.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (versionMatch) {
          return {
            namespace: null,
            detected_version: versionMatch[1],
            full_namespace: null,
            full_version_tag: versionMatch[1]
          };
        }
        if (attempt < MAX_RETRIES - 1) {
          await sleepMs(RETRY_DELAY);
          continue;
        }
        throw parseError;
      }
      
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
      } else if (data.version) {
        // Try direct version field
        detectedVersion = data.version;
      }

      console.log(`    - ✓ Got version info: NS=${namespaceColor}, Ver=${detectedVersion}`);

      return {
        namespace: namespaceColor,
        detected_version: detectedVersion,
        full_namespace: data.namespace || null,
        full_version_tag: data.staticImageTag || data.imageTag || null
      };
    } catch (error) {
      const errorType = error.name === 'AbortError' ? 'Timeout' : error.message;
      console.log(`    - Attempt ${attempt + 1} failed: ${errorType}`);
      
      if (attempt < MAX_RETRIES - 1) {
        await sleepMs(RETRY_DELAY);
      }
    }
  }

  // Fallback: try with https module (more compatible with some servers)
  console.log(`    - Trying fallback with https module...`);
  try {
    const response = await httpsGet(url);
    console.log(`    - HTTPS fallback status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      const data = JSON.parse(response.text);
      
      let namespaceColor = null;
      if (data.namespace) {
        const parts = data.namespace.split('-');
        namespaceColor = parts[parts.length - 1];
      }

      let detectedVersion = null;
      if (data.staticImageTag) {
        detectedVersion = data.staticImageTag.split('-')[0];
      } else if (data.imageTag) {
        detectedVersion = data.imageTag.split('-')[0];
      } else if (data.version) {
        detectedVersion = data.version;
      }

      console.log(`    - ✓ HTTPS fallback success: NS=${namespaceColor}, Ver=${detectedVersion}`);
      return {
        namespace: namespaceColor,
        detected_version: detectedVersion,
        full_namespace: data.namespace || null,
        full_version_tag: data.staticImageTag || data.imageTag || null
      };
    }
  } catch (fallbackError) {
    console.log(`    - HTTPS fallback failed: ${fallbackError.message}`);
  }

  console.error(`    - All attempts failed for ${url}`);
  return null;
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
 * Check if a website URL is reachable with multiple strategies
 */
async function checkWebsiteReachable(url) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds between retries
  
  // Different User-Agent strings to try
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const userAgent = userAgents[attempt % userAgents.length];
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      console.log(`  - Attempt ${attempt + 1}/${MAX_RETRIES} for ${url}`);

      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          // Removed 'br' (Brotli) - Node.js native fetch may not handle it
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });

      clearTimeout(timeoutId);
      console.log(`  - Response: HTTP ${response.status}`);

      // Accept any response that isn't a server error (5xx)
      // 2xx = success, 3xx = redirect (should be followed), 4xx = client error but site is up
      const isUp = response.status < 500;
      
      if (isUp) {
        console.log(`  - ✓ Website responded with HTTP ${response.status}`);
        return true;
      } else {
        console.log(`  - Website returned HTTP ${response.status} (server error)`);
      }
    } catch (error) {
      const errorType = error.name === 'AbortError' ? 'Timeout' : error.message;
      console.log(`  - Attempt ${attempt + 1} failed: ${errorType}`);
      
      // If it's not the last attempt, wait before retrying
      if (attempt < MAX_RETRIES - 1) {
        await sleepMs(RETRY_DELAY);
      }
    }
  }

  // Fallback: try with https module (more compatible with some servers)
  console.log(`  - Trying fallback with https module...`);
  try {
    const response = await httpsGet(url);
    console.log(`  - HTTPS fallback status: ${response.status}`);
    
    if (response.status < 500) {
      console.log(`  - ✓ HTTPS fallback succeeded with HTTP ${response.status}`);
      return true;
    }
  } catch (fallbackError) {
    console.log(`  - HTTPS fallback failed: ${fallbackError.message}`);
  }

  // Final attempt with HEAD request (some servers prefer it)
  try {
    console.log(`  - Final attempt with HEAD request...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UptimeBot/1.0)'
      },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);
    
    if (response.status < 500) {
      console.log(`  - ✓ HEAD request succeeded with HTTP ${response.status}`);
      return true;
    }
  } catch (headError) {
    console.log(`  - HEAD request also failed: ${headError.message}`);
  }

  console.error(`  - All attempts failed for ${url}`);
  return false;
}

/**
 * Check and update website status for a single component
 */
async function checkComponentWebsite(component) {
  if (!component.website_url) {
    return null;
  }

  console.log(`[WEBSITE] Checking "${component.name}" at ${component.website_url}`);
  
  const isReachable = await checkWebsiteReachable(component.website_url);
  
  if (!isReachable) {
    console.log(`  - ⚠️ Website unreachable for "${component.name}" - Setting website_status to POTENTIAL OUTAGE`);
    
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.run(
        `UPDATE components SET website_status = 'potential_outage', website_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [component.id],
        function(err) {
          if (err) {
            console.error(`  - Failed to update component "${component.name}" website status:`, err);
            reject(err);
          } else {
            resolve({
              ...component,
              website_status: 'potential_outage',
              website_reachable: false
            });
          }
        }
      );
    });
  }

  console.log(`  - ✓ Website reachable for "${component.name}"`);

  return new Promise((resolve, reject) => {
    const db = getDb();
    const newWebsiteStatus = component.website_status === 'potential_outage' ? 'operational' : (component.website_status || 'operational');
    
    db.run(
      `UPDATE components SET website_status = ?, website_last_checked = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newWebsiteStatus, component.id],
      function(err) {
        if (err) {
          console.error(`  - Failed to update component "${component.name}" website status:`, err);
          reject(err);
        } else {
          resolve({
            ...component,
            website_status: newWebsiteStatus,
            website_reachable: true
          });
        }
      }
    );
  });
}

/**
 * Check all components with version URLs (Production, Shadow, and Website)
 */
async function checkAllVersions() {
  console.log('\n========================================');
  console.log('Starting version check for all components...');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');

  return new Promise((resolve, reject) => {
    const db = getDb();
    
    // Get all components that have any URL to check
    db.all('SELECT * FROM components WHERE (version_url IS NOT NULL AND version_url != "") OR (shadow_version_url IS NOT NULL AND shadow_version_url != "") OR (website_url IS NOT NULL AND website_url != "")', [], async (err, components) => {
      if (err) {
        console.error('Failed to fetch components for version check:', err);
        reject(err);
        return;
      }

      if (!components || components.length === 0) {
        console.log('No components with URLs found.');
        resolve([]);
        return;
      }

      console.log(`Found ${components.length} component(s) with URLs to check.`);

      const results = [];
      let totalChecks = 0;
      let successCount = 0;
      let failureCount = 0;
      
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        console.log(`\n[${i + 1}/${components.length}] Checking "${component.name}"...`);
        
        // Check Production URL
        if (component.version_url) {
          totalChecks++;
          try {
            const result = await checkComponentVersion(component);
            if (result) {
              if (result.url_reachable === false) {
                failureCount++;
              } else {
                successCount++;
              }
            }
          } catch (error) {
            console.error(`  Error checking production:`, error.message);
            failureCount++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check Shadow URL
        if (component.shadow_version_url) {
          totalChecks++;
          try {
            const shadowResult = await checkComponentShadowVersion(component);
            if (shadowResult) {
              results.push(shadowResult);
              if (shadowResult.shadow_url_reachable === false) {
                failureCount++;
              } else {
                successCount++;
              }
            }
          } catch (error) {
            console.error(`  Error checking shadow:`, error.message);
            failureCount++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check Website URL
        if (component.website_url) {
          totalChecks++;
          try {
            const websiteResult = await checkComponentWebsite(component);
            if (websiteResult) {
              if (websiteResult.website_reachable === false) {
                failureCount++;
              } else {
                successCount++;
              }
            }
          } catch (error) {
            console.error(`  Error checking website:`, error.message);
            failureCount++;
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`\n========================================`);
      console.log(`Version check complete.`);
      console.log(`  Components checked: ${components.length}`);
      console.log(`  Total checks: ${totalChecks}`);
      console.log(`  ✓ Successful: ${successCount}`);
      console.log(`  ✗ Failed: ${failureCount}`);
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

/**
 * Manually trigger a website check for a specific component
 */
async function checkSingleComponentWebsite(componentId) {
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

      if (!component.website_url) {
        reject(new Error('Component has no website URL configured'));
        return;
      }

      try {
        const result = await checkComponentWebsite(component);
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
  checkSingleComponentWebsite,
  fetchVersionInfo
};


