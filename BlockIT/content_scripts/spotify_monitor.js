// Spotify Ad Blocker - Monitor Script
console.log('[BlockIT] Spotify monitor loaded');

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

// Function to detect audio ads
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

    // Rest of the detection logic...
    return false;
}

// Function to skip ads
function skipAd() {
    // Try to skip using the next button
    const nextButton = document.querySelector(SPOTIFY_CONFIG.playerSelectors.nextButton);
    if (nextButton) {
        nextButton.click();
        console.debug('[BlockIT] Clicked next button');
    }

    // Try progress bar skip
    const progressBar = document.querySelector(SPOTIFY_CONFIG.playerSelectors.progressBar);
    if (progressBar) {
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: progressBar.getBoundingClientRect().right,
            clientY: progressBar.getBoundingClientRect().top
        });
        progressBar.dispatchEvent(event);
        console.debug('[BlockIT] Triggered progress bar skip');
    }

    // Force play if paused
    const playButton = document.querySelector(SPOTIFY_CONFIG.playerSelectors.playButton);
    if (playButton) {
        playButton.click();
        console.debug('[BlockIT] Forced playback');
    }
}

// Function to handle audio ads
function handleAudioAd() {
    if (!document.querySelector(SPOTIFY_CONFIG.playerSelectors.player)) return;

    const isAd = detectAudioAd();
    if (isAd) {
        lastAdTime = Date.now();
        consecutiveAdChecks++;

        if (!isAdPlaying || consecutiveAdChecks > 2) {
            console.debug(`[BlockIT] Ad detected (checks: ${consecutiveAdChecks}), taking action`);
            isAdPlaying = true;
            
            // Notify the injected script
            window.postMessage({ type: 'BLOCKIT_AD_STATE', isPlaying: true }, '*');
            
            // Try multiple skip methods
            skipAd();
        }
    } else {
        consecutiveAdChecks = 0;
        if (isAdPlaying) {
            console.debug('[BlockIT] Ad finished, restoring playback');
            
            // Notify the injected script
            window.postMessage({ type: 'BLOCKIT_AD_STATE', isPlaying: false }, '*');
            
            isAdPlaying = false;
        }
    }
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

// Initialize observer
function initializeObserver() {
    if (!document.body) {
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

// Start periodic checks
if (adCheckInterval) {
    clearInterval(adCheckInterval);
}

adCheckInterval = setInterval(() => {
    handleAudioAd();
    removeAdElements();
}, 100); 