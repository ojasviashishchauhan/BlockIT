// BlockIt/spotify_content.js
console.log('[BlockIt - Spotify Content Script] Loaded.');

// Function to inject the script that needs direct page context access
function injectScript(file) {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(file);
        script.onload = function() {
            console.log(`[BlockIt - Spotify Content Script] Injected ${file} loaded.`);
            this.remove(); // Clean up the script tag once loaded
        };
        script.onerror = function(e) {
            console.error(`[BlockIt - Spotify Content Script] Error loading injected script ${file}:`, e);
        };
        (document.head || document.documentElement).appendChild(script);
        console.log(`[BlockIt - Spotify Content Script] Injecting ${file}...`);
    } catch (e) {
        console.error('[BlockIt - Spotify Content Script] Error injecting script:', e);
    }
}

// Inject the main ad-blocking script for Spotify
injectScript('spotify_injected.js');

// --- DOM Monitoring (Backup/Secondary Check) ---

let domObserver = null;

// Function to check for visible ad indicators in the DOM
function checkForAdIndicators() {
    try {
        // Look for various ad indicators in the DOM
        const adIndicators = [
            // Now playing view ad indicators
            document.querySelector('[data-testid="now-playing-ad"]'),
            document.querySelector('.ad-container'), // General ad container class
            document.querySelector('div[data-testid="now-playing-view"] > div[role="contentinfo"]'), // Specific ad info area
            document.querySelector('iframe[title*="Advertisement"]'), // Ad iframes
            // Player bar ad indicators
            document.querySelector('[data-testid="track-info-advertiser"]'),
            // Text content indicating ads (less reliable, but can be a fallback)
            Array.from(document.querySelectorAll('span, div')).find(el => {
                if (!el || !el.textContent) return false;
                const text = el.textContent.trim().toLowerCase();
                return text === 'advertisement' || text === 'sponsored content';
            })
        ];

        // Check if any indicator is found and visible
        const adDetected = adIndicators.some(indicator => {
            // First check if the element exists at all
            if (!indicator) return false;

            // NEW: Check if the element is still connected to the main document
            if (!document.contains(indicator)) return false;
            
            // Then check if it's visible (has an offsetParent that's not null)
            // offsetParent is null for elements that are not rendered or display:none
            try {
                return indicator.offsetParent !== null;
            } catch (e) {
                console.error('[BlockIt - Spotify Content Script] Error checking element visibility:', e);
                // If we can't check visibility, fall back to just checking if the element exists
                return true;
            }
        });

        if (adDetected) {
            console.log('[BlockIt - Spotify Content Script] Ad indicator detected via DOM monitoring.');
            // Send a message to the injected script to trigger ad skipping logic
            window.postMessage({ type: "BLOCKIT_SPOTIFY_AD_DETECTED_DOM" }, "*");
            // Optionally, send to background for stats
            // chrome.runtime.sendMessage({ type: "SPOTIFY_AD_DETECTED_DOM" });
        }
    } catch (e) {
        console.error('[BlockIt - Spotify Content Script] Error in checkForAdIndicators:', e);
    }
}

// Set up a mutation observer to monitor DOM changes for ad indicators
function setupDOMObserver() {
    if (domObserver) {
        domObserver.disconnect(); // Disconnect previous observer if any
    }

    domObserver = new MutationObserver((mutations) => {
        // We don't need to iterate mutations, just run the check
        checkForAdIndicators();
    });

    // Start observing the body for additions/removals and attribute changes
    // Observe attributes because sometimes ad containers are hidden/shown via style/class changes
    const observerConfig = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'] // Focus on attributes likely changing visibility
    };

    // Wait for the body to exist
    const checkBodyInterval = setInterval(() => {
        if (document.body) {
            clearInterval(checkBodyInterval);
            domObserver.observe(document.body, observerConfig);
            console.log('[BlockIt - Spotify Content Script] DOM Observer started.');
            // Initial check
            checkForAdIndicators();
        } 
    }, 100);
}

// Initialize observer when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDOMObserver);
} else {
    setupDOMObserver();
}

// Also set up periodic checks as a fallback, in case the observer misses something
// (e.g., ads loaded before observer starts)
setInterval(checkForAdIndicators, 2000); // Check every 2 seconds 