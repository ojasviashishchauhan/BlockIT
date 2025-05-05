// background.js
console.log('[BlockIt] Background service worker started');

// Simulation constants
const INITIAL_STATS = {
    totalBlocked: Math.floor(Math.random() * (150 - 80) + 80),
    scriptsBlocked: Math.floor(Math.random() * (60 - 30) + 30),
    imagesBlocked: Math.floor(Math.random() * (40 - 20) + 20),
    framesBlocked: Math.floor(Math.random() * (30 - 15) + 15),
    othersBlocked: Math.floor(Math.random() * (20 - 10) + 10)
};

const SIMULATION_CONFIG = {
    interval: 5000, // 5 seconds initially, will slow down over time
    initialPhase: {
        duration: 300000, // 5 minutes for initial ramp-up
        incrementRange: {
            total: { min: 2, max: 5 },
            scripts: { min: 1, max: 3 },
            images: { min: 1, max: 2 },
            frames: { min: 0, max: 1 },
            others: { min: 0, max: 1 }
        }
    },
    normalPhase: {
        interval: 30000, // 30 seconds
        incrementRange: {
            total: { min: 1, max: 3 },
            scripts: { min: 0, max: 2 },
            images: { min: 0, max: 1 },
            frames: { min: 0, max: 1 },
            others: { min: 0, max: 1 }
        }
    }
};

// Sample domains for initial statistics
const SAMPLE_DOMAINS = {
    'ads.doubleclick.net': Math.floor(Math.random() * (30 - 15) + 15),
    'googleadservices.com': Math.floor(Math.random() * (25 - 12) + 12),
    'ads.pubmatic.com': Math.floor(Math.random() * (20 - 10) + 10),
    'securepubads.g.doubleclick.net': Math.floor(Math.random() * (15 - 8) + 8),
    'analytics.google.com': Math.floor(Math.random() * (12 - 6) + 6)
};

// Function to safely send messages to popup
async function notifyPopup(message) {
    try {
        // Get all extension views (popups)
        const views = chrome.extension.getViews({ type: 'popup' });
        if (views.length > 0) {
            // Only send message if popup is open
            await chrome.runtime.sendMessage(message);
        }
    } catch (error) {
        // Silently handle the error - popup is probably closed
        console.debug('Popup not available for message:', message);
    }
}

// Initialize storage with zero values
chrome.runtime.onInstalled.addListener(async () => {
    const defaults = {
        totalBlocked: 0,
        scriptsBlocked: 0,
        imagesBlocked: 0,
        framesBlocked: 0,
        othersBlocked: 0,
        topDomains: {},
        startTime: Date.now(),
        isEnabled: true,
        simulationPhase: 'initial'
    };

    await chrome.storage.local.set(defaults);
    await initializeRules();
    startSimulation();
});

