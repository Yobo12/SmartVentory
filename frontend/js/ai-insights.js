/**
 * ai-insights.js — AI Insights page, the app's "signature" section
 * per the brief.
 *
 * Two very different kinds of endpoint feed this page, and the UI
 * deliberately keeps them visually distinct rather than blending them:
 *
 *   HEURISTIC (no external dependency, always work):
 *     GET /ai/low-stock-analysis        → health summary count
 *     GET /ai/restocking-suggestions    → "Priority Recommendations"
 *     GET /ai/sales-trends              → (used on the Dashboard already)
 *
 *   GEMINI-POWERED (needs GEMINI_API_KEY configured in the backend's
 *   .env — the "Generate Insight" button):
 *     POST /ai/generate-insight/{product_id}
 *     GET  /ai/recommendations           → history of past generations
 *
 * IMPORTANT — carried over verbatim from the backend's own docstring:
 * generate-insight was NOT tested end-to-end in the environment this
 * backend was built in (no outbound access to Google's API there). It
 * may 503 ("not configured") or 502 (Gemini call failed) on first real
 * use — this page handles both explicitly rather than showing a
 * generic error, but you should expect to debug this one live rather
 * than assume it already works.
 */

import { mountLayout } from './layout.js';
import { api, ApiError } from './api.js';
import { addNotification } from './notifications.js';

const state = {
  products: [],
  restockSuggestions: [],
  recommendations: [],
  recommendationsTotal: 0,
  recSkip: 0,
};
const REC_PAGE_SIZE = 10;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Health summary (heuristic — always available)
// ============================================================

async function loadHealthSummary() {
  const [lowStock, restockSuggestions] = await Promise.all([
    api.get('/ai/low-stock-analysis'),
    api.get('/ai/restocking-suggestions?lookback_days=30'),
  ]);
  state.restockSuggestions = restockSuggestions;

  document.getElementById('health-low-stock').textContent = lowStock.length;
  document.getElementById('health-restock').textContent = restockSuggestions.length;
  document.getElementById('health-generated').textContent = state.recommendationsTotal;

  renderPrioritySuggestions();
}

function renderPrioritySuggestions() {
  const wrap = document.getElementById('priority-suggestions-wrap');
  if (state.restockSuggestions.length === 0) {
    wrap.innerHTML = '<div class="table-empty">Nothing needs restocking right now.</div>';
    return;
  }

  wrap.innerHTML = state.restockSuggestions
    .map(
      (s) => `
        <div class="card card-hover" style="margin-bottom:var(--space-3);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-4);flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;">${escapeHtml(s.product_name)}</div>
              <div class="cell-muted" style="font-size:12px;">SKU ${escapeHtml(s.sku)} · ${Number(s.current_stock).toLocaleString()} in stock · ~${Number(s.average_daily_sales).toFixed(1)}/day sold</div>
            </div>
            <span class="badge badge-warning">Suggest restocking ${Math.ceil(Number(s.suggested_restock_quantity)).toLocaleString()} units</span>
          </div>
        </div>`
    )
    .join('');
}

// ============================================================
// Generate Insight (Gemini-powered)
// ============================================================

async function loadProductsForSelect() {
  const data = await api.get('/products?limit=200&active_only=true');
  state.products = data.items;
  const select = document.getElementById('insight-product-select');
  select.innerHTML =
    '<option value="">Select a product…</option>' +
    state.products.map((p) => `<option value="${p.product_id}">${escapeHtml(p.product_name)} (${escapeHtml(p.sku)})</option>`).join('');
}

