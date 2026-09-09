/**
 * layout.js — shared app shell (sidebar + header) for every authenticated
 * page. No templating engine exists in this vanilla-JS/no-build-step
 * project, so instead of duplicating sidebar/header markup across 11
 * HTML files, each page has empty <aside id="sidebar-root"> and
 * <header id="header-root"> containers, and this module fills them in.
 *
 * Icon set: no icon library was chosen yet as of the handover (Section
 * 14). Decision made here: a small hand-built inline SVG set (stroke-
 * based, 20x20, currentColor) — self-contained, zero external requests,
 * respects the "no frameworks" constraint better than a JS icon
 * component library would.
 *
 * Usage, at the bottom of every protected page:
 *   import { mountLayout } from './js/layout.js';
 *   mountLayout({ activePage: 'dashboard' });
 */

import { requireAuth, logout } from './auth.js';
import { api } from './api.js';
import { addNotification, getAll as getAllNotifications, markAllRead, clearAll, getUnreadCount, iconFor, relativeTime } from './notifications.js';
import { requestTourFromAnyPage } from './onboarding.js';

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  products: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 3v18M4 7.5l8 4.5 8-4.5"/>',
  inventory: '<path d="M4 7 12 3l8 4-8 4-8-4Z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4" />',
  categories: '<path d="M12.5 3H4v8.5L13.5 21 21 13.5 12.5 3Z"/><circle cx="8" cy="8" r="1.5"/>',
  units: '<path d="M4 16V8l8-4 8 4v8l-8 4-8-4Z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  suppliers: '<rect x="2" y="7" width="13" height="9" rx="1"/><path d="M15 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
  purchases: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 7H6"/><path d="M12 8v5m-2.2-2.2L12 13l2.2-2.2"/>',
  sales: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 7H6"/><path d="M12 13V8m-2.2 2.2L12 8l2.2 2.2"/>',
  reports: '<path d="M4 20V10M11 20V4M18 20v-7"/>',
  ai: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/><circle cx="12" cy="12" r="2.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.4"/><path d="M12 17h.01"/>',
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard', hint: 'Your business at a glance.' },
  { key: 'products', label: 'Products', href: 'products.html', icon: 'products', hint: 'Manage your product catalogue.' },
  { key: 'inventory', label: 'Inventory', href: 'inventory.html', icon: 'inventory', hint: 'Track stock levels in real time.' },
  { key: 'categories', label: 'Categories', href: 'categories.html', icon: 'categories', hint: 'Organize products into groups.' },
  { key: 'suppliers', label: 'Suppliers', href: 'suppliers.html', icon: 'suppliers', hint: 'Who you buy stock from.' },
  { key: 'units', label: 'Units', href: 'units.html', icon: 'units', hint: 'How your products are measured.' },
  { key: 'purchases', label: 'Purchases', href: 'purchases.html', icon: 'purchases', hint: 'Record stock coming in.' },
  { key: 'sales', label: 'Sales', href: 'sales.html', icon: 'sales', hint: 'Record stock going out.' },
  { key: 'reports', label: 'Reports', href: 'reports.html', icon: 'reports', hint: 'View business analytics.' },
  { key: 'ai-insights', label: 'AI Insights', href: 'ai-insights.html', icon: 'ai', hint: 'Generate intelligent recommendations.' },
];

