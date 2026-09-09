/**
 * purchases.js — Purchases page.
 *
 * Backend note that shapes this whole page: POST /purchases is the
 * ONLY write endpoint — there's no PUT or delete. Recording a purchase
 * increases stock and writes a StockMovement audit record atomically,
 * so a purchase is treated as a permanent transaction, not something
 * you go back and edit. This page reflects that: history table + a
 * "Record Purchase" form, no Edit button anywhere.
 *
 * Any authenticated user (Admin or Staff) can record purchases — this
 * is day-to-day operational work, unlike Products/Categories/etc.
 * which are Admin-only catalog management. So unlike products.js,
 * nothing here is hidden based on role.
 *
 * GET /purchases IS paginated server-side (skip/limit + optional
 * supplier_id filter), so — unlike categories.js/suppliers.js — this
 * page asks the server for each page rather than filtering client-side.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { showToast } from './toast.js';
import { addNotification } from './notifications.js';

const PAGE_SIZE = 10;

const state = {
  items: [],
  total: 0,
  skip: 0,
  supplierFilter: '',
  suppliers: [],
  products: [],
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ============================================================
// Reference data + list loading
// ============================================================

async function loadReferenceData() {
  const [suppliers, productsResponse] = await Promise.all([
    api.get('/suppliers?active_only=true'),
    api.get('/products?limit=200&active_only=true'),
  ]);
  state.suppliers = suppliers;
  state.products = productsResponse.items;

  const filterSelect = document.getElementById('supplier-filter');
  filterSelect.innerHTML =
    '<option value="">All suppliers</option>' +
    state.suppliers.map((s) => `<option value="${s.supplier_id}">${escapeHtml(s.company_name)}</option>`).join('');
}

async function loadPurchases() {
  const tableWrap = document.getElementById('purchases-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading purchases…</div>';

  const params = new URLSearchParams({ skip: state.skip, limit: PAGE_SIZE });
  if (state.supplierFilter) params.set('supplier_id', state.supplierFilter);

  const data = await api.get(`/purchases?${params.toString()}`);
  state.items = data.items;
  state.total = data.total;

  renderTable();
  renderPagination();
}

// ============================================================
// Table
// ============================================================

function renderTable() {
  const tableWrap = document.getElementById('purchases-table-wrap');

  if (state.items.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No purchases recorded yet.</div>';
    return;
  }

  const rows = state.items
    .map(
      (p) => `
        <tr>
          <td class="cell-mono">#${p.purchase_id}</td>
          <td>${escapeHtml(p.supplier.company_name)}</td>
          <td class="cell-muted">${formatDate(p.purchase_date)}</td>
          <td class="cell-muted">${p.items.length} item${p.items.length === 1 ? '' : 's'}</td>
          <td class="cell-mono">${formatCurrency(p.total_cost)}</td>
          <td><span class="badge badge-success">${escapeHtml(p.status)}</span></td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-ghost btn-sm" data-action="view" data-id="${p.purchase_id}">View</button>
            </div>
          </td>
        </tr>`
    )
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Purchase</th>
          <th>Supplier</th>
          <th>Date</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrap.querySelectorAll('[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const purchase = state.items.find((p) => p.purchase_id === Number(btn.dataset.id));
      openViewModal(purchase);
    });
  });
}

function renderPagination() {
  const el = document.getElementById('purchases-pagination');
  const currentPage = Math.floor(state.skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  el.innerHTML = `
    <span>${state.total === 0 ? 0 : state.skip + 1}–${Math.min(state.skip + PAGE_SIZE, state.total)} of ${state.total}</span>
    <div class="table-pagination__controls">
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => { state.skip = Math.max(0, state.skip - PAGE_SIZE); loadPurchases(); });
  document.getElementById('page-next')?.addEventListener('click', () => { state.skip += PAGE_SIZE; loadPurchases(); });
}

// ============================================================
// View modal (read-only line items)
// ============================================================

function openViewModal(purchase) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const rows = purchase.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product.product_name)}</td>
          <td class="cell-mono">${escapeHtml(item.product.sku)}</td>
          <td>${Number(item.quantity).toLocaleString()}</td>
          <td class="cell-mono">${formatCurrency(item.unit_cost)}</td>
          <td class="cell-mono">${formatCurrency(item.subtotal)}</td>
        </tr>`
    )
    .join('');

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>Purchase #${purchase.purchase_id}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <p class="text-secondary" style="margin-bottom:var(--space-4);">
          ${escapeHtml(purchase.supplier.company_name)} · ${formatDate(purchase.purchase_date)}
        </p>
        <table class="data-table" style="min-width:0;">
          <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Cost</th><th>Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:var(--space-4);text-align:right;font-weight:700;">Total: ${formatCurrency(purchase.total_cost)}</p>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Close</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
}

// ============================================================
// Record Purchase modal
// ============================================================

function openRecordModal() {
  const lineItems = [{ product_id: '', quantity: '', unit_cost: '' }];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal__header">
        <h3>Record Purchase</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="purchase-form" novalidate>
          <div class="form-row" style="margin-bottom:var(--space-5);">
            <div class="field">
              <label for="f-supplier">Supplier</label>
              <select id="f-supplier" name="supplier_id" required>
                <option value="">Select supplier…</option>
                ${state.suppliers.map((s) => `<option value="${s.supplier_id}">${escapeHtml(s.company_name)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="f-date">Purchase date</label>
              <input id="f-date" name="purchase_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />
            </div>
          </div>

          <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:var(--space-2);display:block;">Line items</label>
          <div id="line-items-wrap"></div>
          <button type="button" class="btn btn-secondary btn-sm" id="add-line-item-btn" style="margin-top:var(--space-2);">+ Add Line</button>

          <p style="margin-top:var(--space-5);text-align:right;font-weight:700;" id="purchase-total">Total: $0.00</p>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="purchase-form" id="modal-submit">Record Purchase</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  function renderLineItems() {
    const wrap = overlay.querySelector('#line-items-wrap');
    wrap.innerHTML = lineItems
      .map(
        (line, i) => `
        <div class="form-row" style="grid-template-columns: 2fr 1fr 1fr auto; align-items:end; margin-bottom:var(--space-3);" data-line="${i}">
          <div class="field">
            ${i === 0 ? '<label>Product</label>' : ''}
            <select data-field="product_id" data-line="${i}">
              <option value="">Select product…</option>
              ${state.products.map((p) => `<option value="${p.product_id}" ${String(p.product_id) === String(line.product_id) ? 'selected' : ''}>${escapeHtml(p.product_name)} (${escapeHtml(p.sku)})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            ${i === 0 ? '<label>Quantity</label>' : ''}
            <input type="number" min="0.01" step="0.01" data-field="quantity" data-line="${i}" value="${line.quantity}" />
          </div>
          <div class="field">
            ${i === 0 ? '<label>Unit Cost</label>' : ''}
            <input type="number" min="0" step="0.01" data-field="unit_cost" data-line="${i}" value="${line.unit_cost}" />
          </div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-line="${i}" ${lineItems.length === 1 ? 'disabled' : ''} title="Remove line">✕</button>
        </div>`
      )
      .join('');

    wrap.querySelectorAll('select[data-field], input[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const line = Number(el.dataset.line);
        lineItems[line][el.dataset.field] = el.value;
        if (el.dataset.field === 'product_id' && !lineItems[line].unit_cost) {
          // Convenience: prefill unit cost from the product's own cost
          // price, since that's usually what you're paying the supplier.
          const product = state.products.find((p) => String(p.product_id) === el.value);
          if (product) {
            lineItems[line].unit_cost = product.cost_price;
            renderLineItems();
          }
        }
        updateTotal();
      });
    });

    wrap.querySelectorAll('[data-remove-line]').forEach((btn) => {
      btn.addEventListener('click', () => {
        lineItems.splice(Number(btn.dataset.removeLine), 1);
        renderLineItems();
        updateTotal();
      });
    });
  }

  function updateTotal() {
    const total = lineItems.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0), 0);
    overlay.querySelector('#purchase-total').textContent = `Total: ${formatCurrency(total)}`;
  }

  overlay.querySelector('#add-line-item-btn').addEventListener('click', () => {
    lineItems.push({ product_id: '', quantity: '', unit_cost: '' });
    renderLineItems();
  });

  renderLineItems();

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#purchase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const supplierId = overlay.querySelector('#f-supplier').value;
    const purchaseDate = overlay.querySelector('#f-date').value;
    const validLines = lineItems.filter((l) => l.product_id && l.quantity && l.unit_cost !== '');

    if (!supplierId || !purchaseDate || validLines.length === 0) {
      alertBox.textContent = 'Select a supplier, a date, and at least one complete line item.';
      alertBox.classList.add('visible');
      return;
    }

    const payload = {
      supplier_id: Number(supplierId),
      purchase_date: purchaseDate,
      items: validLines.map((l) => ({
        product_id: Number(l.product_id),
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost),
      })),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Recording…';

    try {
      const created = await api.post('/purchases', payload);
      showToast('Purchase recorded — stock updated.', 'success');
      addNotification({
        type: 'purchase',
        title: 'Purchase recorded',
        description: `#${created.purchase_id} from ${created.supplier.company_name}`,
      });
      close();
      await loadPurchases();
    } catch (err) {
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not record this purchase.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Record Purchase';
    }
  });
}

// ============================================================
// Init
// ============================================================

async function init() {
  const user = await mountLayout({ activePage: 'purchases' });
  if (!user) return;

  document.getElementById('record-purchase-btn').addEventListener('click', () => openRecordModal());
  document.getElementById('supplier-filter').addEventListener('change', (e) => {
    state.supplierFilter = e.target.value;
    state.skip = 0;
    loadPurchases();
  });

  try {
    await loadReferenceData();
    await loadPurchases();
  } catch (err) {
    document.getElementById('purchases-table-wrap').innerHTML =
      '<div class="table-empty">Could not load purchases. Check your connection and refresh.</div>';
  }
}

init();
