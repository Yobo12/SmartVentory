/**
 * dashboard.js — SmartVentory dashboard.
 *
 * Data sources (all real, confirmed against the Phase 7 backend):
 *   GET /dashboard/summary        → KPI numbers
 *   GET /ai/low-stock-analysis    → AI Alerts count (no dedicated
 *                                    alerts endpoint exists, per handover)
 *   GET /ai/sales-trends?days=30  → up/down % badge (NOT a daily
 *                                    series — see note below)
 *   GET /reports/product-performance → top-selling products chart
 *   GET /reports/inventory + GET /products → category distribution
 *                                    chart (computed client-side by
 *                                    matching product_id → category,
 *                                    since /reports/inventory doesn't
 *                                    include category on its own)
 *
 * Deliberately NOT built: a daily revenue/sales line chart. The only
 * trend endpoint (/ai/sales-trends) returns a single current-vs-
 * previous-period comparison, not day-by-day figures — building a
 * line chart from that would mean fabricating intermediate data
 * points. Decision made with the project owner: ship the % badge now;
 * a real trend chart needs a new backend endpoint first.
 */

import { mountLayout } from './layout.js';
import { api } from './api.js';
import { getRole } from './auth.js';
import { addNotification } from './notifications.js';
import { initOnboarding } from './onboarding.js';

// Adjust to your actual currency — no currency field exists in the
// backend schemas, so this is a display-only assumption.
const CURRENCY_SYMBOL = '$';

function formatCurrency(value) {
  const n = Number(value) || 0;
  return `${CURRENCY_SYMBOL}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good Night';
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  if (hour < 22) return 'Good Evening';
  return 'Good Night';
}

/** True only if the Chart.js CDN script actually loaded and ran. If it
 * didn't (network block, ad blocker, CDN outage), every chart-drawing
 * function below shows a plain-text fallback instead of throwing —
 * a chart failure should never take down unrelated parts of the page
 * (this was a real bug: it was previously skipping the Profile card). */
function chartLibAvailable() {
  return typeof Chart !== 'undefined';
}

/** Animates a number counting up from 0 to `target` over `duration` ms. */
function animateCount(el, target, { duration = 900, format = formatNumber } = {}) {
  const start = performance.now();
  const from = 0;

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    const current = from + (target - from) * eased;
    el.textContent = format(current);
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = format(target);
  }

  requestAnimationFrame(frame);
}

function kpiCardHTML({ id, label, iconSvg }) {
  return `
    <div class="card card-hover kpi-card fade-in">
      <div class="kpi-card__top">
        <div>
          <div class="kpi-card__label">${label}</div>
        </div>
        <div class="kpi-card__icon">${iconSvg}</div>
      </div>
      <div class="kpi-card__value" id="${id}">0</div>
    </div>`;
}

const KPI_ICONS = {
  products: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 3v18M4 7.5l8 4.5 8-4.5"/></svg>',
  value: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  today: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  revenue: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  lowstock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.3h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.6 1.6 0 0 0-2.7 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  ai: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/><circle cx="12" cy="12" r="2.4"/></svg>',
};

function trendBadgeHTML(changePercent) {
  if (changePercent === null || changePercent === undefined) return '';
  const value = Number(changePercent);
  const isUp = value >= 0;
  return `<span class="badge ${isUp ? 'badge-success' : 'badge-danger'}">${isUp ? '▲' : '▼'} ${Math.abs(value).toFixed(1)}% vs last 30 days</span>`;
}

function sparklineHTML(points, color = 'var(--primary)') {
  // Renders a tiny inline SVG line from real numbers. Used ONLY where
  // real historical points exist (currently: none, per the dashboard's
  // own note on why there's no daily trend endpoint yet). Kept here so
  // it's ready to wire up the moment a real endpoint exists, but not
  // called with fabricated data anywhere in this file.
  if (!points || points.length < 2) return '';
  const w = 72, h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(' ');
  return `<svg class="kpi-card__sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function flatSparklinePlaceholderHTML() {
  // No historical series exists for this metric yet — a flat neutral
  // line, not a fabricated trend, so it doesn't imply data that isn't
  // there.
  return `<svg class="kpi-card__sparkline" width="72" height="24" viewBox="0 0 72 24"><path d="M0,18 L72,18" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="2,3"/></svg>`;
}

