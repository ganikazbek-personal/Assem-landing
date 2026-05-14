/* =========================================
   MOBILE NAV
   ========================================= */
const hamburger = document.querySelector('.nav-hamburger');
const drawer    = document.getElementById('nav-drawer');
const drawerClose = drawer.querySelector('.nav-drawer-close');
const drawerLinks = drawer.querySelectorAll('a');

hamburger.addEventListener('click', () => {
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  drawerClose.focus();
});

function closeDrawer() {
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

drawerClose.addEventListener('click', closeDrawer);
drawerLinks.forEach(link => link.addEventListener('click', closeDrawer));

// Close on backdrop click
drawer.addEventListener('click', (e) => {
  if (e.target === drawer) closeDrawer();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
});

/* =========================================
   SCROLL REVEAL
   ========================================= */
const revealEls = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

revealEls.forEach(el => revealObserver.observe(el));

/* =========================================
   SCROLLSPY — active nav link
   ========================================= */
const sections  = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-links a');

const spyObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}, {
  threshold: 0.35,
  rootMargin: '-80px 0px -35% 0px'
});

sections.forEach(s => spyObserver.observe(s));

/* =========================================
   STICKY CTA — show after hero, hide near contact
   ========================================= */
const stickyCta  = document.getElementById('sticky-cta');
const heroSection    = document.getElementById('home');
const contactSection = document.getElementById('contact');

if (stickyCta && heroSection && contactSection) {
  const ctaObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.target === heroSection) {
        if (!entry.isIntersecting) {
          stickyCta.classList.add('visible');
          stickyCta.removeAttribute('aria-hidden');
        } else {
          stickyCta.classList.remove('visible');
          stickyCta.setAttribute('aria-hidden', 'true');
        }
      }
      if (entry.target === contactSection && entry.isIntersecting) {
        stickyCta.classList.remove('visible');
        stickyCta.setAttribute('aria-hidden', 'true');
      }
    });
  }, { threshold: 0.1 });

  ctaObserver.observe(heroSection);
  ctaObserver.observe(contactSection);

  // Hide when clicking sticky CTA link (navigates to contact)
  stickyCta.querySelector('a').addEventListener('click', () => {
    stickyCta.classList.remove('visible');
  });
}
