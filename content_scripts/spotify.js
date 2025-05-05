// Spotify Ad Blocker with dual-layer protection
console.log('[BlockIT] Spotify handler loaded');

// Configuration
const SPOTIFY_CONFIG = {
    adSelectors: {
        audioAd: [
            '[data-testid="context-item-info-ad"]',
            '[data-testid="advertisement"]',
            '[data-ad-type]',
            '.ad-slot-container',
            '[data-testid="track-info-advertiser"]',
            '[data-testid="video-player"]',
            '[data-testid="minimal-player-controls-and-info"]',
            '[data-testid="now-playing-widget"][aria-label*="advertisement"]',
            '[data-testid="now-playing-widget"][aria-label*="sponsored"]',
            // Additional selectors from Blockify
            '[data-testid="track-info-advertisements"]',
            '[data-testid="progress-bar-advertisement"]',
            '.advertisement-container',
            '#main[aria-label*="Advertisement"]'
        ],
        upgradeButton: '[data-testid="upgrade-button"]',
        adElements: [
            '[data-ad-format]',
            '.sponsor-container',
            '.advertisement',
            '[data-ad-token]',
            '.ad-slot',
            '.ad-container',
            'iframe[src*="audio-ads"]',
            'iframe[src*="spotify-everywhere"]'
        ]
    },
    playerSelectors: {
        player: '[data-testid="now-playing-widget"]',
        progressBar: '.progress-bar',
        playButton: '[data-testid="control-button-play"]',
        pauseButton: '[data-testid="control-button-pause"]',
        nextButton: '[data-testid="control-button-skip-forward"]',
        trackInfo: '[data-testid="context-item-info-title"]',
        nowPlayingBar: '[data-testid="now-playing-bar"]'
    },
    adPatterns: [
        'advertisement',
        'sponsored',
        'ad break',
        'spotify-everywhere',
        'adclick',
        'adform',
        'doubleclick',
        'audio-sp/v1/audio-ad'
    ]
};

// Track player state
let isAdPlaying = false;
let originalVolume = 1;
let observer = null;
let lastTrackName = '';
let adCheckInterval = null;
let consecutiveAdChecks = 0;
let lastAdTime = 0;

// Enhanced network request blocking
const blockPatterns = [
    'audio-fa.spotifycdn.com',
    'audio-ak.spotify.com',
    'audio-sp-',
    'audio-fa.scdn.co',
    'audio-sp/v1/audio-ad',
    'gabo-receiver-service',
    'spotify-everywhere',
    'doubleclick.net',
    'adform.net',
    'spotify.com/ads',
    'spclient.wg.spotify.com/ad-logic',
    'spclient.wg.spotify.com/ads',
    'audio-sp/v1/branded',
    'audio-sp-*.spotifycdn.com',
    'adclick',
    'admob',
    'pagead',
    'spotify.com/ad-logic',
    'spotify.com/ads',
    'audio-fa-',
    'audio4-fa.scdn.co'
];

