/**
 * onboarding.js — first-time-user welcome + guided tour.
 *
 * Two parts, built differently on purpose:
 *   1. Welcome overlay — fully custom (matches the app's own glass/
 *      neural-orb visual language, which a generic library wouldn't).
 *   2. Guided tour — Driver.js (the brief's preferred library),
 *      themed to match via custom popover classes rather than its
 *      default look.
 *
 * All tour steps target elements that live on dashboard.html (sidebar
 * links, quick actions, profile card, header search/bell). Since
 * SmartVentory is a real multi-page app with no client-side router,
 * the tour deliberately never navigates away mid-tour — every step
 * highlights something without actually following its link, so the
 * tour doesn't get interrupted by a real page load.
 *
 * Storage: localStorage 'sv_onboarding_completed' (not sessionStorage
 * — this should stay dismissed across future logins, not just this
 * tab session). Set on completing OR skipping, since both mean "don't
 * show this automatically again" — a person can always restart it via
 * the header's help button.
 */

import { addNotification } from './notifications.js';

const COMPLETED_KEY = 'sv_onboarding_completed';
const RESTART_REQUEST_KEY = 'sv_tour_requested';

function isFirstTime() {
  return !localStorage.getItem(COMPLETED_KEY);
}

function markCompleted() {
  localStorage.setItem(COMPLETED_KEY, 'true');
}

/** Steps only exist meaningfully on dashboard.html (sidebar/quick
 * actions/profile card are all there). If "Restart Tour" is clicked
 * from another page, this flags the request and sends the person to
 * the dashboard, where it auto-starts. */
function requestTourFromAnyPage() {
  if (window.location.pathname.endsWith('dashboard.html')) {
    startTour();
  } else {
    sessionStorage.setItem(RESTART_REQUEST_KEY, 'true');
    window.location.href = 'dashboard.html';
  }
}

function consumeTourRequestFlag() {
  const requested = sessionStorage.getItem(RESTART_REQUEST_KEY);
  sessionStorage.removeItem(RESTART_REQUEST_KEY);
  return requested === 'true';
}

// ============================================================
// Welcome overlay (custom-built, not Driver.js)
// ============================================================

