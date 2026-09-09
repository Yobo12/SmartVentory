/**
 * categories.js — Categories CRUD page.
 *
 * Simpler than products.js because GET /categories returns a plain
 * array with no search/skip/limit params (unlike /products, which is
 * paginated server-side). So here: fetch the full list once, then
 * search/sort/paginate entirely in the browser. Fine at SME scale
 * (dozens of categories, not thousands) — flagged here in case the
 * category list ever grows large enough that this stops being true.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { isAdmin } from './auth.js';
import { showToast } from './toast.js';

const PAGE_SIZE = 10;

const state = {
  all: [],       // full list from the server
  filtered: [],  // after search
  page: 0,
  admin: false,
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadCategories() {
  const tableWrap = document.getElementById('categories-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading categories…</div>';

  state.all = await api.get('/categories?active_only=false');
  applySearch(document.getElementById('categories-search').value);
}

function applySearch(query) {
  const q = query.trim().toLowerCase();
  state.filtered = q
    ? state.all.filter((c) => c.category_name.toLowerCase().includes(q))
    : state.all;
  state.page = 0;
  render();
}

function render() {
  renderTable();
  renderPagination();
}

function renderTable() {
  const tableWrap = document.getElementById('categories-table-wrap');
  const start = state.page * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No categories found.</div>';
    return;
  }

  const rows = pageItems
    .map((c) => {
      const actions = state.admin
        ? `
          <div class="table-row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${c.category_id}">Edit</button>
            <button class="btn ${c.is_active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-action="toggle-status" data-id="${c.category_id}" data-active="${c.is_active}">
              ${c.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>`
        : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>${escapeHtml(c.category_name)}</td>
          <td class="cell-muted">${escapeHtml(c.description) || '—'}</td>
          <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-neutral'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>${actions}</td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Description</th>
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
  const el = document.getElementById('categories-pagination');
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

function openModal(mode, categoryId = null) {
  const existing = mode === 'edit' ? state.all.find((c) => c.category_id === categoryId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${mode === 'edit' ? 'Edit Category' : 'Add Category'}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="category-form" novalidate>
          <div class="form-grid">
            <div class="field">
              <label for="f-name">Category name</label>
              <input id="f-name" name="category_name" required value="${escapeHtml(existing?.category_name)}" />
              <div class="field-error">Category name is required.</div>
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
        <button class="btn btn-primary" type="submit" form="category-form" id="modal-submit">
          ${mode === 'edit' ? 'Save Changes' : 'Add Category'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const formData = new FormData(form);
    const payload = {
      category_name: formData.get('category_name').trim(),
      description: formData.get('description').trim() || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'edit' ? 'Saving…' : 'Adding…';

    try {
      if (mode === 'edit') {
        await api.put(`/categories/${categoryId}`, payload);
        showToast('Category updated.', 'success');
      } else {
        await api.post('/categories', payload);
        showToast('Category added.', 'success');
      }
      close();
      await loadCategories();
    } catch (err) {
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not save this category.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Add Category';
    }
  });
}

async function handleToggleStatus(categoryId, currentlyActive) {
  const category = state.all.find((c) => c.category_id === categoryId);
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!window.confirm(`${currentlyActive ? 'Deactivate' : 'Activate'} "${category?.category_name}"?`)) return;

  try {
    await api.patch(`/categories/${categoryId}/${action}`);
    showToast(`Category ${action}d.`, 'success');
    await loadCategories();
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail || 'Action failed.' : 'Could not reach the server.', 'danger');
  }
}

async function init() {
  const user = await mountLayout({ activePage: 'categories' });
  if (!user) return;

  state.admin = isAdmin();
  document.getElementById('add-category-btn')?.classList.toggle('hidden', !state.admin);

  document.getElementById('categories-search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('add-category-btn')?.addEventListener('click', () => openModal('create'));

  try {
    await loadCategories();
  } catch (err) {
    document.getElementById('categories-table-wrap').innerHTML =
      '<div class="table-empty">Could not load categories. Check your connection and refresh.</div>';
  }
}

init();