// Settings is Admin-only (it's the user-management screen) — shown to
// everyone in the sidebar but the page itself redirects Staff users
// away, same enforcement pattern as every other Admin-only action.
const SETTINGS_ITEM = { key: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings', hint: 'Configure your workspace.' };
const LOGOUT_HINT = 'Sign out of SmartVentory.';

function sidebarHTML(activePage) {
  const items = NAV_ITEMS.map(
    (item) => `
      <a class="nav-item ${item.key === activePage ? 'nav-item--active' : ''}" href="${item.href}" data-tip-label="${item.label}" data-tip-hint="${item.hint}">
        <span class="nav-item__icon">${icon(item.icon)}</span>
        <span class="nav-item__label">${item.label}</span>
      </a>`
  ).join('');

  return `
    <div class="sidebar__brand">
      <span class="sidebar__brand-dot"></span>
      <span class="sidebar__brand-name">SmartVentory</span>
    </div>
    <nav class="sidebar__nav">${items}</nav>
    <div class="sidebar__footer">
      <a class="nav-item ${activePage === 'settings' ? 'nav-item--active' : ''}" href="${SETTINGS_ITEM.href}" data-tip-label="${SETTINGS_ITEM.label}" data-tip-hint="${SETTINGS_ITEM.hint}">
        <span class="nav-item__icon">${icon(SETTINGS_ITEM.icon)}</span>
        <span class="nav-item__label">${SETTINGS_ITEM.label}</span>
      </a>
      <button class="nav-item nav-item--button" id="logout-btn" type="button" data-tip-label="Logout" data-tip-hint="${LOGOUT_HINT}">
        <span class="nav-item__icon">${icon('logout')}</span>
        <span class="nav-item__label">Logout</span>
      </button>
    </div>
    <button class="sidebar__collapse-toggle" id="sidebar-collapse-toggle" type="button" aria-label="Collapse sidebar">
      ${icon('chevron', 16)}
    </button>`;
}

function headerHTML(pageTitle) {
  return `
    <h1 class="header__title">${pageTitle}</h1>
    <div class="header__search">
      ${icon('search', 16)}
      <input type="text" id="header-search-input" placeholder="Search products, suppliers, purchases, reports…" />
      <kbd class="header__search-kbd">Ctrl K</kbd>
    </div>
    <div class="header__actions">
      <button class="header__icon-btn" type="button" id="restart-tour-btn" title="Restart guided tour">
        ${icon('help', 18)}
      </button>
      <div class="notification-bell-wrap">
        <button class="header__icon-btn" type="button" id="notification-bell-btn" title="Notifications" aria-haspopup="true" aria-expanded="false">
          ${icon('bell', 18)}
          <span class="notification-badge" id="notification-badge" hidden>0</span>
        </button>
      </div>
      <div class="header__user">
        <span class="header__user-avatar" id="header-user-initials">–</span>
        <span class="header__user-name" id="header-user-name">Loading…</span>
      </div>
    </div>`;
}

/**
 * Injects the sidebar and header into #sidebar-root / #header-root,
 * wires up collapse toggle + logout, and fetches the current user for
 * the header's name/initials. Call once, at the top of each protected
 * page's own script.
 *
 * @param {object} opts
 * @param {string} opts.activePage - one of NAV_ITEMS' `key` values
 * @param {string} [opts.pageTitle] - defaults to the matching nav label
 * @returns {Promise<object>} the current user (from GET /auth/me)
 */
async function mountLayout({ activePage, pageTitle }) {
  if (!requireAuth()) {
    // requireAuth() already redirected to login.html.
    return null;
  }

  const sidebarRoot = document.getElementById('sidebar-root');
  const headerRoot = document.getElementById('header-root');
  const title = pageTitle || NAV_ITEMS.find((i) => i.key === activePage)?.label || '';

  if (sidebarRoot) sidebarRoot.innerHTML = sidebarHTML(activePage);
  if (headerRoot) headerRoot.innerHTML = headerHTML(title);

  document.getElementById('logout-btn')?.addEventListener('click', () => logout());

  const searchInput = document.getElementById('header-search-input');
  if (searchInput) {
    // Prefill from the URL if we're already on Products via a header
    // search redirect, so the box reflects what's actually filtered.
    const currentParams = new URLSearchParams(window.location.search);
    if (activePage === 'products' && currentParams.get('search')) {
      searchInput.value = currentParams.get('search');
    }

    // Ctrl/Cmd+K focuses search from anywhere on the page — a Linear/
    // Raycast-style shortcut, not just decoration on the badge.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const query = searchInput.value.trim();
      if (!query) return;
      if (activePage === 'products') {
        // Already there — let products.js's own search box handle it
        // live rather than reloading the page.
        document.getElementById('products-search')?.dispatchEvent(new Event('input'));
        document.getElementById('products-search').value = query;
        document.getElementById('products-search').dispatchEvent(new Event('input'));
      } else {
        window.location.href = `products.html?search=${encodeURIComponent(query)}`;
      }
    });
  }

  const collapseToggle = document.getElementById('sidebar-collapse-toggle');
  const shell = document.querySelector('.app-shell');
  collapseToggle?.addEventListener('click', () => {
    shell?.classList.toggle('app-shell--collapsed');
  });

  mountSidebarTooltips(sidebarRoot, shell);
  mountPageTransitions(sidebarRoot);
  mountNotificationBell();

  document.getElementById('restart-tour-btn')?.addEventListener('click', () => requestTourFromAnyPage());

  let user = null;
  try {
    user = await api.me();
    const nameEl = document.getElementById('header-user-name');
    const initialsEl = document.getElementById('header-user-initials');
    if (nameEl) nameEl.textContent = `${user.first_name} ${user.last_name}`;
    if (initialsEl) initialsEl.textContent = (user.first_name[0] + user.last_name[0]).toUpperCase();
  } catch (err) {
    // A failed /auth/me here almost always means an expired/invalid
    // token — api.js already dispatched 'sv:unauthorized' and auth.js's
    // listener will log out and redirect, so nothing further to do here.
  }

  return user;
}

