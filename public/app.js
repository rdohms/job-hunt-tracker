import { renderMarkdown, toggleTask } from './markdown.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const LABELS = {
  saved: 'Saved', applied: 'Applied', screening: 'Screening',
  interviewing: 'Interviewing', offer: 'Offer', rejected: 'Rejected',
};
const WORK_TYPES = ['', 'Remote', 'Hybrid', 'On-site'];

let state = { statuses: [], jobs: [] };

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
};

async function req(method, path, body) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { data, status: r.status });
  return data;
}

let toastTimer;
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = isError ? 'error' : '';
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3500);
}

async function load() {
  state = await req('GET', '/jobs');
}

/* ---------- Add flow ---------- */

const form = $('#add-form');
const urlInput = $('#add-url');

async function addUrl(url) {
  url = url.trim();
  if (!url) return;
  if (location.hash !== '' && location.hash !== '#/') location.hash = '#/';
  urlInput.value = '';
  const placeholder = h('div', { class: 'card loading' }, h('div', { class: 'spinner' }), h('span', {}, `Scraping ${new URL(url).hostname}…`));
  $('.column[data-status="saved"] .cards')?.prepend(placeholder);
  try {
    const { job, scrapeError } = await req('POST', '/jobs', { url });
    state.jobs.unshift(job);
    toast(scrapeError ? `Added, but scrape was partial (${scrapeError})` : `Added “${job.title}”`, !!scrapeError);
  } catch (e) {
    toast(e.status === 409 ? 'That job is already tracked' : e.message, true);
  }
  render();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  addUrl(urlInput.value);
});

// Pasting a URL anywhere (outside editable fields) adds it.
document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]')) return;
  const text = e.clipboardData.getData('text').trim();
  if (/^https?:\/\/\S+$/.test(text)) {
    e.preventDefault();
    addUrl(text);
  }
});
// Dropping a link onto the page works too.
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('text/uri-list')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  const uri = e.dataTransfer.getData('text/uri-list');
  if (uri && !e.defaultPrevented) {
    e.preventDefault();
    addUrl(uri.split('\n')[0]);
  }
});

/* ---------- Board ---------- */

function renderBoard() {
  const board = h('div', { class: 'board' });
  for (const status of state.statuses) {
    const jobs = state.jobs.filter((j) => j.status === status).sort((a, b) => a.order - b.order);
    const cards = h('div', { class: 'cards' }, jobs.map(card));
    const col = h(
      'section',
      { class: `column s-${status}`, 'data-status': status },
      h('h2', {}, LABELS[status], h('span', { class: 'count' }, String(jobs.length))),
      cards
    );
    wireDropZone(col, cards);
    board.append(col);
  }
  app.replaceChildren(board);
}

function card(job) {
  const meta = [job.workType, job.location, job.pay].filter(Boolean);
  return h(
    'article',
    {
      class: 'card', draggable: 'true', 'data-id': job.id,
      onclick: () => (location.hash = `#/job/${job.id}`),
      ondragstart: (e) => {
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => e.target.classList.add('dragging'));
      },
      ondragend: (e) => e.target.classList.remove('dragging'),
    },
    h('div', { class: 'card-title' }, job.title),
    h('div', { class: 'card-company' }, job.company),
    meta.length && h('div', { class: 'chips' }, meta.map((m) => h('span', { class: `chip ${m === job.workType ? 'wt-' + m.toLowerCase() : ''}` }, m))),
    job.ats && h('div', { class: 'ats' }, job.ats),
    job.match && h('div', { class: `score-badge v-${job.match.verdict}`, title: `Match: ${job.match.verdict}` }, String(job.match.score)),
    h('button', {
      class: `referral-btn${job.referral ? ' on' : ''}`,
      title: job.referral ? 'Has an insider referral (click to unset)' : 'Mark as referred by an insider',
      draggable: 'false',
      onclick: (e) => {
        e.stopPropagation();
        patch(job, { referral: !job.referral });
        e.currentTarget.classList.toggle('on', job.referral);
        e.currentTarget.title = job.referral ? 'Has an insider referral (click to unset)' : 'Mark as referred by an insider';
      },
    }, '🤝'),
    job.notes && h('div', { class: 'has-notes', title: 'Has notes' }, '📝')
  );
}

function dropIndex(container, y) {
  const els = [...container.querySelectorAll('.card[data-id]:not(.dragging)')];
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return els[i];
  }
  return null;
}

