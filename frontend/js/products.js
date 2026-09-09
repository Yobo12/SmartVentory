/**
 * products.js — Products CRUD page.
 *
 * This is the first of the CRUD pages and establishes the pattern
 * Categories/Suppliers/Units/Inventory will reuse: table + toolbar +
 * modal form, all through api.js.
 *
 * Data joins done client-side (documented, not backend gaps):
 *   - Stock per product: GET /products doesn't include stock (Inventory
 *     is the sole source of truth, per the backend's own design — see
 *     handover Section 11). Fetches GET /inventory separately and joins
 *     by product_id.
 *
 * Sorting: the backend's GET /products has no sort parameter, so column
 * sort here only reorders the CURRENTLY LOADED PAGE of results, not the
 * full dataset. Flagged in the header tooltip so it doesn't look broken.
 *
 * RBAC: create/edit/deactivate are Admin-only on the backend
 * (require_role("Admin")). The Add/Edit/Deactivate buttons are hidden
 * for Staff — this is a UI convenience only; the backend is the real
 * enforcement (see auth.js's getRole() docstring).
 *
 * Reorder level / max stock: these live on Inventory, not Product, and
 * were write-protected on the backend until a small PATCH
 * /inventory/{product_id}/settings endpoint was added specifically for
 * this. The product form here calls it as a second, separate request
 * right after the product create/update succeeds — it's a different
 * resource, so it's a different API call, not bundled into the product
 * payload.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { isAdmin } from './auth.js';
import { showToast } from './toast.js';

const PAGE_SIZE = 10;

const state = {
  items: [],
  total: 0,
  skip: 0,
  search: '',
  statusFilter: 'all', // 'all' | 'active'
  sortKey: null,
  sortDir: 'asc',
  categories: [],
  suppliers: [],
  units: [],
  stockByProductId: new Map(),
  inventoryByProductId: new Map(),
  admin: false,
};

let searchDebounceTimer = null;

// ============================================================
// Formatting helpers
// ============================================================

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ============================================================
// Data loading
// ============================================================

async function loadReferenceData() {
  const [categories, suppliers, units] = await Promise.all([
    api.get('/categories?active_only=true'),
    api.get('/suppliers?active_only=true'),
    api.get('/units?active_only=true'),
  ]);
  state.categories = categories;
  state.suppliers = suppliers;
  state.units = units;
}

async function loadStockMap() {
  const inventory = await api.get('/inventory?limit=200');
  state.stockByProductId = new Map(
    inventory.items.map((inv) => [inv.product_id, inv.current_stock])
  );
  // Full record (reorder_level, maximum_stock included) — separate map
  // since most callers only need current_stock and this keeps that
  // fast path unchanged.
  state.inventoryByProductId = new Map(
    inventory.items.map((inv) => [inv.product_id, inv])
  );
}

async function loadProducts() {
  const tableWrap = document.getElementById('products-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading products…</div>';

  const params = new URLSearchParams({
    skip: state.skip,
    limit: PAGE_SIZE,
    active_only: state.statusFilter === 'active' ? 'true' : 'false',
  });
  if (state.search) params.set('search', state.search);

  const data = await api.get(`/products?${params.toString()}`);
  state.items = data.items;
  state.total = data.total;

  renderTable();
  renderPagination();
}

// ============================================================
// Rendering
// ============================================================

function sortedItems() {
  if (!state.sortKey) return state.items;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...state.items].sort((a, b) => {
    let va, vb;
    if (state.sortKey === 'stock') {
      va = Number(state.stockByProductId.get(a.product_id) ?? -1);
      vb = Number(state.stockByProductId.get(b.product_id) ?? -1);
    } else if (state.sortKey === 'price') {
      va = Number(a.selling_price);
      vb = Number(b.selling_price);
    } else if (state.sortKey === 'name') {
      va = a.product_name.toLowerCase();
      vb = b.product_name.toLowerCase();
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderTable() {
  const tableWrap = document.getElementById('products-table-wrap');

  if (state.items.length === 0) {
    tableWrap.innerHTML = `<div class="table-empty">No products found${state.search ? ` for "${escapeHtml(state.search)}"` : ''}.</div>`;
    return;
  }

  const rows = sortedItems()
    .map((p) => {
      const stock = state.stockByProductId.get(p.product_id);
      const stockDisplay = stock === undefined ? '—' : Number(stock).toLocaleString();
      const isActive = p.status === 'active';
      const actions = state.admin
        ? `
          <div class="table-row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.product_id}">Edit</button>
            <button class="btn ${isActive ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle-status" data-id="${p.product_id}" data-active="${isActive}">
              ${isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>`
        : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>
            <div>${escapeHtml(p.product_name)}</div>
            <div class="cell-muted" style="font-size:12px;">${escapeHtml(p.category.category_name)}</div>
          </td>
          <td class="cell-mono">${escapeHtml(p.sku)}</td>
          <td>${stockDisplay}</td>
          <td class="cell-mono">${formatCurrency(p.selling_price)}</td>
          <td><span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}">${isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${actions}</td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th data-sortable data-sort-key="name" title="Sorts the current page only">Product ${sortArrow('name')}</th>
          <th>SKU</th>
          <th data-sortable data-sort-key="stock" title="Sorts the current page only">Stock ${sortArrow('stock')}</th>
          <th data-sortable data-sort-key="price" title="Sorts the current page only">Price ${sortArrow('price')}</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrap.querySelectorAll('th[data-sortable]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      renderTable();
    });
  });

  tableWrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openProductModal('edit', Number(btn.dataset.id)));
  });

  tableWrap.querySelectorAll('[data-action="toggle-status"]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleStatus(Number(btn.dataset.id), btn.dataset.active === 'true'));
  });
}

function sortArrow(key) {
  if (state.sortKey !== key) return '<span class="sort-arrow">↕</span>';
  return `<span class="sort-arrow">${state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
}

function renderPagination() {
  const el = document.getElementById('products-pagination');
  const currentPage = Math.floor(state.skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  el.innerHTML = `
    <span>${state.total === 0 ? 0 : state.skip + 1}–${Math.min(state.skip + PAGE_SIZE, state.total)} of ${state.total}</span>
    <div class="table-pagination__controls">
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => {
    state.skip = Math.max(0, state.skip - PAGE_SIZE);
    loadProducts();
  });
  document.getElementById('page-next')?.addEventListener('click', () => {
    state.skip = state.skip + PAGE_SIZE;
    loadProducts();
  });
}

// ============================================================
// Modal: create / edit
// ============================================================

function optionsHTML(list, idKey, labelKey, selectedId) {
  return list
    .map((item) => `<option value="${item[idKey]}" ${item[idKey] === selectedId ? 'selected' : ''}>${escapeHtml(item[labelKey])}</option>`)
    .join('');
}

function openProductModal(mode, productId = null) {
  const existing = mode === 'edit' ? state.items.find((p) => p.product_id === productId) : null;
  const existingInventory = mode === 'edit' ? state.inventoryByProductId.get(productId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${mode === 'edit' ? 'Edit Product' : 'Add Product'}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="product-form-alert"></div>
        <form id="product-form" novalidate>
          <div class="form-grid">
            <div class="form-row">
              <div class="field">
                <label for="f-name">Product name</label>
                <input id="f-name" name="product_name" required value="${escapeHtml(existing?.product_name)}" />
                <div class="field-error">Product name is required.</div>
              </div>
              <div class="field">
                <label for="f-sku">SKU</label>
                <input id="f-sku" name="sku" required value="${escapeHtml(existing?.sku)}" />
                <div class="field-error">SKU is required.</div>
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label for="f-cost">Cost price</label>
                <input id="f-cost" name="cost_price" type="number" min="0" step="0.01" required value="${existing?.cost_price ?? ''}" />
                <div class="field-error">Enter a valid cost price.</div>
              </div>
              <div class="field">
                <label for="f-price">Selling price</label>
                <input id="f-price" name="selling_price" type="number" min="0" step="0.01" required value="${existing?.selling_price ?? ''}" />
                <div class="field-error">Enter a valid selling price.</div>
              </div>
            </div>

            <div class="form-row">
              <div class="field">
                <label for="f-category">Category</label>
                <select id="f-category" name="category_id" required>
                  ${optionsHTML(state.categories, 'category_id', 'category_name', existing?.category.category_id)}
                </select>
              </div>
              <div class="field">
                <label for="f-supplier">Supplier</label>
                <select id="f-supplier" name="supplier_id" required>
                  ${optionsHTML(state.suppliers, 'supplier_id', 'company_name', existing?.supplier.supplier_id)}
                </select>
              </div>
            </div>

            <div class="field">
              <label for="f-unit">Unit</label>
              <select id="f-unit" name="unit_id" required>
                ${optionsHTML(state.units, 'unit_id', 'unit_name', existing?.unit.unit_id)}
              </select>
            </div>

            <div class="field">
              <label for="f-barcode">Barcode <span class="field-optional">(optional)</span></label>
              <input id="f-barcode" name="barcode" value="${escapeHtml(existing?.barcode)}" />
            </div>

            <div class="form-row">
              <div class="field">
                <label for="f-reorder">Reorder level <span class="field-optional">(optional)</span></label>
                <input id="f-reorder" name="reorder_level" type="number" min="0" step="0.01" value="${existingInventory?.reorder_level ?? ''}" />
                <div class="field-hint">Stock at or below this triggers a low-stock flag.</div>
              </div>
              <div class="field">
                <label for="f-maxstock">Max stock <span class="field-optional">(optional)</span></label>
                <input id="f-maxstock" name="maximum_stock" type="number" min="0" step="0.01" value="${existingInventory?.maximum_stock ?? ''}" />
              </div>
            </div>

            <div class="field">
              <label for="f-description">Description <span class="field-optional">(optional)</span></label>
              <textarea id="f-description" name="description">${escapeHtml(existing?.description)}</textarea>
            </div>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="product-form" id="modal-submit">
          ${mode === 'edit' ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitProductForm(overlay, mode, productId, close);
  });
}

async function submitProductForm(overlay, mode, productId, close) {
  const form = overlay.querySelector('#product-form');
  const alertBox = overlay.querySelector('#product-form-alert');
  const submitBtn = overlay.querySelector('#modal-submit');
  alertBox.classList.remove('visible');

  const formData = new FormData(form);
  const payload = {
    product_name: formData.get('product_name').trim(),
    sku: formData.get('sku').trim(),
    barcode: formData.get('barcode').trim() || null,
    description: formData.get('description').trim() || null,
    cost_price: Number(formData.get('cost_price')),
    selling_price: Number(formData.get('selling_price')),
    category_id: Number(formData.get('category_id')),
    supplier_id: Number(formData.get('supplier_id')),
    unit_id: Number(formData.get('unit_id')),
  };
  const reorderLevelRaw = formData.get('reorder_level');
  const maxStockRaw = formData.get('maximum_stock');
  // Only sent if the person actually typed something — omitting a field
  // entirely (rather than sending null) leaves it untouched server-side,
  // since the endpoint is PATCH-style (partial update).
  const inventorySettings = {};
  if (reorderLevelRaw !== '') inventorySettings.reorder_level = Number(reorderLevelRaw);
  if (maxStockRaw !== '') inventorySettings.maximum_stock = Number(maxStockRaw);

  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'edit' ? 'Saving…' : 'Adding…';

  try {
    let targetProductId = productId;
    if (mode === 'edit') {
      await api.put(`/products/${productId}`, payload);
    } else {
      const created = await api.post('/products', payload);
      targetProductId = created.product_id;
    }

    // Separate resource (Inventory), separate call — only fired if the
    // person actually entered a reorder level or max stock value.
    if (Object.keys(inventorySettings).length > 0) {
      await api.patch(`/inventory/${targetProductId}/settings`, inventorySettings);
    }

    showToast(mode === 'edit' ? 'Product updated.' : 'Product added.', 'success');
    close();
    await loadStockMap();
    await loadProducts();
  } catch (err) {
    const message = err instanceof ApiError ? err.detail || 'Could not save this product.' : 'Could not reach the server.';
    alertBox.textContent = message;
    alertBox.classList.add('visible');
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Add Product';
  }
}

async function handleToggleStatus(productId, currentlyActive) {
  const action = currentlyActive ? 'deactivate' : 'activate';
  const product = state.items.find((p) => p.product_id === productId);
  const confirmed = window.confirm(
    `${currentlyActive ? 'Deactivate' : 'Activate'} "${product?.product_name}"?`
  );
  if (!confirmed) return;

  try {
    await api.patch(`/products/${productId}/${action}`);
    showToast(`Product ${action}d.`, 'success');
    await loadProducts();
  } catch (err) {
    const message = err instanceof ApiError ? err.detail || 'Action failed.' : 'Could not reach the server.';
    showToast(message, 'danger');
  }
}

// ============================================================
// Toolbar wiring
// ============================================================

function wireToolbar() {
  const searchInput = document.getElementById('products-search');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.skip = 0;
      loadProducts();
    }, 350);
  });

  const statusFilter = document.getElementById('products-status-filter');
  statusFilter.addEventListener('change', () => {
    state.statusFilter = statusFilter.value;
    state.skip = 0;
    loadProducts();
  });

  const addBtn = document.getElementById('add-product-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openProductModal('create'));
  }
}

// ============================================================
// Init
// ============================================================

async function init() {
  const user = await mountLayout({ activePage: 'products' });
  if (!user) return;

  state.admin = isAdmin();
  document.getElementById('add-product-btn')?.classList.toggle('hidden', !state.admin);

  wireToolbar();

  // Prefill from the header's global search, if that's how we got here.
  const urlSearch = new URLSearchParams(window.location.search).get('search');
  if (urlSearch) {
    document.getElementById('products-search').value = urlSearch;
    state.search = urlSearch;
  }

  try {
    await Promise.all([loadReferenceData(), loadStockMap()]);
    await loadProducts();
  } catch (err) {
    const tableWrap = document.getElementById('products-table-wrap');
    tableWrap.innerHTML = '<div class="table-empty">Could not load products. Check your connection and refresh.</div>';
  }
}

init();