/** Only notifies when the low-stock count actually CHANGES from what
 * was last seen — otherwise every single dashboard reload would fire
 * an identical notification, which defeats the point of a
 * notification (something new happened) rather than a status readout
 * (the KPI card already shows the live number regardless). */
function maybeNotifyLowStock(count) {
  const lastSeen = localStorage.getItem('sv_last_low_stock_count');
  localStorage.setItem('sv_last_low_stock_count', String(count));
  if (count > 0 && String(count) !== lastSeen) {
    addNotification({
      type: 'low_stock',
      title: 'Inventory running low',
      description: `${count} product${count === 1 ? '' : 's'} at or below reorder level.`,
    });
  }
}

async function loadKpis(user) {
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = [
    kpiCardHTML({ id: 'kpi-products', label: 'Total Products', iconSvg: KPI_ICONS.products }),
    kpiCardHTML({ id: 'kpi-value', label: 'Inventory Value', iconSvg: KPI_ICONS.value }),
    kpiCardHTML({ id: 'kpi-today', label: "Today's Sales", iconSvg: KPI_ICONS.today }),
    kpiCardHTML({ id: 'kpi-revenue', label: 'Monthly Revenue', iconSvg: KPI_ICONS.revenue }),
    kpiCardHTML({ id: 'kpi-lowstock', label: 'Low Stock Items', iconSvg: KPI_ICONS.lowstock }),
    kpiCardHTML({ id: 'kpi-ai', label: 'AI Alerts', iconSvg: KPI_ICONS.ai }),
  ].join('');

  const [summary, lowStockItems, trend] = await Promise.all([
    api.get('/dashboard/summary'),
    api.get('/ai/low-stock-analysis'),
    api.get('/ai/sales-trends?days=30').catch(() => null), // heuristic-only, degrade gracefully
  ]);

  animateCount(document.getElementById('kpi-products'), summary.total_products);
  animateCount(document.getElementById('kpi-value'), Number(summary.total_inventory_value), { format: formatCurrency });
  animateCount(document.getElementById('kpi-today'), Number(summary.today_sales_total), { format: formatCurrency });
  animateCount(document.getElementById('kpi-revenue'), Number(summary.monthly_sales_total), { format: formatCurrency });
  animateCount(document.getElementById('kpi-lowstock'), summary.low_stock_count);
  maybeNotifyLowStock(summary.low_stock_count);
  animateCount(document.getElementById('kpi-ai'), lowStockItems.length);

  if (trend && trend.change_percent !== null && trend.change_percent !== undefined) {
    const revenueCard = document.getElementById('kpi-revenue')?.closest('.kpi-card');
    if (revenueCard) {
      const badge = document.createElement('div');
      badge.innerHTML = trendBadgeHTML(trend.change_percent);
      revenueCard.appendChild(badge.firstChild);
    }
  }

  // Descriptive subtext + sparkline row under each KPI value. Only
  // Revenue has any real trend numbers behind it (current vs previous
  // period from /ai/sales-trends) — everything else gets a flat
  // placeholder line rather than an invented one. See this file's
  // docstring for why no daily series exists yet.
  const KPI_DESCRIPTIONS = {
    'kpi-products': 'Active catalog size',
    'kpi-value': 'At current cost price',
    'kpi-today': "Revenue booked today",
    'kpi-revenue': 'Last 30 days',
    'kpi-lowstock': 'At or below reorder level',
    'kpi-ai': 'From heuristic stock analysis',
  };
  document.querySelectorAll('.kpi-card').forEach((card) => {
    const valueEl = card.querySelector('.kpi-card__value');
    if (!valueEl) return;
    const id = valueEl.id;
    const row = document.createElement('div');
    row.className = 'kpi-card__trend-row';
    row.innerHTML = `<span class="kpi-card__description">${KPI_DESCRIPTIONS[id] || ''}</span>${id === 'kpi-revenue' ? '' : flatSparklinePlaceholderHTML()}`;
    card.appendChild(row);
  });

  return summary;
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function loadTopProductsChart() {
  const wrap = document.getElementById('top-products-chart-wrap');
  try {
    const startDate = dateDaysAgo(30);
    const endDate = new Date().toISOString().slice(0, 10);

    const data = await api.get(
      `/reports/product-performance?start_date=${startDate}&end_date=${endDate}&limit=8`
    );

    if (!data.items || data.items.length === 0) {
      wrap.innerHTML = '<div class="chart-empty">No sales in the last 30 days yet — this chart fills in once sales start coming through.</div>';
      return;
    }

    if (!chartLibAvailable()) {
      wrap.innerHTML = '<div class="chart-empty">Chart library did not load (check your internet connection or ad blocker) — the underlying data is fine, just this visual is unavailable right now.</div>';
      return;
    }

    const canvas = document.createElement('canvas');
    wrap.innerHTML = '';
    wrap.appendChild(canvas);

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.items.map((i) => i.product_name),
      datasets: [
        {
          label: 'Revenue',
          data: data.items.map((i) => Number(i.revenue)),
          backgroundColor: 'rgba(59, 130, 246, 0.55)',
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131E33',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          displayColors: false,
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94A3B8' } },
        y: { grid: { display: false }, ticks: { color: '#94A3B8' } },
      },
      animation: { duration: 700, easing: 'easeOutCubic' },
    },
  });
  } catch (err) {
    wrap.innerHTML = '<div class="chart-empty">Could not load this chart. The rest of the dashboard is unaffected.</div>';
  }
}

