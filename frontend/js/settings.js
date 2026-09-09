/**
 * settings.js — Settings page. Currently just User Management, since
 * that's the only Settings-shaped feature your backend actually has
 * (Admin-only CRUD on /users, already built before this page existed).
 *
 * Admin-only: the whole /users API requires the Admin role, so Staff
 * users are redirected away entirely rather than shown an empty/broken
 * page — see the isAdmin() check in init().
 *
 * No password reset here: there is no endpoint anywhere in the backend
 * for an admin to reset another user's password, or for a user to
 * change their own. Flagged, not silently omitted — see the note in
 * the Add User modal.
 *
 * GET /users returns a plain array with no search/pagination params
 * (same as categories.js/suppliers.js/units.js) — search and paging
 * happen client-side here for the same reason.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { isAdmin } from './auth.js';
import { showToast } from './toast.js';
import { addNotification } from './notifications.js';

const PAGE_SIZE = 10;

const state = {
  all: [],
  filtered: [],
  page: 0,
  roles: [],
  currentUserId: null,
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function roleName(roleId) {
  return state.roles.find((r) => r.role_id === roleId)?.role_name || `Role #${roleId}`;
}

async function loadRoles() {
  state.roles = await api.get('/roles');
}

async function loadUsers() {
  const tableWrap = document.getElementById('users-table-wrap');
  tableWrap.innerHTML = '<div class="table-loading">Loading users…</div>';

  state.all = await api.get('/users?skip=0&limit=200');
  applySearch(document.getElementById('users-search').value);
}

function applySearch(query) {
  const q = query.trim().toLowerCase();
  state.filtered = q
    ? state.all.filter(
        (u) =>
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
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
  const tableWrap = document.getElementById('users-table-wrap');
  const start = state.page * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    tableWrap.innerHTML = '<div class="table-empty">No users found.</div>';
    return;
  }

  const rows = pageItems
    .map((u) => {
      const isSelf = u.user_id === state.currentUserId;
      const isActive = u.status === 'active';
      const actions = `
        <div class="table-row-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${u.user_id}">Edit</button>
          <button
            class="btn ${isActive ? 'btn-danger' : 'btn-secondary'} btn-sm"
            data-action="toggle-status"
            data-id="${u.user_id}"
            data-active="${isActive}"
            ${isSelf ? 'disabled title="You can\'t deactivate your own account"' : ''}
          >${isActive ? 'Deactivate' : 'Activate'}</button>
        </div>`;

      return `
        <tr>
          <td>
            <div>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}${isSelf ? ' <span class="text-muted" style="font-size:11.5px;">(you)</span>' : ''}</div>
            <div class="cell-muted" style="font-size:12px;">${escapeHtml(u.email)}</div>
          </td>
          <td class="cell-muted">${escapeHtml(u.phone) || '—'}</td>
          <td><span class="badge badge-neutral">${escapeHtml(roleName(u.role_id))}</span></td>
          <td><span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}">${isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${actions}</td>
        </tr>`;
    })
    .join('');

  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Phone</th>
          <th>Role</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openUserModal('edit', Number(btn.dataset.id)));
  });
  tableWrap.querySelectorAll('[data-action="toggle-status"]:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleStatus(Number(btn.dataset.id), btn.dataset.active === 'true'));
  });
}

function renderPagination() {
  const el = document.getElementById('users-pagination');
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

function optionsHTML(list, idKey, labelKey, selectedId) {
  return list
    .map((item) => `<option value="${item[idKey]}" ${item[idKey] === selectedId ? 'selected' : ''}>${escapeHtml(item[labelKey])}</option>`)
    .join('');
}

function openUserModal(mode, userId = null) {
  const existing = mode === 'edit' ? state.all.find((u) => u.user_id === userId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${mode === 'edit' ? 'Edit User' : 'Add User'}</h3>
        <button class="modal__close" type="button" id="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-alert" id="form-alert"></div>
        <form id="user-form" novalidate>
          <div class="form-grid">
            <div class="form-row">
              <div class="field">
                <label for="f-first">First name</label>
                <input id="f-first" name="first_name" required value="${escapeHtml(existing?.first_name)}" />
                <div class="field-error">Required.</div>
              </div>
              <div class="field">
                <label for="f-last">Last name</label>
                <input id="f-last" name="last_name" required value="${escapeHtml(existing?.last_name)}" />
                <div class="field-error">Required.</div>
              </div>
            </div>

            <div class="field">
              <label for="f-email">Email</label>
              <input id="f-email" name="email" type="email" required value="${escapeHtml(existing?.email)}" ${mode === 'edit' ? 'disabled' : ''} />
              ${mode === 'edit' ? '<div class="field-hint">Email can\'t be changed — no endpoint for it.</div>' : ''}
            </div>

            <div class="field">
              <label for="f-phone">Phone <span class="field-optional">(optional)</span></label>
              <input id="f-phone" name="phone" value="${escapeHtml(existing?.phone)}" />
            </div>

            <div class="field">
              <label for="f-role">Role</label>
              <select id="f-role" name="role_id" required>
                ${optionsHTML(state.roles, 'role_id', 'role_name', existing?.role_id)}
              </select>
            </div>

            ${mode === 'create' ? `
            <div class="field">
              <label for="f-password">Temporary password</label>
              <input id="f-password" name="password" type="password" required minlength="8" />
              <div class="field-hint">At least 8 characters. There's no "forgot password" flow yet — share this with them directly.</div>
              <div class="field-error">Password must be at least 8 characters.</div>
            </div>` : ''}
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn-secondary" type="button" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit" form="user-form" id="modal-submit">
          ${mode === 'edit' ? 'Save Changes' : 'Add User'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);

  overlay.querySelector('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const alertBox = overlay.querySelector('#form-alert');
    const submitBtn = overlay.querySelector('#modal-submit');
    alertBox.classList.remove('visible');

    const formData = new FormData(form);

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'edit' ? 'Saving…' : 'Adding…';

    try {
      if (mode === 'edit') {
        const payload = {
          first_name: formData.get('first_name').trim(),
          last_name: formData.get('last_name').trim(),
          phone: formData.get('phone').trim() || null,
          role_id: Number(formData.get('role_id')),
        };
        await api.put(`/users/${userId}`, payload);
        showToast('User updated.', 'success');
      } else {
        const payload = {
          first_name: formData.get('first_name').trim(),
          last_name: formData.get('last_name').trim(),
          email: formData.get('email').trim(),
          phone: formData.get('phone').trim() || null,
          role_id: Number(formData.get('role_id')),
          password: formData.get('password'),
        };
        const created = await api.post('/users', payload);
        showToast('User added.', 'success');
        addNotification({
          type: 'user_created',
          title: 'User created',
          description: `${created.first_name} ${created.last_name} added as ${roleName(created.role_id)}`,
        });
      }
      close();
      await loadUsers();
    } catch (err) {
      alertBox.textContent = err instanceof ApiError ? err.detail || 'Could not save this user.' : 'Could not reach the server.';
      alertBox.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'edit' ? 'Save Changes' : 'Add User';
    }
  });
}

async function handleToggleStatus(userId, currentlyActive) {
  const user = state.all.find((u) => u.user_id === userId);
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!window.confirm(`${currentlyActive ? 'Deactivate' : 'Activate'} ${user?.first_name} ${user?.last_name}?`)) return;

  try {
    await api.patch(`/users/${userId}/status`, { status: currentlyActive ? 'inactive' : 'active' });
    showToast(`User ${action}d.`, 'success');
    await loadUsers();
  } catch (err) {
    showToast(err instanceof ApiError ? err.detail || 'Action failed.' : 'Could not reach the server.', 'danger');
  }
}

async function init() {
  const user = await mountLayout({ activePage: 'settings' });
  if (!user) return;

  if (!isAdmin()) {
    document.getElementById('users-table-wrap').innerHTML =
      '<div class="table-empty">Settings is Admin-only. Ask an administrator if you need something changed here.</div>';
    document.getElementById('add-user-btn')?.classList.add('hidden');
    document.getElementById('users-search')?.setAttribute('disabled', 'true');
    return;
  }

  state.currentUserId = user.user_id;

  document.getElementById('users-search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('add-user-btn').addEventListener('click', () => openUserModal('create'));

  try {
    await loadRoles();
    await loadUsers();
  } catch (err) {
    document.getElementById('users-table-wrap').innerHTML =
      '<div class="table-empty">Could not load users. Check your connection and refresh.</div>';
  }
}

init();