function wireDropZone(col, cards) {
  col.addEventListener('dragover', (e) => {
    if (!document.querySelector('.card.dragging')) return;
    e.preventDefault();
    col.classList.add('over');
    const dragging = document.querySelector('.card.dragging');
    const before = dropIndex(cards, e.clientY);
    if (before) cards.insertBefore(dragging, before);
    else cards.append(dragging);
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('over');
  });
  col.addEventListener('drop', async (e) => {
    const dragging = document.querySelector('.card.dragging');
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.column.over').forEach((c) => c.classList.remove('over'));
    // Persist every column that might have changed (cheap, and server skips no-ops).
    const columns = {};
    document.querySelectorAll('.column').forEach((c) => {
      columns[c.dataset.status] = [...c.querySelectorAll('.card[data-id]')].map((x) => x.dataset.id);
    });
    for (const [status, ids] of Object.entries(columns)) {
      ids.forEach((id, i) => {
        const j = state.jobs.find((x) => x.id === id);
        if (j) Object.assign(j, { status, order: i });
      });
    }
    document.querySelectorAll('.column').forEach((c) => {
      c.querySelector('.count').textContent = columns[c.dataset.status].length;
    });
    try {
      await req('POST', '/jobs/reorder', { columns });
    } catch (err) {
      toast(`Save failed: ${err.message}`, true);
      await load();
      render();
    }
  });
}

/* ---------- Detail page ---------- */

function field(label, key, job, opts = {}) {
  const input = opts.options
    ? h('select', {}, opts.options.map(([v, l]) => h('option', { value: v, selected: v === job[key] }, l)))
    : h('input', { type: 'text', value: job[key] || '', placeholder: opts.placeholder || '' });
  const save = () => patch(job, { [key]: input.value });
  input.addEventListener(opts.options ? 'change' : 'blur', save);
  if (!opts.options) input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

const saveTimers = new Map();
async function patch(job, changes, { debounce = 0 } = {}) {
  Object.assign(job, changes);
  const run = async () => {
    setSaveState('Saving…');
    try {
      await req('PATCH', `/jobs/${job.id}`, changes);
      setSaveState('Saved');
    } catch (e) {
      setSaveState('Save failed');
      toast(e.message, true);
    }
  };
  if (!debounce) return run();
  clearTimeout(saveTimers.get(job.id));
  saveTimers.set(job.id, setTimeout(run, debounce));
}

function setSaveState(text) {
  const el = $('#save-state');
  if (el) el.textContent = text;
}

function rescrapeButton(job) {
  const btn = h('button', { class: 'secondary', title: 'Re-fetch title, company, pay, location and description from the URL (notes and status are kept)' }, '↻ Re-scrape');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Scraping…';
    try {
      const { job: fresh, scrapeError } = await req('POST', `/jobs/${job.id}/rescrape`);
      for (const k of ['title', 'company', 'ats', 'pay', 'workType', 'location', 'description']) job[k] = fresh[k];
      toast(scrapeError ? `Partial re-scrape (${scrapeError})` : 'Re-scraped', !!scrapeError);
      if (location.hash === `#/job/${job.id}`) renderDetail(job.id);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      btn.textContent = '↻ Re-scrape';
    }
  });
  return btn;
}

// Rendered markdown that turns into a textarea on click; blur / Esc / Cmd+Enter renders again. Autosaves job[key].
function mdEditor(job, key, placeholder, { minHeight = 240 } = {}) {
  const view = h('div', { class: 'md', title: 'Click to edit' });
  const editor = h('textarea', { class: 'editor', placeholder, spellcheck: 'true' });
  editor.value = job[key] || '';
  const box = h('div', { class: 'notes' }, view, editor);
  box.style.setProperty('--min-h', minHeight + 'px');

  const autosize = () => {
    editor.style.height = 'auto';
    editor.style.height = Math.max(minHeight, editor.scrollHeight + 4) + 'px';
  };
  const showView = () => {
    view.innerHTML = (job[key] || '').trim() ? renderMarkdown(job[key]) : `<p class="placeholder">${placeholder}</p>`;
    view.hidden = false;
    editor.hidden = true;
  };
  const showEditor = () => {
    view.hidden = true;
    editor.hidden = false;
    autosize();
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  };
  view.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (e.target.matches('input[type=checkbox]')) {
      job[key] = toggleTask(job[key], Number(e.target.dataset.task));
      editor.value = job[key];
      patch(job, { [key]: job[key] });
      return;
    }
    showEditor();
  });
  editor.addEventListener('input', () => {
    job[key] = editor.value;
    autosize();
    patch(job, { [key]: editor.value }, { debounce: 500 });
  });
  editor.addEventListener('blur', showView);
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) editor.blur();
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
  });
  showView();
  return { el: box, showEditor, isEmpty: () => !(job[key] || '').trim() };
}