async function handleGenerateInsight() {
  const select = document.getElementById('insight-product-select');
  const resultWrap = document.getElementById('insight-result-wrap');
  const generateBtn = document.getElementById('generate-insight-btn');

  const productId = select.value;
  if (!productId) {
    resultWrap.innerHTML = '<div class="form-alert visible">Pick a product first.</div>';
    return;
  }

  generateBtn.disabled = true;
  resultWrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-6) 0;">
      <div class="neural-orb neural-orb--sm">
        <div class="neural-orb__ring"></div>
        <div class="neural-orb__core"></div>
        <div class="neural-orb__node"></div>
      </div>
      <span class="text-secondary">AI is analyzing this product…</span>
    </div>`;

  try {
    const result = await api.post(`/ai/generate-insight/${productId}`);
    renderInsightResult(result);
    const productName = select.selectedOptions[0]?.textContent || 'product';
    addNotification({
      type: 'ai_recommendation',
      title: 'AI recommendation generated',
      description: `New insight for ${productName}`,
    });
    state.recSkip = 0;
    await loadRecommendations();
    await loadHealthSummary();
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) {
      resultWrap.innerHTML = '<div class="form-alert visible">AI insights aren\'t configured yet — this backend needs a GEMINI_API_KEY set in its .env file.</div>';
    } else if (err instanceof ApiError && err.status === 502) {
      resultWrap.innerHTML = '<div class="form-alert visible">The AI service call failed. This endpoint is flagged as untested end-to-end in the handover — worth checking your Gemini API key and quota.</div>';
    } else {
      const message = err instanceof ApiError ? err.detail || 'Could not generate an insight.' : 'Could not reach the server.';
      resultWrap.innerHTML = `<div class="form-alert visible">${escapeHtml(message)}</div>`;
    }
  } finally {
    generateBtn.disabled = false;
  }
}

function renderInsightResult(rec) {
  const resultWrap = document.getElementById('insight-result-wrap');
  const confidencePct = rec.confidence_score !== null ? Math.round(rec.confidence_score * 100) : null;

  resultWrap.innerHTML = `
    <div class="card fade-in" style="background: var(--bg-elevated);">
      <p style="margin-bottom:var(--space-4);">${escapeHtml(rec.recommendation)}</p>
      ${confidencePct !== null ? `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:var(--space-1);">
            <span>Confidence</span><span>${confidencePct}%</span>
          </div>
          <div style="height:6px;border-radius:var(--radius-full);background:var(--surface-hover);overflow:hidden;">
            <div style="height:100%;width:${confidencePct}%;background:linear-gradient(90deg, var(--primary), var(--accent));"></div>
          </div>
        </div>` : ''}
    </div>`;
}

// ============================================================
// Recommendation history
// ============================================================

async function loadRecommendations() {
  const wrap = document.getElementById('history-table-wrap');
  wrap.innerHTML = '<div class="table-loading">Loading history…</div>';

  const data = await api.get(`/ai/recommendations?skip=${state.recSkip}&limit=${REC_PAGE_SIZE}`);
  state.recommendations = data.items;
  state.recommendationsTotal = data.total;
  document.getElementById('health-generated').textContent = data.total;

  renderHistoryTable();
  renderHistoryPagination();
}

function renderHistoryTable() {
  const wrap = document.getElementById('history-table-wrap');
  if (state.recommendations.length === 0) {
    wrap.innerHTML = '<div class="table-empty">No AI insights generated yet — try the panel above.</div>';
    return;
  }

  const rows = state.recommendations
    .map((r) => {
      const product = state.products.find((p) => p.product_id === r.product_id);
      const confidencePct = r.confidence_score !== null ? `${Math.round(r.confidence_score * 100)}%` : '—';
      return `
        <tr>
          <td>${escapeHtml(product?.product_name) || `Product #${r.product_id}`}</td>
          <td style="max-width:360px;">${escapeHtml(r.recommendation)}</td>
          <td class="cell-mono">${confidencePct}</td>
          <td class="cell-muted">${formatDateTime(r.generated_at)}</td>
          <td><span class="badge badge-neutral">${escapeHtml(r.status)}</span></td>
        </tr>`;
    })
    .join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Product</th><th>Recommendation</th><th>Confidence</th><th>Generated</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderHistoryPagination() {
  const el = document.getElementById('history-pagination');
  const currentPage = Math.floor(state.recSkip / REC_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.recommendationsTotal / REC_PAGE_SIZE));

  el.innerHTML = `
    <span>${state.recommendationsTotal === 0 ? 0 : state.recSkip + 1}–${Math.min(state.recSkip + REC_PAGE_SIZE, state.recommendationsTotal)} of ${state.recommendationsTotal}</span>
    <div class="table-pagination__controls">
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn-secondary btn-sm table-pagination__page" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => { state.recSkip = Math.max(0, state.recSkip - REC_PAGE_SIZE); loadRecommendations(); });
  document.getElementById('page-next')?.addEventListener('click', () => { state.recSkip += REC_PAGE_SIZE; loadRecommendations(); });
}

// ============================================================
// Init
// ============================================================

async function init() {
  const user = await mountLayout({ activePage: 'ai-insights' });
  if (!user) return;

  document.getElementById('generate-insight-btn').addEventListener('click', handleGenerateInsight);

  try {
    await loadProductsForSelect();
    await loadRecommendations();
    await loadHealthSummary();
  } catch (err) {
    document.getElementById('history-table-wrap').innerHTML =
      '<div class="table-empty">Could not load AI Insights. Check your connection and refresh.</div>';
  }
}

init();
