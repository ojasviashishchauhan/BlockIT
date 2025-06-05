// BlockIT Pro - Content Script
// Professional cosmetic filtering and ad blocking

class BlockITContentScript {
    constructor() {
        this.isEnabled = true;
        this.observer = null;
        this.intervalIds = [];
        this.extensionContextValid = true;
        
        this.setupExtensionContextCheck();
        this.setupNetworkMonitoring();
        this.init();
    }
    
    setupExtensionContextCheck() {
        // Monitor extension context validity
        const checkContext = () => {
            if (!chrome.runtime || !chrome.runtime.id) {
                this.extensionContextValid = false;
                this.cleanup();
                return false;
            }
            return true;
        };
        
        // Check context on key operations
        setInterval(() => {
            if (!checkContext()) return;
        }, 5000);
    }
    
    setupNetworkMonitoring() {
        if (!this.extensionContextValid) return;
        
        // Monitor and report blocked requests
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0];
            if (typeof url === 'string' && this.isAdRequest(url)) {
                try {
                    await this.reportNetworkBlock(url);
                } catch (e) {
                    // Continue silently if reporting fails
                }
                throw new Error('Blocked by BlockIT Pro');
            }
            return originalFetch.apply(this, args);
        }.bind(this);
        
        // Monitor XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._blockit_url = url;
            return originalXHROpen.call(this, method, url, ...rest);
        };
        
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...args) {
            if (this._blockit_url && this.isAdRequest(this._blockit_url)) {
                try {
                    this.reportNetworkBlock(this._blockit_url);
                } catch (e) {
                    // Continue silently
                }
                this.abort();
                return;
            }
            return originalXHRSend.apply(this, args);
        }.bind(this);
    }
    
    isAdRequest(url) {
        const adPatterns = [
            'googleads', 'doubleclick', 'googlesyndication',
            'amazon-adsystem', 'facebook.com/tr', 'analytics',
            'googletagmanager', 'google-analytics'
        ];
        return adPatterns.some(pattern => url.includes(pattern));
    }
    
    async reportNetworkBlock(url) {
        if (!this.extensionContextValid) return;
        try {
            await chrome.runtime.sendMessage({
                action: 'networkBlocked',
                count: 1,
                url: url
            });
        } catch (error) {
            this.extensionContextValid = false;
        }
    }
    
    async init() {
        if (!this.extensionContextValid) return;
        
        try {
            // Get initial blocking state
            const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
            if (response) {
                this.isEnabled = response.isEnabled;
            }
            
            if (this.isEnabled) {
                this.startBlocking();
            }
            
            // Listen for toggle messages
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'toggleBlocking') {
                    this.isEnabled = message.enabled;
                    if (this.isEnabled) {
                        this.startBlocking();
                    } else {
                        this.stopBlocking();
                    }
                }
            });
            
        } catch (error) {
            // Silently handle communication errors
        }
    }
    
    startBlocking() {
        if (!this.extensionContextValid) return;
        
        // Apply cosmetic filters
        this.applyCosmeticFilters();
        
        // Set up mutation observer for dynamic content
        this.setupMutationObserver();
        
        // YouTube-specific blocking
        if (window.location.hostname.includes('youtube.com')) {
            this.setupYouTubeBlocking();
        }
        
        // General ad blocking intervals
        this.intervalIds.push(
            setInterval(() => this.applyCosmeticFilters(), 1000),
            setInterval(() => this.hideGenericAds(), 2000)
        );
    }
    
    stopBlocking() {
        // Clear all intervals
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
        
        // Disconnect observer
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
    
    applyCosmeticFilters() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const rules = this.getCosmeticRules();
        let hiddenCount = 0;
        
        rules.forEach(rule => {
            try {
                const elements = document.querySelectorAll(rule);
                elements.forEach(element => {
                    if (element && !element.hasAttribute('blockit-hidden')) {
                        element.style.display = 'none !important';
                        element.setAttribute('blockit-hidden', 'true');
                        hiddenCount++;
                    }
                });
            } catch (e) {
                // Invalid selector, skip
            }
        });
        
        if (hiddenCount > 0) {
            this.reportHiddenElements(hiddenCount);
        }
    }
    
    getCosmeticRules() {
        const genericRules = [
            // Generic ad selectors
            '[id*="ad-"], [class*="ad-"], [id*="ads-"], [class*="ads-"]',
            '[data-ad], [data-ads]',
            '.advertisement, .ads, .banner-ad',
            '#ads, #ad, #advertisement',
            'div[id*="google_ads"]',
            'iframe[src*="ads"], iframe[src*="doubleclick"]'
        ];
        
        const youtubeRules = [
            // YouTube ad selectors
            '.ytd-display-ad-renderer',
            '.ytd-promoted-sparkles-text-search-renderer',
            '.ytd-ad-slot-renderer',
            '.ytp-ad-module',
            '.video-ads',
            '.ytd-banner-promo-renderer',
            '#masthead-ad',
            '.ytd-rich-item-renderer:has([aria-label*="Ad"])',
            
            // Anti-adblock enforcement
            '.ytd-enforcement-message-view-model',
            'tp-yt-paper-dialog:has([id="enforcement-dialog"])',
            '[role="dialog"]:has([class*="enforcement"])',
            
            // Overlay ads
            '.ytp-ad-overlay-container',
            '.ytp-ad-text-overlay',
            '.ytp-ad-player-overlay',
            
            // Promoted content
            '[data-testid="ad-feedback-container"]',
            '[data-testid="banner-shelf"]',
            '.ytd-promoted-video-renderer'
        ];
        
        return window.location.hostname.includes('youtube.com') 
            ? [...genericRules, ...youtubeRules] 
            : genericRules;
    }
    
    setupMutationObserver() {
        if (this.observer || !this.extensionContextValid) return;
        
        this.observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkElementForAds(node);
                        }
                    });
                }
            });
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    checkElementForAds(element) {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const rules = this.getCosmeticRules();
        let hiddenCount = 0;
        
        rules.forEach(rule => {
            try {
                if (element.matches && element.matches(rule)) {
                    element.style.display = 'none !important';
                    element.setAttribute('blockit-hidden', 'true');
                    hiddenCount++;
                }
                
                const childElements = element.querySelectorAll ? element.querySelectorAll(rule) : [];
                childElements.forEach(child => {
                    if (!child.hasAttribute('blockit-hidden')) {
                        child.style.display = 'none !important';
                        child.setAttribute('blockit-hidden', 'true');
                        hiddenCount++;
                    }
                });
            } catch (e) {
                // Invalid selector, skip
            }
        });
        
        if (hiddenCount > 0) {
            this.reportHiddenElements(hiddenCount);
        }
    }
    
    hideGenericAds() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        // Hide elements with ad-related text content
        const adTextPatterns = ['advertisement', 'sponsored', 'promoted'];
        let hiddenCount = 0;
        
        adTextPatterns.forEach(pattern => {
            const elements = document.querySelectorAll(`*:not([blockit-hidden])`);
            elements.forEach(element => {
                if (element.textContent && 
                    element.textContent.toLowerCase().includes(pattern) &&
                    element.offsetHeight > 0) {
                    element.style.display = 'none !important';
                    element.setAttribute('blockit-hidden', 'true');
                    hiddenCount++;
                }
            });
        });
        
        if (hiddenCount > 0) {
            this.reportHiddenElements(hiddenCount);
        }
    }
    
    setupYouTubeBlocking() {
        if (!this.extensionContextValid) return;
        
        // Enhanced YouTube ad blocking
        this.intervalIds.push(
            setInterval(() => this.removeYouTubeAds(), 500),
            setInterval(() => this.removeEnforcementMessages(), 1000),
            setInterval(() => this.removeOverlayAds(), 800),
            setInterval(() => this.autoSkipAds(), 1000),
            setInterval(() => this.blockPremiumPrompts(), 2000)
        );
    }
    
    removeYouTubeAds() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const adSelectors = [
            '.ytd-display-ad-renderer',
            '.ytd-promoted-sparkles-text-search-renderer',
            '.ytd-ad-slot-renderer',
            '.ytp-ad-module',
            '.video-ads',
            '.ytd-banner-promo-renderer',
            '#masthead-ad',
            '.ytd-rich-item-renderer:has([aria-label*="Ad"])'
        ];
        
        let removed = 0;
        adSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (!element.hasAttribute('blockit-hidden')) {
                        element.remove();
                        removed++;
                    }
                });
            } catch (e) {
                // Invalid selector
            }
        });
        
        if (removed > 0) {
            this.reportHiddenElements(removed);
        }
    }
    
    removeEnforcementMessages() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const enforcementSelectors = [
            '.ytd-enforcement-message-view-model',
            'tp-yt-paper-dialog:has([id="enforcement-dialog"])',
            '[role="dialog"]:has([class*="enforcement"])'
        ];
        
        enforcementSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => element.remove());
            } catch (e) {
                // Invalid selector
            }
        });
    }
    
    removeOverlayAds() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const overlaySelectors = [
            '.ytp-ad-overlay-container',
            '.ytp-ad-text-overlay',
            '.ytp-ad-player-overlay'
        ];
        
        overlaySelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.style.display = 'none !important';
            });
        });
    }
    
    autoSkipAds() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const skipSelectors = [
            '.ytp-ad-skip-button',
            '.ytp-skip-ad-button',
            '[class*="skip"][class*="button"]',
            '.videoAdUiSkipButton',
            '.skip-button',
            'button[aria-label*="Skip"]',
            'button[aria-label*="skip"]',
            '.ytp-ad-skip-button-modern'
        ];
        
        skipSelectors.forEach(selector => {
            const skipButton = document.querySelector(selector);
            if (skipButton && skipButton.offsetParent !== null) {
                skipButton.click();
            }
        });
    }
    
    blockPremiumPrompts() {
        if (!this.isEnabled || !this.extensionContextValid) return;
        
        const premiumSelectors = [
            '[aria-label*="Premium"]',
            '[title*="Premium"]',
            '.ytd-mealbar-promo-renderer',
            '.ytd-premium-promo-renderer'
        ];
        
        premiumSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.textContent && element.textContent.includes('Premium')) {
                    element.style.display = 'none !important';
                }
            });
        });
    }
    
    async reportHiddenElements(count) {
        if (!this.extensionContextValid) return;
        
        try {
            await chrome.runtime.sendMessage({
                action: 'elementHidden',
                count: count
            });
        } catch (error) {
            this.extensionContextValid = false;
        }
    }
    
    cleanup() {
        this.stopBlocking();
        
        // Clear all intervals
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
    }
    
    // Message handling
    handleMessage(message, sender, sendResponse) {
        if (!this.extensionContextValid) return;
        
        try {
            switch (message.action) {
                case 'toggleBlocking':
                    this.isEnabled = message.enabled;
                    if (this.isEnabled) {
                        this.startBlocking();
                    } else {
                        this.stopBlocking();
                    }
                    sendResponse({ success: true });
                    break;
                    
                case 'getBlockingState':
                    sendResponse({ isEnabled: this.isEnabled });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            this.extensionContextValid = false;
        }
    }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BlockITContentScript());
} else {
    new BlockITContentScript();
}

// Handle extension context invalidation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (window.blockitContentScript) {
        window.blockitContentScript.handleMessage(message, sender, sendResponse);
    }
    return true;
});

// Store reference for message handling
window.blockitContentScript = new BlockITContentScript();