// Silent audio to replace ads
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Service Worker Prevention Code
const serviceWorkerCode = `
// Store original service worker APIs
const originalServiceWorker = navigator.serviceWorker;

// Block Workbox-specific features
const blockWorkbox = {
    get Workbox() { return null; },
    get messageSW() { return () => Promise.resolve(); },
    get register() { return () => Promise.reject(new Error('Blocked by BlockIT')); },
    get active() { return null; },
    get controlling() { return null; },
    get waiting() { return null; }
};

// Define window.workbox before Spotify's scripts load
Object.defineProperty(window, 'workbox', {
    value: blockWorkbox,
    writable: false,
    configurable: false
});

// Block Workbox registration
window.WorkboxRegistration = null;
Object.defineProperty(window, 'WorkboxRegistration', {
    value: null,
    writable: false,
    configurable: false
});

// Override the entire serviceWorker property
Object.defineProperty(navigator, 'serviceWorker', {
    get: function() {
        return {
            // Return a non-functional controller
            controller: null,
            // Block registration attempts
            register: function() {
                console.debug('[BlockIT] Blocked service worker registration attempt');
                return Promise.reject(new Error('Blocked by BlockIT'));
            },
            // Block getting registrations
            getRegistrations: function() {
                console.debug('[BlockIT] Blocked service worker getRegistrations');
                return Promise.resolve([]);
            },
            // Block getting registration
            getRegistration: function() {
                console.debug('[BlockIT] Blocked service worker getRegistration');
                return Promise.resolve(null);
            },
            // Block ready promise
            ready: Promise.reject(new Error('Blocked by BlockIT')),
            // Ensure startMessages is blocked
            startMessages: function() { return false; },
            // Additional Workbox-specific properties
            scope: '/',
            type: 'classic',
            state: 'blocked',
            scriptURL: '',
            installing: null,
            waiting: null,
            active: null
        };
    },
    configurable: false,
    enumerable: true
});

// Clean up any existing service workers
if (originalServiceWorker?.getRegistrations) {
    originalServiceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
            registration.unregister().then(() => {
                console.debug('[BlockIT] Unregistered existing service worker');
            }).catch(() => {
                // Ignore errors during unregistration
            });
        });
    }).catch(() => {
        // Ignore errors during cleanup
    });
}

// Block service worker feature detection
Object.defineProperty(navigator, 'serviceWorkerEnabled', {
    get: function() { return false; },
    configurable: false
});

// Prevent Spotify's service worker checks
const spotifyOverrides = {
    serviceWorkerEnabled: false,
    serviceWorkerSupported: false,
    serviceWorkerRegistration: null,
    serviceWorkerState: 'blocked',
    workbox: null
};

// Apply overrides to various Spotify namespaces
['spicefrontend', 'splay', 'spotify', 'Spotify'].forEach(namespace => {
    if (window[namespace]) {
        Object.entries(spotifyOverrides).forEach(([key, value]) => {
            Object.defineProperty(window[namespace], key, {
                get: () => value,
                set: () => {},
                configurable: false
            });
        });
    }
});

// Block service worker messaging
window.postMessage = (function(originalPostMessage) {
    return function(message, targetOrigin, transfer) {
        if (message && (
            (typeof message === 'string' && message.includes('workbox')) ||
            (typeof message === 'object' && JSON.stringify(message).includes('workbox'))
        )) {
            console.debug('[BlockIT] Blocked service worker message');
            return;
        }
        return originalPostMessage.call(this, message, targetOrigin, transfer);
    };
})(window.postMessage);
`;

// Function to inject code into the page context
function injectCode(code) {
    const blob = new Blob([code], { type: 'text/javascript' });
    const script = document.createElement('script');
    script.src = URL.createObjectURL(blob);
    
    // Add error handling
    script.onerror = (error) => {
        console.error('[BlockIT] Script injection failed:', error);
    };
    
    // Ensure script loads before page scripts
    script.async = false;
    
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
        URL.revokeObjectURL(script.src);
        script.remove();
    };
}

// Fetch rewrite code
const fetchRewriteCode = `
const originalFetch = window.fetch;

window.fetch = async function(...args) {
  const [url, options] = args;
  
  // Block ad-related requests
  if (url.includes('/ads/') || 
      url.includes('ad-logic') ||
      url.includes('adeventtracker') ||
      url.includes('audio-ak') ||
      url.includes('audio-akp')) {
    return new Response('{}', {
      status: 200,
      headers: {'Content-Type': 'application/json'}
    });
  }

  // Block tracking requests
  if (url.includes('analytics') ||
      url.includes('crashdump') ||
      url.includes('log.spotify.com')) {
    return new Response('{}', {
      status: 200,
      headers: {'Content-Type': 'application/json'}  
    });
  }

  // Allow all other requests
  return originalFetch.apply(this, args);
}
`;

