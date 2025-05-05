console.log('[BlockIt - Spotify Injected Script] Initializing...');

(function() {
    'use strict';

    // --- Configuration ---
    const DEBUG_LOGGING = true; // Enable detailed logging
    const MAX_INIT_WAIT_MS = 15000; // Max time to wait for Spotify objects (15s)
    const CHECK_INTERVAL_MS = 200; // How often to check for Spotify objects

    // --- State ---
    let spotifyPlayerApi = null;
    let spotifyPlayerInstance = null;
    let isBlockingInitialized = false;

    // --- Logging Helper ---
    function log(...args) {
        if (DEBUG_LOGGING) {
            console.log('[BlockIt Spotify]', ...args);
        }
    }
    function error(...args) {
        console.error('[BlockIt Spotify]', ...args);
    }

    // --- Ad Detection Logic ---
    function isAdState(state) {
        if (!state) return false;

        // Combine multiple checks for robustness
        const adIndicators = [
            state.isAdvertisement,
            state.isAd, // Some internal states might use this
            state.item?.type === 'ad',
            state.track?.metadata?.is_advertisement,
            state.track?.provider === 'ad',
            state.ad // Check if state itself is marked as ad
        ];
        
        const isAd = adIndicators.some(indicator => indicator === true);
        if (isAd) {
            log('Ad state detected via state object properties.');
        }
        return isAd;
    }

    // --- Ad Skipping Logic ---
    function attemptToSkipAd(reason) {
        // Prevent running multiple skip attempts close together
        const now = Date.now();
        if (window._lastSkipAttempt && (now - window._lastSkipAttempt < 5000)) {
            log(`Skipping duplicate skip attempt (last was ${now - window._lastSkipAttempt}ms ago)`);
            return false; // Skip if we tried less than 5 seconds ago
        }
        window._lastSkipAttempt = now;
        
        log(`Attempting to skip ad (Reason: ${reason})...`);

        // Method 1: Use the player API if available
        if (spotifyPlayerInstance && typeof spotifyPlayerInstance.skipToNext === 'function') {
            try {
                log('Trying skipToNext() via player instance...');
                spotifyPlayerInstance.skipToNext();
                log('skipToNext() called successfully.');
                // Maybe unmute just in case, as skipping should handle it
                muteAudio(false);
                return true;
            } catch (e) {
                error('Error calling skipToNext():', e);
            }
        }

        // Method 2: Find and click a skip button (less reliable in web player)
        const skipButtonSelectors = [
            '[data-testid="skip-forward-button"]', // Standard skip?
            '[aria-label*="Skip"]', // Generic skip label
            'button[title*="Skip"]'
        ];
        for (const selector of skipButtonSelectors) {
            const skipButton = document.querySelector(selector);
            if (skipButton && typeof skipButton.click === 'function') {
                log(`Trying to click skip button: ${selector}`);
                skipButton.click();
                 // Maybe unmute just in case, as skipping should handle it
                muteAudio(false);
                return true;
            }
        }

        // Method 3: Fallback to muting the audio
        log('Skip methods failed or unavailable. Muting audio as fallback.');
        
        // Clear any existing unmute timeout to prevent multiple concurrent timers
        if (window._adMuteTimeout) {
            clearTimeout(window._adMuteTimeout);
            window._adMuteTimeout = null;
        }
        
        // Set state for active ad
        window._adBlockActive = true;
        
        // Create or update the ad progress indicator
        showAdProgressIndicator();
        
        // Apply muting
        muteAudio(true);
        
        // Set a timeout to unmute after a typical ad duration (e.g., 35 seconds)
        window._adMuteTimeout = setTimeout(() => {
            log('Timeout reached, unmuting audio.');
            window._adBlockActive = false;
            hideAdProgressIndicator();
            muteAudio(false);
            window._adMuteTimeout = null;
        }, 35000);
        return false; // Indicate that we only muted, didn't truly skip
    }

    function muteAudio(shouldMute) {
        log(shouldMute ? 'Muting audio during ad...' : 'Unmuting audio after ad...');
        let success = false;
        
        // Strategy 1: Standard HTML5 audio/video elements
        const mediaElements = document.querySelectorAll('audio, video');
        if (mediaElements.length > 0) {
            mediaElements.forEach(audio => {
                if (audio.muted !== shouldMute) {
                    audio.muted = shouldMute;
                    // If muting, also set playbackRate to highest possible value to speed through the ad
                    if (shouldMute) {
                        try {
                            // Save original rate to restore later
                            audio._originalRate = audio.playbackRate;
                            audio.playbackRate = 16; // Maximum value that usually works
                        } catch (e) {
                            // Some browsers limit how fast media can play
                            log('Could not increase playback rate:', e);
                        }
                    } else if (audio._originalRate) {
                        // Restore original rate when unmuting
                        audio.playbackRate = audio._originalRate;
                    }
                }
            });
            success = true;
            log(`Modified ${mediaElements.length} media elements.`);
        }
        
        // Strategy 2: Find and click volume/mute button in the player UI
        if (shouldMute) {
            // Common selectors for volume/mute buttons
            const volumeButtonSelectors = [
                '[data-testid="volume-bar"]',
                '[data-testid="volume-bar-toggle-mute-button"]',
                '[data-testid="control-button-volume"]', // New selector found in Spotify's latest UI
                '[aria-label="Volume off"]',
                '[aria-label="Mute"]',
                '[aria-label="Volume high"]', // Will mute when clicked
                '[aria-label="Volume medium"]', // Will mute when clicked
                '[aria-label="Volume low"]', // Will mute when clicked
                '[title="Mute"]',
                '.volume-bar__icon-button',
                '.volume-bar'
            ];
            
            // Try to find and click a mute button
            for (const selector of volumeButtonSelectors) {
                const volumeButton = document.querySelector(selector);
                if (volumeButton) {
                    try {
                        // First check if it's already in the desired state
                        const isCurrentlyMuted = volumeButton.getAttribute('aria-label') === 'Volume off' ||
                                               volumeButton.classList.contains('muted') ||
                                               volumeButton.getAttribute('data-testid')?.includes('muted');
                                               
                        // Only click if needed to change state
                        if (shouldMute !== isCurrentlyMuted) {
                            log(`Clicking volume button: ${selector}`);
                            volumeButton.click();
                            success = true;
                            break;
                        } else {
                            log('Volume already in correct state.');
                            success = true;
                            break;
                        }
                    } catch (e) {
                        error(`Error clicking volume button: ${e}`);
                    }
                }
            }
            
            // Additionally, try pausing playback
            if (shouldMute) {
                attemptToPausePlayback();
            }
        }
        
        // Strategy 3: Target volume sliders directly
        const volumeSliders = document.querySelectorAll('input[type="range"][aria-label*="Volume"], [role="slider"][aria-label*="Volume"]');
        if (volumeSliders.length > 0) {
            volumeSliders.forEach(slider => {
                try {
                    if (shouldMute) {
                        // Store original value
                        slider._originalValue = slider.value;
                        // Set to 0
                        slider.value = "0";
                        // Dispatch input and change events to trigger Spotify's handlers
                        slider.dispatchEvent(new Event('input', { bubbles: true }));
                        slider.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (slider._originalValue) {
                        // Restore original value
                        slider.value = slider._originalValue;
                        slider.dispatchEvent(new Event('input', { bubbles: true }));
                        slider.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    success = true;
                } catch (e) {
                    error(`Error manipulating volume slider: ${e}`);
                }
            });
            log(`Modified ${volumeSliders.length} volume sliders.`);
        }
        
        // Strategy 4: Look for iframes that might contain audio player
        const iframes = document.querySelectorAll('iframe');
        if (iframes.length > 0) {
            log(`Found ${iframes.length} iframes, attempting to access their contents.`);
            iframes.forEach((iframe, index) => {
                try {
                    // Attempt to access iframe content (may fail due to same-origin policy)
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        const iframeAudio = iframeDoc.querySelectorAll('audio, video');
                        if (iframeAudio.length > 0) {
                            log(`Found ${iframeAudio.length} media elements in iframe ${index}.`);
                            iframeAudio.forEach(audio => {
                                audio.muted = shouldMute;
                                if (shouldMute) {
                                    audio._originalRate = audio.playbackRate;
                                    audio.playbackRate = 16;
                                } else if (audio._originalRate) {
                                    audio.playbackRate = audio._originalRate;
                                }
                            });
                            success = true;
                        }
                    }
                } catch (e) {
                    // Most likely a cross-origin error, which is expected
                    log(`Cannot access iframe ${index} content (likely cross-origin).`);
                }
            });
        }
        
        if (!success) {
            log('Could not find any audio elements or controls to mute/unmute.');
        }
        
        return success;
    }

    // --- Spotify Player Hooking ---
    function findSpotifyPlayerObjects() {
        try {
            // Try to find the Player API and an instance
            if (typeof Spotify !== 'undefined' && Spotify?.Player?.prototype) {
                spotifyPlayerApi = Spotify.Player;
                log('Found Spotify Player API (Spotify.Player).');
            }
            
            // Look for an instance - heuristic approach
            // Only scan window objects directly owned by this window (not iframes)
            for (const key in window) {
                // Skip properties starting with 'webkit' or 'toJSON' which are unlikely player objects and can cause issues
                if (key.startsWith('webkit') || key === 'toJSON') continue;
                
                try {
                    // Skip if not own property or not accessible (could be cross-origin)
                    if (!window.hasOwnProperty(key)) continue;
                    
                    const obj = window[key];
                    
                    // Skip null, undefined, or non-objects, or the window itself
                    if (!obj || typeof obj !== 'object' || obj === window) continue;
                    
                    // Additional check: Skip if it looks like an iframe window object
                    try {
                        // Accessing cross-origin 'window' property will throw
                        if (obj.window && obj.window !== obj) { 
                            continue; // Likely an iframe window
                        }
                        // Accessing cross-origin 'document' property will throw
                        if (obj.document) {
                            continue; // Likely an iframe window or similar
                        }
                    } catch (e) {
                        // If accessing .window or .document throws, it's cross-origin
                        continue;
                    }
                    
                    // Skip cross-origin objects (will throw error when accessing properties)
                    try {
                        // This might throw for some cross-origin objects
                        if (Object.getPrototypeOf(obj) === null && key !== 'sandbox') continue; 
                    } catch (e) {
                        // Skip this object if accessing its prototype causes a security error
                        continue;
                    }
                    
                    // Now safely check for methods
                    try {
                        if (typeof obj.skipToNext === 'function' && typeof obj.getCurrentState === 'function') {
                            // Crude check: Does it look like a player instance?
                            // Check existence of _keys safely
                             try {
                                 if (obj.hasOwnProperty('_keys') || '_keys' in obj) { 
                                    spotifyPlayerInstance = obj;
                                    log('Found potential Spotify Player Instance via window scan.');
                                    break; // Found it, exit loop
                                 }
                             } catch(e) { /* Ignore errors checking _keys */ }
                        }
                    } catch (e) {
                        // Some objects might throw when accessing properties, even if they seem accessible
                        continue;
                    }
                } catch (e) {
                    // Skip any property that throws security errors during initial access
                    if (e instanceof DOMException && e.name === 'SecurityError') {
                         // Expected for cross-origin properties
                    } else {
                         error(`Unexpected error scanning window property '${key}':`, e);
                    }
                    continue;
                }
            } // End window scan loop
            
            // Fallback: Check common paths if direct instance not found
            try {
                if (!spotifyPlayerInstance && window.player) {
                    if (typeof window.player.skipToNext === 'function') {
                        spotifyPlayerInstance = window.player;
                        log('Found potential Spotify Player Instance via window.player.');
                    }
                }
            } catch (e) {
                // Catch potential security errors accessing window.player directly
                log('Error accessing window.player (may be cross-origin):', e.message);
            }
            
            try {
                if (!spotifyPlayerInstance && window.app?.player) {
                    if (typeof window.app.player.skipToNext === 'function') {
                        spotifyPlayerInstance = window.app.player;
                        log('Found potential Spotify Player Instance via window.app.player.');
                    }
                }
            } catch (e) {
                 // Catch potential security errors accessing window.app.player directly
                log('Error accessing window.app.player (may be cross-origin):', e.message);
            }

            return spotifyPlayerApi && spotifyPlayerInstance;
            
        } catch (e) {
            error('Error in findSpotifyPlayerObjects:', e);
            return false;
        }
    }

    function setupPlayerStateHook() {
        if (!spotifyPlayerApi || !spotifyPlayerApi.prototype) {
            error('Cannot hook player state: Spotify.Player.prototype not found.');
            return false;
        }

        const stateHandlerName = 'handleStateChange'; // Common name, might change

        if (typeof spotifyPlayerApi.prototype[stateHandlerName] !== 'function') {
            error(`Cannot hook player state: Method '${stateHandlerName}' not found on Spotify.Player.prototype.`);
            // Attempt alternative common names? e.g., processStateChanges
            // Or rely purely on player events if state hooking fails.
            return false;
        }
        
        if (spotifyPlayerApi.prototype._blockItOriginalStateChange) {
             log('Player state hook already applied.');
             return true; // Already hooked
        }

        log(`Hooking Spotify.Player.prototype.${stateHandlerName}...`);
        spotifyPlayerApi.prototype._blockItOriginalStateChange = spotifyPlayerApi.prototype[stateHandlerName];

        spotifyPlayerApi.prototype[stateHandlerName] = function(newState) {
            try {
                if (isAdState(newState)) {
                    log('Ad state detected via hooked state handler. Attempting skip...');
                    // Make sure 'this' refers to the player instance
                    const player = spotifyPlayerInstance || this;
                    if (player && typeof player.skipToNext === 'function') {
                         player.skipToNext();
                    } else {
                         // Fallback if instance is wrong/missing
                         attemptToSkipAd('State Hook Detection');
                    }
                    // Don't call the original handler for ad states
                    return; 
                } else {
                     // Maybe unmute if transitioning from an ad we muted?
                     // Check previous state if possible, or just unmute cautiously.
                     muteAudio(false);
                }
            } catch (e) {
                error('Error in hooked state handler:', e);
            }
            // Call original handler for non-ad states
            return this._blockItOriginalStateChange.apply(this, arguments);
        };

        log(`Successfully hooked ${stateHandlerName}.`);
        return true;
    }
    
    // --- WebSocket Proxy --- (Copied and adapted from previous spotify_main.js)
    function setupWebSocketProxy() {
        if (window._BlockIt_WebSocket_proxy_active) {
            log('WebSocket proxy already active');
            return;
        }

        const originalWebSocket = window.WebSocket;
        const AD_MESSAGE_INDICATORS = [
            'ads', 'advertisement', 'commercial', 'sponsor', 'promoted',
            'marketing', 'banner', 'tracking', 'analytics', 'gabo-receiver' // Added gabo
        ];

        function isAdRelatedMessage(data) {
            if (!data || typeof data !== 'string') return false;
            const lowerData = data.toLowerCase();
            return AD_MESSAGE_INDICATORS.some(indicator => lowerData.includes(indicator));
        }

        window.WebSocket = function(url, protocols) {
            log(`WebSocket connection intercepted: ${url}`);
            const socket = new originalWebSocket(url, protocols);

            // Only monitor potentially ad-related endpoints more closely
            const isPotentialAdEndpoint = url.includes('dealer.spotify.com') || 
                                        url.includes('analytics') ||
                                        url.includes('tracking') ||
                                        url.includes('gabo') || // Added gabo
                                        url.includes('metrics');

            if (isPotentialAdEndpoint) {
                log(`Monitoring WebSocket for ad content: ${url}`);
                const originalSend = socket.send;
                socket.send = function(data) {
                    if (isAdRelatedMessage(data)) {
                        log('Blocked outgoing ad-related WebSocket message:', data.substring(0, 100) + '...');
                        return; 
                    }
                    return originalSend.apply(this, arguments);
                };

                socket.addEventListener('message', function(event) {
                    if (isAdRelatedMessage(event.data)) {
                        log('Detected incoming ad-related WebSocket message (cannot block, logging only):', event.data.substring(0, 100) + '...');
                    }
                });
            }

            return socket;
        };

        // Copy prototype and static properties
        window.WebSocket.prototype = originalWebSocket.prototype;
        Object.assign(window.WebSocket, originalWebSocket);

        window._BlockIt_WebSocket_proxy_active = true;
        log('Selective WebSocket proxy activated');
    }
    
    // --- createElement Proxy --- (Refined to be less aggressive)
    function setupDocumentCreateElementProxy() {
        if (document._blockItCreateElementProxyActive) {
            log('document.createElement proxy already active.');
            return;
        }

        const originalCreateElement = document.createElement.bind(document);
        // More specific keywords, avoiding just "ad"
        const AD_INDICATOR_STRINGS = ['advert', 'sponsor', 'promo', 'banner', 'doubleclick', 'googlead', '-ad-', '_ad_']; 
        // Specific attributes that strongly indicate ads
        const AD_SPECIFIC_ATTRIBUTES = ['data-ad-slot', 'data-ad-client', 'data-ad-format', 'data-google-query-id', 'data-test-id'];
        const AD_TAGS = ['iframe', 'div', 'ins', 'as-ad']; // Tags often used for ads

        document.createElement = function(tagName, options) {
            const lowerTagName = tagName.toLowerCase();
            let element = null;

            try {
                element = originalCreateElement(tagName, options);
            } catch (e) {
                error(`Error calling original document.createElement(${tagName}):`, e);
                return null; 
            }

            // Only apply checks to common ad tags
            if (element && AD_TAGS.includes(lowerTagName)) {
                // Use a slightly longer delay to allow attributes to settle
                setTimeout(() => {
                    if (!element || !document.contains(element)) return; // Check if element still exists and is attached
                    
                    let isPotentialAd = false;
                    let detectionReason = '';

                    // 1. Check for specific ad-related attributes
                    for (const attr of AD_SPECIFIC_ATTRIBUTES) {
                        if (element.hasAttribute(attr)) {
                            const value = element.getAttribute(attr);
                            // Check if attribute value itself contains ad strings (for data-testid etc)
                            if (attr === 'data-testid' && AD_INDICATOR_STRINGS.some(ind => value?.toLowerCase().includes(ind))){
                                isPotentialAd = true;
                                detectionReason = `Specific ad attribute [${attr}=${value}]`;
                                break;
                            } else if (attr !== 'data-testid') {
                                 isPotentialAd = true;
                                 detectionReason = `Specific ad attribute [${attr}]`;
                                 break;
                            }
                        }
                    }

                    // 2. If not found by specific attributes, check common attributes with stricter keywords
                    if (!isPotentialAd) {
                        const commonAttributesToCheck = ['id', 'class', 'aria-label', 'title'];
                        for (const attr of commonAttributesToCheck) {
                            const value = element.getAttribute(attr)?.toLowerCase();
                            // Use stricter keywords here
                            if (value && AD_INDICATOR_STRINGS.some(ind => value.includes(ind))) {
                                isPotentialAd = true;
                                detectionReason = `Common attribute [${attr}=${value.substring(0, 50)}...] with keyword`;
                                break;
                            }
                        }
                    }
                    
                    // 3. Check iframe src attribute specifically
                    if (!isPotentialAd && lowerTagName === 'iframe') {
                        const srcValue = element.getAttribute('src')?.toLowerCase();
                        if (srcValue && AD_INDICATOR_STRINGS.some(ind => srcValue.includes(ind))) {
                            isPotentialAd = true;
                            detectionReason = `iframe src [${srcValue.substring(0, 100)}...] with keyword`;
                        }
                    }

                    // If identified as potential ad, hide it forcefully and log details
                    if (isPotentialAd) {
                        log(`createElement Proxy: Hiding potential ad element. Reason: ${detectionReason}. OuterHTML:`, element.outerHTML.substring(0, 200) + '...');
                        try {
                            element.style.setProperty('display', 'none', 'important');
                            element.style.setProperty('visibility', 'hidden', 'important');
                            element.style.setProperty('width', '0px', 'important');
                            element.style.setProperty('height', '0px', 'important');
                            element.style.setProperty('position', 'absolute', 'important');
                            element.style.setProperty('left', '-9999px', 'important');
                            element.setAttribute('aria-hidden', 'true');
                            // If it's an iframe, also stop loading
                            if (lowerTagName === 'iframe') {
                                element.src = 'about:blank';
                            }
                        } catch (e) {
                            error('Error applying styles to potential ad element:', e);
                        }
                    }
                }, 100); // Increased delay slightly
            }

            return element;
        };

        document._blockItCreateElementProxyActive = true;
        log('document.createElement proxy activated (Refined).');
    }

    // --- Initialization ---
    function initializeBlocking() {
        if (isBlockingInitialized) {
            log('Blocking already initialized.');
            return;
        }

        log('Attempting to initialize blocking mechanisms...');
        
        if (!findSpotifyPlayerObjects()) {
             error('Failed to find necessary Spotify Player objects after waiting. State hooking may fail.');
             // Continue anyway, other methods might work
        }

        let success = true;
        try {
             if (!setupPlayerStateHook()) {
                 log('Player state hook failed. Relying on other methods.');
                 // We don't set success to false, as other methods are fallbacks
             }
        } catch (e) {
             error('Error setting up player state hook:', e);
             success = false;
        }
        
        try {
            setupWebSocketProxy();
        } catch (e) {
             error('Error setting up WebSocket proxy:', e);
             success = false;
        }
        
        try {
             setupDocumentCreateElementProxy();
        } catch (e) {
             error('Error setting up createElement proxy:', e);
             success = false;
        }

        if (success) {
            log('BlockIt Spotify Initialized Successfully.');
            isBlockingInitialized = true;
            // Initial check in case an ad is already playing
            checkCurrentStateForAd();
        } else {
            error('BlockIt Spotify Initialization failed for one or more components.');
        }
    }

    function checkCurrentStateForAd() {
         if (spotifyPlayerInstance && typeof spotifyPlayerInstance.getCurrentState === 'function') {
             try {
                 spotifyPlayerInstance.getCurrentState().then(state => {
                     if (isAdState(state)) {
                         log('Ad detected in initial state check.');
                         attemptToSkipAd('Initial State Check');
                     }
                 }).catch(e => error('Error getting current state:', e));
             } catch (e) {
                 error('Error calling getCurrentState:', e);
             }
         }
    }

    // --- Communication with Content Script ---
    window.addEventListener("message", (event) => {
        // Only accept messages from same window
        if (event.source !== window || !event.data) {
            return;
        }

        const message = event.data;
        if (message.type === "BLOCKIT_SPOTIFY_AD_DETECTED_DOM") {
            // Only take action if we're not already muting an ad
            if (!window._adBlockActive) {
                log('Received ad detection message from content script (DOM check).');
                attemptToSkipAd('DOM Detection');
            } else {
                log('Ignoring ad detection - already muting an ad');
            }
        }
    }, false);

    // --- Start Initialization Process ---
    let startTime = Date.now();
    const initInterval = setInterval(() => {
        if (findSpotifyPlayerObjects()) {
            clearInterval(initInterval);
            initializeBlocking();
        } else if (Date.now() - startTime > MAX_INIT_WAIT_MS) {
            clearInterval(initInterval);
            error(`Initialization timeout: Spotify objects not found after ${MAX_INIT_WAIT_MS}ms. Attempting initialization anyway.`);
            initializeBlocking(); // Try anyway, maybe late init or only proxies needed
        }
    }, CHECK_INTERVAL_MS);

    // Log successful initialization inside the IIFE where log is defined
    log('[BlockIt - Spotify Injected Script] Running.');

    // Create a visual indicator for when ads are being blocked
    function showAdProgressIndicator() {
        // Remove any existing indicator first
        hideAdProgressIndicator();
        
        // Create a new indicator
        const indicator = document.createElement('div');
        indicator.id = 'blockit-ad-indicator';
        Object.assign(indicator.style, {
            position: 'fixed',
            bottom: '70px',
            right: '20px',
            backgroundColor: 'rgba(30, 215, 96, 0.9)', // Spotify green with transparency
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: '9999',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.3s ease'
        });
        
        // Add a progress bar that counts down from 35 seconds
        const progressOuter = document.createElement('div');
        Object.assign(progressOuter.style, {
            width: '100px',
            height: '6px',
            backgroundColor: 'rgba(255,255,255,0.3)',
            borderRadius: '3px',
            marginLeft: '10px',
            overflow: 'hidden'
        });
        
        const progressInner = document.createElement('div');
        progressInner.id = 'blockit-progress-bar';
        Object.assign(progressInner.style, {
            width: '100%',
            height: '100%',
            backgroundColor: 'white',
            borderRadius: '3px',
            transition: 'width 1s linear'
        });
        
        progressOuter.appendChild(progressInner);
        
        indicator.textContent = 'BlockIt: Ad Muted';
        indicator.appendChild(progressOuter);
        document.body.appendChild(indicator);
        
        // Animate the progress bar
        let secondsLeft = 35;
        window._progressInterval = setInterval(() => {
            secondsLeft--;
            const percentLeft = (secondsLeft / 35) * 100;
            const progressBar = document.getElementById('blockit-progress-bar');
            if (progressBar) {
                progressBar.style.width = percentLeft + '%';
            }
            
            if (secondsLeft <= 0) {
                clearInterval(window._progressInterval);
            }
        }, 1000);
    }

    function hideAdProgressIndicator() {
        const indicator = document.getElementById('blockit-ad-indicator');
        if (indicator) {
            document.body.removeChild(indicator);
        }
        
        if (window._progressInterval) {
            clearInterval(window._progressInterval);
            window._progressInterval = null;
        }
    }

    // Helper function to try pausing playback directly
    function attemptToPausePlayback() {
        try {
            // Try multiple pause button selectors
            const pauseButtonSelectors = [
                '[data-testid="control-button-pause"]',
                '[aria-label="Pause"]',
                '[title="Pause"]',
                'button[data-testid="play-pause-button"][aria-label="Pause"]'
            ];
            
            for (const selector of pauseButtonSelectors) {
                const pauseButton = document.querySelector(selector);
                if (pauseButton) {
                    log(`Found and clicking pause button: ${selector}`);
                    pauseButton.click();
                    return true;
                }
            }
            
            log('No pause button found');
            return false;
        } catch (e) {
            error('Error attempting to pause playback:', e);
            return false;
        }
    }
})();

// Replace direct log call with console.log outside the IIFE
console.log('[BlockIt - Spotify Injected Script] Script loaded.'); 