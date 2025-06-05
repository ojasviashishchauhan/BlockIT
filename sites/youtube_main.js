// YouTube MAIN world script
// This script runs in the MAIN world and has direct access to YouTube's JavaScript functions

(function() {
  console.log('[BlockIt] YouTube MAIN world script injected');
  
  // --- Ad Blocking Patterns --- 

  // 1. Known Ad Domains (check hostname)
  const AD_DOMAIN_PATTERNS = [
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
      'google-analytics.com', // Optional: Often blocked but might break features
      'ads.youtube.com',
      'adservice.google.com',
      'securepubads.g.doubleclick.net',
      'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net',
      'innovid.com',
      'scorecardresearch.com', // Tracking
      // Add other specific ad domains as needed
  ];

  // 2. Ad URL Path Patterns (check pathname)
  const AD_URL_PATH_REGEX_PATTERNS = [
      /^\/pagead\//,              // Starts with /pagead/
      /^\/pcs\/activeview/,       // Starts with /pcs/activeview
      /^\/pubads/,               // Starts with /pubads
      /^\/adview/,               // Starts with /adview
      /\/api\/ads\//,            // Contains /api/ads/
      /\/api\/stats\/ads/,        // Contains /api/stats/ads
      /\/api\/stats\/atr/,        // Contains /api/stats/atr
      /^\/ptracking/,             // Starts with /ptracking (YouTube)
      /\/pagead\/interaction\//, // Contains /pagead/interaction/ (YouTube)
      /\/log_interaction/,       // Contains /log_interaction
      /\/ad_status/,            // Contains /ad_status
      // Google APIs often used for ads/tracking
      /\/google\.com\/pagead\//,
      /\/google\.com\/afs\//,
      /\/google\.com\/adsense\//,
      // YouTube specific API endpoints known to be ad-related
      /\/youtubei\/v1\/log_event.*?\?(?=.*(ad_break|ad_impression|ad_click|adNotify))/, // Added adNotify
      /\/youtube\.com\/api\/stats\/qoe.*?\?(?=.*(adunit|ad_break))/, 
      /\/youtube\.com\/api\/stats\/playback.*?\?(?=.*(ad_break|adunit))/, // Added playback check
  ];

  // 3. Specific Videoplayback Ad URL Parameter Patterns (check search params)
  const isVideoplaybackAd = (url) => {
    // Only check URLs containing /videoplayback
    if (!url || !url.includes('/videoplayback')) {
        return false;
    }
    // If it contains a range parameter, it's almost certainly content, not an ad manifest
    if (/[?&]range=/.test(url)) {
        return false;
    }
    // Check for specific ad parameters known to indicate an ad
    const AD_PARAMS_ONLY_REGEX = [
        /[?&]ad_docid=/,
        /[?&]adformat=/,
        /[?&]ad_preroll=/,
        /[?&]adunit=/,
        /[?&]ad_type=/,
        /[?&]ad_channel=/,
        /[?&]ad_host_tier=/,
        /[?&]ad_tag=/
    ];
    return AD_PARAMS_ONLY_REGEX.some(regex => regex.test(url));
  };

  // --- Ad Detection Functions --- 

  const isAdDomain = (hostname) => {
    return AD_DOMAIN_PATTERNS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  };

  const isAdUrlPath = (pathname) => {
    return AD_URL_PATH_REGEX_PATTERNS.some(regex => regex.test(pathname));
  };

  // --- Network Interception Logic --- 

  function interceptNetworkRequests() {
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;

    const blockRequest = (url, type) => {
      console.log(`[BlockIt] Blocked ${type} ad request:`, url);
      
      // Set our flag to indicate an ad was just blocked
      recentlyBlockedAds = true;
      
      // Clear any existing timeout and set a new one
      if (blockedAdTimeout) {
        clearTimeout(blockedAdTimeout);
      }
      
      // Flag will be true for 3 seconds after blocking an ad
      blockedAdTimeout = setTimeout(() => {
        recentlyBlockedAds = false;
      }, 3000);
      
      // Schedule a video playback check shortly after blocking an ad
      if (!videoPlaybackCheckTimeout) {
        videoPlaybackCheckTimeout = setTimeout(checkVideoPlayback, 2000);
      }
      
      return new Promise((resolve, reject) => {
        // Return a minimal valid JSON response
        resolve(new Response('{"responseContext":{}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      });
    };

    const blockXHR = (xhrInstance, method, url, async, user, password) => {
      console.log('[BlockIt] Blocked XHR ad request:', url);
      
      // Same tracking for XHR blocked requests
      recentlyBlockedAds = true;
      if (blockedAdTimeout) {
        clearTimeout(blockedAdTimeout);
      }
      blockedAdTimeout = setTimeout(() => {
        recentlyBlockedAds = false;
      }, 3000);
      
      // Schedule a video playback check
      if (!videoPlaybackCheckTimeout) {
        videoPlaybackCheckTimeout = setTimeout(checkVideoPlayback, 2000);
      }
      
      xhrInstance._isAdRequest = true; // Mark as ad request
      // Use apply with the correct context (xhrInstance) and redirect to about:blank
      return originalXHROpen.apply(xhrInstance, [method, 'about:blank', async, user, password]);
    };

    // Intercept fetch requests
    window.fetch = function(resource, init) {
      const url = resource instanceof Request ? resource.url : resource;
      try {
        const parsedUrl = new URL(url);
        if (isAdDomain(parsedUrl.hostname) || isAdUrlPath(parsedUrl.pathname) || isVideoplaybackAd(url)) {
          return blockRequest(url, 'fetch');
        }
      } catch (e) {
        // Ignore errors parsing potentially invalid URLs
      }
      // Pass through non-ad requests
      return originalFetch.apply(this, arguments);
    };

    // Intercept XMLHttpRequest
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      try {
        // Resolve relative URLs against the document's base URI
        const absoluteUrl = new URL(url, document.baseURI).toString();
        const parsedUrl = new URL(absoluteUrl);
        if (isAdDomain(parsedUrl.hostname) || isAdUrlPath(parsedUrl.pathname) || isVideoplaybackAd(absoluteUrl)) {
          // Pass 'this' (the XHR instance) to blockXHR
          return blockXHR(this, method, url, async, user, password);
        }
      } catch (e) {
        // Ignore errors parsing potentially invalid URLs
      }
      // Use apply with the correct context (this) for non-ad requests
      return originalXHROpen.apply(this, arguments);
    };

    // Handle XHR send for ad requests (remains largely the same)
    const originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (this._isAdRequest) {
        // Mock a completed request for previously marked ad requests
        Object.defineProperty(this, 'readyState', { value: 4, writable: false });
        Object.defineProperty(this, 'status', { value: 200, writable: false });
        Object.defineProperty(this, 'responseText', { value: '{"responseContext": {}}', writable: false });
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') {
            this.onreadystatechange();
          }
          if (typeof this.onload === 'function') {
            this.onload();
          }
        }, 50);
        return; // Prevent actual send
      }
      // Regular XHR handling
      return originalXHRSend.apply(this, arguments);
    };

    console.log('[BlockIt] Network request interception active with refined patterns');
  }

  // --- Rest of the MAIN world script --- 

  // Known ad request patterns
  const AD_PATTERNS = [
    '/pagead/',
    '/ptracking',
    '=adunit&',
    '/api/ads/',
    '/api/stats/ads',
    '/pcs/activeview',
    '/pubads',
    '/pubads_impl',
    '/securepubads',
    'videoplayback?ad_docid',
    'videoplayback?adformat',
    'videoplayback?ad_preroll',
    'videoplayback?ctier=L&sparams=.*adunit',
    '/adview',
    '_adsense_',
    'doubleclick.net',
    'googleadservices',
    'pagead2.',
    'pubads.',
    'innovid.com',
    'youtube.com/pagead/',
    'youtube.com/ptracking',
    '/log_interaction',
    'google.com/pagead/',
    'google.com/afs/',
    'google.com/adsense/',
    '/youtubei/v1/log_event?.*(ad_break|ad_impression|ad_click)',
    '/api/stats/atr',
    '/api/stats/qoe?.*(adunit|ad_break)',
    'googlesyndication.com',
    'google-analytics.com',
    'adsystem',
    'doubleclick',
    'adservice',
    'dynamicpreroll',
    '/ad_status'
  ];
  
  // Keep track of clicked buttons to avoid endless loops
  const clickedButtons = new WeakSet();
  let skipButtonCooldown = false;
  
  // Variable to track the refresh check timeout
  let refreshCheckTimeout = null; 
  
  // Track blocked ad requests to better detect when we should check for video stalling
  let recentlyBlockedAds = false;
  let blockedAdTimeout = null;
  let videoPlaybackCheckTimeout = null;
  
  // Track if we've already refreshed the page to avoid refresh loops
  let hasRefreshed = false;
  
  // Function to check if video is playing correctly
  function checkVideoPlayback() {
    videoPlaybackCheckTimeout = null;
    
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('.html5-main-video');
    
    if (!player || !video) return;
    
    console.log('[BlockIt] Checking video playback after blocking ads');
    
    // Check if video is playing properly
    const isVideoPlaying = !video.paused && 
                          video.currentTime > 0 &&
                          video.readyState >= 3 && // HAVE_FUTURE_DATA or better
                          !player.classList.contains('ad-showing') &&
                          !player.hasAttribute('ad-showing');
    
    // Logic for when video is NOT playing properly after we blocked ads
    if (recentlyBlockedAds && !isVideoPlaying) {
      console.log('[BlockIt] Video not playing properly after ad was blocked');
      
      // First try to force play
      try {
        // Attempt to play the video directly
        video.play().then(() => {
          console.log('[BlockIt] Successfully forced video to play');
        }).catch(e => {
          console.warn('[BlockIt] Failed to force play video:', e);
          
          // If we can't play, try more aggressive measures
          forceVideoToPlay();
        });
      } catch (e) {
        console.warn('[BlockIt] Error during play attempt:', e);
        
        // If play() throws, try more aggressive measures
        forceVideoToPlay();
      }
    } else if (isVideoPlaying) {
      console.log('[BlockIt] Video is playing normally after ad blocks');
    }
  }
  
  // More aggressive measures to get video to play
  function forceVideoToPlay() {
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('.html5-main-video');
    
    if (!player || !video) return;
    
    console.log('[BlockIt] Attempting more aggressive measures to force video to play');
    
    // Try multiple methods to force the video to play
    
    // 1. Remove ad classes
    player.classList.remove('ad-showing', 'ad-interrupting', 'ytp-ad-overlay-open');
    player.removeAttribute('ad-showing');
    
    // 2. Try calling player API methods directly
    if (player.getPlayerState && typeof player.playVideo === 'function') {
      try {
        player.playVideo();
        console.log('[BlockIt] Called playVideo() directly');
      } catch (e) {
        console.warn('[BlockIt] Error calling playVideo():', e);
      }
    }
    
    // 3. Set a final check to see if our measures worked
    setTimeout(() => {
      const currentPlayer = document.querySelector('#movie_player');
      const currentVideo = document.querySelector('.html5-main-video');
      
      if (!currentPlayer || !currentVideo) return;
      
      const isVideoPlayingNow = !currentVideo.paused && 
                             currentVideo.currentTime > 0 &&
                             currentVideo.readyState >= 3;
      
      // If video still not playing, refresh the page (only if we haven't already)
      if (!isVideoPlayingNow && !hasRefreshed) {
        console.log('[BlockIt] Video still not playing, refreshing page as last resort');
        hasRefreshed = true;
        window.location.reload();
      }
    }, 1500);
  }
  
  // Function to click visible skip buttons (extracted to fix ReferenceError)
  function clickVisibleSkipButton() {
    const SKIP_BUTTON_SELECTORS = [
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      '.ytp-skip-ad-button',
      'button[class*="ytp-ad-skip"]',
      '.ytp-ad-skip-button-container button',
      'button.ytp-ad-skip-button-container',
      'button[id="skip-button"]',
      'span.ytp-ad-skip-button-container',
      'div.ytp-ad-skip-button-container',
      'button.videoAdUiSkipButton',
      'button[data-tooltip-text*="Skip"]',
      'button[title*="Skip"]',
      'button[aria-label*="Skip"]'
    ];
    
    let skipButtonClicked = false;
    
    SKIP_BUTTON_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach(button => {
        // Skip if we've already tried to click this button
        if (clickedButtons.has(button)) {
          return;
        }
        
        // Check if button is visible and clickable
        const isVisible = button.offsetWidth > 0 && 
                         button.offsetHeight > 0 && 
                         window.getComputedStyle(button).visibility !== 'hidden' &&
                         window.getComputedStyle(button).display !== 'none';
        
        if (isVisible) {
          console.log(`[BlockIt] Found visible skip button in MAIN world matching selector: ${selector}`);
          
          // Set cooldown to prevent rapid clicking
          skipButtonCooldown = true;
          setTimeout(() => { skipButtonCooldown = false; }, 2000);
          
          // Remember this button
          clickedButtons.add(button);
          
          // Try multiple click methods
          try {
            // Method 1: Native .click()
            button.click();
            console.log('[BlockIt] Clicked skip button using .click() in MAIN world');
            
            // Method 2: Programmatic click event
            try {
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
              });
              button.dispatchEvent(clickEvent);
              console.log('[BlockIt] Dispatched click event on skip button in MAIN world');
            } catch (e) {
              console.warn('[BlockIt] Error dispatching click event in MAIN world:', e);
            }
            
            // Also try to click any parent button if this is a span/div
            if (button.tagName.toLowerCase() !== 'button') {
              const parentButton = button.closest('button');
              if (parentButton && !clickedButtons.has(parentButton)) {
                clickedButtons.add(parentButton);
                parentButton.click();
                console.log('[BlockIt] Clicked parent button of skip element in MAIN world');
              }
            }
            
            skipButtonClicked = true;
          } catch (e) {
            console.error('[BlockIt] Error clicking skip button in MAIN world:', e);
          }
        }
      });
    });
    
    return skipButtonClicked;
  }
  
  // Skip ads immediately
  function skipAds() {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    
    // Don't process if in cooldown
    if (skipButtonCooldown) {
      return;
    }
    
    // If ad is showing, try multiple methods to skip
    if (player.classList.contains('ad-showing') || player.hasAttribute('ad-showing')) {
      console.log('[BlockIt] Ad detected, attempting to skip');
      
      // Method 1: Click skip button if available
      let skipButtonClicked = clickVisibleSkipButton();
      
      // Method 2: Seek to end of ad if possible
      const video = document.querySelector('.html5-main-video');
      if (video && !skipButtonClicked && video.duration && !isNaN(video.duration)) {
        try {
          if (video.currentTime < video.duration - 0.1) {
            console.log('[BlockIt] Seeking to end of ad video');
            video.currentTime = video.duration;
            // Also attempt to click skip if seeking fails
            setTimeout(() => {
              clickVisibleSkipButton();
            }, 50);
          }
        } catch (e) {
          console.warn('[BlockIt] Error seeking ad video:', e);
        }
      }
      
      // Method 3: Check for white screen / stuck ad and refresh
      if (video && !refreshCheckTimeout) { // Check if a timeout isn't already running
          // Set a timeout to check the video state shortly
          refreshCheckTimeout = setTimeout(() => {
              // Check again inside the timeout to ensure the ad is *still* supposedly showing
              const currentPlayer = document.querySelector('#movie_player');
              const currentVideo = document.querySelector('.html5-main-video');
              
              if (currentPlayer && currentVideo && 
                  (currentPlayer.classList.contains('ad-showing') || currentPlayer.hasAttribute('ad-showing'))) {
                  
                  // Check if video is actually stuck (white screen)
                  const isStuck = currentVideo.readyState < 2 || // HAVE_NOTHING or HAVE_METADATA 
                                  (currentVideo.paused && !currentVideo.ended) || // Paused but not ended
                                  (currentVideo.currentTime === 0 && !currentVideo.paused); // Not started playing
                  
                  if (isStuck) {
                      console.log('[BlockIt] Detected white screen/stuck ad. Attempting to fix...');
                      
                      // Try multiple methods to force the player past the ad
                      
                      // Method 1: Try to trigger the "ad error" scenario to skip the ad
                      try {
                          // Dispatch a fake error event on the video element
                          const errorEvent = new ErrorEvent('error', { 
                              bubbles: true,
                              cancelable: true,
                              message: 'Ad playback error'
                          });
                          currentVideo.dispatchEvent(errorEvent);
                          console.log('[BlockIt] Dispatched error event on video element');
                          
                          // For YouTube we can also try to simulate an error at the player level
                          if (currentPlayer.getPlayerState && typeof currentPlayer.playVideo === 'function') {
                              // Try to trigger a player state change
                              currentPlayer.playVideo();
                              console.log('[BlockIt] Called playVideo() to attempt to unstick player');
                          }
                      } catch (e) {
                          console.warn('[BlockIt] Error triggering ad error event:', e);
                      }
                      
                      // Method 2: Remove ad-related elements and classes
                      try {
                          // Remove ad-showing classes and attributes
                          currentPlayer.classList.remove('ad-showing', 'ad-interrupting', 'ytp-ad-overlay-open');
                          currentPlayer.removeAttribute('ad-showing');
                          
                          // Try to find and remove the ad overlay element itself
                          const adOverlays = document.querySelectorAll('.ytp-ad-overlay-container, .ytp-ad-overlay-slot');
                          adOverlays.forEach(overlay => {
                              overlay.style.display = 'none';
                              console.log('[BlockIt] Hid ad overlay element');
                          });
                      } catch (e) {
                          console.warn('[BlockIt] Error removing ad elements:', e);
                      }
                      
                      // Method A.3: Call specific YouTube player methods to try to skip the ad
                      try {
                          // Try to access player API methods
                          if (currentPlayer.getPlayerState) {
                              // If these methods exist, try to call them
                              if (typeof currentPlayer.cancelAd === 'function') {
                                  currentPlayer.cancelAd();
                                  console.log('[BlockIt] Called cancelAd() on player');
                              }
                              
                              if (typeof currentPlayer.skipAd === 'function') {
                                  currentPlayer.skipAd();
                                  console.log('[BlockIt] Called skipAd() on player');
                              }
                              
                              if (typeof currentPlayer.nextVideo === 'function' && 
                                  typeof currentPlayer.getCurrentTime === 'function' && 
                                  currentPlayer.getCurrentTime() === 0) {
                                  // Only if we're at the start, try to jump to the actual video
                                  currentPlayer.nextVideo();
                                  console.log('[BlockIt] Called nextVideo() on player');
                              }
                          }
                      } catch (e) {
                          console.warn('[BlockIt] Error calling player methods:', e);
                      }
                      
                      // Method 4: Set a second timeout to check if our methods worked
                      // If still stuck after another second, try refreshing as last resort
                      setTimeout(() => {
                          const playerStillExists = document.querySelector('#movie_player');
                          const videoStillExists = document.querySelector('.html5-main-video');
                          
                          if (playerStillExists && videoStillExists && 
                              (playerStillExists.classList.contains('ad-showing') || 
                               playerStillExists.hasAttribute('ad-showing'))) {
                              
                              // Check if STILL stuck
                              const stillStuck = videoStillExists.readyState < 2 || 
                                                (videoStillExists.paused && !videoStillExists.ended) ||
                                                (videoStillExists.currentTime === 0 && !videoStillExists.paused);
                              
                              if (stillStuck) {
                                  console.log('[BlockIt] Still stuck after fix attempts, refreshing page as last resort');
                                  window.location.reload();
                              } else {
                                  console.log('[BlockIt] Player unstuck successfully!');
                              }
                          }
                      }, 1500);
                  }
              }
              refreshCheckTimeout = null; // Reset timeout tracker
          }, 1500); // Wait 1.5 seconds before checking - reduced from 2s for faster response
      }

      // Apply cooldown after attempting to skip
      if (skipButtonClicked) {
        skipButtonCooldown = true;
        setTimeout(() => { skipButtonCooldown = false; }, 500); // 0.5 second cooldown
      }
    } else {
       // If ad is NOT showing, clear any pending refresh check
       if (refreshCheckTimeout) {
           clearTimeout(refreshCheckTimeout);
           refreshCheckTimeout = null;
           console.log('[BlockIt] Ad finished/skipped, canceling refresh check.');
       }
       // Reset clicked buttons if no ad is playing
       // This might need adjustment if elements persist longer than expected
       // clickedButtons = new WeakSet(); // Potentially problematic if buttons are reused quickly
    }
  }
  
  // Hijack YouTube player to prevent ads
  function hijackPlayer() {
    // Check for player every 500ms until found
    const checkInterval = setInterval(() => {
      // Look for video player
      const player = document.querySelector('#movie_player') || window.document.getElementById('movie_player');
      if (!player) return;
      
      // Check for common player API interfaces
      const playerApi = player.getPlayerApi ? player.getPlayerApi() : player;
      
      // Check if essential API methods exist
      if (typeof playerApi.getPlayerResponse !== 'function') return;
      
      try {
        // Clear interval once we've found the player
        clearInterval(checkInterval);
        console.log('[BlockIt] Found YouTube player, hijacking ad functions');
        
        // Store original methods if not already stored
        if (!playerApi._adsModuleOriginal && playerApi.getAdsModule) {
          playerApi._adsModuleOriginal = playerApi.getAdsModule;
          playerApi.getAdsModule = () => {
            console.log('[BlockIt] Blocked getAdsModule call');
            return { 
              requestAds: () => {},
              beforePlayback: () => false
            };
          };
        }
        
        // Override playAd method if exists
        if (playerApi.playAd && !playerApi._playAdOriginal) {
          playerApi._playAdOriginal = playerApi.playAd;
          playerApi.playAd = () => {
            console.log('[BlockIt] Blocked playAd call');
            return false;
          };
        }
        
        // Try to override loadVideoByPlayerVars (modern player)
        /* // Temporarily disabled patch
        if (playerApi.loadVideoByPlayerVars && !playerApi._loadVideoByPlayerVarsOriginal) {
          playerApi._loadVideoByPlayerVarsOriginal = playerApi.loadVideoByPlayerVars;
          playerApi.loadVideoByPlayerVars = function(playerVars) {
            console.log('[BlockIt] Intercepted loadVideoByPlayerVars call');
            // Remove ad-related parameters from playerVars
            if (playerVars) {
              if (playerVars.ad_flags !== undefined) playerVars.ad_flags = 0;
              if (playerVars.ad_logging_flag !== undefined) playerVars.ad_logging_flag = 0;
              if (playerVars.ad_preroll !== undefined) playerVars.ad_preroll = 0;
              if (playerVars.ad_tag !== undefined) delete playerVars.ad_tag;
              if (playerVars.ad_video_id !== undefined) delete playerVars.ad_video_id;
              if (playerVars.ad3_module !== undefined) delete playerVars.ad3_module;
              if (playerVars.vmap !== undefined) delete playerVars.vmap;
              if (playerVars.plad !== undefined) delete playerVars.plad;
              if (playerVars.instream_long !== undefined) playerVars.instream_long = false;
              // Add other ad params to remove as needed
              console.log('[BlockIt] Removed ad parameters from playerVars');
            }
            // Call the original function with modified playerVars
            return playerApi._loadVideoByPlayerVarsOriginal.call(this, playerVars);
          };
          console.log('[BlockIt] Patched loadVideoByPlayerVars');
        }
        */
        
        // Hijack specific prototype methods if present (less common now)
        try {
          if (window.Yk && window.Yk.prototype && window.Yk.prototype.checkPosition_) {
            if (!window.Yk.prototype._checkPositionOriginal) {
              window.Yk.prototype._checkPositionOriginal = window.Yk.prototype.checkPosition_;
              window.Yk.prototype.checkPosition_ = function() {
                console.log('[BlockIt] Blocked ad checkPosition_ call');
                return false;
              };
              console.log('[BlockIt] Successfully hijacked checkPosition_');
            }
          }
        } catch (e) {
          // console.log('[BlockIt] Could not find or hijack checkPosition_');
        }
        
        // Disable ad-related parts in the player config (if accessible)
        try {
          const playerConfig = window.ytplayer && window.ytplayer.config;
          if (playerConfig && playerConfig.args) {
            const args = playerConfig.args;
            if (args.ad_flags !== '0') args.ad_flags = '0';
            if (args.ad3_module) args.ad3_module = '0';
            if (args.vmap) args.vmap = '';
            if (args.ad_preroll) args.ad_preroll = '0';
            if (args.ad_device) args.ad_device = '0';
            if (args.ad_logging_flag) args.ad_logging_flag = '0';
            if (args.enable_instream_companion) args.enable_instream_companion = '0';
            if (args.instream_ad_player_overlay_instream) args.instream_ad_player_overlay_instream = '0';
            if (args.show_pyv_in_related) args.show_pyv_in_related = 'false';
            console.log('[BlockIt] Updated player config args to disable ads');
          }
        } catch(e) {
           console.warn('[BlockIt] Could not update player config args', e);
        }
             
        console.log('[BlockIt] Player hijacking attempts completed');
      } catch (e) {
        console.error('[BlockIt] Error during player hijacking:', e);
      }
    }, 500);
  }
  
  // Set YouTube config flags to disable ads
  function setConfigFlags() {
    // Define the interval ID outside
    let configInterval;
    
    // Function to set the config
    const setConfig = () => {
      try {
        // Check window.yt object
        if (window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS) {
          const flags = window.yt.config_.EXPERIMENT_FLAGS;
          const currentHTML5Pref = flags.HTML5_PREFER_AD_FREE;
          const currentAdblockDetected = flags.ADBLOCK_DETECTED;
          
          console.log(`[BlockIt] Current HTML5_PREFER_AD_FREE value: ${currentHTML5Pref}`);
          console.log(`[BlockIt] Current ADBLOCK_DETECTED value: ${currentAdblockDetected}`);
          
          // Set flags to disable ads
          flags.ad_tag = false;
          flags.disable_new_pause_state3 = true;
          flags.disable_thumbnail_preloading = true;
          flags.enable_async_ads_request_without_hold = false;
          flags.enable_client_sli_logging = false;
          flags.enable_instream_companion = false;
          flags.enable_live_premieres_ads = false;
          flags.enable_mixer_gemini_formats = false;
          flags.enable_server_stitched_ad = false;
          flags.load_both_vr_apis = false;
          flags.use_new_ad_pagination = false;
          flags.use_new_paid_product_placement = false;
          flags.use_wil_di = false;
          
          // Add premium flags
          flags.web_enable_ad_signals = false;
          flags.web_adblock_detection_enabled = false;
          flags.web_deprecate_service_ajax_map_dependency = true;
          flags.web_forward_command_on_pbj = true;
          flags.web_player_disable_ads_on_ad_channel = true;
          // flags.HTML5_PREFER_AD_FREE = true; // Temporarily disabled
          // flags.ADBLOCK_DETECTED = false; // Temporarily disabled
          
          console.log('[BlockIt] Set YouTube config flags to disable ads');
          
          // Clear the interval once we've successfully set the config
          clearInterval(configInterval);
        }
      } catch (e) {
        console.error('[BlockIt] Error setting config flags:', e);
      }
    };
    
    // Try immediately
    setConfig();
    
    // Also set an interval to catch any reinitialization
    configInterval = setInterval(setConfig, 1000);
    
    // Clear the interval after 10 seconds to avoid unnecessary CPU usage
    setTimeout(() => clearInterval(configInterval), 10000);
  }
  
  // Override YouTube metrics tracking for ads
  function overrideMetrics() {
    // Check if ytcsi exists
    if (window.ytcsi) {
      console.log('[BlockIt] Found ytcsi, overriding tick and info methods');
      
      // Save original functions
      const originalTick = window.ytcsi.tick;
      const originalInfo = window.ytcsi.info;
      
      // Override tick function to suppress ad metrics
      window.ytcsi.tick = function(label, ...args) {
        // Ignore ad-related ticks
        if (label && (
          label.startsWith('ad_') || 
          label.includes('ad') || 
          label.includes('ads') ||
          label === 'vmap' ||
          label === 'adformat'
        )) {
          console.log(`[BlockIt] Suppressed ytcsi.tick: ${label}`);
          return;
        }
        
        // Pass through non-ad metrics
        return originalTick.apply(this, [label, ...args]);
      };
      
      // Override info function to suppress ad info
      window.ytcsi.info = function(label, value, ...args) {
        // Ignore ad-related info
        if (label && (
          label.startsWith('ad_') || 
          label.includes('ad') || 
          label.includes('ads') ||
          label === 'vmap' ||
          label === 'adformat'
        )) {
          console.log(`[BlockIt] Suppressed ytcsi.info: ${label}`);
          return;
        }
        
        // Pass through non-ad info
        return originalInfo.apply(this, [label, value, ...args]);
      };
      
      console.log('[BlockIt] Overrode YouTube metrics tracking for ads');
    } else {
      console.log('[BlockIt] ytcsi not found yet, will try to override later');
      setTimeout(overrideMetrics, 1000); // Try again after 1 second
    }
  }
  
  // Initialize all the blocking methods
  function init() {
    console.log('[BlockIt] Initializing YouTube MAIN world ad blocking');
    
    // Set up ad blocking functions
    interceptNetworkRequests();
    hijackPlayer();
    setConfigFlags();
    overrideMetrics();
    
    // Reset hasRefreshed flag when navigating to a new video
    monitorVideoNavigation();
    
    // Set up more periodic checks for ads (800ms instead of 200ms to reduce load)
    setInterval(() => {
      if (!skipButtonCooldown) {
        skipAds();
      }
    }, 800);
    
    console.log('[BlockIt] YouTube MAIN world ad blocking initialized');
  }
  
  // Monitor for video navigation to reset state
  function monitorVideoNavigation() {
    // Last video ID to detect changes
    let lastVideoId = getVideoId();
    
    // Check periodically for video ID changes
    setInterval(() => {
      const currentVideoId = getVideoId();
      
      if (currentVideoId && currentVideoId !== lastVideoId) {
        console.log(`[BlockIt] Detected navigation to new video: ${currentVideoId}`);
        
        // Reset state for new video
        hasRefreshed = false;
        lastVideoId = currentVideoId;
        
        // Also clear any pending timeouts
        if (refreshCheckTimeout) {
          clearTimeout(refreshCheckTimeout);
          refreshCheckTimeout = null;
        }
        
        if (blockedAdTimeout) {
          clearTimeout(blockedAdTimeout);
          blockedAdTimeout = null;
        }
        
        if (videoPlaybackCheckTimeout) {
          clearTimeout(videoPlaybackCheckTimeout);
          videoPlaybackCheckTimeout = null;
        }
      }
    }, 1000);
  }
  
  // Helper to get current video ID
  function getVideoId() {
    try {
      // Try to extract from URL
      const urlMatch = location.href.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      return urlMatch ? urlMatch[1] : null;
    } catch (e) {
      return null;
    }
  }
  
  // Start initialization
  init();
})(); 