/**
 * Custom floating sidebar tooltips. Only shown while the sidebar is
 * collapsed (per spec — when expanded, the text label is already
 * visible, so a tooltip would be redundant). One shared tooltip element
 * is created and repositioned on hover, rather than one per nav item,
 * to keep this cheap.
 *
 * Two-stage reveal: the label appears almost immediately (120ms, just
 * enough to avoid flicker on fast mouse-past), then after 1.5s of
 * continued hovering a second line (the contextual hint) fades in
 * alongside it — matching the spec's "AI Module Hints" as an extension
 * of the same tooltip rather than a second competing popup.
 */
function mountSidebarTooltips(sidebarRoot, shell) {
  if (!sidebarRoot) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'sidebar-tooltip';
  tooltip.innerHTML = '<div class="sidebar-tooltip__label"></div><div class="sidebar-tooltip__hint"></div>';
  document.body.appendChild(tooltip);
  const labelEl = tooltip.querySelector('.sidebar-tooltip__label');
  const hintEl = tooltip.querySelector('.sidebar-tooltip__hint');

  let showTimer = null;
  let hintTimer = null;

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hintTimer);
    tooltip.classList.remove('sidebar-tooltip--visible', 'sidebar-tooltip--hint-visible');
  }

  sidebarRoot.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item || !shell?.classList.contains('app-shell--collapsed')) return;

    hide();
    showTimer = setTimeout(() => {
      const rect = item.getBoundingClientRect();
      labelEl.textContent = item.dataset.tipLabel || '';
      hintEl.textContent = item.dataset.tipHint || '';
      tooltip.style.top = `${rect.top + rect.height / 2}px`;
      tooltip.style.left = `${rect.right + 12}px`;
      tooltip.classList.add('sidebar-tooltip--visible');

      hintTimer = setTimeout(() => {
        tooltip.classList.add('sidebar-tooltip--hint-visible');
      }, 1500);
    }, 120);
  });

  sidebarRoot.addEventListener('mouseout', (e) => {
    if (!e.target.closest('.nav-item')) return;
    hide();
  });

  // Collapsing/expanding mid-hover shouldn't leave a stale tooltip
  // pointing at nothing.
  document.getElementById('sidebar-collapse-toggle')?.addEventListener('click', hide);
}

/**
 * Lightweight cross-page "transition": fades the page content out just
 * before navigating away (sidebar links only — internal nav), and fades
 * it in on load. This is a real multi-page app (no SPA router), so this
 * is the honest way to get a transition feel without pretending pages
 * don't actually reload — under 300ms both ways, per spec.
 */