// Runs a NotebookLM-backed action; on success copies `fields` from the response onto job and re-renders.
function aiButton(label, job, endpoint, fields) {
  const btn = h('button', { class: 'secondary' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Asking NotebookLM…';
    try {
      const { job: fresh } = await req('POST', `/jobs/${job.id}/${endpoint}`);
      for (const k of fields) job[k] = fresh[k];
      if (location.hash === `#/job/${job.id}`) renderDetail(job.id);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      btn.textContent = label;
    }
  });
  return btn;
}

function matchPanel(job) {
  const m = job.match;
  const list = (title, items, cls) =>
    items?.length ? h('div', { class: `m-list ${cls}` }, h('h4', {}, title), h('ul', {}, items.map((i) => h('li', {}, i)))) : null;
  return h('div', { class: 'match' },
    m
      ? h('div', {},
          h('div', { class: 'match-head' },
            h('span', { class: `score v-${m.verdict}` }, String(m.score)),
            h('span', { class: 'verdict' }, m.verdict),
            h('span', { class: 'muted' }, `scored ${new Date(m.at).toLocaleDateString()}`)),
          h('p', {}, m.summary),
          h('div', { class: 'm-cols' }, list('Strengths', m.strengths, 'good'), list('Gaps', m.gaps, 'warn'), list('Red flags', m.redFlags, 'bad')))
      : h('p', { class: 'muted' }, 'Not scored yet.'),
    aiButton(m ? '↻ Re-run match' : 'Analyze match', job, 'match', ['match'])
  );
}

function renderDetail(id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) {
    app.replaceChildren(h('div', { class: 'detail' }, h('p', {}, 'Job not found. '), h('a', { href: '#/' }, '← Back to board')));
    return;
  }

  const titleInput = h('input', { class: 'title-input', value: job.title });
  titleInput.addEventListener('blur', () => patch(job, { title: titleInput.value }));
  titleInput.addEventListener('keydown', (e) => e.key === 'Enter' && titleInput.blur());

  const notes = mdEditor(job, 'notes', 'Click to add notes (Markdown supported)…');
  const letter = mdEditor(job, 'coverLetter', 'No cover letter yet. Generate one, or click to write your own…', { minHeight: 160 });

  const desc = job.description
    ? h('details', { class: 'desc' }, h('summary', {}, 'Scraped description'), h('pre', {}, job.description))
    : null;

  const page = h(
    'div',
    { class: 'detail' },
    h(
      'div', { class: 'detail-bar' },
      h('a', { href: '#/', class: 'back' }, '← Board'),
      h('span', { id: 'save-state' }, ''),
      rescrapeButton(job),
      h('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm(`Delete “${job.title}”?`)) return;
          await req('DELETE', `/jobs/${job.id}`);
          state.jobs = state.jobs.filter((j) => j.id !== job.id);
          location.hash = '#/';
        },
      }, 'Delete')
    ),
    titleInput,
    h('div', { class: 'sub' }, h('a', { href: job.url, target: '_blank', rel: 'noopener' }, job.url)),
    h(
      'div', { class: 'fields' },
      field('Company', 'company', job),
      field('Status', 'status', job, { options: state.statuses.map((s) => [s, LABELS[s]]) }),
      field('Type', 'workType', job, { options: WORK_TYPES.map((t) => [t, t || '—']) }),
      field('Location', 'location', job),
      field('Pay', 'pay', job, { placeholder: 'e.g. $150k – $180k' }),
      field('Recruitment system', 'ats', job),
      h('div', { class: 'field' }, h('span', {}, 'Insider referral'),
        h('label', { class: 'switch' },
          h('input', { type: 'checkbox', checked: !!job.referral, onchange: (e) => patch(job, { referral: e.target.checked }) }),
          h('span', { class: 'slider' }), h('span', { class: 'switch-label' }, '🤝 Someone is recommending me')))
    ),
    h('h3', {}, 'Match'),
    matchPanel(job),
    h('h3', {}, 'Cover letter'),
    letter.el,
    h('div', { class: 'row' },
      aiButton(job.coverLetter ? '↻ Regenerate letter' : 'Generate cover letter', job, 'cover-letter', ['coverLetter', 'coverLetterAt']),
      job.coverLetter && h('button', { class: 'secondary', onclick: async (e) => {
        await navigator.clipboard.writeText(job.coverLetter);
        e.target.textContent = 'Copied ✓';
      } }, 'Copy')),
    h('h3', {}, 'Notes'),
    notes.el,
    desc
  );
  app.replaceChildren(page);
  if (notes.isEmpty()) notes.showEditor();
}

/* ---------- Routing ---------- */

function render() {
  const m = /^#\/job\/([\w-]+)/.exec(location.hash);
  m ? renderDetail(m[1]) : renderBoard();
}

window.addEventListener('hashchange', render);
await load();
render();
