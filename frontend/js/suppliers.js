/**
 * suppliers.js — Suppliers CRUD page.
 *
 * Same shape as categories.js: GET /suppliers returns a plain array
 * with no search/pagination params, so both happen client-side here.
 * See categories.js's docstring for the "fine at SME scale" note.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { isAdmin } from './auth.js';
import { showToast } from './toast.js';

const PAGE_SIZE = 10;

const state = {
  all: [],
  filtered: [],
  page: 0,
  admin: false,
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadSuppliers() {
  const tableWrap = document.getElementById('suppliers-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading suppliers…</div>';

  state.all = await api.get('/suppliers?active_only=false');
  applySearch(document.getElementById('suppliers-search').value);
}

function applySearch(query) {
  const q = query.trim().toLowerCase();
  state.filtered = q
    ? state.all.filter(
        (s) =>
          s.company_name.toLowerCase().includes(q) ||
          (s.contact_person || '').toLowerCase().includes(q)
      )
    : state.all;
  state.page = 0;
  render();
}

function render() {
  renderTable();
  renderPagination();
}

function renderTable() {
  const tableWrap = document.getElementById('suppliers-table-wrap');
  const start = state.page * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No suppliers found.</div>';
    return;
  }

  const rows = pageItems
    .map((s) => {
      const actions = state.admin
        ? `
          <div class="table-row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${s.supplier_id}">Edit</button>
            <button class="btn ${s.is_active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle-status" data-id="${s.supplier_id}" data-active="${s.is_active}">
              ${s.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>`
        : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>${escapeHtml(s.company_name)}</td>
          <td class="cell-muted">${escapeHtml(s.contact_person) || '—'}</td>
          <td class="cell-muted">${escapeHtml(s.phone) || '—'}</td>
          <td class="cell-muted">${escapeHtml(s.email) || '—'}</td>
          <td><span class="badge ${s.is_active ? 'badge-success' : 'badge-neutral'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>${actions}</td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Contact</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openModal('edit', Number(btn.dataset.id)));
  });
  tableWrap.querySelectorAll('[data-action="toggle-status"]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleStatus(Number(btn.dataset.id), btn.dataset.active === 'true'));
  });
}

function renderPagination() {
  const el = document.getElementById('suppliers-pagination');
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

function openModal(mode, supplierId = null) {
  const existing = mode === 'edit' ? state.all.find((s) => s.supplier_id === supplierId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="supplier-form" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="f-company">Company name</label>
              <input id="f-company" name="company_name" required value="${escapeHtml(existing?.company_name)}" />
              <div class="field-error">Company name is required.</div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="f-contact">Contact person <span class="field-optional">(optional)</span></label>
                <input id="f-contact" name="contact_person" value="${escapeHtml(existing?.contact_person)}" />
              </div>
              <div class="field">
                <label for="f-phone">Phone <span class="field-optional">(optional)</span></label>
                <input id="f-phone" name="phone" value="${escapeHtml(existing?.phone)}" />
              </div>
            </div>
            <div class="field">
              <label for="f-email">Email <span class="field-optional">(optional)</span></label>
              <input id="f-email" name="email" type="email" value="${escapeHtml(existing?.email)}" />
            </div>
            <div class="field">
              <label for="f-address">Address <span class="field-optional">(optional)</span></label>
              <textarea id="f-address" name="address">${escapeHtml(existing?.address)}</textarea>
            </div>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="supplier-form" id="modal-submit">
          ${mode === 'edit' ? 'Save Changes' : 'Add Supplier'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#supplier-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const formData = new FormData(form);
    const payload = {
      company_name: formData.get('company_name').trim(),
      contact_person: formData.get('contact_person').trim() || null,
      phone: formData.get('phone').trim() || null,
      email: formData.get('email').trim() || null,
      address: formData.get('address').trim() || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'edit' ? 'Saving…' : 'Adding…';

    try {
      if (mode === 'edit') {
        await api.put(`/suppliers/${supplierId}`, payload);
        showToast('Supplier updated.', 'success');
      } else {
        await api.post('/suppliers', payload);
        showToast('Supplier added.', 'success');
      }
      close();
      await loadSuppliers();
    } catch (err) {
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not save this supplier.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Add Supplier';
    }
  });
}

async function handleToggleStatus(supplierId, currentlyActive) {
  const supplier = state.all.find((s) => s.supplier_id === supplierId);
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!window.confirm(`${currentlyActive ? 'Deactivate' : 'Activate'} "${supplier?.company_name}"?`)) return;

  try {
    await api.patch(`/suppliers/${supplierId}/${action}`);
    showToast(`Supplier ${action}d.`, 'success');
    await loadSuppliers();
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail || 'Action failed.' : 'Could not reach the server.', 'danger');
  }
}

async function init() {
  const user = await mountLayout({ activePage: 'suppliers' });
  if (!user) return;

  state.admin = isAdmin();
  document.getElementById('add-supplier-btn')?.classList.toggle('hidden', !state.admin);

  document.getElementById('suppliers-search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('add-supplier-btn')?.addEventListener('click', () => openModal('create'));

  try {
    await loadSuppliers();
  } catch (err) {
    document.getElementById('suppliers-table-wrap').innerHTML =
      '<div class="table-empty">Could not load suppliers. Check your connection and refresh.</div>';
  }
}

init();