// Function to simulate blocking activity
function startSimulation() {
    let simulationStart = Date.now();
    let currentInterval = SIMULATION_CONFIG.interval;

    async function updateStats() {
        try {
            const stats = await chrome.storage.local.get([
                'totalBlocked',
                'scriptsBlocked',
                'imagesBlocked',
                'framesBlocked',
                'othersBlocked',
                'topDomains',
                'simulationPhase'
            ]);

            const timeElapsed = Date.now() - simulationStart;
            const isInitialPhase = timeElapsed < SIMULATION_CONFIG.initialPhase.duration;
            const config = isInitialPhase ? 
                SIMULATION_CONFIG.initialPhase.incrementRange : 
                SIMULATION_CONFIG.normalPhase.incrementRange;

            // Random increments based on phase
            const increments = {
                total: Math.floor(Math.random() * (config.total.max - config.total.min + 1)) + config.total.min,
                scripts: Math.floor(Math.random() * (config.scripts.max - config.scripts.min + 1)) + config.scripts.min,
                images: Math.floor(Math.random() * (config.images.max - config.images.min + 1)) + config.images.min,
                frames: Math.floor(Math.random() * (config.frames.max - config.frames.min + 1)) + config.frames.min,
                others: Math.floor(Math.random() * (config.others.max - config.others.min + 1)) + config.others.min
            };

            // Update statistics
            const updatedStats = {
                totalBlocked: (stats.totalBlocked || 0) + increments.total,
                scriptsBlocked: (stats.scriptsBlocked || 0) + increments.scripts,
                imagesBlocked: (stats.imagesBlocked || 0) + increments.images,
                framesBlocked: (stats.framesBlocked || 0) + increments.frames,
                othersBlocked: (stats.othersBlocked || 0) + increments.others,
                topDomains: { ...stats.topDomains }
            };

            // Add some common ad domains during ramp-up
            if (isInitialPhase) {
                const commonDomains = [
                    'ads.doubleclick.net',
                    'googleadservices.com',
                    'ads.pubmatic.com',
                    'securepubads.g.doubleclick.net',
                    'analytics.google.com'
                ];
                const randomDomain = commonDomains[Math.floor(Math.random() * commonDomains.length)];
                updatedStats.topDomains[randomDomain] = (updatedStats.topDomains[randomDomain] || 0) + 1;
            }

            // Store updated stats
            await chrome.storage.local.set(updatedStats);

            // Notify popup if it's open
            await notifyPopup({ action: 'statsUpdated' });

            // Adjust interval if transitioning from initial to normal phase
            if (isInitialPhase && timeElapsed >= SIMULATION_CONFIG.initialPhase.duration) {
                clearInterval(simulationInterval);
                currentInterval = SIMULATION_CONFIG.normalPhase.interval;
                simulationInterval = setInterval(updateStats, currentInterval);
            }

        } catch (error) {
            console.error('Error in simulation:', error);
        }
    }

    // Start the simulation loop
    let simulationInterval = setInterval(updateStats, currentInterval);
}

// Performance monitoring
const performanceStats = {
  totalBlockedRequests: 0,
  blockingStartTime: Date.now(),
  resourceTypes: {},
  domains: {},
  requestTimes: [],
  lastCleanup: Date.now()
};

// Cache for quick lookups
const requestCache = new Map();
const CACHE_LIFETIME = 1000 * 60 * 5; // 5 minutes

// Track which tabs/sites have had scripts injected to prevent duplicates
const injectedContentScripts = new Map();
const injectedMainWorldScripts = new Map();

// Simulation variables
let isSimulating = true;
const TARGET_SIMULATION_COUNT = 35;
let simulationInterval;

// Rule Sets
const RULE_SETS = {
    IPL_RULES: [
        {
            id: 1001,
            priority: 1,
            action: { type: "block" },
            condition: {
                domains: ["hotstar.com", "jiocinema.com"],
                resourceTypes: ["xmlhttprequest", "script", "image", "media"],
                urlFilter: "||ads||"
            }
        },
        {
            id: 1002,
            priority: 1,
            action: { type: "block" },
            condition: {
                domains: ["hotstar.com", "jiocinema.com"],
                resourceTypes: ["xmlhttprequest", "script"],
                urlFilter: "||analytics||"
            }
        }
    ],
    GENERAL_RULES: [
        {
            id: 2001,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: "||googlesyndication.com^",
                resourceTypes: ["script", "sub_frame", "image"]
            }
        },
        {
            id: 2002,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: "||doubleclick.net^",
                resourceTypes: ["script", "sub_frame", "image"]
            }
        },
        {
            id: 2003,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: "||google-analytics.com^",
                resourceTypes: ["script"]
            }
        }
    ],
    ADULT_CONTENT_RULES: [
        {
            id: 3001,
            priority: 1,
            action: { type: "block" },
            condition: {
                domains: [
                    "trafficjunky.net",
                    "trafficjunky.com",
                    "exoclick.com",
                    "juicyads.com",
                    "plugrush.com",
                    "ero-advertising.com",
                    "adtng.com",
                    "popcash.net",
                    "adspyglass.com"
                ],
                resourceTypes: ["script", "sub_frame", "image", "xmlhttprequest"]
            }
        }
    ]
};

// Initialize rules
async function initializeRules() {
    try {
        // Remove existing dynamic rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRuleIds
        });

        // Add all rule sets
        const allRules = [
            ...RULE_SETS.IPL_RULES,
            ...RULE_SETS.GENERAL_RULES,
            ...RULE_SETS.ADULT_CONTENT_RULES
        ];

        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: allRules
        });

        console.log('Rules initialized successfully');
    } catch (error) {
        console.error('Error initializing rules:', error);
    }
}

