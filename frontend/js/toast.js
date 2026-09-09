/**
 * toast.js — spawns/dismisses toast notifications into the
 * #toast-container element every page includes.
 *
 * Usage: import { showToast } from './toast.js';
 *        showToast('Product created.', 'success');
 */

const AUTO_DISMISS_MS = 3800;

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  setTimeout(dismiss, AUTO_DISMISS_MS);
  toast.addEventListener('click', dismiss);
}

export { showToast };