async function loadCategoryDistributionChart() {
  const wrap = document.getElementById('category-chart-wrap');
  try {

  const [inventoryReport, productsResponse] = await Promise.all([
    api.get('/reports/inventory'),
    api.get('/products?limit=200&active_only=true'),
  ]);

  const categoryByProductId = new Map(
    productsResponse.items.map((p) => [p.product_id, p.category.category_name])
  );

  const valueByCategory = new Map();
  for (const item of inventoryReport.items) {
    const categoryName = categoryByProductId.get(item.product_id) || 'Uncategorized';
    const current = valueByCategory.get(categoryName) || 0;
    valueByCategory.set(categoryName, current + Number(item.stock_value));
  }

  if (valueByCategory.size === 0) {
    wrap.innerHTML = '<div class="chart-empty">No inventory value to show yet.</div>';
    return;
  }

  if (!chartLibAvailable()) {
    wrap.innerHTML = '<div class="chart-empty">Chart library did not load (check your internet connection or ad blocker) — the underlying data is fine, just this visual is unavailable right now.</div>';
    return;
  }

  const canvas = document.createElement('canvas');
  wrap.innerHTML = '';
  wrap.appendChild(canvas);

  const palette = ['#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#64748B'];

  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: [...valueByCategory.keys()],
      datasets: [
        {
          data: [...valueByCategory.values()],
          backgroundColor: palette,
          borderColor: '#1E293B',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94A3B8', boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#131E33',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
        },
      },
      animation: { duration: 700, easing: 'easeOutCubic' },
    },
  });
  } catch (err) {
    wrap.innerHTML = '<div class="chart-empty">Could not load this chart. The rest of the dashboard is unaffected.</div>';
  }
}

async function init() {
  const user = await mountLayout({ activePage: 'dashboard' });
  if (!user) return; // mountLayout already redirected to login

  document.getElementById('greeting-prefix').textContent = `${greetingForNow()},`;
  document.getElementById('greeting-name').textContent = user.first_name;
  startHeroClock();
  startStatusRotator();

  const summary = await loadKpis(user);
  renderRevenueGoal(Number(summary.monthly_sales_total));
  wireRevenueGoalEdit(Number(summary.monthly_sales_total));
  startSubtitleRotator(buildHeroSubtitleMessages(summary, summary.low_stock_count));

  // Promise.allSettled, NOT Promise.all: each section fetches its own
  // data independently, and one section failing (e.g. Chart.js not
  // loading) must never stop the others from rendering. This was a
  // real bug — a chart failure was silently preventing the Profile
  // card below from ever running.
  await Promise.allSettled([
    loadTopProductsChart(),
    loadCategoryDistributionChart(),
    loadAiCommandCenter(),
    loadAiCarousel(),
    loadActivityTimeline(),
  ]);

  renderProfileCard(user, getRole());
  initOnboarding();
}

