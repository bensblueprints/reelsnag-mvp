'use strict';

const state = {
  jobs: new Map(),
  order: [],
  pendingProbe: null,
  settings: null
};

/* ---------------- Tabs ---------------- */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'history') refreshHistory();
    if (tab.dataset.tab === 'settings') refreshSettings();
  });
});

/* ---------------- First-run banner / binary status ---------------- */
async function refreshBinaryStatus() {
  const status = await window.api.binaryStatus();
  const label = document.getElementById('ytdlpVersionLabel');
  if (status.ytdlpInstalled) {
    label.textContent = 'yt-dlp ' + (status.ytdlpVersion || 'installed');
  } else {
    label.textContent = 'yt-dlp not installed yet';
  }
  return status;
}

window.api.onBinariesProgress((p) => {
  const banner = document.getElementById('firstRunBanner');
  const detail = document.getElementById('bannerDetail');
  const bar = document.getElementById('bannerBar');
  if (p.stage === 'done') {
    bar.style.width = '100%';
    setTimeout(() => banner.classList.add('hidden'), 600);
    refreshBinaryStatus();
    return;
  }
  banner.classList.remove('hidden');
  const pct = p.pct != null ? p.pct : 0;
  bar.style.width = pct + '%';
  detail.textContent = `Downloading yt-dlp… ${pct}% (${((p.received || 0) / 1048576).toFixed(1)} MB)`;
});

document.getElementById('updateYtdlpBtn').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Updating…';
  try {
    await window.api.updateYtdlp();
  } catch (err) {
    alert('Update failed: ' + err.message);
  } finally {
    e.target.disabled = false;
    e.target.textContent = 'Update yt-dlp';
    refreshBinaryStatus();
  }
});

/* ---------------- Queue rendering ---------------- */
function fmtBytes(n) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + units[i];
}

function jobCardHtml(job) {
  const title = (job.meta && job.meta.title) || job.url;
  const thumb = (job.meta && job.meta.thumbnail) || '';
  const pct = Math.max(0, Math.min(100, job.progress || 0));
  const fillClass = job.status === 'done' ? 'done' : job.status === 'error' ? 'error' : '';
  const canCancel = ['queued', 'downloading', 'processing', 'probing'].includes(job.status);
  const canRetry = job.status === 'error';
  return `
    <li class="job-card" data-id="${job.id}">
      ${thumb ? `<img class="job-thumb" src="${thumb}" alt="" />` : '<div class="job-thumb"></div>'}
      <div class="job-main">
        <div class="job-title" title="${title}">${title}</div>
        <div class="job-meta">
          <span class="job-status-chip ${job.status}">${job.status}</span>
          ${job.speed ? `<span>${job.speed}</span>` : ''}
          ${job.eta ? `<span>ETA ${job.eta}</span>` : ''}
          ${job.error ? `<span style="color:var(--error)">${job.error}</span>` : ''}
        </div>
        <div class="job-progress-bar"><div class="job-progress-fill ${fillClass}" style="width:${pct}%"></div></div>
      </div>
      <div class="job-actions">
        ${canCancel ? `<button class="btn ghost small" data-action="cancel">Cancel</button>` : ''}
        ${canRetry ? `<button class="btn ghost small" data-action="retry">Retry</button>` : ''}
        ${job.status === 'done' && job.filePath ? `<button class="btn ghost small" data-action="folder">Open folder</button>` : ''}
        <button class="btn ghost small" data-action="remove">✕</button>
      </div>
    </li>`;
}

function renderQueue() {
  const list = document.getElementById('queueList');
  const empty = document.getElementById('queueEmpty');
  const jobs = state.order.map((id) => state.jobs.get(id)).filter(Boolean);
  empty.classList.toggle('hidden', jobs.length > 0);
  list.innerHTML = jobs.map(jobCardHtml).join('');
}

document.getElementById('queueList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.job-card').dataset.id;
  const action = btn.dataset.action;
  if (action === 'cancel') await window.api.cancel(id);
  if (action === 'retry') await window.api.retry(id);
  if (action === 'remove') { await window.api.removeJob(id); state.jobs.delete(id); state.order = state.order.filter((x) => x !== id); renderQueue(); }
  if (action === 'folder') {
    const job = state.jobs.get(id);
    if (job && job.filePath) window.api.openInFolder(job.filePath);
  }
});

window.api.onJobUpdate((job) => {
  if (!state.jobs.has(job.id)) state.order.push(job.id);
  state.jobs.set(job.id, job);
  renderQueue();
});

