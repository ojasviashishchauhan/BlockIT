// Spotify Ad Blocker - Injection Script
console.log('[BlockIT] Spotify injection loaded');

// Store original methods
const originalPlay = HTMLMediaElement.prototype.play;
const originalLoad = HTMLMediaElement.prototype.load;
const originalFetch = window.fetch;
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalSendBeacon = navigator.sendBeacon;
let realVolume = 1;
let isAdPlaying = false;

// Silent audio to replace ads
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Ad-related URL patterns to block
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
    'audio-fa-',
    'audio4-fa.scdn.co',
    'harmony/v1/harmony', // Block harmony endpoint that handles ad skipping
    'gew-spclient.spotify.com', // Additional ad-related endpoints
    'audio-sp/v1/audio-mobile-ad',
    'audio-sp/v1/video-ad',
    'spclient.wg.spotify.com/storage-resolve/v2/files/audio/interactive',
    'spclient.wg.spotify.com/melody/v1/time'
];

// Function to check if a URL is ad-related
function isAdUrl(url) {
    if (!url) return false;
    return blockPatterns.some(pattern => {
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(url);
        }
        return url.includes(pattern);
    });
}

// Override play method with better error handling
HTMLMediaElement.prototype.play = async function() {
    if (isAdPlaying) {
        console.debug('[BlockIT] Prevented ad playback');
        this.volume = 0;
        this.muted = true;
        // Return a resolved promise to prevent errors
        return Promise.resolve();
    }
    return originalPlay.call(this);
};

// Override load method
HTMLMediaElement.prototype.load = function() {
    if (isAdPlaying) {
        console.debug('[BlockIT] Prevented ad loading');
        return;
    }
    return originalLoad.call(this);
};

// Override volume getter/setter
Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    get: function() {
        return isAdPlaying ? 0 : realVolume;
    },
    set: function(val) {
        realVolume = val;
        if (!isAdPlaying) {
            this._volume = val;
        }
    }
});

// Intercept XHR requests
XMLHttpRequest.prototype.open = function(...args) {
    const url = args[1];
    if (typeof url === 'string' && isAdUrl(url)) {
        console.debug(`[BlockIT] Blocked XHR request: ${url}`);
        args[1] = SILENT_AUDIO;
    }
    return originalXHROpen.apply(this, args);
};

// Intercept fetch requests with better error handling
window.fetch = async function(resource, init) {
    const url = resource instanceof Request ? resource.url : resource;
    if (typeof url === 'string' && isAdUrl(url)) {
        console.debug(`[BlockIT] Blocked fetch request: ${url}`);
        // Return a fake response instead of redirecting to silent audio
        return new Response('', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    return originalFetch.apply(this, arguments);
};

// Block sendBeacon requests (used for analytics and ad tracking)
navigator.sendBeacon = function(url, data) {
    if (isAdUrl(url)) {
        console.debug(`[BlockIT] Blocked sendBeacon request: ${url}`);
        return true; // Pretend it succeeded
    }
    return originalSendBeacon.call(this, url, data);
};

// Override Spotify's internal ad-related functions
Object.defineProperties(window, {
    adPlaybackSDK: { value: null, writable: false },
    adPlaybackState: { value: 'blocked', writable: false },
    isAdPlaying: { value: false, writable: false },
    isAdPaused: { value: false, writable: false }
});

// Listen for messages from the monitor script
window.addEventListener('message', (event) => {
    if (event.data?.type === 'BLOCKIT_AD_STATE') {
        isAdPlaying = event.data.isPlaying;
        console.debug('[BlockIT] Ad state updated:', isAdPlaying);
    }
}); 