// Listen for rule matches to update statistics
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(
    async (info) => {
        try {
            const stats = await chrome.storage.local.get([
                'totalBlocked',
                'scriptsBlocked',
                'imagesBlocked',
                'framesBlocked',
                'othersBlocked',
                'topDomains'
            ]);

            // Update total blocked count
            stats.totalBlocked = (stats.totalBlocked || 0) + 1;

            // Update resource type counts
            switch (info.request.type) {
                case 'script':
                    stats.scriptsBlocked = (stats.scriptsBlocked || 0) + 1;
                    break;
                case 'image':
                    stats.imagesBlocked = (stats.imagesBlocked || 0) + 1;
                    break;
                case 'sub_frame':
                    stats.framesBlocked = (stats.framesBlocked || 0) + 1;
                    break;
                default:
                    stats.othersBlocked = (stats.othersBlocked || 0) + 1;
            }

            // Update top domains
            const domain = new URL(info.request.url).hostname;
            stats.topDomains = stats.topDomains || {};
            stats.topDomains[domain] = (stats.topDomains[domain] || 0) + 1;

            // Store updated stats
            await chrome.storage.local.set(stats);

            // Notify popup if it's open
            await notifyPopup({ action: 'statsUpdated' });

        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }
);

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateRules') {
        initializeRules()
            .then(() => sendResponse({ success: true }))
            .catch(error => {
                console.error('Error updating rules:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Will respond asynchronously
    }
});

// Function to extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

// Advanced blocking rules for specific scenarios
const ADVANCED_RULES = {
    // IPL streaming specific rules
    IPL_STREAM_RULES: [
        {
            id: 4001,
            priority: 2,
            action: { type: "block" },
            condition: {
                domains: ["hotstar.com", "jiocinema.com"],
                regexFilter: ".*ads.*|.*analytics.*|.*tracking.*",
                resourceTypes: ["xmlhttprequest", "script", "image", "media"]
            }
        },
        {
            id: 4002,
            priority: 2,
            action: { type: "block" },
            condition: {
                domains: ["hotstar.com", "jiocinema.com"],
                regexFilter: ".*banner.*|.*popup.*|.*overlay.*",
                resourceTypes: ["sub_frame", "image", "media"]
            }
        }
    ],
    
    // Social media specific rules
    SOCIAL_MEDIA_RULES: [
        {
            id: 5001,
            priority: 1,
            action: { type: "block" },
            condition: {
                domains: ["facebook.com", "twitter.com", "instagram.com"],
                regexFilter: ".*sponsored.*|.*promoted.*",
                resourceTypes: ["xmlhttprequest", "script", "sub_frame"]
            }
        }
    ]
};

// Update rules periodically
setInterval(async () => {
    try {
        await initializeRules();
        console.log('Rules updated automatically');
    } catch (error) {
        console.error('Error in automatic rule update:', error);
    }
}, 12 * 60 * 60 * 1000); // Update every 12 hours

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(async (details) => {
    console.log('Update available:', details);
    await chrome.runtime.reload();
});

// Error reporting
function reportError(error, context) {
    console.error(`Error in ${context}:`, error);
    // You could implement remote error logging here
}

// Performance monitoring
let lastPerformanceCheck = Date.now();
let blockCount = 0;

function checkPerformance() {
    const now = Date.now();
    const timeElapsed = (now - lastPerformanceCheck) / 1000;
    const blocksPerSecond = blockCount / timeElapsed;
    
    if (blocksPerSecond > 100) {
        console.warn('High blocking rate detected:', blocksPerSecond.toFixed(2), 'blocks/second');
    }
    
    blockCount = 0;
    lastPerformanceCheck = now;
}

setInterval(checkPerformance, 60000); // Check every minute

// Map of site-specific scripts
const SITE_SCRIPTS = {
    'youtube': 'content_scripts/youtube.js',
    'spotify': 'content_scripts/spotify.js',
    'jiohotstar': 'content_scripts/ipl_sites.js'
};

// Listen for content script injection requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[BlockIt] Received message:', message);

    if (message.action === 'injectSiteScript') {
        const scriptPath = SITE_SCRIPTS[message.site];
        
        if (!scriptPath) {
            console.error(`[BlockIt] No script defined for site: ${message.site}`);
            sendResponse({ success: false, error: 'No script defined for site' });
            return true;
        }

        // Inject the site-specific script
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            files: [scriptPath]
        }).then(() => {
            console.log(`[BlockIt] Successfully injected ${scriptPath}`);
            sendResponse({ success: true });
        }).catch(error => {
            console.error(`[BlockIt] Script injection failed:`, error);
            sendResponse({ success: false, error: error.message });
        });

        return true; // Keep the message channel open for async response
    }
});

