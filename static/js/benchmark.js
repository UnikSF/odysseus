// Benchmark / Decision mode — guided weighted search.
//
// When active, intercepts the chat submit (see chat.js handleChatSubmit) and runs
// a 3-step wizard inside #chat-history:
//   1. clarifying questions  -> /api/benchmark/questions
//   2. AI-proposed weighted criteria (editable sliders) -> /api/benchmark/criteria
//   3. live-web-search ranking -> /api/benchmark/rank
// Backend logic lives in src/benchmark.py.

import uiModule from './ui.js';
import { hideWelcomeScreen } from './chatRenderer.js';

const API_BASE = '';
const esc = uiModule.esc;
const el = (id) => document.getElementById(id);

let _state = { query: '', questions: [], criteria: [], searchQueries: [] };

// ── Activation ────────────────────────────────────────────────────────────
export function isActive() {
  const c = el('benchmark-toggle');
  return !!(c && c.checked);
}

export function activate() {
  const c = el('benchmark-toggle');
  if (c) c.checked = true;
  const btn = el('benchmark-toggle-btn');
  if (btn) { btn.style.display = ''; btn.classList.add('active'); }
  // Mutually exclusive with Deep Research and Compare.
  const res = el('research-toggle');
  if (res && res.checked) {
    res.checked = false;
    const rb = el('research-toggle-btn');
    if (rb) { rb.style.display = 'none'; rb.classList.remove('active'); }
  }
  try {
    if (window.compareModule && window.compareModule.isActive()) {
      window.compareModule.deactivate(true);
    }
  } catch (_) { /* compare not loaded */ }
  if (uiModule.showToast) uiModule.showToast('Benchmark mode on', 1800);
}

export function deactivate() {
  const c = el('benchmark-toggle');
  if (c) c.checked = false;
  const btn = el('benchmark-toggle-btn');
  if (btn) { btn.style.display = 'none'; btn.classList.remove('active'); }
}

export function toggle() { isActive() ? deactivate() : activate(); }

// ── Networking ────────────────────────────────────────────────────────────
async function postJSON(path, body) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const d = await r.json(); if (d && d.detail) msg = d.detail; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Rendering helpers ─────────────────────────────────────────────────────
function chatBox() { return el('chat-history'); }

function appendUserBubble(text) {
  const box = chatBox();
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.innerHTML = `<div class="role">You</div><div class="body">${esc(text)}</div>`;
  box.appendChild(div);
  uiModule.scrollHistory();
}

function appendCard() {
  const box = chatBox();
  const card = document.createElement('div');
  card.className = 'msg msg-ai benchmark-card';
  card.innerHTML = '<div class="role">Benchmark</div><div class="body benchmark-body"></div>';
  box.appendChild(card);
  uiModule.scrollHistory();
  return card.querySelector('.benchmark-body');
}

function setLoading(body, text) {
  body.innerHTML = `<div class="benchmark-loading"><span class="benchmark-spinner"></span>${esc(text)}</div>`;
  uiModule.scrollHistory();
}

function setError(body, text) {
  body.innerHTML = `<div class="benchmark-error">${esc(text)}</div>`;
}

// ── Step 1: query -> clarifying questions ─────────────────────────────────
export async function handleSubmit() {
  const input = el('message');
  const query = (input ? input.value : '').trim();
  if (!query) return;
  if (input) { input.value = ''; uiModule.autoResize(input); }
  _state = { query, questions: [], criteria: [], searchQueries: [] };
  hideWelcomeScreen();
  appendUserBubble(query);
  const body = appendCard();
  setLoading(body, 'Thinking about what to ask…');
  try {
    const data = await postJSON('/api/benchmark/questions', { query });
    _state.questions = data.questions || [];
    renderQuestions(body, data.intro || '', _state.questions);
  } catch (e) {
    setError(body, e.message || 'Could not generate questions.');
  }
}

function renderQuestions(body, intro, questions) {
  const rows = questions.map((q, i) => `
    <div class="benchmark-q">
      <label for="bm-q-${i}">${esc(q)}</label>
      <input type="text" id="bm-q-${i}" class="benchmark-input" autocomplete="off" />
    </div>`).join('');
  body.innerHTML = `
    <div class="benchmark-intro">${esc(intro)}</div>
    <div class="benchmark-questions">${rows}</div>
    <div class="benchmark-actions">
      <button type="button" class="benchmark-btn primary" id="bm-build-criteria">Build weighted criteria →</button>
    </div>`;
  const go = body.querySelector('#bm-build-criteria');
  go.addEventListener('click', () => {
    const answers = questions.map((q, i) => ({
      question: q,
      answer: (body.querySelector(`#bm-q-${i}`)?.value || '').trim(),
    }));
    loadCriteria(body, answers);
  });
  // Enter in the last field triggers the next step.
  const lastInput = body.querySelector(`#bm-q-${questions.length - 1}`);
  if (lastInput) lastInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); go.click(); }
  });
  const first = body.querySelector('.benchmark-input');
  if (first) first.focus();
  uiModule.scrollHistory();
}

// ── Step 2: answers -> editable weighted criteria ─────────────────────────
async function loadCriteria(body, answers) {
  setLoading(body, 'Designing the scoring benchmark…');
  try {
    const data = await postJSON('/api/benchmark/criteria', { query: _state.query, answers });
    _state.criteria = data.criteria || [];
    _state.searchQueries = data.search_queries || [];
    renderCriteria(body, _state.criteria);
  } catch (e) {
    setError(body, e.message || 'Could not propose criteria.');
  }
}

