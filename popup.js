// alert("Popup script loaded");

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
    console.log("Popup DOM fully loaded and parsed.");
    loadData();

    // Set up event listeners
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
    const siteInput = document.getElementById("new-site");
    const timeLimitInput = document.getElementById("new-time-limit");
    const addSiteButton = document.getElementById("add-site-button");

    // Function to validate inputs and toggle button state
    function validateInputs() {
        const isSiteValid = siteInput.value.trim() !== "";
        const isTimeLimitValid = timeLimitInput.value.trim() !== "" && !isNaN(timeLimitInput.value) && parseInt(timeLimitInput.value, 10) > 0;
        addSiteButton.disabled = !(isSiteValid && isTimeLimitValid);
    }

    // Add event listeners to validate inputs on change
    siteInput.addEventListener("input", validateInputs);
    timeLimitInput.addEventListener("input", validateInputs);

    // Initial validation
    validateInputs();

    addSiteButton.addEventListener("click", () => {
        console.log("Add Site button clicked.");
        addNewSite(siteInput, timeLimitInput);
    });

    // Add event listener for refreshing the display
    document.getElementById("refresh").addEventListener("click", () => {
        console.log("Refresh button clicked.");
        loadData();
    });
});

// Load data from storage
function loadData() {
    console.log("Loading data from storage...");
    browser.runtime.sendMessage({ action: "GET_TIME_DATA" }).then(response => {
        console.log("Data received from background script:", response);
        const sites = response.sites || {}; // Ensure sites is an object

        // Update site information
        const sitesContainer = document.getElementById("sites-container");
        sitesContainer.innerHTML = ""; // Clear loading message

        for (const domain in sites) {
            const siteData = sites[domain] || { timeSpent: 0, timeLimit: 0, blocked: false }; // Default values
            const siteElement = createSiteElement(domain, siteData);
            sitesContainer.appendChild(siteElement);
        }
    }).catch(error => {
        console.error("Error loading data from storage:", error);
    });
}

// Create element for a site
function createSiteElement(domain, siteData) {
    console.log(`Creating site element for domain: ${domain}`);
    console.log(`Time limit: ${siteData.timeLimit}, Time spent: ${siteData.timeSpent}`);

    const siteElement = document.createElement("div");
    siteElement.className = "site";

    const siteName = document.createElement("div");
    siteName.className = "site-name";
    siteName.textContent = getDomainName(domain);

    const timeInfo = document.createElement("div");
    timeInfo.className = "time-info";

    const timeSpent = document.createElement("span");
    const minutes = Math.floor((siteData.timeSpent || 0) / (60 * 1000));
    const seconds = Math.floor(((siteData.timeSpent || 0) % (60 * 1000)) / 1000);
    timeSpent.textContent = `Time spent: ${minutes}m ${seconds}s`;

    const timeRemaining = document.createElement("span");
    const remainingMs = Math.max(0, siteData.timeLimit - siteData.timeSpent); // Correct calculation
    console.log(`Remaining time (ms): ${remainingMs}`);
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
function addNewSite(siteInput, timeLimitInput) {
    const siteName = siteInput.value.trim();
    const timeLimit = parseInt(timeLimitInput.value.trim(), 10);

    if (!siteName || isNaN(timeLimit) || timeLimit <= 0) {
        console.error("Invalid inputs for adding a new site.");
        return;
    }

    console.log(`Adding new site: ${siteName} with time limit: ${timeLimit} minutes`);
    browser.runtime.sendMessage({ action: "ADD_DOMAIN", domain: siteName, timeLimit: timeLimit * 60 * 1000 }).then(() => {
        console.log(`Site '${siteName}' added successfully.`);
        alert(`Site '${siteName}' added successfully!`);
        siteInput.value = ""; // Clear input field
        timeLimitInput.value = ""; // Clear input field
        loadData(); // Refresh the display
    }).catch(error => {
        console.error("Error adding new site:", error);
    });
}