// Harmony error prevention code
const harmonyCode = `
// Override Spotify's error handling and harmony checks
window.onerror = function(msg, url, line, col, error) {
    if (msg.includes('Harmony') || msg.includes('TypeError')) {
        return true; // Prevent error from bubbling up
    }
    return false;
};

// Mock Spotify's harmony interface
const mockHarmonyInterface = {
    canSkip: true,
    canSeek: true,
    isRestricted: false,
    restrictions: {},
    isPlaybackCapped: false,
    isPlaybackPaused: false,
    isPremiumOnly: false,
    allowedActions: ['skip', 'seek', 'pause', 'resume'],
    currentState: 'playing'
};

// Override Spotify's harmony checks
Object.defineProperty(window, 'Spotify', {
    get: function() {
        return {
            Player: {
                prototype: {
                    // Mock player methods
                    connect: function() { return Promise.resolve(); },
                    disconnect: function() { return Promise.resolve(); },
                    setVolume: function() { return Promise.resolve(); },
                    // Add harmony-specific methods
                    _getHarmonyState: function() { return mockHarmonyInterface; },
                    _canSkipCurrent: function() { return true; },
                    _canSeekCurrent: function() { return true; },
                    _isRestricted: function() { return false; }
                }
            },
            Harmony: {
                prototype: {
                    // Mock harmony methods
                    getState: function() { return mockHarmonyInterface; },
                    canSkip: function() { return true; },
                    canSeek: function() { return true; },
                    isRestricted: function() { return false; }
                }
            }
        };
    },
    configurable: false
});

// Override harmony-specific globals
window.spharmony = mockHarmonyInterface;
Object.defineProperty(window, 'spharmony', {
    get: function() { return mockHarmonyInterface; },
    set: function() {},
    configurable: false
});

// Intercept harmony API calls
const originalFetch = window.fetch;
window.fetch = async function(resource, init) {
    const url = resource instanceof Request ? resource.url : resource;
    if (typeof url === 'string' && url.includes('harmony')) {
        return new Response(JSON.stringify({
            canSkip: true,
            canSeek: true,
            isRestricted: false,
            restrictions: {},
            status: 'success'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    return originalFetch.apply(this, arguments);
};
`;

