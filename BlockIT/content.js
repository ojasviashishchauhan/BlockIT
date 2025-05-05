// BlockIt/content.js (Refactored)
console.log("[BlockIt] Core content script loaded");

(function() {
    const currentHostname = window.location.hostname;
    let site = null;
    
    // Track if we've already sent the injection request for this page load
    let injectionRequested = false;

    // --- Site Detection ---
    if (currentHostname.includes('youtube.com')) {
        site = 'youtube';
    } else if (currentHostname.includes('spotify.com')) {
        site = 'spotify';
    } else if (currentHostname.includes('jiohotstar.com') || currentHostname.includes('hotstar.com')) {
        site = 'jiohotstar';
    } 
    // Add other sites as needed
    
    // --- Request Script Injection from Background --- 
    if (site && !injectionRequested) {
        injectionRequested = true; // Prevent duplicate requests
        console.log(`[BlockIt] Detected site: ${site}. Requesting script injections from background.`);
        
        // Send one message to background to handle both content & MAIN world scripts
        chrome.runtime.sendMessage({
            action: 'injectSiteScript', // Reusing this action name
            site: site
        }, response => {
            if (chrome.runtime.lastError) {
                console.error(`[BlockIt] Error requesting script injections:`, chrome.runtime.lastError);
            } else {
                console.log(`[BlockIt] Background script injection response:`, response);
            }
        });
    } else if (!site) {
        console.log(`[BlockIt] No specific handler for: ${currentHostname}`);
    }
})(); 