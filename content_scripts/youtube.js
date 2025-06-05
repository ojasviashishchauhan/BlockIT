// YouTube Ad Blocker
console.log('[BlockIT] YouTube handler loaded');

// Configuration
const YOUTUBE_CONFIG = {
    adSelectors: {
        videoAds: [
            '.video-ads',
            '.ytp-ad-module',
            '.ytp-ad-overlay-container',
            'div[id^="player-ads"]',
            '.ytd-video-masthead-ad-v3-renderer',
            '.ytd-banner-promo-renderer',
            '.ytd-statement-banner-renderer',
            '.ytd-in-feed-ad-layout-renderer',
            'ytd-ad-slot-renderer',
            '.ytd-promoted-sparkles-web-renderer',
            '.ytd-display-ad-renderer',
            '.ytd-ad-break-preview-renderer'
        ],
        skipButton: '.ytp-ad-skip-button',
        skipButtonModern: '.ytp-ad-skip-button-modern',
        adOverlay: '.ytp-ad-overlay-container',
        adDisplayContainer: 'div[id^="google_ads_"]',
        companions: '#companions',
        playerAds: '#player-ads',
        playerOverlays: '#player-overlay:not(.ytd-miniplayer)',
        adElement: '[id^="ad-"]'
    },
    videoSelectors: {
        player: '#movie_player',
        video: 'video.html5-main-video',
        progressBar: '.ytp-progress-bar'
    },
    adPatterns: [
        'googlesyndication.com',
        'doubleclick.net',
        'youtube.com/pagead',
        'youtube.com/ptracking',
        'youtube.com/api/stats/ads',
        'youtube.com/get_video_info.*adformat',
        'youtube.com/get_midroll_info',
        'youtube.com/_get_ads'
    ]
};

// Track state
let isAdPlaying = false;
let originalVolume = 1;
let observer = null;
let adCheckInterval = null;
let lastAdCheck = 0;
let consecutiveAdChecks = 0;

// Function to detect ads
function detectAd() {
    // Check for ad elements
    for (const selector of YOUTUBE_CONFIG.adSelectors.videoAds) {
        const adElements = document.querySelectorAll(selector);
        if (adElements.length > 0) {
            return true;
        }
    }

    // Check video player state
    const player = document.querySelector(YOUTUBE_CONFIG.videoSelectors.player);
    if (player && player.classList.contains('ad-showing')) {
        return true;
    }

    // Check for ad overlay
    const adOverlay = document.querySelector(YOUTUBE_CONFIG.adSelectors.adOverlay);
    if (adOverlay && window.getComputedStyle(adOverlay).display !== 'none') {
        return true;
    }

    return false;
}

// Function to skip ads
function skipAd() {
    // Method 1: Click skip button if available
    const skipButton = document.querySelector(YOUTUBE_CONFIG.adSelectors.skipButton) || 
                      document.querySelector(YOUTUBE_CONFIG.adSelectors.skipButtonModern);
    if (skipButton && skipButton.offsetParent !== null) {
        skipButton.click();
        console.debug('[BlockIT] Clicked skip button');
        return true;
    }

    // Method 2: Force video to end
    const video = document.querySelector(YOUTUBE_CONFIG.videoSelectors.video);
    if (video) {
        try {
            // Store original playback rate
            const originalRate = video.playbackRate;
            
            // Only modify if it's actually an ad
            if (detectAd()) {
                // Speed up video to end quickly
                video.currentTime = video.duration || 0;
                video.playbackRate = 16;
                
                // Reset playback rate after a short delay
                setTimeout(() => {
                    if (!detectAd()) {
                        video.playbackRate = 1;
                        console.debug('[BlockIT] Reset playback rate');
                    }
                }, 500);
            } else {
                // If not an ad, ensure normal playback rate
                video.playbackRate = originalRate;
            }
            
            console.debug('[BlockIT] Handled video speed');
            return true;
        } catch (e) {
            console.debug('[BlockIT] Video handling failed:', e);
            // Ensure playback rate is reset even if there's an error
            try {
                video.playbackRate = 1;
            } catch (e) {}
        }
    }
    return false;
}

// Function to remove ad elements
function removeAdElements() {
    // Remove all ad containers
    for (const selector of YOUTUBE_CONFIG.adSelectors.videoAds) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.remove();
        });
    }

    // Hide ad overlays
    const adOverlay = document.querySelector(YOUTUBE_CONFIG.adSelectors.adOverlay);
    if (adOverlay) {
        adOverlay.style.display = 'none';
    }

    // Remove companion ads
    const companions = document.querySelector(YOUTUBE_CONFIG.adSelectors.companions);
    if (companions) {
        companions.remove();
    }

    // Remove player ads
    const playerAds = document.querySelector(YOUTUBE_CONFIG.adSelectors.playerAds);
    if (playerAds) {
        playerAds.remove();
    }
}

