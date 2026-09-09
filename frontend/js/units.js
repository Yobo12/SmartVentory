/**
 * units.js — Units of Measure CRUD page (e.g. "Piece", "Kg", "Box").
 * Same client-side search+pagination pattern as categories.js and
 * suppliers.js — see categories.js's docstring for why.
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

async function loadUnits() {
  const tableWrap = document.getElementById('units-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading units…</div>';

  state.all = await api.get('/units?active_only=false');
  applySearch(document.getElementById('units-search').value);
}

function applySearch(query) {
  const q = query.trim().toLowerCase();
  state.filtered = q ? state.all.filter((u) => u.unit_name.toLowerCase().includes(q)) : state.all;
  state.page = 0;
  render();
}

function render() {
  renderTable();
  renderPagination();
}

function renderTable() {
  const tableWrap = document.getElementById('units-table-wrap');
  const start = state.page * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No units found.</div>';
    return;
  }

  const rows = pageItems
    .map((u) => {
      const actions = state.admin
        ? `
          <div class="table-row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${u.unit_id}">Edit</button>
            <button class="btn ${u.is_active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle-status" data-id="${u.unit_id}" data-active="${u.is_active}">
              ${u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>`
        : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>${escapeHtml(u.unit_name)}</td>
          <td class="cell-mono">${escapeHtml(u.symbol) || '—'}</td>
          <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-neutral'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>${actions}</td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Unit</th>
          <th>Symbol</th>
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
  const el = document.getElementById('units-pagination');
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

function openModal(mode, unitId = null) {
  const existing = mode === 'edit' ? state.all.find((u) => u.unit_id === unitId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${mode === 'edit' ? 'Edit Unit' : 'Add Unit'}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="unit-form" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="f-name">Unit name</label>
              <input id="f-name" name="unit_name" required placeholder="e.g. Kilogram" value="${escapeHtml(existing?.unit_name)}" />
              <div class="field-error">Unit name is required.</div>
            </div>
            <div class="field">
              <label for="f-symbol">Symbol <span class="field-optional">(optional)</span></label>
              <input id="f-symbol" name="symbol" placeholder="e.g. kg" value="${escapeHtml(existing?.symbol)}" />
            </div>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="unit-form" id="modal-submit">
          ${mode === 'edit' ? 'Save Changes' : 'Add Unit'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#unit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const formData = new FormData(form);
    const payload = {
      unit_name: formData.get('unit_name').trim(),
      symbol: formData.get('symbol').trim() || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'edit' ? 'Saving…' : 'Adding…';

    try {
      if (mode === 'edit') {
        await api.put(`/units/${unitId}`, payload);
        showToast('Unit updated.', 'success');
      } else {
        await api.post('/units', payload);
        showToast('Unit added.', 'success');
      }
      close();
      await loadUnits();
    } catch (err) {
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not save this unit.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Add Unit';
    }
  });
}

async function handleToggleStatus(unitId, currentlyActive) {
  const unit = state.all.find((u) => u.unit_id === unitId);
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!window.confirm(`${currentlyActive ? 'Deactivate' : 'Activate'} "${unit?.unit_name}"?`)) return;

  try {
    await api.patch(`/units/${unitId}/${action}`);
    showToast(`Unit ${action}d.`, 'success');
    await loadUnits();
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail || 'Action failed.' : 'Could not reach the server.', 'danger');
  }
}

async function init() {
  const user = await mountLayout({ activePage: 'units' });
  if (!user) return;

  state.admin = isAdmin();
  document.getElementById('add-unit-btn')?.classList.toggle('hidden', !state.admin);

  document.getElementById('units-search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('add-unit-btn')?.addEventListener('click', () => openModal('create'));

  try {
    await loadUnits();
  } catch (err) {
    document.getElementById('units-table-wrap').innerHTML =
      '<div class="table-empty">Could not load units. Check your connection and refresh.</div>';
  }
}

init();