function showWelcomeOverlay(onStart, onSkip) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-welcome';
  overlay.innerHTML = `
    <div class="onboarding-welcome__card">
      <div class="onboarding-welcome__orb">
        <div class="neural-orb neural-orb--sm">
          <div class="neural-orb__ring"></div>
          <div class="neural-orb__ring"></div>
          <div class="neural-orb__core"></div>
          <div class="neural-orb__node"></div>
          <div class="neural-orb__node"></div>
        </div>
      </div>
      <h2>Welcome to SmartVentory AI</h2>
      <p>Your intelligent inventory assistant is now ready. We'll take less than two minutes to introduce you to everything you need.</p>
      <div class="onboarding-welcome__actions">
        <button class="btn btn-secondary" id="onboarding-skip">Skip</button>
        <button class="btn btn-primary" id="onboarding-start">Start Tour</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('onboarding-welcome--visible'));

  function close() {
    overlay.classList.remove('onboarding-welcome--visible');
    setTimeout(() => overlay.remove(), 220);
  }

  overlay.querySelector('#onboarding-start').addEventListener('click', () => { close(); onStart(); });
  overlay.querySelector('#onboarding-skip').addEventListener('click', () => { close(); onSkip(); });
}

// ============================================================
// Guided tour (Driver.js)
// ============================================================

/** Conversational copy, per the brief's "AI Assistant Personality"
 * section — describes what a section IS for, not "click here". Each
 * entry's `element` is a CSS selector resolved at tour-start time
 * (after mountLayout has injected the sidebar/header), so a missing
 * element (e.g. a Staff user without some access) just gets skipped
 * rather than breaking the tour. */
function tourSteps() {
  const steps = [
    { element: '.hero-command', title: 'Your Command Center', description: "This is where SmartVentory AI keeps you oriented — the time, your AI status, and a live pulse on how the business is doing right now." },
    { element: 'a[href="products.html"]', title: 'Products', description: 'Every product your business sells starts here — names, prices, and which supplier and category each one belongs to.' },
    { element: 'a[href="inventory.html"]', title: 'Inventory', description: "This shows what's actually on your shelves right now. It's read-only on purpose — stock only ever changes through a real Purchase or Sale, so there's always a trail of why a number moved." },
    { element: 'a[href="categories.html"]', title: 'Categories', description: 'A simple way to group related products together, so reports and browsing stay organized as your catalog grows.' },
    { element: 'a[href="suppliers.html"]', title: 'Suppliers', description: 'The businesses you buy stock from. Every product points back to one of these.' },
    { element: 'a[href="units.html"]', title: 'Units', description: 'How each product is measured — pieces, kilograms, boxes, whatever fits your business.' },
    { element: 'a[href="purchases.html"]', title: 'Purchases', description: "Record stock coming in from a supplier. This is what actually increases what's on your shelves." },
    { element: 'a[href="sales.html"]', title: 'Sales', description: 'Record stock going out to a customer. This is what decreases your inventory and drives your revenue numbers.' },
    { element: 'a[href="reports.html"]', title: 'Reports', description: 'Deeper analysis over any date range you choose — sales, purchases, top products, and inventory value, all exportable.' },
    { element: 'a[href="ai-insights.html"]', title: 'AI Insights', description: "Ask the AI to look closely at a specific product and suggest what to do about it — this is where SmartVentory's intelligence really shows up." },
    { element: 'a[href="settings.html"]', title: 'Settings', description: 'Admin-only — this is where your team gets managed: who has access, and what role they hold.' },
    { element: '.quick-actions', title: 'Quick Actions', description: "The fastest path to your most common tasks, right from the dashboard — no digging through menus." },
    { element: '#profile-card-wrap', title: 'Your Profile', description: "A quick summary of who you're logged in as, your role, and when this session started." },
    { element: '#notification-bell-btn', title: 'Notification Center', description: "SmartVentory quietly tracks what's happening — sales, purchases, low stock — and surfaces it here." },
    { element: '#header-search-input', title: 'Search', description: "Jump straight to a product from anywhere in the app. Press Ctrl+K any time to get here instantly." },
  ];
  // Only include steps whose target actually exists on the page right
  // now — e.g. a Staff user's sidebar still has every link (Settings
  // included, per how the sidebar is built), so in practice this
  // mostly guards against future/edge-case DOM changes rather than
  // role differences today.
  return steps.filter((s) => document.querySelector(s.element));
}

function startTour() {
  if (typeof window.driver === 'undefined') {
    // Driver.js failed to load (CDN blocked/offline) — the welcome
    // overlay already showed useful info, so degrade quietly rather
    // than blocking the person from using the app.
    markCompleted();
    return;
  }

  const { driver } = window.driver.js;
  const steps = tourSteps().map((s) => ({
    element: s.element,
    popover: {
      title: s.title,
      description: s.description,
      popoverClass: 'sv-onboarding-popover',
    },
  }));

  const tourDriver = driver({
    showProgress: true,
    animate: true,
    popoverClass: 'sv-onboarding-popover',
    steps,
    onDestroyStarted: () => {
      // Fires for BOTH "Finish" on the last step and clicking the
      // overlay's close (x) mid-tour — either way, it means the
      // person is done, whether or not they saw every step.
      tourDriver.destroy();
      finishTour();
    },
  });

  tourDriver.drive();
}

function finishTour() {
  markCompleted();
  addNotification({
    type: 'tour_completed',
    title: "You're ready",
    description: 'SmartVentory AI will continue assisting you as you work.',
  });
}

/**
 * Call once from dashboard.js's init(), after mountLayout has finished
 * (so sidebar/header elements actually exist for the tour to target).
 */
function initOnboarding() {
  if (consumeTourRequestFlag()) {
    startTour();
    return;
  }
  if (isFirstTime()) {
    showWelcomeOverlay(
      () => startTour(),
      () => markCompleted()
    );
  }
}

export { initOnboarding, requestTourFromAnyPage };