function renderCriteria(body, criteria) {
  const rows = criteria.map((c, i) => `
    <div class="benchmark-weight-row" data-idx="${i}">
      <div class="benchmark-weight-head">
        <span class="benchmark-weight-name">${esc(c.name)}</span>
        <span class="benchmark-weight-val" id="bm-w-val-${i}">${Math.round(c.weight)}%</span>
      </div>
      <input type="range" min="0" max="100" value="${Math.round(c.weight)}" class="benchmark-slider" id="bm-w-${i}" />
      ${c.why ? `<div class="benchmark-weight-why">${esc(c.why)}</div>` : ''}
    </div>`).join('');
  body.innerHTML = `
    <div class="benchmark-intro">Here's how I'll weigh the options. Adjust any slider, then find the best match.</div>
    <div class="benchmark-weights">${rows}</div>
    <div class="benchmark-weight-total">Normalized share shown live · weights are rescaled to 100%.</div>
    <div class="benchmark-actions">
      <button type="button" class="benchmark-btn" id="bm-back-questions">← Questions</button>
      <button type="button" class="benchmark-btn primary" id="bm-rank">Find best match</button>
    </div>`;

  const sliders = Array.from(body.querySelectorAll('.benchmark-slider'));
  const refreshShares = () => {
    const vals = sliders.map((s) => Number(s.value) || 0);
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    sliders.forEach((s, i) => {
      const pct = Math.round(vals[i] / total * 100);
      const valEl = body.querySelector(`#bm-w-val-${i}`);
      if (valEl) valEl.textContent = `${pct}%`;
    });
  };
  sliders.forEach((s) => s.addEventListener('input', refreshShares));
  refreshShares();

  body.querySelector('#bm-back-questions').addEventListener('click', () => {
    renderQuestions(body, '', _state.questions);
  });
  body.querySelector('#bm-rank').addEventListener('click', () => {
    const edited = criteria.map((c, i) => ({
      name: c.name,
      weight: Number(body.querySelector(`#bm-w-${i}`)?.value) || 0,
      why: c.why || '',
    }));
    _state.criteria = edited;
    loadResults(body, edited);
  });
  uiModule.scrollHistory();
}

// ── Step 3: search + score + rank ─────────────────────────────────────────
async function loadResults(body, criteria) {
  setLoading(body, 'Searching the web and scoring candidates… (this can take ~30s)');
  try {
    const data = await postJSON('/api/benchmark/rank', {
      query: _state.query,
      criteria,
      search_queries: _state.searchQueries,
    });
    if (data.error) { setError(body, data.error); return; }
    renderResults(body, data, criteria);
  } catch (e) {
    setError(body, e.message || 'Could not rank options.');
  }
}

function renderResults(body, data, criteria) {
  const candidates = data.candidates || [];
  const usedCriteria = data.criteria || criteria;
  if (!candidates.length) {
    setError(body, 'No candidates could be extracted from the search results.');
    return;
  }
  const cards = candidates.map((c, idx) => {
    const isWinner = idx === 0;
    const bars = usedCriteria.map((cr) => {
      const score = (c.scores && c.scores[cr.name] != null) ? Number(c.scores[cr.name]) : 0;
      const pct = Math.max(0, Math.min(100, score * 10));
      return `
        <div class="benchmark-crit">
          <span class="benchmark-crit-name">${esc(cr.name)} <span class="benchmark-crit-wt">${Math.round(cr.weight)}%</span></span>
          <span class="benchmark-bar"><span class="benchmark-bar-fill" style="width:${pct}%"></span></span>
          <span class="benchmark-crit-score">${score.toFixed(1)}</span>
        </div>`;
    }).join('');
    return `
      <div class="benchmark-result${isWinner ? ' winner' : ''}">
        <div class="benchmark-result-head">
          <span class="benchmark-rank">#${idx + 1}</span>
          <span class="benchmark-result-name">${esc(c.name)}${isWinner ? ' <span class="benchmark-best-tag">Best match</span>' : ''}</span>
          <span class="benchmark-total">${Math.round(c.total)}<span class="benchmark-total-max">/100</span></span>
        </div>
        ${c.summary ? `<div class="benchmark-result-summary">${esc(c.summary)}</div>` : ''}
        <div class="benchmark-crits">${bars}</div>
      </div>`;
  }).join('');

  const sources = (data.sources || []).slice(0, 8).map((s) => {
    const url = (s && s.url) || '';
    const title = (s && (s.title || s.url)) || url;
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="benchmark-source">${esc(title)}</a>`;
  }).filter(Boolean).join('');

  body.innerHTML = `
    <div class="benchmark-intro">Ranked by your weighted criteria:</div>
    <div class="benchmark-results">${cards}</div>
    ${sources ? `<div class="benchmark-sources"><span class="benchmark-sources-label">Sources</span>${sources}</div>` : ''}
    <div class="benchmark-actions">
      <button type="button" class="benchmark-btn" id="bm-adjust">← Adjust weights</button>
    </div>`;
  body.querySelector('#bm-adjust').addEventListener('click', () => {
    renderCriteria(body, _state.criteria);
  });
  uiModule.scrollHistory();
}

// ── Init / wiring ─────────────────────────────────────────────────────────
function init() {
  const overflowBtn = el('overflow-benchmark-btn');
  if (overflowBtn) {
    overflowBtn.addEventListener('click', () => {
      toggle();
      overflowBtn.classList.toggle('active', isActive());
      const menu = el('overflow-menu');
      if (menu) menu.classList.add('hidden');
    });
  }
  const indicator = el('benchmark-toggle-btn');
  if (indicator) {
    indicator.addEventListener('click', () => {
      deactivate();
      if (overflowBtn) overflowBtn.classList.remove('active');
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

const benchmarkModule = { isActive, activate, deactivate, toggle, handleSubmit };
window.benchmarkModule = benchmarkModule;
export default benchmarkModule;
