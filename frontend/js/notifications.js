/**
 * notifications.js — frontend-only notification store.
 *
 * There is no backend notifications system (no endpoint, no table) —
 * everything here lives in localStorage on this browser. That's a real
 * limitation worth knowing: notifications won't sync across devices or
 * survive clearing browser data, and two people sharing a login on
 * different machines won't see each other's notifications. Fine for
 * now per the brief ("initially frontend-generated... later these can
 * connect to backend events"), but not a substitute for a real backend
 * notifications table if that's ever needed.
 *
 * Usage:
 *   import { addNotification } from './notifications.js';
 *   addNotification({ type: 'sale', title: 'Sale completed', description: '...' });
 */

const STORAGE_KEY = 'sv_notifications';
const MAX_STORED = 50;

const ICONS = {
  low_stock: '⚠️',
  purchase: '🚚',
  sale: '💵',
  ai_recommendation: '✨',
  user_created: '👤',
  system_welcome: '👋',
  tour_completed: '🎉',
  export_completed: '⬇️',
};

function getAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_STORED)));
  } catch {
    // Storage full or unavailable (private browsing, etc.) — degrade
    // silently rather than breaking whatever action triggered this.
  }
}

function addNotification({ type, title, description }) {
  const list = getAll();
  list.unshift({
    id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    type,
    title,
    description,
    timestamp: new Date().toISOString(),
    read: false,
  });
  saveAll(list);
  window.dispatchEvent(new CustomEvent('sv:notification-added'));
}

function markAllRead() {
  saveAll(getAll().map((n) => ({ ...n, read: true })));
  window.dispatchEvent(new CustomEvent('sv:notifications-changed'));
}

function clearAll() {
  saveAll([]);
  window.dispatchEvent(new CustomEvent('sv:notifications-changed'));
}

function getUnreadCount() {
  return getAll().filter((n) => !n.read).length;
}

function iconFor(type) {
  return ICONS[type] || '🔔';
}

/** "2 minutes ago" / "Today, 3:45 PM" / "Yesterday" / a full date for
 * anything older — matches the brief's example groupings without
 * needing a date library. */
function relativeTime(isoString) {
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

  const isToday = then.toDateString() === now.toDateString();
  if (isToday) return `Today, ${then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export { addNotification, getAll, markAllRead, clearAll, getUnreadCount, iconFor, relativeTime };
