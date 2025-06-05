console.log('[BlockIt] YouTube content script loaded');

// YouTube ad selectors
const youtubeSelectors = [
  // Video player ads
  '.ad-showing',
  '.ytp-ad-module',
  '.ytp-ad-overlay-container',
  '.ytp-ad-overlay-slot',
  '.ytp-ad-progress',
  '.ytp-ad-progress-list',
  'ytd-action-companion-ad-renderer',
  'ytd-player-legacy-desktop-watch-ads-renderer',
  'div[id="player-ads"]',
  '.ytd-video-masthead-ad-v3-renderer',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
  'button[class*="ytp-ad-skip"]',
  
  // Sidebar ads
  'ytd-display-ad-renderer',
  'ytd-promoted-video-renderer',
  'ytd-compact-promoted-video-renderer',
  'ytd-watch-next-secondary-results-renderer ytd-compact-promoted-item-renderer',
  
  // Homepage and feed ads
  'ytd-in-feed-ad-layout-renderer',
  'ytd-ad-slot-renderer',
  'ytd-in-feed-paid-content-ad-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  'ytd-rich-section-renderer[is-compact-layout]',
  
  // New formats for 2024
  'ytd-carousel-ad-renderer',
  'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer',
  'ytd-sponsored-card-renderer',
  
  // Shopping ads
  'ytd-merch-shelf-renderer',
  'ytd-product-details-snapshot-renderer',
  'ytd-product-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-shopping-renderer',
  
  // Premium marketing
  '.ytd-watch-premium-upsell',
  '.ytd-premium-upsell-infographic-renderer',
  '.ytd-premium-upsell-dialogue-renderer',
  'ytd-button-renderer[dialog-title="Premium"]',
  'ytd-mealbar-promo-renderer',
  'ytd-background-promo-renderer',
  'ytd-popup-promo-renderer'
];

// Enhanced skip button selectors (more comprehensive)
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

// Keep track of clicked buttons to avoid endless loops
const clickedButtons = new WeakSet();
let skipButtonCooldown = false;

// Enhanced click function to ensure buttons are properly clicked
function clickSkipButton() {
  let clicked = false;
  
  // If we're in cooldown, don't try to click any buttons
  if (skipButtonCooldown) {
    return false;
  }
  
  SKIP_BUTTON_SELECTORS.forEach(selector => {
    document.querySelectorAll(selector).forEach(button => {
      // Skip if we've already tried to click this button recently
      if (clickedButtons.has(button)) {
        return;
      }
      
      // Check if button is visible and clickable
      const isVisible = button.offsetWidth > 0 && 
                        button.offsetHeight > 0 && 
                        window.getComputedStyle(button).visibility !== 'hidden' &&
                        window.getComputedStyle(button).display !== 'none';
      
      if (isVisible) {
        console.log(`[BlockIt] Found visible skip button matching selector: ${selector}`);
        
        // Set cooldown to prevent rapid clicking
        skipButtonCooldown = true;
        setTimeout(() => { skipButtonCooldown = false; }, 2000); // 2-second cooldown
        
        // Remember this button to avoid clicking it repeatedly
        clickedButtons.add(button);
        
        // Try multiple click methods
        try {
          // Method 1: Native .click()
          button.click();
          console.log('[BlockIt] Clicked skip button using .click()');
          
          // Method 2: Programmatic click event
          try {
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            button.dispatchEvent(clickEvent);
            console.log('[BlockIt] Dispatched click event on skip button');
          } catch (e) {
            console.warn('[BlockIt] Error dispatching click event:', e);
          }
          
          // Also try to click any parent button if this is a span/div
          if (button.tagName.toLowerCase() !== 'button') {
            const parentButton = button.closest('button');
            if (parentButton && !clickedButtons.has(parentButton)) {
              clickedButtons.add(parentButton);
              parentButton.click();
              console.log('[BlockIt] Clicked parent button of skip element');
            }
          }
          
          clicked = true;
        } catch (e) {
          console.error('[BlockIt] Error clicking skip button:', e);
        }
      }
    });
  });
  
  return clicked;
}

// Process ads immediately and on DOM changes
function observeAndRemoveAds() {
  // Hide all ad elements
  let adsFound = false;
  youtubeSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(ad => {
      adsFound = true;
      console.log(`[BlockIt] Hiding ad element: ${selector}`);
      
      // Try to fully remove the ad
      if (ad.parentNode) {
        try {
          ad.parentNode.removeChild(ad);
          console.log(`[BlockIt] Removed ad element from DOM: ${selector}`);
        } catch (e) {
          // If we can't remove it, hide it
          ad.style.display = 'none';
          ad.style.opacity = '0';
          ad.setAttribute('blocked-by-blockit', 'true');
          console.log(`[BlockIt] Hidden ad element: ${selector}`);
        }
      } else {
        // If no parent, just hide it
        ad.style.display = 'none';
        ad.style.opacity = '0';
        ad.setAttribute('blocked-by-blockit', 'true');
      }
    });
  });
  
  // Try to click skip buttons
  const skipClicked = clickSkipButton();
  if (skipClicked) {
    adsFound = true;
  }
  
  // Remove ad-showing class from player element
  const player = document.querySelector('#movie_player');
  if (player && player.classList.contains('ad-showing')) {
    console.log('[BlockIt] Removing ad-showing class from player');
    player.classList.remove('ad-showing');
    player.removeAttribute('ad-showing');
  }
  
  return adsFound;
}

// Initialize the script
function init() {
  console.log('[BlockIt] Initializing YouTube ad blocker');
  
  // Process ads immediately
  const initialAdsFound = observeAndRemoveAds();
  if (initialAdsFound) {
    console.log('[BlockIt] Found and removed initial ads');
  }
  
  // Set up observer for DOM changes
  const observer = new MutationObserver(mutations => {
    // Only process if we're not in cooldown
    if (!skipButtonCooldown) {
      const adsFound = observeAndRemoveAds();
      if (adsFound) {
        console.log('[BlockIt] Found and removed new ads after DOM change');
      }
    }
  });
  
  // Start observing with more specific attribute filtering
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'display', 'visibility'] 
  });
  
  // More frequent checks for skip buttons (800ms instead of 200ms to reduce load)
  setInterval(() => {
    // Only check if not in cooldown
    if (!skipButtonCooldown) {
      const skipClicked = clickSkipButton();
      if (skipClicked) {
        console.log('[BlockIt] Clicked skip button during interval check');
      }
    }
  }, 800);
  
  // Regular check for all other ads (1500ms instead of 1000ms)
  setInterval(() => {
    // Only check if not in cooldown
    if (!skipButtonCooldown) {
      observeAndRemoveAds();
    }
  }, 1500);
  
  console.log('[BlockIt] YouTube ad blocker initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 