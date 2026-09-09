/**
 * sales.js — Sales page. Structurally the mirror of purchases.js:
 * same "history table + multi-line-item record form, no edit" shape,
 * since POST /sales is likewise the only write endpoint.
 *
 * Differences from Purchases, all coming straight from the schema:
 *   - No supplier — a sale isn't tied to one.
 *   - unit_price per line is OPTIONAL — if left blank, the backend
 *     fills in the product's current selling_price itself. This page
 *     prefills it client-side for a live total, but leaves it editable
 *     (e.g. a manual discount on one item) and still sends `null` if
 *     the person clears it, so the backend's own default logic runs
 *     rather than the frontend silently guessing a price.
 *   - Sale-level discount and tax (flat amounts, not percentages),
 *     entered once per sale rather than per line.
 *   - payment_method is just a free-text-constrained string on the
 *     backend (min_length 1) — rendered here as a select of common
 *     methods, which is a frontend convenience, not a backend rule.
 *   - The backend REJECTS the whole sale if any line would sell more
 *     than the current stock on hand — surfaced via the form alert,
 *     not guessed at client-side, since the frontend's stock numbers
 *     could be stale by the time of submit.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { showToast } from './toast.js';
import { addNotification } from './notifications.js';

const PAGE_SIZE = 10;
const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer'];

const state = {
  items: [],
  total: 0,
  skip: 0,
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
  const productsResponse = await api.get('/products?limit=200&active_only=true');
  state.products = productsResponse.items;
}

async function loadSales() {
  const tableWrap = document.getElementById('sales-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading sales…</div>';

  const data = await api.get(`/sales?skip=${state.skip}&limit=${PAGE_SIZE}`);
  state.items = data.items;
  state.total = data.total;

  renderTable();
  renderPagination();
}

// ============================================================
// Table
// ============================================================

function renderTable() {
  const tableWrap = document.getElementById('sales-table-wrap');

  if (state.items.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No sales recorded yet.</div>';
    return;
  }

  const rows = state.items
    .map(
      (s) => `
        <tr>
          <td class="cell-mono">#${s.sale_id}</td>
          <td class="cell-muted">${formatDate(s.sale_date)}</td>
          <td class="cell-muted">${s.items.length} item${s.items.length === 1 ? '' : 's'}</td>
          <td><span class="badge badge-neutral">${escapeHtml(s.payment_method)}</span></td>
          <td class="cell-mono">${formatCurrency(s.total_amount)}</td>
          <td><span class="badge badge-success">${escapeHtml(s.status)}</span></td>
          <td>
            <div class="table-row-actions">
              <button class="btn btn-ghost btn-sm" data-action="view" data-id="${s.sale_id}">View</button>
            </div>
          </td>
        </tr>`
    )
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Sale</th>
          <th>Date</th>
          <th>Items</th>
          <th>Payment</th>
          <th>Total</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrap.querySelectorAll('[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sale = state.items.find((s) => s.sale_id === Number(btn.dataset.id));
      openViewModal(sale);
    });
  });
}

function renderPagination() {
  const el = document.getElementById('sales-pagination');
  const currentPage = Math.floor(state.skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  el.innerHTML = `
    <span>${state.total === 0 ? 0 : state.skip + 1}–${Math.min(state.skip + PAGE_SIZE, state.total)} of ${state.total}</span>
    <div class="table-pagination__controls">
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => { state.skip = Math.max(0, state.skip - PAGE_SIZE); loadSales(); });
  document.getElementById('page-next')?.addEventListener('click', () => { state.skip += PAGE_SIZE; loadSales(); });
}

// ============================================================
// View modal (read-only line items)
// ============================================================

function openViewModal(sale) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product.product_name)}</td>
          <td class="cell-mono">${escapeHtml(item.product.sku)}</td>
          <td>${Number(item.quantity).toLocaleString()}</td>
          <td class="cell-mono">${formatCurrency(item.unit_price)}</td>
          <td class="cell-mono">${formatCurrency(item.subtotal)}</td>
        </tr>`
    )
    .join('');

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>Sale #${sale.sale_id}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <p class="text-secondary" style="margin-bottom:var(--space-4);">
          ${formatDate(sale.sale_date)} · ${escapeHtml(sale.payment_method)}
        </p>
        <table class="data-table" style="min-width:0;">
          <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:var(--space-4);text-align:right;">
          <p class="text-secondary">Subtotal: ${formatCurrency(sale.subtotal)}</p>
          <p class="text-secondary">Discount: -${formatCurrency(sale.discount)}</p>
          <p class="text-secondary">Tax: +${formatCurrency(sale.tax)}</p>
          <p style="font-weight:700;">Total: ${formatCurrency(sale.total_amount)}</p>
        </div>
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
// Record Sale modal
// ============================================================

function openRecordModal() {
  const lineItems = [{ product_id: '', quantity: '', unit_price: '' }];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal__header">
        <h3>Record Sale</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="sale-form" novalidate>
          <div class="form-row" style="margin-bottom:var(--space-5);">
            <div class="field">
              <label for="f-date">Sale date</label>
              <input id="f-date" name="sale_date" type="date" required value="${new Date().toISOString().slice(0, 10)}" />
            </div>
            <div class="field">
              <label for="f-payment">Payment method</label>
              <select id="f-payment" name="payment_method" required>
                ${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
          </div>

          <label style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:var(--space-2);display:block;">Line items</label>
          <div id="line-items-wrap"></div>
          <button type="button" class="btn btn-secondary btn-sm" id="add-line-item-btn" style="margin-top:var(--space-2);">+ Add Line</button>

          <div class="form-row" style="margin-top:var(--space-5);">
            <div class="field">
              <label for="f-discount">Discount <span class="field-optional">(optional)</span></label>
              <input id="f-discount" name="discount" type="number" min="0" step="0.01" value="0" />
            </div>
            <div class="field">
              <label for="f-tax">Tax <span class="field-optional">(optional)</span></label>
              <input id="f-tax" name="tax" type="number" min="0" step="0.01" value="0" />
            </div>
          </div>

          <p style="margin-top:var(--space-4);text-align:right;font-weight:700;" id="sale-total">Total: $0.00</p>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="sale-form" id="modal-submit">Record Sale</button>
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
            ${i === 0 ? '<label>Unit Price</label>' : ''}
            <input type="number" min="0" step="0.01" data-field="unit_price" data-line="${i}" value="${line.unit_price}" />
          </div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-line="${i}" ${lineItems.length === 1 ? 'disabled' : ''} title="Remove line">✕</button>
        </div>`
      )
      .join('');

    wrap.querySelectorAll('select[data-field], input[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const line = Number(el.dataset.line);
        lineItems[line][el.dataset.field] = el.value;
        if (el.dataset.field === 'product_id' && !lineItems[line].unit_price) {
          // Convenience prefill from the product's current selling
          // price — still editable, and still sent as-is (or omitted,
          // see submit handler) rather than silently overridden.
          const product = state.products.find((p) => String(p.product_id) === el.value);
          if (product) {
            lineItems[line].unit_price = product.selling_price;
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
    const subtotal = lineItems.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);
    const discount = Number(overlay.querySelector('#f-discount')?.value) || 0;
    const tax = Number(overlay.querySelector('#f-tax')?.value) || 0;
    overlay.querySelector('#sale-total').textContent = `Total: ${formatCurrency(subtotal - discount + tax)}`;
  }

  overlay.querySelector('#add-line-item-btn').addEventListener('click', () => {
    lineItems.push({ product_id: '', quantity: '', unit_price: '' });
    renderLineItems();
  });
  overlay.querySelector('#f-discount').addEventListener('input', updateTotal);
  overlay.querySelector('#f-tax').addEventListener('input', updateTotal);

  renderLineItems();

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const saleDate = overlay.querySelector('#f-date').value;
    const paymentMethod = overlay.querySelector('#f-payment').value;
    const discount = overlay.querySelector('#f-discount').value;
    const tax = overlay.querySelector('#f-tax').value;
    const validLines = lineItems.filter((l) => l.product_id && l.quantity);

    if (!saleDate || !paymentMethod || validLines.length === 0) {
      alertBox.textContent = 'Pick a date, a payment method, and at least one line item with a quantity.';
      alertBox.classList.add('visible');
      return;
    }

    const payload = {
      sale_date: saleDate,
      payment_method: paymentMethod,
      discount: Number(discount) || 0,
      tax: Number(tax) || 0,
      items: validLines.map((l) => ({
        product_id: Number(l.product_id),
        quantity: Number(l.quantity),
        // Sent as null (not 0) when left blank, so the backend applies
        // its own "defaults to current selling_price" logic instead of
        // the frontend guessing a price.
        unit_price: l.unit_price === '' ? null : Number(l.unit_price),
      })),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Recording…';

    try {
      const created = await api.post('/sales', payload);
      showToast('Sale recorded — stock updated.', 'success');
      addNotification({
        type: 'sale',
        title: 'Sale completed',
        description: `#${created.sale_id} — ${formatCurrency(created.total_amount)}`,
      });
      close();
      await loadSales();
    } catch (err) {
      // Most likely failure here is the backend's stock-availability
      // check — surface its own message rather than a generic one.
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not record this sale.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Record Sale';
    }
  });
}

// ============================================================
// Init
// ============================================================

async function init() {
  const user = await mountLayout({ activePage: 'sales' });
  if (!user) return;

  document.getElementById('record-sale-btn').addEventListener('click', () => openRecordModal());

  try {
    await loadReferenceData();
    await loadSales();
  } catch (err) {
    document.getElementById('sales-table-wrap').innerHTML =
      '<div class="table-empty">Could not load sales. Check your connection and refresh.</div>';
  }
}

init();