// Media interception code
const mediaCode = `
// Store original methods
const originalPlay = HTMLMediaElement.prototype.play;
const originalLoad = HTMLMediaElement.prototype.load;
const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').set;
const originalCurrentTimeSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime').set;
let realVolume = 1;

// Create a dummy audio element for silent playback
const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
silentAudio.loop = true;

// Function to check if a URL is ad-related
function isAdUrl(url) {
    return url && (
        url.includes('audio-fa') ||
        url.includes('audio-ak') ||
        url.includes('audio-sp') ||
        url.includes('audio-akp') ||
        url.includes('audio-ad') ||
        url.includes('spotify.com/ads') ||
        url.includes('spclient.wg.spotify.com/ad-logic') ||
        url.includes('spclient.wg.spotify.com/ads')
    );
}

// Override src setter
Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    set: function(url) {
        if (isAdUrl(url)) {
            console.debug('[BlockIT] Blocked ad URL:', url);
            originalSrcSetter.call(this, silentAudio.src);
            return;
        }
        originalSrcSetter.call(this, url);
    },
    get: function() {
        return Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').get.call(this);
    }
});

// Override currentTime setter
Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    set: function(time) {
        if (isAdUrl(this.src)) {
            console.debug('[BlockIT] Prevented ad time update');
            return;
        }
        originalCurrentTimeSetter.call(this, time);
    },
    get: function() {
        return Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime').get.call(this);
    }
});

// Override play method
HTMLMediaElement.prototype.play = async function() {
    if (isAdUrl(this.src)) {
        console.debug('[BlockIT] Prevented ad playback');
        this.volume = 0;
        this.muted = true;
        // Play silent audio instead
        return silentAudio.play();
    }
    return originalPlay.call(this);
};

// Override load method
HTMLMediaElement.prototype.load = function() {
    if (isAdUrl(this.src)) {
        console.debug('[BlockIT] Prevented ad loading');
        this.src = silentAudio.src;
        return;
    }
    return originalLoad.call(this);
};

// Override volume getter/setter
Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    get: function() {
        return isAdUrl(this.src) ? 0 : realVolume;
    },
    set: function(val) {
        realVolume = val;
        if (!isAdUrl(this.src)) {
            this._volume = val;
        }
    }
});

// Override duration getter
Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    get: function() {
        return isAdUrl(this.src) ? 0 : Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration').get.call(this);
    }
});

// Intercept Media Session API
if ('mediaSession' in navigator) {
    const originalSetActionHandler = navigator.mediaSession.setActionHandler;
    navigator.mediaSession.setActionHandler = function(type, handler) {
        if (type === 'nexttrack' || type === 'previoustrack' || type === 'seekto') {
            const wrappedHandler = (details) => {
                if (window._blockItAdPlaying) {
                    console.debug('[BlockIT] Blocked media session action during ad');
                    return;
                }
                return handler?.(details);
            };
            return originalSetActionHandler.call(this, type, handler ? wrappedHandler : null);
        }
        return originalSetActionHandler.call(this, type, handler);
    };
}

// Block Spotify's internal player API
const playerApiCode = {
    skipToNext: () => Promise.resolve(),
    skipToPrevious: () => Promise.resolve(),
    seek: () => Promise.resolve(),
    getCurrentState: () => Promise.resolve({ duration: 0, position: 0 }),
    getVolume: () => Promise.resolve(0),
    setVolume: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    togglePlay: () => Promise.resolve(),
    addListener: () => {},
    removeListener: () => {}
};

// Override Spotify's player API
if (window.Spotify?.Player) {
    Object.assign(window.Spotify.Player.prototype, playerApiCode);
}
`;

// Initialize content blocking
function initializeContentBlocking() {
    // Inject service worker prevention code immediately
    try {
        // Create and inject inline script element
        const immediateScript = document.createElement('script');
        immediateScript.textContent = serviceWorkerCode;
        // Insert at the very beginning of the document
        const target = document.documentElement || document.head || document.body;
        target.insertBefore(immediateScript, target.firstChild);
        immediateScript.remove();
    } catch (e) {
        console.error('[BlockIT] Immediate injection failed:', e);
        // Fallback to blob injection
        injectCode(serviceWorkerCode);
    }
    
    // Continue with other injections
    injectCode(fetchRewriteCode);
    injectCode(harmonyCode);
    injectCode(mediaCode);

    // Set up mutation observer to handle dynamic content and ads
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    // Handle script tags
                    if (node.nodeName === 'SCRIPT') {
                        if (node.src && (
                            node.src.includes('ads') ||
                            node.src.includes('analytics') ||
                            node.src.includes('tracking') ||
                            node.src.includes('workbox-window') // Block workbox service worker scripts
                        )) {
                            node.remove();
                        }
                    }
                    
                    // Handle ad containers
                    if (node.classList && (
                        node.classList.contains('ad-slot') ||
                        node.classList.contains('ad-container') ||
                        node.classList.contains('sponsor'))) {
                        node.remove();
                    }
                });
            }
        });
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });
}

// Start content blocking when DOM is ready
document.addEventListener('DOMContentLoaded', initializeContentBlocking);

// Function to update ad state
function setAdState(isPlaying) {
    window._blockItAdPlaying = isPlaying;
    console.debug('[BlockIT] Ad state updated:', isPlaying);

    // Immediately affect all media elements
    const mediaElements = document.querySelectorAll('audio, video');
    mediaElements.forEach(media => {
        try {
            if (isPlaying) {
                media.volume = 0;
                media.muted = true;
                media.pause();
            } else {
                media.muted = false;
                media.volume = originalVolume;
            }
        } catch (e) {}
    });
}

