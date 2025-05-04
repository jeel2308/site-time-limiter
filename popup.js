// alert("Popup script loaded");

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup DOM fully loaded and parsed.");
    loadData();

    // Set up event listeners
    document.getElementById("save-limit").addEventListener("click", () => {
        console.log("Save Time Limit button clicked.");
        saveTimeLimit();
    });
    document.getElementById("reset").addEventListener("click", () => {
        console.log("Reset button clicked.");
        resetCounters();
    });

    // Add event listeners for tab switching
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const targetTab = tab.getAttribute("data-tab");
            console.log(`Switching to tab: ${targetTab}`);

            // Update active tab
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // Show corresponding tab content
            document.querySelectorAll(".tab-content").forEach(content => {
                content.classList.remove("active");
            });
            document.getElementById(`${targetTab}-tab`).classList.add("active");
        });
    });

    // Add event listener for adding a new site
    const siteInput = document.getElementById("new-domain");
    const addSiteButton = document.getElementById("add-domain");
    addSiteButton.addEventListener("click", () => {
        console.log("Add Domain button clicked.");
        addNewSite(siteInput);
    });
});

// Load data from storage
function loadData() {
    console.log("Loading data from storage...");
browser.runtime.sendMessage({ action: "GET_TIME_DATA" }).then(response => {
        console.log("Data received from background script:", response);
        const sites = response.sites;
        const timeLimit = response.timeLimit;

        // Update time limit input
        document.getElementById("time-limit").value = timeLimit / (60 * 1000); // Convert to minutes

        // Update site information
        const sitesContainer = document.getElementById("sites-container");
        sitesContainer.innerHTML = ""; // Clear loading message

        for (const domain in sites) {
            const siteData = sites[domain];
            const siteElement = createSiteElement(domain, siteData, timeLimit);
            sitesContainer.appendChild(siteElement);
        }
    }).catch(error => {
        console.error("Error loading data from storage:", error);
    });
}

// Create element for a site
function createSiteElement(domain, siteData, timeLimit) {
    const siteElement = document.createElement("div");
    siteElement.className = "site";

    const siteName = document.createElement("div");
    siteName.className = "site-name";
    siteName.textContent = getDomainName(domain);

    const timeInfo = document.createElement("div");
    timeInfo.className = "time-info";

    const timeSpent = document.createElement("span");
    const minutes = Math.floor(siteData.timeSpent / (60 * 1000));
    const seconds = Math.floor((siteData.timeSpent % (60 * 1000)) / 1000);
    timeSpent.textContent = `Time spent: ${minutes}m ${seconds}s`;

    const timeRemaining = document.createElement("span");
    const remainingMs = Math.max(0, timeLimit - siteData.timeSpent);
    const remainingMinutes = Math.floor(remainingMs / (60 * 1000));
    const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
    timeRemaining.textContent = `Remaining: ${remainingMinutes}m ${remainingSeconds}s`;

    timeInfo.appendChild(timeSpent);
    timeInfo.appendChild(timeRemaining);

    siteElement.appendChild(siteName);
    siteElement.appendChild(timeInfo);

    // Show blocked status if applicable
    if (siteData.blocked) {
        const blockedInfo = document.createElement("div");
        blockedInfo.className = "blocked";
        blockedInfo.textContent = "BLOCKED UNTIL TOMORROW";
        siteElement.appendChild(blockedInfo);
    }

    return siteElement;
}

// Get readable domain name
function getDomainName(domain) {
    if (domain.includes("youtube")) return "YouTube";
    if (domain.includes("hotstar")) return "Hotstar";
    if (domain.includes("jiocinema")) return "JioCinema";
    return domain;
}

// Save new time limit
function saveTimeLimit() {
    const limitInput = document.getElementById("time-limit");
    const limitMinutes = parseInt(limitInput.value, 10);

    if (isNaN(limitMinutes) || limitMinutes < 1) {
        alert("Please enter a valid time limit (minimum 1 minute).");
        return;
    }

    const limitMilliseconds = limitMinutes * 60 * 1000;
    browser.runtime.sendMessage({
        action: "UPDATE_TIME_LIMIT",
        timeLimit: limitMilliseconds
    });

    alert("Time limit updated successfully!");
    loadData(); // Refresh the display
}

// Reset all counters
function resetCounters() {
    if (confirm("Are you sure you want to reset all counters? This will unblock all sites.")) {
        browser.runtime.sendMessage({ action: "RESET_COUNTERS" });
        loadData(); // Refresh the display
    }
}

// Switch between tabs
function switchTab(tabName) {
    const tabs = ["monitored-sites", "add-site", "settings"];
    tabs.forEach(tab => {
        document.getElementById(tab).style.display = tab === tabName ? "block" : "none";
    });
}

// Add a new site to the monitored list
function addNewSite() {
    const siteInput = document.getElementById("new-site");
    const siteName = siteInput.value.trim();

    if (!siteName) {
        console.log("Invalid site name entered.");
        alert("Please enter a valid site name.");
        return;
    }

    console.log(`Adding new site: ${siteName}`);
    browser.runtime.sendMessage({ action: "ADD_SITE", site: siteName }).then(() => {
        console.log(`Site '${siteName}' added successfully.`);
        alert(`Site '${siteName}' added successfully!`);
        siteInput.value = ""; // Clear input field
        loadData(); // Refresh the display
    }).catch(error => {
        console.error("Error adding new site:", error);
    });
}