/* ---------------- Add URL / format picker ---------------- */
document.getElementById('addBtn').addEventListener('click', () => addUrl());
document.getElementById('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addUrl(); });

async function addUrl() {
  const input = document.getElementById('urlInput');
  const url = input.value.trim();
  if (!url) return;
  input.value = '';
  const addBtn = document.getElementById('addBtn');
  addBtn.disabled = true;
  addBtn.textContent = 'Probing…';
  try {
    const meta = await window.api.probe(url);
    openFormatModal(url, meta);
  } catch (err) {
    alert('Could not read that URL:\n' + err.message);
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = 'Add';
  }
}

function openFormatModal(url, meta) {
  state.pendingProbe = { url, meta };
  document.getElementById('fmTitle').textContent = meta.title;
  document.getElementById('fmThumb').src = meta.thumbnail || '';
  const mins = meta.duration ? Math.floor(meta.duration / 60) + ':' + String(Math.round(meta.duration % 60)).padStart(2, '0') : '?';
  document.getElementById('fmMeta').textContent = `${meta.uploader} · ${mins}`;

  const tbody = document.getElementById('fmFormatTable');
  const rows = meta.formats.slice().reverse().slice(0, 20);
  tbody.innerHTML = rows.map((f, i) => `
    <tr data-format-id="${f.formatId}" class="${i === 0 ? 'selected' : ''}">
      <td>${f.resolution}</td><td>${f.ext}</td><td>${f.vcodec !== 'none' ? f.vcodec : f.acodec}</td>
      <td>${f.filesize ? fmtBytes(f.filesize) : '—'}</td><td></td>
    </tr>`).join('');
  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach((t) => t.classList.remove('selected'));
      tr.classList.add('selected');
    });
  });

  const subsList = document.getElementById('fmSubsList');
  const allSubs = Array.from(new Set([...(meta.subtitles || []), ...(meta.autoCaptions || [])]));
  subsList.innerHTML = allSubs.length
    ? allSubs.map((lang) => `<label><input type="checkbox" value="${lang}" /> ${lang}</label>`).join('')
    : '<span class="fm-meta">No subtitles available</span>';

  document.getElementById('fmAudioOnly').checked = false;
  document.getElementById('fmTrimEnable').checked = false;
  document.getElementById('fmTrimStart').value = '';
  document.getElementById('fmTrimEnd').value = '';

  showModal('formatModal');
}

document.getElementById('fmAddBtn').addEventListener('click', async () => {
  const { url, meta } = state.pendingProbe;
  const audioOnly = document.getElementById('fmAudioOnly').checked;
  const bitrate = Number(document.getElementById('fmBitrate').value);
  const selectedRow = document.querySelector('#fmFormatTable tr.selected');
  const formatId = selectedRow ? selectedRow.dataset.formatId : 'best';
  const trimEnabled = document.getElementById('fmTrimEnable').checked;
  const trim = trimEnabled
    ? { start: document.getElementById('fmTrimStart').value || '0:00', end: document.getElementById('fmTrimEnd').value }
    : null;
  const subs = Array.from(document.querySelectorAll('#fmSubsList input:checked')).map((c) => c.value);

  await window.api.enqueue({ url, meta, audioOnly, audioBitrate: audioOnly ? bitrate : null, formatId, trim, subs });
  hideModal('formatModal');
});

/* ---------------- Batch modal ---------------- */
document.getElementById('batchBtn').addEventListener('click', () => showModal('batchModal'));
document.getElementById('loadTxtBtn').addEventListener('click', async () => {
  const urls = await window.api.openTxtBatchFile();
  const ta = document.getElementById('batchTextarea');
  ta.value = (ta.value ? ta.value + '\n' : '') + urls.join('\n');
});
document.getElementById('batchAddBtn').addEventListener('click', async () => {
  const urls = document.getElementById('batchTextarea').value
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!urls.length) return hideModal('batchModal');
  await window.api.enqueueBatch(urls, { formatId: 'best', audioOnly: false });
  document.getElementById('batchTextarea').value = '';
  hideModal('batchModal');
});

/* ---------------- Modal helpers ---------------- */
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => hideModal(el.dataset.close)));

/* ---------------- History ---------------- */
async function refreshHistory() {
  const items = await window.api.getHistory();
  const empty = document.getElementById('historyEmpty');
  const list = document.getElementById('historyList');
  empty.classList.toggle('hidden', items.length > 0);
  list.innerHTML = items.map((it) => `
    <li class="job-card">
      <div class="job-main">
        <div class="job-title">${it.title}</div>
        <div class="job-meta">
          <span>${it.formatLabel || ''}</span>
          <span>${it.bytes ? fmtBytes(it.bytes) : ''}</span>
          <span>${new Date(it.finishedAt).toLocaleString()}</span>
        </div>
      </div>
      <div class="job-actions">
        <button class="btn ghost small" data-path="${it.filePath || ''}" data-action="open-history-folder">Open folder</button>
      </div>
    </li>`).join('');
}
document.getElementById('historyList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="open-history-folder"]');
  if (btn && btn.dataset.path) window.api.openInFolder(btn.dataset.path);
});
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  await window.api.clearHistory();
  refreshHistory();
});

/* ---------------- Settings ---------------- */
async function refreshSettings() {
  const s = await window.api.getSettings();
  state.settings = s;
  document.getElementById('outDirInput').value = s.outDir || '';
  document.getElementById('templateInput').value = s.template || '';
  document.getElementById('defaultQualitySelect').value = s.defaultQuality || 'best';
  document.getElementById('concurrencySelect').value = String(s.concurrency || 1);
  document.getElementById('subLangsInput').value = (s.subLangsDefault || []).join(', ');
}
document.getElementById('chooseFolderBtn').addEventListener('click', async () => {
  const dir = await window.api.chooseFolder();
  if (dir) document.getElementById('outDirInput').value = dir;
});
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const patch = {
    outDir: document.getElementById('outDirInput').value,
    template: document.getElementById('templateInput').value,
    defaultQuality: document.getElementById('defaultQualitySelect').value,
    concurrency: Number(document.getElementById('concurrencySelect').value),
    subLangsDefault: document.getElementById('subLangsInput').value.split(',').map((s) => s.trim()).filter(Boolean)
  };
  await window.api.setSettings(patch);
  const btn = document.getElementById('saveSettingsBtn');
  const original = btn.textContent;
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = original; }, 1200);
});

/* ---------------- Init ---------------- */
(async function init() {
  const jobs = await window.api.listJobs();
  jobs.forEach((job) => { state.order.push(job.id); state.jobs.set(job.id, job); });
  renderQueue();
  await refreshBinaryStatus();
  await refreshSettings();
})();
