console.log("BlockIt: jiohotstar.js loaded");

// --- Configuration & Selectors ---
const HIDE_ADS = true;
const jiohotstarSelectors = [
     // Add specific selectors found for JioHotstar/Hotstar ads here
     // Examples (might need adjustment):
     // '.ad-interrupt-overlay',
     // '.masthead-ad-container',
     // '[id*="ad_player"]',
     // '.video-ad-label'
];
const allSelectors = [
    // General patterns
    '[id*="ad_creative"]',
    '[class*="ad_slug"]',
    '[data-ad-id]',
    '.ad-container',
    '.ad-wrapper',
    '.video-ads',
    ...jiohotstarSelectors
];

// --- Core Ad Handling Logic ---
function handleAdElement(element, selector) {
    if (!element || element.dataset.blockitHidden) {
        return false;
    }
    let handled = false;
    if (HIDE_ADS) {
        // console.log('BlockIt JH: Hiding potential ad element:', selector, element);
        element.style.display = 'none !important';
        element.dataset.blockitHidden = 'true';
        handled = true;
    } else {
        // console.log('BlockIt JH: Removing potential ad element:', selector, element);
        try {
             element.remove();
             handled = true;
        } catch (removeError) {
            console.warn('BlockIt JH: Error removing element:', removeError, element);
        }
    }

    if (handled) {
        chrome.runtime.sendMessage({ action: 'incrementCount', url: window.location.href }, (response) => {
            if (chrome.runtime.lastError) {
                // console.error("BlockIt JH CS: Error sending incrementCount message:", chrome.runtime.lastError.message);
            }
        });
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
            // console.warn(`BlockIt JH: Error with selector "${selector}": ${error.message}`);
        }
    });
    return handledCount;
}


// --- JioHotstar Specific Unmute Logic ---
let hotstarUnmuteInterval = null;

function checkAndUnmuteHotstar() {
    try {
        // Add more potential selectors, including a generic fallback
        const videoPlayer = document.querySelector(
            'video[data-player-video-id], video.shaka-video-container--player, video.video-player-tag, video#hlsplayer, video' 
        );
        if (videoPlayer) {
            // Log current state
            // console.log(`BlockIt JH: Check. Muted: ${videoPlayer.muted}, Volume: ${videoPlayer.volume}`); 

            if (videoPlayer.muted || videoPlayer.volume === 0) { // Check volume too
                console.log("BlockIt JH: Player muted or volume 0. Attempting unmute/volume set.");
                videoPlayer.muted = false;
                // Set volume AFTER attempting to unmute
                if (videoPlayer.volume === 0) {
                    videoPlayer.volume = 0.5; // Set to a reasonable default
                }
                
                // Check again immediately to see if it worked
                if (!videoPlayer.muted && videoPlayer.volume > 0) {
                     console.log("BlockIt JH: Player successfully unmuted/volume restored.");
                     // Optional: Clear interval if successful, but letting it run might be safer
                     // if (hotstarUnmuteInterval) clearInterval(hotstarUnmuteInterval);
                     // hotstarUnmuteInterval = null;
                } else {
                    console.warn("BlockIt JH: Player still muted/volume 0 after attempt.");
                }
            } else {
                // If already unmuted, we can stop checking
                // console.log("BlockIt JH: Player already unmuted. Stopping checks.");
                // if (hotstarUnmuteInterval) clearInterval(hotstarUnmuteInterval);
                // hotstarUnmuteInterval = null;
            }
        } else {
            // console.log("BlockIt JH: video player not found yet.");
        }
    } catch (error) {
        console.error("BlockIt JH: Error in checkAndUnmuteHotstar:", error);
         if (hotstarUnmuteInterval) {
             clearInterval(hotstarUnmuteInterval);
             hotstarUnmuteInterval = null;
             console.warn("BlockIt JH: Stopping unmute check due to error.");
         }
    }
}

function forceUnmuteHotstarPlayer() {
    console.log("BlockIt JH: Initializing Hotstar unmute logic.");
    if (hotstarUnmuteInterval) {
        clearInterval(hotstarUnmuteInterval);
    }
    console.log("BlockIt JH: Starting periodic check for muted player (every 250ms).");
    hotstarUnmuteInterval = setInterval(checkAndUnmuteHotstar, 250); // Check more frequently

    // Stop checking after a while longer
    setTimeout(() => {
        if (hotstarUnmuteInterval) {
            clearInterval(hotstarUnmuteInterval);
            hotstarUnmuteInterval = null;
            // console.log("BlockIt JH: Stopped periodic unmute check after 20s timeout.");
        }
    }, 20000); // Stop after 20 seconds
}

// --- Initialization and Observation ---
function observeDOM() {
    // Initial scan
    findAndHandleAds(allSelectors);
    forceUnmuteHotstarPlayer(); // Start unmute check

    const observer = new MutationObserver(mutations => {
        let dynamicallyHandledCount = 0;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    for (const selector of allSelectors) {
                        try {
                            if (node.matches && node.matches(selector)) {
                                if (handleAdElement(node, selector)) {
                                    dynamicallyHandledCount++;
                                }
                            } else {
                                const childAds = node.querySelectorAll(selector);
                                childAds.forEach(childAd => {
                                    if (handleAdElement(childAd, selector)) {
                                        dynamicallyHandledCount++;
                                    }
                                });
                            }
                        } catch (error) {
                           // console.warn(`BlockIt JH: Error checking node with selector "${selector}": ${error.message}`);
                        }
                    }
                }
            }
        }
         // If ads were potentially handled, re-check unmute status briefly
        if (dynamicallyHandledCount > 0) {
             forceUnmuteHotstarPlayer();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    console.log("BlockIt JH: MutationObserver started.");
}

// Start observing
observeDOM(); 