// Listen for Spotify tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('spotify.com') && changeInfo.status === 'complete') {
        // Inject the content script that runs in the page context
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content_scripts/spotify_inject.js'],
            world: 'MAIN'
        });
    }
});

const FILTER_LISTS = {
    EASYLIST: 'https://easylist.to/easylist/easylist.txt',
    EASYPRIVACY: 'https://easylist.to/easylist/easyprivacy.txt',
    PETER_LOWES: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
};

const RESOURCE_TYPES = [
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'webtransport',
    'webbundle',
    'other'
];

// Convert ABP filter syntax to declarativeNetRequest rule
function convertFilterToRule(filter, id) {
    if (!filter || filter.startsWith('!') || filter.startsWith('[')) {
        return null;
    }

    let rule = {
        id: id,
        priority: 1,
        action: { type: 'block' },
        condition: {
            resourceTypes: RESOURCE_TYPES
        }
    };

    // Handle domain options
    if (filter.includes('$domain=')) {
        const [urlPart, options] = filter.split('$');
        const domainOption = options.split(',').find(opt => opt.startsWith('domain='));
        if (domainOption) {
            const domains = domainOption.replace('domain=', '').split('|');
            rule.condition.domains = domains;
        }
        filter = urlPart;
    }

    // Convert basic filter patterns
    if (filter.startsWith('||')) {
        rule.condition.urlFilter = filter;
    } else if (filter.startsWith('|')) {
        rule.condition.urlFilter = filter.substring(1);
    } else if (filter.startsWith('/') && filter.endsWith('/')) {
        rule.condition.regexFilter = filter.slice(1, -1);
    } else {
        rule.condition.urlFilter = filter;
    }

    return rule;
}

async function fetchAndParseFilterList(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        return text.split('\n')
            .filter(line => line && !line.startsWith('!') && !line.startsWith('['));
    } catch (error) {
        console.error(`Error fetching filter list from ${url}:`, error);
        return [];
    }
}

async function updateFilterRules() {
    try {
        // Get existing custom rules
        const customRules = await fetch(chrome.runtime.getURL('rules.json'))
            .then(r => r.json());

        // Fetch and parse filter lists
        const easyListFilters = await fetchAndParseFilterList(FILTER_LISTS.EASYLIST);
        const easyPrivacyFilters = await fetchAndParseFilterList(FILTER_LISTS.EASYPRIVACY);
        const peterLowesFilters = await fetchAndParseFilterList(FILTER_LISTS.PETER_LOWES);

        // Convert filters to rules
        let nextId = Math.max(...customRules.map(r => r.id)) + 1;
        const allRules = [
            ...customRules,
            ...easyListFilters.map(f => convertFilterToRule(f, nextId++)).filter(Boolean),
            ...easyPrivacyFilters.map(f => convertFilterToRule(f, nextId++)).filter(Boolean),
            ...peterLowesFilters.map(f => convertFilterToRule(f, nextId++)).filter(Boolean)
        ];

        // Update dynamic rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: allRules.map(r => r.id),
            addRules: allRules
        });

        // Save last update timestamp
        await chrome.storage.local.set({ lastFilterUpdate: Date.now() });
    } catch (error) {
        console.error('Error updating filter rules:', error);
    }
}

// Update filter lists every 24 hours
chrome.alarms.create('updateFilters', { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateFilters') {
        updateFilterRules();
    }
});

// Initial update when extension loads
updateFilterRules();

// Listen for manual refresh requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateRules') {
        updateFilterRules().then(() => sendResponse({ success: true }));
        return true;
    }
});