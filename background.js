// Store sites to be monitored
const MONITORED_SITES = [
    { domain: "youtube.com", name: "YouTube" },
    { domain: "netflix.com", name: "Netflix" },
    { domain: "hotstar.com", name: "Hotstar" }
  ];
  
  // Default time limit: 30 minutes (in milliseconds)
  const DEFAULT_TIME_LIMIT = 30 * 60 * 1000;
  
  // Initialize extension data
  browser.runtime.onInstalled.addListener(() => {
    const today = new Date().toDateString();
    
    // Set default values
    const defaultData = {
      timeLimit: DEFAULT_TIME_LIMIT,
      sites: {}
    };
    
    // Initialize tracking data for each site
    MONITORED_SITES.forEach(site => {
      defaultData.sites[site.domain] = {
        timeSpent: 0,
        lastUpdated: null,
        lastDate: today,
        blocked: false
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
      
      MONITORED_SITES.forEach(site => {
        if (sites[site.domain]) {
          sites[site.domain].timeSpent = 0;
          sites[site.domain].lastDate = today;
          sites[site.domain].blocked = false;
        }
      });
      
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
      const site = getSiteFromUrl(activeTabUrl);
      
      if (site) {
        startTracking(site);
      }
    }).catch(error => {
      console.error("Error getting tab info:", error);
    });
  }
  
  // Extract site info from URL
  function getSiteFromUrl(url) {
    if (!url) return null;
    
    for (const site of MONITORED_SITES) {
      if (url.includes(site.domain)) {
        return site;
      }
    }
    
    return null;
  }
  
  // Start tracking time for a site
  function startTracking(site) {
    if (!site) return;
    
    browser.storage.local.get(["sites", "timeLimit"], data => {
      const siteData = data.sites[site.domain];
      const timeLimit = data.timeLimit || DEFAULT_TIME_LIMIT;
      
      // Check if site is blocked
      if (siteData.blocked) {
        browser.tabs.sendMessage(activeTabId, { 
          action: "BLOCK_SITE",
          site: site.name,
          timeLimit: timeLimit / (60 * 1000) // Convert to minutes
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
    browser.storage.local.get(["sites", "timeLimit"], data => {
      const sites = data.sites;
      const timeLimit = data.timeLimit || DEFAULT_TIME_LIMIT;
      const siteData = sites[site.domain];
      
      // Update time spent
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
      
      // Update storage
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
  
  // Listen for messages from popup or content scripts
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_TIME_DATA") {
      browser.storage.local.get(["sites", "timeLimit"], data => {
        sendResponse({
          sites: data.sites,
          timeLimit: data.timeLimit || DEFAULT_TIME_LIMIT
        });
      });
      return true; // Required for async response
    } else if (message.action === "UPDATE_TIME_LIMIT") {
      browser.storage.local.set({ timeLimit: message.timeLimit });
    } else if (message.action === "RESET_COUNTERS") {
      resetDailyCounts();
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