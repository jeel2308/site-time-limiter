// Check if the site is already blocked
checkIfBlocked();

// Listen for messages from background script
browser.runtime.onMessage.addListener(message => {
  if (message.action === "BLOCK_SITE") {
    blockSite(message.site, message.timeLimit);
  }
});

// Check if site should be blocked
function checkIfBlocked() {
  browser.runtime.sendMessage({ action: "GET_TIME_DATA" }).then(response => {
    const currentUrl = window.location.href;
    const sites = response.sites;
    
    for (const domain in sites) {
      if (currentUrl.includes(domain) && sites[domain].blocked) {
        blockSite(sites[domain].name || getDomainName(domain), sites[domain].timeLimit / (60 * 1000));
        break;
      }
    }
  });
}

// Get readable domain name
function getDomainName(domain) {
  if (domain.includes("youtube")) return "YouTube";
  if (domain.includes("hotstar")) return "Hotstar";
  if (domain.includes("netflix")) return "Netflix";
  return domain;
}

// Block the site
function blockSite(siteName, timeLimitMinutes) {
  // Save original content
  const originalContent = document.body.innerHTML;
  
  // Create block overlay
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  overlay.style.zIndex = "9999999";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.color = "white";
  overlay.style.fontFamily = "Arial, sans-serif";
  
  // Create message
  const message = document.createElement("div");
  message.style.fontSize = "24px";
  message.style.marginBottom = "20px";
  message.style.textAlign = "center";
  message.style.padding = "0 20px";
  message.innerHTML = `<h1>Daily Time Limit Reached</h1>
                      <p>You've reached your daily limit of ${timeLimitMinutes} minutes for ${siteName}.</p>
                      <p>The site will be available again tomorrow.</p>`;
  
  // Create ignore button
  const ignoreButton = document.createElement("button");
  ignoreButton.textContent = "Ignore limit for 6 hours";
  ignoreButton.style.padding = "10px 20px";
  ignoreButton.style.fontSize = "16px";
  ignoreButton.style.backgroundColor = "#4688F1";
  ignoreButton.style.color = "white";
  ignoreButton.style.border = "none";
  ignoreButton.style.borderRadius = "4px";
  ignoreButton.style.cursor = "pointer";
  ignoreButton.style.marginTop = "20px";
  
  ignoreButton.addEventListener("click", () => {
    const domain = getDomainFromUrl(window.location.href);
    if (domain) {
      browser.runtime.sendMessage({ 
        action: "IGNORE_DOMAIN", 
        domain: domain 
      });
    }
  });
  
  overlay.appendChild(message);
  overlay.appendChild(ignoreButton);
  
  // Clear existing content and add overlay
  document.body.innerHTML = "";
  document.body.appendChild(overlay);
  
  // Prevent site from functioning
  document.addEventListener("DOMNodeInserted", function(e) {
    if (e.target !== overlay && !overlay.contains(e.target)) {
      e.stopPropagation();
      if (document.body.innerHTML !== "" && !document.body.contains(overlay)) {
        document.body.innerHTML = "";
        document.body.appendChild(overlay);
      }
    }
  }, true);
}

// Extract domain from URL
function getDomainFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    
    // Handle cases like www.youtube.com -> youtube.com
    if (parts.length > 2 && parts[0] === 'www') {
      return parts.slice(1).join('.');
    }
    
    return parts.slice(-2).join('.');
  } catch (e) {
    return null;
  }
}