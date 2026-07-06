'use strict';
/**
 * First-run asset download: the yt-dlp.exe binary from the official GitHub
 * releases. Stored under the app data dir passed by the caller (Electron
 * userData in the app, a local cache dir in tests). Never bundled in the repo.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const GITHUB_LATEST_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

function assetName() {
  if (process.platform === 'win32') return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  return 'yt-dlp';
}

/** Ask GitHub for the latest release's download URL + version tag. */
async function fetchLatestRelease() {
  const res = await fetch(GITHUB_LATEST_API, {
    headers: { 'User-Agent': 'clip-grabber-app', Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GitHub API request failed (${res.status})`);
  const data = await res.json();
  const name = assetName();
  const asset = (data.assets || []).find((a) => a.name === name);
  if (!asset) throw new Error(`Could not find asset "${name}" in latest yt-dlp release`);
  return { url: asset.browser_download_url, version: data.tag_name, size: asset.size };
}

/** Stream a URL to disk with progress callbacks. Follows redirects (fetch does). */
async function downloadFile(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once('drain', r));
      }
      if (onProgress) onProgress({ received, total });
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    fs.renameSync(tmp, dest);
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

function binDir(dataDir) {
  return path.join(dataDir, 'bin');
}

function ytdlpBinaryPath(dataDir) {
  const p = path.join(binDir(dataDir), assetName());
  return fs.existsSync(p) ? p : null;
}

async function downloadYtdlp(dataDir, onProgress) {
  const { url } = await fetchLatestRelease();
  const dest = path.join(binDir(dataDir), assetName());
  await downloadFile(url, dest, (p) => onProgress && onProgress({ stage: 'ytdlp', ...p }));
  if (process.platform !== 'win32') {
    try { fs.chmodSync(dest, 0o755); } catch (_) { /* ignore */ }
  }
  const size = fs.statSync(dest).size;
  if (size < 5 * 1024 * 1024) {
    fs.unlinkSync(dest);
    throw new Error(`Downloaded yt-dlp binary looks too small (${size} bytes) — the download may have failed`);
  }
  return dest;
}

/** Download yt-dlp.exe if missing. Returns the binary path. */
async function ensureYtdlp(dataDir, onProgress) {
  const existing = ytdlpBinaryPath(dataDir);
  if (existing) return existing;
  return downloadYtdlp(dataDir, onProgress);
}

/** Force a fresh download of the latest yt-dlp release (the "Update" button). */
async function updateYtdlp(dataDir, onProgress) {
  const existing = ytdlpBinaryPath(dataDir);
  if (existing) {
    try { fs.unlinkSync(existing); } catch (_) { /* ignore */ }
  }
  return downloadYtdlp(dataDir, onProgress);
}

/** Runs `yt-dlp --version` and returns the trimmed stdout, or null on failure. */
function getYtdlpVersion(binPath) {
  try {
    const res = spawnSync(binPath, ['--version'], { encoding: 'utf8', windowsHide: true });
    const out = (res.stdout || '').trim();
    return out || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  binDir,
  ytdlpBinaryPath,
  downloadFile,
  fetchLatestRelease,
  ensureYtdlp,
  updateYtdlp,
  getYtdlpVersion
};