// Function to handle ads
function handleAd() {
    const now = Date.now();
    if (now - lastAdCheck < 50) return; // Prevent too frequent checks
    lastAdCheck = now;

    const isAd = detectAd();
    if (isAd) {
        consecutiveAdChecks++;
        if (!isAdPlaying || consecutiveAdChecks > 2) {
            console.debug('[BlockIT] Ad detected, taking action');
            isAdPlaying = true;

            // Remove ad elements
            removeAdElements();

            // Try to skip the ad
            if (skipAd()) {
                console.debug('[BlockIT] Successfully skipped ad');
            }

            // Mute video during ad
            const video = document.querySelector(YOUTUBE_CONFIG.videoSelectors.video);
            if (video) {
                originalVolume = video.volume;
                video.volume = 0;
                video.muted = true;
            }
        }
    } else {
        consecutiveAdChecks = 0;
        if (isAdPlaying) {
            console.debug('[BlockIT] Ad finished, restoring state');
            isAdPlaying = false;

            // Restore volume and playback rate
            const video = document.querySelector(YOUTUBE_CONFIG.videoSelectors.video);
            if (video) {
                video.muted = false;
                video.volume = originalVolume;
                video.playbackRate = 1; // Ensure normal playback rate
            }
        }
    }
}

// Network request blocking
function blockAdsRequests() {
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init) {
        const url = resource instanceof Request ? resource.url : resource;
        if (typeof url === 'string' && YOUTUBE_CONFIG.adPatterns.some(pattern => {
            if (pattern.includes('*')) {
                return new RegExp(pattern.replace(/\*/g, '.*')).test(url);
            }
            return url.includes(pattern);
        })) {
            console.debug('[BlockIT] Blocked fetch request:', url);
            return new Response('{}', {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return originalFetch.apply(this, arguments);
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && YOUTUBE_CONFIG.adPatterns.some(pattern => {
            if (pattern.includes('*')) {
                return new RegExp(pattern.replace(/\*/g, '.*')).test(url);
            }
            return url.includes(pattern);
        })) {
            console.debug('[BlockIT] Blocked XHR request:', url);
            arguments[1] = 'data:text/plain;base64,e30='; // Empty JSON object
        }
        return originalXHROpen.apply(this, arguments);
    };
}

// Initialize observer
function initializeObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        handleAd();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'src', 'style']
    });

    console.debug('[BlockIT] YouTube observer initialized');
}

// Add playback rate protection
function protectPlaybackRate() {
    const video = document.querySelector(YOUTUBE_CONFIG.videoSelectors.video);
    if (video) {
        // Store the original descriptor
        const originalPlaybackRateDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
        
        // Override playbackRate property
        Object.defineProperty(video, 'playbackRate', {
            get: function() {
                // Return actual playback rate only if we're handling an ad
                return isAdPlaying ? this._actualPlaybackRate : (this._userPlaybackRate || 1);
            },
            set: function(value) {
                // Store the actual playback rate
                this._actualPlaybackRate = value;
                
                // If not handling an ad, store user's intended rate
                if (!isAdPlaying) {
                    this._userPlaybackRate = value;
                    // Use the original setter
                    originalPlaybackRateDescriptor.set.call(this, value);
                } else {
                    // During ad, allow our script to modify the actual rate
                    originalPlaybackRateDescriptor.set.call(this, value);
                }
            },
            configurable: true
        });
    }
}

// Initialize blocking
function initialize() {
    // Block network requests
    blockAdsRequests();

    // Set up observer
    if (document.body) {
        initializeObserver();
    } else {
        document.addEventListener('DOMContentLoaded', initializeObserver);
    }

    // Set up interval for continuous checking
    if (adCheckInterval) {
        clearInterval(adCheckInterval);
    }
    adCheckInterval = setInterval(handleAd, 100);

    // Initial cleanup
    removeAdElements();

    // Protect playback rate
    protectPlaybackRate();

    // Handle navigation events
    window.addEventListener('yt-navigate-start', () => {
        console.debug('[BlockIT] YouTube navigation detected');
        setTimeout(() => {
            removeAdElements();
            protectPlaybackRate(); // Re-protect playback rate after navigation
        }, 500);
    });

    window.addEventListener('yt-navigate-finish', () => {
        console.debug('[BlockIT] YouTube navigation finished');
        setTimeout(() => {
            removeAdElements();
            protectPlaybackRate(); // Re-protect playback rate after navigation
        }, 500);
    });
}

// Start blocking
initialize(); 