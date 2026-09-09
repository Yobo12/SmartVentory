/**
 * reports.js — Reports page.
 *
 * Four backend report endpoints, three of them date-ranged and one
 * that isn't:
 *   GET /reports/sales?start_date&end_date       → summary card
 *   GET /reports/purchases?start_date&end_date    → summary card
 *   GET /reports/product-performance?start_date&end_date&limit → chart + table
 *   GET /reports/inventory                         → table (no date range —
 *     it's a snapshot of stock RIGHT NOW, not a historical period, per
 *     the backend's own docstring, so it doesn't move when you change
 *     the date range picker)
 *
 * "Download" buttons (per the brief's "reports should include download
 * buttons") export the currently-loaded table to CSV client-side —
 * there's no backend export endpoint, so this builds the CSV in the
 * browser from data already on the page.
 */

import { mountLayout } from './layout.js';
import { api } from './api.js';
import { addNotification } from './notifications.js';

const state = {
  startDate: null,
  endDate: null,
  productPerformance: [],
  inventoryReport: [],
};

/** See dashboard.js for why this guard exists — a Chart.js load
 * failure must degrade gracefully, not crash the whole section. */
function chartLibAvailable() {
  return typeof Chart !== 'undefined';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// CSV export — built client-side from whatever's currently loaded
// ============================================================

function downloadCsv(filename, headers, rows) {
  const escapeCsvCell = (cell) => {
    const str = String(cell ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Data loading
// ============================================================

async function loadSummaries() {
  const params = `start_date=${state.startDate}&end_date=${state.endDate}`;

  document.getElementById('sales-summary').innerHTML = summarySkeletonHTML(4);
  document.getElementById('purchases-summary').innerHTML = summarySkeletonHTML(2);

  const [salesReport, purchaseReport] = await Promise.all([
    api.get(`/reports/sales?${params}`),
    api.get(`/reports/purchases?${params}`),
  ]);

  document.getElementById('sales-summary').innerHTML = `
    ${summaryStatHTML('Sales', salesReport.total_sales_count)}
    ${summaryStatHTML('Revenue', formatCurrency(salesReport.total_revenue))}
    ${summaryStatHTML('Discount Given', formatCurrency(salesReport.total_discount))}
    ${summaryStatHTML('Tax Collected', formatCurrency(salesReport.total_tax))}`;

  document.getElementById('purchases-summary').innerHTML = `
    ${summaryStatHTML('Purchases', purchaseReport.total_purchases_count)}
    ${summaryStatHTML('Total Cost', formatCurrency(purchaseReport.total_cost))}`;
}

function summarySkeletonHTML(count) {
  return Array(count).fill('<div class="skeleton" style="height:52px;border-radius:var(--radius-sm);"></div>').join('');
}

function summaryStatHTML(label, value) {
  return `
    <div>
      <div class="kpi-card__label">${label}</div>
      <div class="kpi-card__value" style="font-size:20px;">${value}</div>
    </div>`;
}

async function loadProductPerformance() {
  const wrap = document.getElementById('performance-chart-wrap');
  wrap.innerHTML = '<div class="skeleton" style="height:100%;border-radius:var(--radius-md);"></div>';

  const data = await api.get(
    `/reports/product-performance?start_date=${state.startDate}&end_date=${state.endDate}&limit=10`
  );
  state.productPerformance = data.items;

  if (data.items.length === 0) {
    wrap.innerHTML = '<div class="chart-empty">No sales in this date range.</div>';
    renderPerformanceTable();
    return;
  }

  if (!chartLibAvailable()) {
    wrap.innerHTML = '<div class="chart-empty">Chart library did not load (check your internet connection or ad blocker) — the table below still has the real numbers.</div>';
    renderPerformanceTable();
    return;
  }

  // The chart-drawing step is wrapped separately from the data fetch
  // above: if Chart.js throws for any reason, the table must still
  // render — a chart failure should never take the table down with it
  // (this was a real bug users hit).
  try {
    const canvas = document.createElement('canvas');
    wrap.innerHTML = '';
    wrap.appendChild(canvas);

    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.items.map((i) => i.product_name),
        datasets: [{ label: 'Revenue', data: data.items.map((i) => Number(i.revenue)), backgroundColor: 'rgba(59, 130, 246, 0.55)', borderRadius: 6, maxBarThickness: 28 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#94A3B8' } },
          y: { grid: { display: false }, ticks: { color: '#94A3B8' } },
        },
      },
    });
  } catch (err) {
    wrap.innerHTML = '<div class="chart-empty">Could not load this chart. The table below still has the real numbers.</div>';
  }

  renderPerformanceTable();
}

function renderPerformanceTable() {
  const wrap = document.getElementById('performance-table-wrap');
  if (state.productPerformance.length === 0) {
    wrap.innerHTML = '<div class="table-empty">No sales in this date range.</div>';
    return;
  }
  const rows = state.productPerformance
    .map(
      (i) => `
        <tr>
          <td>${escapeHtml(i.product_name)}</td>
          <td class="cell-mono">${escapeHtml(i.sku)}</td>
          <td>${Number(i.quantity_sold).toLocaleString()}</td>
          <td class="cell-mono">${formatCurrency(i.revenue)}</td>
        </tr>`
    )
    .join('');
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Product</th><th>SKU</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function loadInventoryReport() {
  const wrap = document.getElementById('inventory-report-wrap');
  wrap.innerHTML = '<div class="table-loading">Loading…</div>';

  const data = await api.get('/reports/inventory');
  state.inventoryReport = data.items;

  document.getElementById('inventory-report-total').textContent =
    `${data.total_products} products · ${formatCurrency(data.total_stock_value)} total value`;

  if (data.items.length === 0) {
    wrap.innerHTML = '<div class="table-empty">No inventory to report on yet.</div>';
    return;
  }

  const rows = data.items
    .map(
      (i) => `
        <tr>
          <td>${escapeHtml(i.product_name)}</td>
          <td class="cell-mono">${escapeHtml(i.sku)}</td>
          <td>${Number(i.current_stock).toLocaleString()}</td>
          <td class="cell-mono">${formatCurrency(i.cost_price)}</td>
          <td class="cell-mono">${formatCurrency(i.stock_value)}</td>
        </tr>`
    )
    .join('');
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Cost Price</th><th>Stock Value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ============================================================
// Init
// ============================================================

async function loadAll() {
  await Promise.allSettled([loadSummaries(), loadProductPerformance(), loadInventoryReport()]);
}

function wireDateRange() {
  const startInput = document.getElementById('report-start-date');
  const endInput = document.getElementById('report-end-date');
  const applyBtn = document.getElementById('report-apply-range');

  state.startDate = dateDaysAgo(30);
  state.endDate = new Date().toISOString().slice(0, 10);
  startInput.value = state.startDate;
  endInput.value = state.endDate;

  applyBtn.addEventListener('click', () => {
    if (!startInput.value || !endInput.value) return;
    state.startDate = startInput.value;
    state.endDate = endInput.value;
    loadSummaries();
    loadProductPerformance();
    // Inventory report deliberately NOT reloaded here — it has no date
    // range, see this file's docstring.
  });
}

function wireDownloadButtons() {
  document.getElementById('download-performance-btn').addEventListener('click', () => {
    downloadCsv(
      `product-performance_${state.startDate}_to_${state.endDate}.csv`,
      ['Product', 'SKU', 'Quantity Sold', 'Revenue'],
      state.productPerformance.map((i) => [i.product_name, i.sku, i.quantity_sold, i.revenue])
    );
    addNotification({
      type: 'export_completed',
      title: 'Export completed',
      description: 'Product performance report downloaded as CSV.',
    });
  });

  document.getElementById('download-inventory-btn').addEventListener('click', () => {
    downloadCsv(
      `inventory-valuation_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Product', 'SKU', 'Current Stock', 'Cost Price', 'Stock Value'],
      state.inventoryReport.map((i) => [i.product_name, i.sku, i.current_stock, i.cost_price, i.stock_value])
    );
    addNotification({
      type: 'export_completed',
      title: 'Export completed',
      description: 'Inventory valuation report downloaded as CSV.',
    });
  });
}

async function init() {
  const user = await mountLayout({ activePage: 'reports' });
  if (!user) return;

  wireDateRange();
  wireDownloadButtons();

  try {
    await loadAll();
  } catch (err) {
    document.getElementById('performance-table-wrap').innerHTML =
      '<div class="table-empty">Could not load reports. Check your connection and refresh.</div>';
  }
}

init();