function mountPageTransitions(sidebarRoot) {
  document.body.classList.add('page-transition-enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.remove('page-transition-enter'));
  });

  if (!sidebarRoot) return;
  sidebarRoot.addEventListener('click', (e) => {
    const link = e.target.closest('a.nav-item');
    if (!link || !link.href || link.target === '_blank') return;
    // Already on this page — nothing to transition to.
    if (link.pathname === window.location.pathname) return;

    e.preventDefault();
    document.body.classList.add('page-transition-exit');
    setTimeout(() => {
      window.location.href = link.href;
    }, 160);
  });
}

/**
 * Notification bell + floating panel. A dropdown, not a modal or a
 * page — matches the brief. Panel content re-renders from
 * notifications.js's store each time it opens, and the badge updates
 * live on 'sv:notification-added'/'sv:notifications-changed' events so
 * a notification added by, say, sales.js on this same page shows up
 * without a refresh.
 */
function mountNotificationBell() {
  const btn = document.getElementById('notification-bell-btn');
  const badge = document.getElementById('notification-badge');
  if (!btn) return;

  let panel = null;

  function updateBadge() {
    const count = getUnreadCount();
    if (count === 0) {
      badge.hidden = true;
    } else {
      badge.hidden = false;
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.classList.remove('notification-badge--bounce');
      // Retrigger the bounce animation even if the count changes twice
      // in a row.
      void badge.offsetWidth;
      badge.classList.add('notification-badge--bounce');
    }
  }

  function panelHTML() {
    const items = getAllNotifications();
    if (items.length === 0) {
      return `
        <div class="notification-panel__empty">
          <div class="notification-panel__empty-icon">🤖</div>
          <div class="notification-panel__empty-title">You're all caught up.</div>
          <div class="notification-panel__empty-text">SmartVentory AI hasn't detected anything requiring your attention.</div>
        </div>`;
    }
    return items
      .map(
        (n) => `
        <div class="notification-card ${n.read ? '' : 'notification-card--unread'}">
          <span class="notification-card__icon">${iconFor(n.type)}</span>
          <div class="notification-card__body">
            <div class="notification-card__title">${n.title}</div>
            <div class="notification-card__desc">${n.description || ''}</div>
            <div class="notification-card__time">${relativeTime(n.timestamp)}</div>
          </div>
        </div>`
      )
      .join('');
  }

  function render() {
    if (!panel) return;
    panel.querySelector('.notification-panel__list').innerHTML = panelHTML();
  }

  function openPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'notification-panel';
    panel.innerHTML = `
      <div class="notification-panel__header">
        <span>Notifications</span>
        <div class="notification-panel__actions">
          <button type="button" id="notif-mark-read">Mark all read</button>
          <button type="button" id="notif-clear-all">Clear all</button>
        </div>
      </div>
      <div class="notification-panel__list"></div>`;
    document.body.appendChild(panel);

    const rect = btn.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 10}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;

    render();
    requestAnimationFrame(() => panel.classList.add('notification-panel--visible'));

    panel.querySelector('#notif-mark-read').addEventListener('click', () => {
      markAllRead();
      render();
      updateBadge();
    });
    panel.querySelector('#notif-clear-all').addEventListener('click', () => {
      clearAll();
      render();
      updateBadge();
    });

    btn.setAttribute('aria-expanded', 'true');
    // Marking as read happens on close, not on open — so the badge
    // count is still meaningful while the person is reading them.
  }

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    btn.setAttribute('aria-expanded', 'false');
    updateBadge();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel ? closePanel() : openPanel();
  });

  document.addEventListener('click', (e) => {
    if (panel && !panel.contains(e.target) && e.target !== btn) closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) closePanel();
  });

  window.addEventListener('sv:notification-added', () => {
    updateBadge();
    render();
  });
  window.addEventListener('sv:notifications-changed', () => {
    updateBadge();
    render();
  });

  updateBadge();
}

export { mountLayout, NAV_ITEMS };