// Function to detect audio ads (enhanced)
function detectAudioAd() {
    const now = Date.now();
    
    // Check for any ad indicators
    for (const selector of SPOTIFY_CONFIG.adSelectors.audioAd) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.debug(`[BlockIT] Ad detected via selector: ${selector}`);
            return true;
        }
    }

    // Check Media Session metadata
    if (navigator.mediaSession?.metadata) {
        const title = navigator.mediaSession.metadata.title?.toLowerCase() || '';
        const artist = navigator.mediaSession.metadata.artist?.toLowerCase() || '';
        if (title.includes('advertisement') || artist.includes('spotify') || title.length < 3) {
            console.debug('[BlockIT] Ad detected via Media Session metadata');
            return true;
        }
    }

    // Check for ad-related text in the track info
    const trackInfo = document.querySelector(SPOTIFY_CONFIG.playerSelectors.trackInfo);
    if (trackInfo) {
        const trackText = trackInfo.textContent.toLowerCase();
        for (const pattern of SPOTIFY_CONFIG.adPatterns) {
            if (trackText.includes(pattern)) {
                console.debug(`[BlockIT] Ad detected via pattern: ${pattern}`);
                return true;
            }
        }
    }

    // Check for sudden track changes
    const currentTrack = trackInfo?.textContent || '';
    if (currentTrack && currentTrack !== lastTrackName) {
        lastTrackName = currentTrack;
        if (currentTrack.length < 3 || /^ad(\s|$)/i.test(currentTrack)) {
            console.debug(`[BlockIT] Ad detected via track name: ${currentTrack}`);
            return true;
        }
    }

    // Check for rapid track changes (common during ads)
    if (now - lastAdTime < 3000 && currentTrack !== lastTrackName) {
        console.debug('[BlockIT] Ad detected via rapid track change');
        return true;
    }

    // Check for iframe-based ads
    const adIframes = document.querySelectorAll('iframe');
    for (const iframe of adIframes) {
        if (iframe.src && SPOTIFY_CONFIG.adPatterns.some(pattern => iframe.src.includes(pattern))) {
            console.debug(`[BlockIT] Ad detected via iframe: ${iframe.src}`);
            return true;
        }
    }

    // Check player state
    const player = document.querySelector(SPOTIFY_CONFIG.playerSelectors.player);
    if (player && player.getAttribute('aria-label')?.toLowerCase().includes('advertisement')) {
        console.debug('[BlockIT] Ad detected via player aria-label');
        return true;
    }

    return false;
}

// Function to handle audio ads (enhanced)
function handleAudioAd() {
    if (!document.querySelector(SPOTIFY_CONFIG.playerSelectors.player)) return;

    const isAd = detectAudioAd();
    console.debug(`[BlockIT] Ad check result: ${isAd}`);

    if (isAd) {
        lastAdTime = Date.now();
        consecutiveAdChecks++;

        if (!isAdPlaying || consecutiveAdChecks > 2) {
            console.debug(`[BlockIT] Ad detected (checks: ${consecutiveAdChecks}), taking action`);
            isAdPlaying = true;
            
            // Update page context state
            setAdState(true);
            
            // Aggressive audio control
            const mediaElements = document.querySelectorAll('audio, video');
            mediaElements.forEach(media => {
                try {
                    media.volume = 0;
                    media.muted = true;
                    media.pause();
                    // Force the source to our silent audio
                    media.src = SILENT_AUDIO;
                } catch (e) {}
            });
            
            try {
                localStorage.setItem('blockIt_handling_ad', 'true');
                localStorage.setItem('blockIt_ad_time', Date.now().toString());
            } catch (e) {}
        }
    } else {
        consecutiveAdChecks = 0;
        if (isAdPlaying) {
            console.debug('[BlockIT] Ad finished, restoring playback');
            
            // Update page context state
            setAdState(false);
            
            isAdPlaying = false;
            
            // Restore audio state
            const mediaElements = document.querySelectorAll('audio, video');
            mediaElements.forEach(media => {
                media.muted = false;
                media.volume = originalVolume;
            });

            try {
                localStorage.removeItem('blockIt_handling_ad');
                localStorage.removeItem('blockIt_ad_time');
            } catch (e) {}
        }
    }
}