init();

// ============================================================
// Dashboard v2 additions
// ============================================================

// --- Hero date/time ---

// --- Hero: AI Command Center clock + rotators ---

function startHeroClock() {
  const hEl = document.getElementById('clock-h');
  const mEl = document.getElementById('clock-m');
  const sEl = document.getElementById('clock-s');
  const tzEl = document.getElementById('hero-tz-line');
  const dayEl = document.getElementById('hero-day');
  const dateEl = document.getElementById('hero-date-full');

  // Real timezone/offset from the browser — not hardcoded to any one
  // city, since this app could run for a business anywhere.
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -new Date().getTimezoneOffset();
  const offsetHours = Math.trunc(offsetMinutes / 60);
  const offsetSign = offsetHours >= 0 ? '+' : '';
  tzEl.textContent = `GMT${offsetSign}${offsetHours} · ${tzName}`;

  function tick() {
    const now = new Date();
    hEl.textContent = String(now.getHours()).padStart(2, '0');
    mEl.textContent = String(now.getMinutes()).padStart(2, '0');
    sEl.textContent = String(now.getSeconds()).padStart(2, '0');
    dayEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
    dateEl.textContent = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

const AI_STATUS_MESSAGES = [
  'Monitoring inventory',
  'No critical alerts',
  'Sales engine active',
  'Warehouse status normal',
  'Purchase pipeline healthy',
  'Awaiting user commands',
];

function startStatusRotator() {
  const el = document.getElementById('ai-status-rotator');
  let index = 0;
  setInterval(() => {
    el.classList.add('is-fading');
    setTimeout(() => {
      index = (index + 1) % AI_STATUS_MESSAGES.length;
      el.textContent = AI_STATUS_MESSAGES[index];
      el.classList.remove('is-fading');
    }, 400);
  }, 7000);
}

/** Builds the hero subtitle's rotating message pool. Mixes a couple of
 * generic, always-true lines with REAL numbers pulled from the same
 * KPI summary the cards below already show — not fabricated stats,
 * since a "3 products need attention" claim should mean something. */
function buildHeroSubtitleMessages(summary, lowStockCount) {
  const messages = [
    'SmartVentory AI is actively watching your inventory.',
    'All operational systems are functioning normally.',
  ];
  if (lowStockCount > 0) {
    messages.push(`${lowStockCount} product${lowStockCount === 1 ? '' : 's'} currently need${lowStockCount === 1 ? 's' : ''} attention.`);
  } else {
    messages.push('No products are currently low on stock.');
  }
  messages.push(`${formatCurrency(Number(summary.monthly_sales_total))} in revenue tracked so far this month.`);
  return messages;
}

function startSubtitleRotator(messages) {
  const el = document.getElementById('hero-subtitle-text');
  let index = 0;
  el.textContent = messages[0];
  if (messages.length <= 1) return;
  setInterval(() => {
    el.classList.add('is-fading');
    setTimeout(() => {
      index = (index + 1) % messages.length;
      el.textContent = messages[index];
      el.classList.remove('is-fading');
    }, 400);
  }, 6500);
}

// --- AI Command Center: health score + carousel ---
// "Inventory Health Score" here is a frontend-only heuristic (percent
// of products that are NOT low/critical/out-of-stock), computed from
// GET /inventory — there's no such score in the backend itself.

async function loadAiCommandCenter() {
  try {
    const inventory = await api.get('/inventory?limit=200');
    const items = inventory.items;
    const total = items.length || 1;
    const outOfStock = items.filter((i) => Number(i.current_stock) === 0).length;
    const critical = items.filter((i) => Number(i.current_stock) > 0 && i.reorder_level !== null && Number(i.current_stock) <= Number(i.reorder_level) * 0.5).length;
    const low = items.filter((i) => {
      const s = Number(i.current_stock);
      const isLow = i.reorder_level !== null && s <= Number(i.reorder_level);
      const isCritical = i.reorder_level !== null && s <= Number(i.reorder_level) * 0.5;
      return s > 0 && isLow && !isCritical;
    }).length;
    const healthy = total - outOfStock - critical - low;
    const score = Math.round((healthy / total) * 100);

    const ring = document.getElementById('health-score-ring');
    ring.style.setProperty('--score', score);
    document.getElementById('health-score-value').textContent = `${score}%`;
    document.getElementById('health-score-legend').innerHTML = `
      <div class="health-score-legend__row"><span class="health-score-legend__dot" style="background:var(--success);"></span>Healthy: ${healthy}</div>
      <div class="health-score-legend__row"><span class="health-score-legend__dot" style="background:var(--warning);"></span>Low: ${low}</div>
      <div class="health-score-legend__row"><span class="health-score-legend__dot" style="background:var(--danger);"></span>Critical: ${critical}</div>
      <div class="health-score-legend__row"><span class="health-score-legend__dot" style="background:var(--text-muted);"></span>Out of stock: ${outOfStock}</div>`;
    document.getElementById('ai-status-text').textContent = `Monitoring ${total} products · heuristics active`;

    renderInventoryHealthWidget({ healthy, low, critical, outOfStock, total });
  } catch (err) {
    document.getElementById('ai-status-text').textContent = 'Could not load health data.';
  }
}

let carouselTimer = null;

async function loadAiCarousel() {
  const wrap = document.getElementById('ai-carousel-wrap');
  try {
    const data = await api.get('/ai/recommendations?skip=0&limit=5');
    if (data.items.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4);">
          <div class="empty-state__text">No AI insights generated yet. Try the AI Insights page.</div>
        </div>`;
      return;
    }

    let index = 0;
    function render() {
      const rec = data.items[index];
      const confidencePct = rec.confidence_score !== null ? `${Math.round(rec.confidence_score * 100)}%` : '—';
      wrap.innerHTML = `
        <div class="ai-carousel__item">${escapeHtmlLocal(rec.recommendation)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-2);">
          <span class="text-muted" style="font-size:11.5px;">Confidence: ${confidencePct}</span>
          <div class="ai-carousel__dots">
            ${data.items.map((_, i) => `<span class="ai-carousel__dot ${i === index ? 'ai-carousel__dot--active' : ''}"></span>`).join('')}
          </div>
        </div>`;
    }
    render();

    if (carouselTimer) clearInterval(carouselTimer);
    if (data.items.length > 1) {
      carouselTimer = setInterval(() => {
        index = (index + 1) % data.items.length;
        render();
      }, 5000);
    }
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state__text">Could not load recommendations.</div></div>';
  }
}

function escapeHtmlLocal(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// --- Inventory Health Widget (bottom row) ---

function renderInventoryHealthWidget({ healthy, low, critical, outOfStock, total }) {
  const wrap = document.getElementById('inventory-health-wrap');
  const tiers = [
    { label: 'Healthy', count: healthy, color: 'var(--success)' },
    { label: 'Low Stock', count: low, color: 'var(--warning)' },
    { label: 'Critical', count: critical, color: 'var(--danger)' },
    { label: 'Out of Stock', count: outOfStock, color: 'var(--text-muted)' },
  ];
  wrap.innerHTML = tiers
    .map((t) => {
      const pct = total > 0 ? Math.round((t.count / total) * 100) : 0;
      return `
        <div class="health-tier-row">
          <span style="width:90px;">${t.label}</span>
          <div class="health-tier-row__bar-track">
            <div class="health-tier-row__bar-fill" style="width:${pct}%;background:${t.color};"></div>
          </div>
          <span class="badge badge-neutral">${t.count}</span>
        </div>`;
    })
    .join('');
}

// --- Revenue Goal (target stored locally — no backend goals feature) ---

const REVENUE_GOAL_STORAGE_KEY = 'sv_revenue_goal';
const DEFAULT_REVENUE_GOAL = 10000;

function getRevenueGoal() {
  const stored = localStorage.getItem(REVENUE_GOAL_STORAGE_KEY);
  return stored ? Number(stored) : DEFAULT_REVENUE_GOAL;
}

function renderRevenueGoal(currentRevenue) {
  const goal = getRevenueGoal();
  const pct = Math.min(100, Math.round((currentRevenue / goal) * 100));
  document.getElementById('revenue-goal-current').textContent = formatCurrency(currentRevenue);
  document.getElementById('revenue-goal-bar').style.width = `${pct}%`;
  document.getElementById('revenue-goal-pct').textContent = `${pct}% of ${formatCurrency(goal)} goal`;
}

function wireRevenueGoalEdit(currentRevenue) {
  document.getElementById('edit-goal-btn').addEventListener('click', () => {
    const current = getRevenueGoal();
    const input = window.prompt('Set your monthly revenue target ($):', current);
    if (input === null) return;
    const value = Number(input);
    if (!value || value <= 0) return;
    localStorage.setItem(REVENUE_GOAL_STORAGE_KEY, String(value));
    renderRevenueGoal(currentRevenue);
  });
}

// --- Recent Activity Timeline ---
// No dedicated "activity feed" endpoint exists in the backend — this
// merges the most recent purchases, sales, and AI recommendations
// (all real, from their own endpoints) into one sorted feed.

async function loadActivityTimeline() {
  const wrap = document.getElementById('activity-timeline-wrap');
  try {
    const [purchases, sales, recommendations] = await Promise.all([
      api.get('/purchases?skip=0&limit=5'),
      api.get('/sales?skip=0&limit=5'),
      api.get('/ai/recommendations?skip=0&limit=5'),
    ]);

    const events = [
      ...purchases.items.map((p) => ({
        icon: '🚚', text: `Purchase #${p.purchase_id} received from ${p.supplier.company_name}`,
        time: p.purchase_date, ts: new Date(p.purchase_date).getTime(),
      })),
      ...sales.items.map((s) => ({
        icon: '💵', text: `Sale #${s.sale_id} completed (${formatCurrency(s.total_amount)})`,
        time: s.sale_date, ts: new Date(s.sale_date).getTime(),
      })),
      ...recommendations.items.map((r) => ({
        icon: '✨', text: `AI recommendation generated for product #${r.product_id}`,
        time: r.generated_at, ts: new Date(r.generated_at).getTime(),
      })),
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);

    if (events.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <div class="empty-state__text">No activity yet — record a sale or purchase to see it here.</div>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="timeline">
        ${events
          .map(
            (e) => `
          <div class="timeline-item">
            <span class="timeline-item__icon">${e.icon}</span>
            <div>
              <div class="timeline-item__text">${escapeHtmlLocal(e.text)}</div>
              <div class="timeline-item__time">${new Date(e.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
            </div>
          </div>`
          )
          .join('')}
      </div>`;
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state__text">Could not load recent activity.</div></div>';
  }
}

// --- Profile card ---
// "Last Login" doesn't exist on UserRead — shown honestly as "Session
// started" using a timestamp auth.js records at sign-in time, not a
// fabricated backend audit feature.

function renderProfileCard(user, role) {
  const wrap = document.getElementById('profile-card-wrap');
  const initials = (user.first_name[0] + user.last_name[0]).toUpperCase();
  const sessionStart = sessionStorage.getItem('sv_login_time');

  wrap.innerHTML = `
    <div class="profile-card__row">
      <div class="profile-card__avatar">${initials}</div>
      <div>
        <div style="font-weight:600;">${escapeHtmlLocal(user.first_name)} ${escapeHtmlLocal(user.last_name)}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtmlLocal(user.email)}</div>
      </div>
    </div>
    <div class="profile-card__stat"><span class="text-muted">Role</span><span class="badge badge-neutral">${escapeHtmlLocal(role || 'Unknown')}</span></div>
    <div class="profile-card__stat"><span class="text-muted">Session started</span><span>${sessionStart ? new Date(sessionStart).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
    <div class="profile-card__stat"><span class="text-muted">Account status</span><span class="badge ${user.status === 'active' ? 'badge-success' : 'badge-neutral'}">${escapeHtmlLocal(user.status)}</span></div>`;
}
