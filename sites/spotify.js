console.log("BlockIt: spotify.js (Content Script) loaded");

// --- Configuration & Selectors ---
const HIDE_ADS = true;
const spotifySelectors = [
    // Add specific selectors based on inspection
    '.ad-container', 
    '[data-testid="ad-indicator"]', 
    '.ad-class', 
    '[data-ad]', 
    '[aria-label*="Advertisement" i]', // Common aria label pattern
    '[data-testid="encore-web-player-ad-module"]', // Possible ad module ID
];
const allSelectors = [
    // General patterns
    '[id*="ad_creative"]',
    '[class*="ad_slug"]',
    '[data-ad-id]',
    '.ad-wrapper',
    ...spotifySelectors
];

// --- Core Ad Handling Logic (DOM Manipulation Fallback) ---
function handleAdElement(element, selector) {
    if (!element || element.dataset.blockitHidden) return false;
    let handled = false;
    if (HIDE_ADS) {
        element.style.display = 'none !important';
        element.dataset.blockitHidden = 'true';
        handled = true;
    } else {
        try {
             element.remove();
             handled = true;
        } catch (removeError) {
            console.warn('BlockIt Spotify DOM: Error removing element:', removeError, element);
        }
    }
    if (handled) {
        console.log(`BlockIt Spotify DOM: Handled ad element matching selector: ${selector}`);
        chrome.runtime.sendMessage({ action: 'incrementCount', url: window.location.href });
    }
    return handled;
}

function findAndHandleAds(selectors) {
    let handledCount = 0;
    selectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (handleAdElement(el, selector)) {
                    handledCount++;
                }
            });
        } catch (error) {
            // console.warn(`BlockIt Spotify DOM: Error with selector "${selector}": ${error.message}`);
        }
    });
    if (handledCount > 0) {
         console.log(`BlockIt Spotify DOM: Initial scan handled ${handledCount} elements.`);
    }
    return handledCount;
}

// --- Initialization and Observation (Content Script World) ---
function initializeSpotifyBlocker() {
    console.log("BlockIt Spotify (Content Script): Initializing DOM observer.");
    findAndHandleAds(allSelectors);

    const observer = new MutationObserver(mutations => {
        let dynamicallyHandledCount = 0;
        let addedNodes = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) addedNodes = true;
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    for (const selector of allSelectors) {
                        try {
                            if (node.matches && node.matches(selector)) {
                                if (handleAdElement(node, selector)) dynamicallyHandledCount++;
                            } else {
                                const childAds = node.querySelectorAll(selector);
                                childAds.forEach(childAd => {
                                    if (handleAdElement(childAd, selector)) dynamicallyHandledCount++;
                                });
                            }
                        } catch (error) {
                            // console.warn(`BlockIt Spotify DOM: Error checking node with selector "${selector}": ${error.message}`);
                        }
                    }
                }
            }
        }
        if (dynamicallyHandledCount > 0) {
            console.log(`BlockIt Spotify DOM: Mutation observer handled ${dynamicallyHandledCount} elements.`);
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    console.log("BlockIt Spotify (Content Script): MutationObserver started.");
}

// Run the content-script specific initialization
initializeSpotifyBlocker();

// NOTE: MAIN world injection is now handled by background.js injecting spotify_main.js

 