// Function to skip ads
function skipAd() {
    console.debug('[BlockIT] Attempting to skip ad with multiple methods');

    // Method 1: Direct skip using next button
    const nextButton = document.querySelector(SPOTIFY_CONFIG.playerSelectors.nextButton);
    if (nextButton) {
        try {
            nextButton.click();
            console.debug('[BlockIT] Clicked next button');
        } catch (e) {
            console.debug('[BlockIT] Direct skip failed:', e);
        }
    }

    // Method 2: Simulate end of track
    const mediaElements = document.querySelectorAll('audio, video');
    mediaElements.forEach(media => {
        try {
            // Force track to end
            Object.defineProperty(media, 'currentTime', {
                get: function() { return this.duration || 30; },
                set: function() {},
                configurable: true
            });
            
            // Dispatch ended event
            const endEvent = new Event('ended');
            media.dispatchEvent(endEvent);
            
            console.debug('[BlockIT] Simulated track end');
        } catch (e) {
            console.debug('[BlockIT] Track end simulation failed:', e);
        }
    });

    // Method 3: Progress bar manipulation
    const progressBar = document.querySelector(SPOTIFY_CONFIG.playerSelectors.progressBar);
    if (progressBar) {
        try {
            // Override duration and current time getters
            Object.defineProperty(progressBar, 'value', {
                get: function() { return 100; },
                set: function() {},
                configurable: true
            });

            // Simulate click at end of progress bar
            const rect = progressBar.getBoundingClientRect();
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: rect.right - 1,
                clientY: rect.top + (rect.height / 2),
                view: window
            });
            progressBar.dispatchEvent(event);
            console.debug('[BlockIT] Triggered progress bar skip');
        } catch (e) {
            console.debug('[BlockIT] Progress bar skip failed:', e);
        }
    }

    // Method 4: Force playback state
    setTimeout(() => {
        const playButton = document.querySelector(SPOTIFY_CONFIG.playerSelectors.playButton);
        if (playButton) {
            try {
                playButton.click();
                console.debug('[BlockIT] Forced playback');
            } catch (e) {
                console.debug('[BlockIT] Force playback failed:', e);
            }
        }
    }, 100);
}

// Remove visual ad elements
function removeAdElements() {
    SPOTIFY_CONFIG.adSelectors.adElements.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.remove();
            console.debug(`[BlockIT] Removed Spotify ad element: ${selector}`);
        });
    });

    // Hide upgrade buttons
    const upgradeButton = document.querySelector(SPOTIFY_CONFIG.adSelectors.upgradeButton);
    if (upgradeButton) {
        upgradeButton.style.display = 'none';
    }
}

// Initialize observers and start monitoring
function initializeObserver() {
    if (!document.body) {
        console.debug('[BlockIT] Document body not ready, retrying...');
        setTimeout(initializeObserver, 100);
        return;
    }

    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        handleAudioAd();
        removeAdElements();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-testid', 'class', 'src', 'style']
    });

    console.debug('[BlockIT] Spotify observer initialized');
    removeAdElements();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeObserver);
} else {
    initializeObserver();
}

// More aggressive periodic checks
if (adCheckInterval) {
    clearInterval(adCheckInterval);
}

adCheckInterval = setInterval(() => {
    handleAudioAd();
    removeAdElements();
}, 100); // Check more frequently

// Listen for page navigation
window.addEventListener('popstate', () => {
    setTimeout(() => {
        removeAdElements();
        initializeObserver();
    }, 1000);
}); 