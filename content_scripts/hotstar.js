// Hotstar Ad Blocker
console.log('[BlockIT] Hotstar handler loaded');

// Configuration
const HOTSTAR_CONFIG = {
    adSelectors: {
        adContainer: '.ad-container',
        adOverlay: '.ad-overlay',
        playerAds: '#player-ads',
        adBanners: '.ad-banner',
        adSlots: '[data-container="ads"]',
        videoAds: '.video-ad',
        adElements: '[data-purpose="ad-element"]'
    },
    adURLPatterns: [
        'hesads.akamaized.net',
        'ads.akamaized.net',
        'pubads.g.doubleclick.net',
        'securepubads.g.doubleclick.net',
        'ad.doubleclick.net',
        'adservice.google.com',
        'googleads.g.doubleclick.net'
    ]
};

// Block ad network requests
function blockAdsRequests() {
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init) {
        const url = resource instanceof Request ? resource.url : resource;
        if (typeof url === 'string' && HOTSTAR_CONFIG.adURLPatterns.some(pattern => url.includes(pattern))) {
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
        if (typeof url === 'string' && HOTSTAR_CONFIG.adURLPatterns.some(pattern => url.includes(pattern))) {
            console.debug('[BlockIT] Blocked XHR request:', url);
            arguments[1] = 'data:text/plain;base64,e30='; // Empty JSON object
        }
        return originalXHROpen.apply(this, arguments);
    };
}

// Remove ad elements
function removeAdElements() {
    for (const [key, selector] of Object.entries(HOTSTAR_CONFIG.adSelectors)) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.remove();
            console.debug(`[BlockIT] Removed ${key}`);
        });
    }
}

// Handle video player
function handleVideoPlayer() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
        let userVolume = null;  // Start with null to detect initial volume
        let volumeCheckInterval;
        let initialVolumeSet = false;
        
        // Handle volume state
        const restoreVolume = () => {
            if (videoElement.muted) {
                videoElement.muted = false;
                if (userVolume !== null) {
                    videoElement.volume = userVolume;
                }
                console.debug('[BlockIT] Unmuted video, volume:', videoElement.volume);
            } else if (!initialVolumeSet) {
                // Capture initial player volume on first run
                userVolume = videoElement.volume;
                initialVolumeSet = true;
                console.debug('[BlockIT] Initial player volume captured:', userVolume);
            }
        };

        // Save user's volume preference when they change it manually
        videoElement.addEventListener('volumechange', () => {
            if (!videoElement.muted && videoElement.volume > 0) {
                userVolume = videoElement.volume;
                console.debug('[BlockIT] Updated volume preference:', userVolume);
            } else if (videoElement.muted) {
                // Only handle muting, preserve volume level
                setTimeout(() => {
                    videoElement.muted = false;
                    console.debug('[BlockIT] Prevented muting, kept volume at:', videoElement.volume);
                }, 10);
            }
        });

        // Restore volume on various events
        const events = ['play', 'playing', 'loadeddata', 'loadedmetadata'];
        events.forEach(event => {
            videoElement.addEventListener(event, () => {
                restoreVolume();
            });
        });

        // Set up periodic volume check
        if (volumeCheckInterval) {
            clearInterval(volumeCheckInterval);
        }
        volumeCheckInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                restoreVolume();
            }
        }, 1000);

        // Skip ads by advancing video time
        videoElement.addEventListener('timeupdate', () => {
            const player = videoElement.closest('.player-container');
            if (player && player.querySelector(HOTSTAR_CONFIG.adSelectors.adContainer)) {
                videoElement.currentTime = videoElement.duration;
                restoreVolume();
                console.debug('[BlockIT] Skipped video ad');
            }
        });

        // Initial volume restore
        setTimeout(restoreVolume, 100);

        // Cleanup when video is removed
        videoElement.addEventListener('remove', () => {
            if (volumeCheckInterval) {
                clearInterval(volumeCheckInterval);
            }
        });
    }
}

// Initialize observer
function initializeObserver() {
    const observer = new MutationObserver((mutations) => {
        removeAdElements();
        handleVideoPlayer();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-purpose']
    });

    console.debug('[BlockIT] Hotstar observer initialized');
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

    // Initial cleanup
    removeAdElements();
    handleVideoPlayer();

    // Handle navigation events
    window.addEventListener('popstate', () => {
        setTimeout(() => {
            removeAdElements();
            handleVideoPlayer();
        }, 500);
    });
}

// Start blocking
initialize(); 