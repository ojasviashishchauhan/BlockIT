// BlockIT Pro - Landing Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenuToggle && navLinks) {
        mobileMenuToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            const icon = mobileMenuToggle.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
        });
    }

    // Smooth Scrolling for Anchor Links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Header Scroll Effect
    const header = document.querySelector('.header');
    let lastScrollTop = 0;
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > 100) {
            header.style.background = 'rgba(255, 255, 255, 0.98)';
            header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.background = 'rgba(255, 255, 255, 0.95)';
            header.style.boxShadow = 'none';
        }
        
        lastScrollTop = scrollTop;
    });

    // Animate Elements on Scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-card, .testimonial-card, .step, .platform-card');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Install Button Click Tracking
    const installButtons = document.querySelectorAll('a[href*="chromewebstore.google.com"]');
    installButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Track conversion
            if (typeof gtag !== 'undefined') {
                gtag('event', 'click', {
                    'event_category': 'Extension Install',
                    'event_label': 'Chrome Web Store',
                    'value': 1
                });
            }
            
            // Track in console for development
            console.log('Install button clicked - Chrome Web Store');
            
            // Optional: Show loading state
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening Chrome Web Store...';
            
            setTimeout(() => {
                this.innerHTML = originalText;
            }, 2000);
        });
    });

    // Browser Mockup Interactive Effects
    const browserMockup = document.querySelector('.browser-mockup');
    if (browserMockup) {
        browserMockup.addEventListener('mouseenter', function() {
            this.style.transform = 'perspective(1000px) rotateY(-2deg) rotateX(2deg) scale(1.02)';
        });
        
        browserMockup.addEventListener('mouseleave', function() {
            this.style.transform = 'perspective(1000px) rotateY(-5deg) rotateX(5deg) scale(1)';
        });
    }

    // Play Button Animation
    const playButton = document.querySelector('.play-button');
    if (playButton) {
        playButton.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    this.style.transform = 'scale(1)';
                }, 150);
            }, 100);
        });
    }

    // Feature Cards Hover Effect Enhancement
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            const icon = this.querySelector('.feature-icon');
            if (icon) {
                icon.style.transform = 'scale(1.1) rotate(5deg)';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            const icon = this.querySelector('.feature-icon');
            if (icon) {
                icon.style.transform = 'scale(1) rotate(0deg)';
            }
        });
    });

    // Testimonial Cards Random Animation
    const testimonialCards = document.querySelectorAll('.testimonial-card');
    testimonialCards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 200);
    });

    // Stats Counter Animation
    const stats = document.querySelectorAll('.stat-number');
    const statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const finalValue = target.textContent;
                let currentValue = 0;
                
                if (finalValue.includes('%')) {
                    const numValue = parseFloat(finalValue);
                    const increment = numValue / 50;
                    const timer = setInterval(() => {
                        currentValue += increment;
                        if (currentValue >= numValue) {
                            currentValue = numValue;
                            clearInterval(timer);
                        }
                        target.textContent = currentValue.toFixed(1) + '%';
                    }, 30);
                } else if (finalValue.includes('+')) {
                    const numValue = parseInt(finalValue);
                    const increment = Math.ceil(numValue / 50);
                    const timer = setInterval(() => {
                        currentValue += increment;
                        if (currentValue >= numValue) {
                            currentValue = numValue;
                            clearInterval(timer);
                        }
                        target.textContent = currentValue + '+';
                    }, 30);
                } else if (finalValue.includes('★')) {
                    target.textContent = finalValue; // Keep star rating as is
                }
                
                statsObserver.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => {
        statsObserver.observe(stat);
    });

    // Add Mobile Menu Styles Dynamically
    if (window.innerWidth <= 768) {
        const style = document.createElement('style');
        style.textContent = `
            .nav-links.active {
                display: flex !important;
                flex-direction: column;
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                padding: 20px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                gap: 16px;
            }
            
            .nav-links.active .nav-link {
                padding: 12px 0;
                border-bottom: 1px solid #f3f4f6;
            }
            
            .nav-links.active .cta-button {
                margin-top: 12px;
                justify-content: center;
            }
        `;
        document.head.appendChild(style);
    }

    // Keyboard Navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Close mobile menu if open
            if (navLinks && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                const icon = mobileMenuToggle.querySelector('i');
                icon.classList.add('fa-bars');
                icon.classList.remove('fa-times');
            }
        }
    });

    // Form Validation (if contact forms are added later)
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Basic validation
            const inputs = form.querySelectorAll('input[required], textarea[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = '#ef4444';
                } else {
                    input.style.borderColor = '#10b981';
                }
            });
            
            if (isValid) {
                // Submit form or show success message
                console.log('Form submitted successfully');
            }
        });
    });

    // Performance Monitoring
    if ('performance' in window) {
        window.addEventListener('load', function() {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                console.log('Page Load Time:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
                
                // Track page load time for analytics
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'timing_complete', {
                        'name': 'load',
                        'value': Math.round(perfData.loadEventEnd - perfData.loadEventStart)
                    });
                }
            }, 0);
        });
    }

    // Ad Blocker Detection (Ironic but useful for analytics)
    function detectAdBlocker() {
        const testAd = document.createElement('div');
        testAd.innerHTML = '&nbsp;';
        testAd.className = 'adsbox';
        testAd.style.position = 'absolute';
        testAd.style.left = '-10000px';
        document.body.appendChild(testAd);
        
        setTimeout(() => {
            const isBlocked = testAd.offsetHeight === 0;
            document.body.removeChild(testAd);
            
            if (isBlocked && typeof gtag !== 'undefined') {
                gtag('event', 'ad_blocker_detected', {
                    'event_category': 'User Behavior',
                    'event_label': 'Ad Blocker Active'
                });
            }
        }, 100);
    }

    // Run ad blocker detection
    detectAdBlocker();

    // Easter Egg - Konami Code
    let konamiCode = [];
    const konamiSequence = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA
    
    document.addEventListener('keydown', function(e) {
        konamiCode.push(e.keyCode);
        
        if (konamiCode.length > konamiSequence.length) {
            konamiCode.shift();
        }
        
        if (konamiCode.length === konamiSequence.length) {
            let match = true;
            for (let i = 0; i < konamiSequence.length; i++) {
                if (konamiCode[i] !== konamiSequence[i]) {
                    match = false;
                    break;
                }
            }
            
            if (match) {
                // Easter egg activated!
                document.body.style.filter = 'hue-rotate(180deg)';
                setTimeout(() => {
                    document.body.style.filter = 'none';
                }, 3000);
                console.log('🎉 Easter egg activated! Thanks for trying the Konami code!');
            }
        }
    });

    console.log('🛡️ BlockIT Pro website loaded successfully!');
    console.log('💡 Try the Konami code for a surprise!');
}); 