/**
 * inventory.js — Inventory page. Read-only by design: the backend's
 * own inventory router comment says stock is never edited directly,
 * only ever changed by Purchases/Sales, so every change keeps a
 * matching StockMovement audit record. So no Add/Edit modal here —
 * that would let the frontend do exactly what the backend deliberately
 * prevents.
 *
 * GET /inventory is paginated server-side (skip/limit) but has no
 * search param, so — same tradeoff as categories.js/suppliers.js —
 * this fetches up to the backend's max page size (200) and searches
 * client-side. If your product catalog ever exceeds 200 items, this
 * page will only search within the first 200; flagging that now
 * rather than let it silently miss items later.
 */

import { mountLayout } from './layout.js';
import { api } from './api.js';

const PAGE_SIZE = 10;

const state = {
  all: [],
  filtered: [],
  page: 0,
  lowStockOnly: false,
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function isLowStock(item) {
  return item.reorder_level !== null && Number(item.current_stock) <= Number(item.reorder_level);
}

async function loadInventory() {
  const tableWrap = document.getElementById('inventory-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading inventory…</div>';

  const data = await api.get('/inventory?limit=200');
  state.all = data.items;
  applyFilters();
}

function applyFilters() {
  const query = document.getElementById('inventory-search').value.trim().toLowerCase();
  state.filtered = state.all.filter((item) => {
    if (state.lowStockOnly && !isLowStock(item)) return false;
    if (!query) return true;
    return (
      item.product.product_name.toLowerCase().includes(query) ||
      item.product.sku.toLowerCase().includes(query)
    );
  });
  state.page = 0;
  render();
}

function render() {
  renderTable();
  renderPagination();
}

function renderTable() {
  const tableWrap = document.getElementById('inventory-table-wrap');
  const start = state.page * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No inventory items match this view.</div>';
    return;
  }

  const rows = pageItems
    .map((item) => {
      const low = isLowStock(item);
      return `
        <tr>
          <td>
            <div>${escapeHtml(item.product.product_name)}</div>
            <div class="cell-muted" style="font-size:12px;">${escapeHtml(item.product.category.category_name)}</div>
          </td>
          <td class="cell-mono">${escapeHtml(item.product.sku)}</td>
          <td>${Number(item.current_stock).toLocaleString()}</td>
          <td class="cell-muted">${item.reorder_level !== null ? Number(item.reorder_level).toLocaleString() : '—'}</td>
          <td class="cell-muted">${item.maximum_stock !== null ? Number(item.maximum_stock).toLocaleString() : '—'}</td>
          <td><span class="badge ${low ? 'badge-danger' : 'badge-success'}">${low ? 'Low Stock' : 'In Stock'}</span></td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th>Current Stock</th>
          <th>Reorder Level</th>
          <th>Max Stock</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPagination() {
  const el = document.getElementById('inventory-pagination');
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  el.innerHTML = `
    <span>${total === 0 ? 0 : state.page * PAGE_SIZE + 1}–${Math.min((state.page + 1) * PAGE_SIZE, total)} of ${total}</span>
    <div class="table-pagination__controls">
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-prev" ${state.page <= 0 ? 'disabled' : ''}>‹</button>
      <span>Page ${state.page + 1} of ${totalPages}</span>
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>›</button>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => { state.page--; render(); });
  document.getElementById('page-next')?.addEventListener('click', () => { state.page++; render(); });
}

async function init() {
  const user = await mountLayout({ activePage: 'inventory' });
  if (!user) return;

  document.getElementById('inventory-search').addEventListener('input', applyFilters);
  document.getElementById('low-stock-toggle').addEventListener('change', (e) => {
    state.lowStockOnly = e.target.checked;
    applyFilters();
  });

  try {
    await loadInventory();
  } catch (err) {
    document.getElementById('inventory-table-wrap').innerHTML =
      '<div class="table-empty">Could not load inventory. Check your connection and refresh.</div>';
  }
}

init();
