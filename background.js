// Default sites to be monitored
const DEFAULT_MONITORED_SITES = [
    { domain: "youtube.com", name: "YouTube", timeLimit: 60 * 60 * 1000 },
    { domain: "hotstar.com", name: "Hotstar", timeLimit: 60 * 60 * 1000 },
    { domain: "netflix.com", name: "Netflix", timeLimit: 60 * 60 * 1000 }
  ];
  
  // Initialize extension data
  browser.runtime.onInstalled.addListener(() => {
    const today = new Date().toDateString();
    
    // Set default values
    const defaultData = {
      sites: {},
      ignoredUntil: {}
    };
    
    // Initialize tracking data for each site
    DEFAULT_MONITORED_SITES.forEach(site => {
      defaultData.sites[site.domain] = {
        timeSpent: 0,
        lastUpdated: null,
        lastDate: today,
        blocked: false,
        timeLimit: site.timeLimit,
        name: site.name
      };
    });
    
    browser.storage.local.set(defaultData);
    
    // Create daily alarm to reset counters
    browser.alarms.create("resetDaily", {
      delayInMinutes: getMinutesToMidnight(),
      periodInMinutes: 24 * 60 // 24 hours
    });
  });
  
  // Reset counters at midnight
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "resetDaily") {
      resetDailyCounts();
    } else if (alarm.name.startsWith("ignoreExpire_")) {
      // Handle expiration of ignore period
      const domain = alarm.name.replace("ignoreExpire_", "");
      expireIgnore(domain);
    }
  });
  
  // Calculate minutes until midnight for alarm
  function getMinutesToMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return (midnight - now) / 1000 / 60;
  }
  
  // Reset daily counts
  function resetDailyCounts() {
    const today = new Date().toDateString();
    
    browser.storage.local.get(["sites"], (data) => {
      const sites = data.sites || {};
      
      for (const domain in sites) {
        sites[domain].timeSpent = 0;
        sites[domain].lastDate = today;
        sites[domain].blocked = false;
      }
      
      browser.storage.local.set({ sites });
    });
  }
  
  // Track active tabs
  let activeTabId = null;
  let activeTabUrl = null;
  let trackingInterval = null;
  
  // Listen for tab activation changes
  browser.tabs.onActivated.addListener(activeInfo => {
    activeTabId = activeInfo.tabId;
    checkAndTrackTab(activeTabId);
  });
  
  // Listen for tab URL changes
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.url) {
      checkAndTrackTab(tabId);
    }
  });
  
  // Check if tab should be tracked and start tracking if necessary
  function checkAndTrackTab(tabId) {
    browser.tabs.get(tabId).then(tab => {
      stopTracking();
      
      activeTabUrl = tab.url;
      getSiteFromUrl(activeTabUrl).then(site => {
        if (site) {
          startTracking(site);
        }
      });
    }).catch(error => {
      console.error("Error getting tab info:", error);
    });
  }
  
  // Extract site info from URL
  function getSiteFromUrl(url) {
    if (!url) return Promise.resolve(null);
    
    return browser.storage.local.get(["sites", "ignoredUntil"]).then(data => {
      const sites = data.sites || {};
      const ignoredUntil = data.ignoredUntil || {};
      
      for (const domain in sites) {
        if (url.includes(domain)) {
          // Check if this domain is currently being ignored
          const now = Date.now();
          if (ignoredUntil[domain] && ignoredUntil[domain] > now) {
            return null; // Don't track this site while it's ignored
          }
          
          return {
            domain: domain,
            name: sites[domain].name || domain
          };
        }
      }
      
      return null;
    });
  }
  
  // Start tracking time for a site
  function startTracking(site) {
    if (!site) return;
    
    browser.storage.local.get(["sites"], data => {
      const siteData = data.sites[site.domain];
      
      // Check if site is blocked
      if (siteData.blocked) {
        browser.tabs.sendMessage(activeTabId, { 
          action: "BLOCK_SITE",
          site: site.name,
          timeLimit: siteData.timeLimit / (60 * 1000) // Convert to minutes
        });
        return;
      }
      
      // Reset date if needed
      const today = new Date().toDateString();
      if (siteData.lastDate !== today) {
        siteData.timeSpent = 0;
        siteData.lastDate = today;
        siteData.blocked = false;
      }
      
      // Start interval for tracking
      trackingInterval = setInterval(() => {
        updateTimeSpent(site);
      }, 1000); // Update every second
    });
  }
  
  // Stop tracking
  function stopTracking() {
    if (trackingInterval) {
      clearInterval(trackingInterval);
      trackingInterval = null;
    }
  }
  
  // Update time spent on site
  function updateTimeSpent(site) {
    browser.storage.local.get(["sites"], data => {
        const sites = data.sites;
        const siteData = sites[site.domain];

        if (!siteData) {
            console.error(`No data found for domain: ${site.domain}`);
            return;
        }

        const timeLimit = siteData.timeLimit;

        // Update time spent only for the active domain
        siteData.timeSpent += 1000; // Add 1 second
        siteData.lastUpdated = Date.now();

        // Check if time limit is reached
        if (siteData.timeSpent >= timeLimit && !siteData.blocked) {
            siteData.blocked = true;

            // Send block message to content script
            browser.tabs.sendMessage(activeTabId, { 
                action: "BLOCK_SITE",
                site: site.name,
                timeLimit: timeLimit / (60 * 1000) // Convert to minutes
            });

            stopTracking();
        }

        // Update storage only for the active domain
        browser.storage.local.set({ sites });

        // Update badge with remaining time
        const remainingTime = Math.max(0, Math.floor((timeLimit - siteData.timeSpent) / (60 * 1000)));
        browser.browserAction.setBadgeText({
            text: remainingTime.toString(),
            tabId: activeTabId
        });

        // Red badge when time is almost up
        if (remainingTime < 5) {
            browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000" });
        } else {
            browser.browserAction.setBadgeBackgroundColor({ color: "#4688F1" });
        }
    });
}
  
  // Ignore a domain for 6 hours
  function ignoreDomain(domain) {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const expireTime = now + sixHoursMs;
    
    browser.storage.local.get(["ignoredUntil", "sites"], data => {
      const ignoredUntil = data.ignoredUntil || {};
      const sites = data.sites || {};
      
      // Set ignore expiration time
      ignoredUntil[domain] = expireTime;
      
      // If this site was blocked, unblock it
      if (sites[domain] && sites[domain].blocked) {
        sites[domain].blocked = false;
      }
      
      // Update storage
      browser.storage.local.set({ 
        ignoredUntil: ignoredUntil,
        sites: sites 
      });
      
      // Create alarm to expire ignore
      browser.alarms.create(`ignoreExpire_${domain}`, {
        delayInMinutes: sixHoursMs / (60 * 1000) // Convert to minutes
      });
      
      // Reload active tab if it contains this domain
      browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs.length > 0 && tabs[0].url.includes(domain)) {
          browser.tabs.reload(tabs[0].id);
        }
      });
    });
  }
  
  // Expire ignore period for a domain
  function expireIgnore(domain) {
    browser.storage.local.get("ignoredUntil", data => {
      const ignoredUntil = data.ignoredUntil || {};
      
      if (ignoredUntil[domain]) {
        delete ignoredUntil[domain];
        browser.storage.local.set({ ignoredUntil: ignoredUntil });
      }
    });
  }
  
  // Add a new domain to monitor
  function addDomain(domain, name, timeLimit) {
    // Clean up domain
    domain = domain.toLowerCase().trim();
    if (!domain.match(/^[a-z0-9.-]+\.[a-z]{2,}$/)) {
      return Promise.reject("Invalid domain format");
    }
    
    return browser.storage.local.get("sites").then(data => {
      const sites = data.sites || {};
      const today = new Date().toDateString();
      
      // Check if domain already exists
      if (sites[domain]) {
        return Promise.reject("Domain already exists");
      }
      
      // Add new domain
      sites[domain] = {
        timeSpent: 0,
        lastUpdated: null,
        lastDate: today,
        blocked: false,
        timeLimit: timeLimit,
        name: name || domain
      };
      
      return browser.storage.local.set({ sites });
    });
  }
  
  // Remove a domain from monitoring
  function removeDomain(domain) {
    return browser.storage.local.get(["sites", "ignoredUntil"]).then(data => {
      const sites = data.sites || {};
      const ignoredUntil = data.ignoredUntil || {};
      
      // Remove domain if it exists
      if (sites[domain]) {
        delete sites[domain];
      }
      
      // Remove from ignored list if it exists
      if (ignoredUntil[domain]) {
        delete ignoredUntil[domain];
      }
      
      // Remove any related alarms
      browser.alarms.clear(`ignoreExpire_${domain}`);
      
      return browser.storage.local.set({ 
        sites: sites,
        ignoredUntil: ignoredUntil
      });
    });
  }
  
  // Update time limit for a domain
  function updateDomainTimeLimit(domain, newTimeLimit) {
    return browser.storage.local.get("sites").then(data => {
      const sites = data.sites || {};
      
      // Update time limit if domain exists
      if (sites[domain]) {
        sites[domain].timeLimit = newTimeLimit;
        return browser.storage.local.set({ sites });
      } else {
        return Promise.reject("Domain not found");
      }
    });
  }
  
  // Listen for messages from popup or content scripts
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_TIME_DATA") {
      browser.storage.local.get(["sites", "ignoredUntil"], data => {
        sendResponse({
          sites: data.sites || {},
          ignoredUntil: data.ignoredUntil || {}
        });
      });
      return true; // Required for async response
    } 
    else if (message.action === "UPDATE_DOMAIN_TIME_LIMIT") {
      updateDomainTimeLimit(message.domain, message.timeLimit)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error }));
      return true;
    } 
    else if (message.action === "ADD_DOMAIN") {
      addDomain(message.domain, message.name, message.timeLimit)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error }));
      return true;
    } 
    else if (message.action === "REMOVE_DOMAIN") {
      removeDomain(message.domain)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error }));
      return true;
    } 
    else if (message.action === "IGNORE_DOMAIN") {
      ignoreDomain(message.domain);
      sendResponse({ success: true });
      return false;
    } 
    else if (message.action === "RESET_COUNTERS") {
      resetDailyCounts();
      sendResponse({ success: true });
      return false;
    }
  });
  
  // Handle window focus changes
  browser.windows.onFocusChanged.addListener(windowId => {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      // Window lost focus, stop tracking
      stopTracking();
    } else {
      // Window gained focus, check active tab
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          checkAndTrackTab(activeTabId);
        }
      });
    }
  });
  
  // Update badge text to reflect remaining time for the active domain
  function updateBadgeForActiveTab() {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs.length === 0) return; // No active tab

        const activeTab = tabs[0];
        const url = new URL(activeTab.url);
        const domain = url.hostname;

        browser.storage.local.get("sites").then(data => {
            const sites = data.sites || {};
            const siteData = sites[domain];

            if (siteData) {
                const remainingMs = Math.max(0, siteData.timeLimit - siteData.timeSpent);
                const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

                browser.browserAction.setBadgeText({ text: remainingMinutes.toString() });
                browser.browserAction.setBadgeBackgroundColor({ color: remainingMinutes > 0 ? "#4688F1" : "#FF0000" });
            } else {
                browser.browserAction.setBadgeText({ text: "" });
            }
        });
    });
}

// Update badge only for the active tab
browser.tabs.onActivated.addListener(updateBadgeForActiveTab);
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        updateBadgeForActiveTab();
    }
});