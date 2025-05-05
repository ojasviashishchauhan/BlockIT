// IPL Sites Content Script
console.log('[BlockIT IPL] Content script loaded');

// Configuration for different streaming platforms
const SITE_CONFIGS = {
    'hotstar.com': {
        adContainerSelectors: [
            '.ad-container',
            '.ad-overlay',
            '[data-testid*="ad"]',
            '[class*="advertisement"]',
            '[id*="sponsor"]'
        ],
        videoAdSelectors: [
            '.vjs-advertisement',
            '.advertisement-overlay',
            '[data-testid="ad-video"]'
        ],
        cleanupSelectors: [
            '[class*="banner"]',
            '[id*="banner"]',
            '[class*="popup"]',
            '[id*="popup"]'
        ]
    },
    'jiocinema.com': {
        adContainerSelectors: [
            '.ad-unit',
            '.ad-container',
            '[data-ad]',
            '[class*="advert"]',
            '[id*="sponsor"]'
        ],
        videoAdSelectors: [
            '.video-ad-overlay',
            '.ad-player-container',
            '[data-player-type="ad"]'
        ],
        cleanupSelectors: [
            '[class*="promotional"]',
            '[class*="sponsor"]',
            '[class*="banner"]'
        ]
    }
};

// Utility function to remove elements
function removeElements(selectors) {
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.remove();
            console.log(`[BlockIT IPL] Removed element: ${selector}`);
        });
    });
}

// Function to handle video player modifications
function handleVideoPlayer() {
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach(video => {
        // Skip ads by monitoring time updates
        video.addEventListener('timeupdate', () => {
            if (video.duration > 0 && video.duration < 45) { // Likely an ad
                video.currentTime = video.duration;
                console.log('[BlockIT IPL] Skipped video ad');
            }
        });

        // Remove autoplay for ads
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    const src = video.getAttribute('src');
                    if (src && (src.includes('ad') || src.includes('sponsor'))) {
                        video.removeAttribute('autoplay');
                        video.pause();
                        console.log('[BlockIT IPL] Prevented ad autoplay');
                    }
                }
            });
        });

        observer.observe(video, {
            attributes: true,
            attributeFilter: ['src']
        });
    });
}

// Function to clean up the page
function cleanupPage(config) {
    // Remove ad containers
    removeElements(config.adContainerSelectors);
    
    // Remove video ads
    removeElements(config.videoAdSelectors);
    
    // Remove other promotional content
    removeElements(config.cleanupSelectors);
    
    // Handle video player
    handleVideoPlayer();
}

// Function to handle dynamic content
function observeDynamicContent(config) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(() => {
            cleanupPage(config);
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Main initialization function
function initialize() {
    const hostname = window.location.hostname;
    const config = Object.entries(SITE_CONFIGS).find(([domain]) => 
        hostname.includes(domain)
    )?.[1];

    if (config) {
        console.log(`[BlockIT IPL] Initializing for ${hostname}`);
        
        // Initial cleanup
        cleanupPage(config);
        
        // Watch for dynamic content
        observeDynamicContent(config);
        
        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const [resource, config] = args;
            
            // Block ad-related requests
            if (typeof resource === 'string' && 
                (resource.includes('ad') || 
                 resource.includes('sponsor') || 
                 resource.includes('analytics'))) {
                console.log(`[BlockIT IPL] Blocked fetch request: ${resource}`);
                return new Response('', { status: 200 });
            }
            
            return originalFetch.apply(window, args);
        };

        // Intercept XHR requests
        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        XHR.open = function(...args) {
            const [method, url] = args;
            
            // Block ad-related XHR requests
            if (url && 
                (url.includes('ad') || 
                 url.includes('sponsor') || 
                 url.includes('analytics'))) {
                console.log(`[BlockIT IPL] Blocked XHR request: ${url}`);
                return;
            }
            
            return open.apply(this, args);
        };
    }
}

// Start the script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 