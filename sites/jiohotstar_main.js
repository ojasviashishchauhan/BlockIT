// JioHotstar MAIN world script
// This script runs in the MAIN world and has direct access to JioHotstar's JavaScript functions

(function() {
  console.log('[BlockIt] JioHotstar MAIN world script injected');
  
  // Known ad-related API patterns
  const AD_PATTERNS = [
    '/ads/',
    '/ad-manager/',
    '/adinsert/',
    '/ad-events/',
    '/adbreak/',
    '/pubads',
    'ads.js',
    'ad-insertion',
    'adunit'
  ];
  
  // Keep track of unmute attempts
  let unmuteAttempts = 0;
  const MAX_UNMUTE_ATTEMPTS = 50; // Number of attempts before giving up
  
  // Intercept network requests to block ad-related API calls
  function interceptNetworkRequests() {
    console.log('[BlockIt] Setting up JioHotstar network request interception');
    
    // Save original methods
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    
    // Intercept fetch requests
    window.fetch = function(resource, init) {
      const url = resource instanceof Request ? resource.url : resource;
      
      // Check if this is an ad request
      const isAdRequest = AD_PATTERNS.some(pattern => url.includes(pattern));
      
      if (isAdRequest) {
        console.log('[BlockIt] Blocked JioHotstar ad-related fetch request:', url);
        return new Promise((resolve, reject) => {
          resolve(new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      }
      
      // Pass through non-ad requests
      return originalFetch.apply(this, arguments);
    };
    
    // Intercept XMLHttpRequest
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      // Check if this is an ad request
      const isAdRequest = AD_PATTERNS.some(pattern => url.includes(pattern));
      
      if (isAdRequest) {
        console.log('[BlockIt] Blocked JioHotstar ad-related XHR request:', url);
        // Track that this is an ad request
        this._isAdRequest = true;
        // Redirect to empty response
        return originalXHROpen.apply(this, [method, 'about:blank', async, user, password]);
      }
      
      // Proceed with original request
      return originalXHROpen.apply(this, arguments);
    };
    
    // Handle XHR send for ad requests
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (this._isAdRequest) {
        // Mock a completed request for ad requests
        Object.defineProperty(this, 'readyState', { value: 4, writable: false });
        Object.defineProperty(this, 'status', { value: 200, writable: false });
        Object.defineProperty(this, 'responseText', { value: '{}', writable: false });
        
        // Trigger ready state change
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') {
            this.onreadystatechange();
          }
          if (typeof this.onload === 'function') {
            this.onload();
          }
        }, 50);
        
        return;
      }
      
      // Regular XHR handling
      return originalXHRSend.apply(this, arguments);
    };
    
    console.log('[BlockIt] JioHotstar network request interception active');
  }
  
  // Prevent player from being muted by ads
  function forceUnmutePlayer() {
    try {
      // Find the video player element
      const videoPlayer = document.querySelector(
        'video[data-player-video-id], video.shaka-video-container--player, video.video-player-tag, video#hlsplayer, video'
      );
      
      if (videoPlayer) {
        // Log current state
        const wasMuted = videoPlayer.muted;
        const prevVolume = videoPlayer.volume;
        
        // Force unmute and set volume if needed
        if (videoPlayer.muted || videoPlayer.volume === 0) {
          console.log(`[BlockIt] JioHotstar player was muted=${wasMuted}, volume=${prevVolume}. Unmuting...`);
          videoPlayer.muted = false;
          
          if (videoPlayer.volume === 0) {
            videoPlayer.volume = 0.5; // Set to a reasonable default volume
          }
          
          // Check if operation was successful
          if (!videoPlayer.muted && videoPlayer.volume > 0) {
            console.log('[BlockIt] Successfully unmuted JioHotstar player');
            unmuteAttempts = 0; // Reset counter on success
          } else {
            console.warn('[BlockIt] Failed to unmute JioHotstar player');
            unmuteAttempts++;
          }
        } else {
          // Player is already in the desired state
          unmuteAttempts = 0; // Reset counter
        }
        
        return true; // Player found and processed
      } else {
        unmuteAttempts++;
        return false; // Player not found
      }
    } catch (error) {
      console.error('[BlockIt] Error in forceUnmutePlayer:', error);
      unmuteAttempts++;
      return false;
    }
  }
  
  // Hijack player functions to prevent ads
  function hijackPlayer() {
    try {
      // Check for common ad player objects and methods
      
      // Method 1: Try to find the player object
      if (window.player && typeof window.player.ads === 'object') {
        console.log('[BlockIt] Found player.ads object, attempting to override');
        
        // Disable ad functions if they exist
        if (typeof window.player.ads.play === 'function') {
          window.player.ads.play = function() {
            console.log('[BlockIt] Blocked player.ads.play call');
            return false;
          };
        }
        
        if (typeof window.player.ads.load === 'function') {
          window.player.ads.load = function() {
            console.log('[BlockIt] Blocked player.ads.load call');
            return false;
          };
        }
      }
      
      // Method 2: Look for JioHotstar-specific player objects
      if (window.JioHotstarPlayer || window.HSPlayer || window.HotstarPlayer) {
        const playerObj = window.JioHotstarPlayer || window.HSPlayer || window.HotstarPlayer;
        console.log('[BlockIt] Found Hotstar player object, attempting to modify');
        
        // Override methods that might handle ads
        if (typeof playerObj.prototype.onAdBreakStart === 'function') {
          const original = playerObj.prototype.onAdBreakStart;
          playerObj.prototype.onAdBreakStart = function() {
            console.log('[BlockIt] Blocked onAdBreakStart, calling onAdBreakComplete instead');
            if (typeof this.onAdBreakComplete === 'function') {
              this.onAdBreakComplete();
            }
            return false;
          };
        }
      }
      
      // Method 3: Look for ad manager or SDK
      if (window.adManager || window.AdManager) {
        const adManagerObj = window.adManager || window.AdManager;
        console.log('[BlockIt] Found ad manager object, attempting to disable');
        
        // Prevent ad loading/playing
        adManagerObj.enabled = false;
        adManagerObj.initialized = false;
        
        if (typeof adManagerObj.loadAd === 'function') {
          adManagerObj.loadAd = function() {
            console.log('[BlockIt] Blocked adManager.loadAd call');
            return false;
          };
        }
      }
      
    } catch (error) {
      console.error('[BlockIt] Error in hijackPlayer:', error);
    }
  }
  
  // Initialize all the blocking methods
  function init() {
    console.log('[BlockIt] Initializing JioHotstar MAIN world ad blocking');
    
    // Set up ad blocking functions
    interceptNetworkRequests();
    hijackPlayer();
    
    // Set up periodic checks for player state
    let unmuteInterval = setInterval(() => {
      const result = forceUnmutePlayer();
      
      // If we've made too many unsuccessful attempts, stop trying
      if (unmuteAttempts >= MAX_UNMUTE_ATTEMPTS) {
        console.warn(`[BlockIt] Stopping unmute attempts after ${MAX_UNMUTE_ATTEMPTS} tries`);
        clearInterval(unmuteInterval);
      }
    }, 500);
    
    // Set up periodic hijack attempts for player
    let hijackInterval = setInterval(hijackPlayer, 2000);
    
    // Stop player hijack attempts after 30 seconds
    setTimeout(() => {
      clearInterval(hijackInterval);
      console.log('[BlockIt] Stopped periodic player hijacking after 30s');
    }, 30000);
    
    console.log('[BlockIt] JioHotstar MAIN world ad blocking initialized');
  }
  
  // Start initialization
  init();
})(); 