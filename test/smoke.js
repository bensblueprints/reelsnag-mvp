'use strict';
/**
 * Network-independent-by-default smoke test (no Electron needed).
 *
 *   1. Downloads the real yt-dlp.exe from GitHub releases (only real network
 *      call in the default run) — asserts it exists, is a plausible size,
 *      and reports a version string.
 *   2. Confirms ffmpeg-static resolves and runs `-version`.
 *   3. Generates a local 10s test fixture (testsrc + sine) with ffmpeg —
 *      no network — then trims it and asserts the resulting duration.
 *   4. Extracts MP3 from the fixture and asserts a valid MPEG/ID3 file.
 *   5. Exercises the JobQueue with a stubbed runner: sequential execution,
 *      progress events, cancel mid-run, retry-after-error, queue.json
 *      round-trips through JSON.parse.
 *   6. Feeds captured sample yt-dlp stdout lines through the progress parser.
 *   7. Optional live probe behind SMOKE_LIVE=1 (skipped by default so
 *      `npm test` is fully deterministic beyond the yt-dlp binary download).
 *
 * Assets are cached in test/.cache so re-runs are fast; test/.work is wiped
 * each run.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dl = require('../src/lib/download');
const ffmpeg = require('../src/lib/ffmpeg');
const { JobQueue } = require('../src/lib/queue');
const { parseProgressLine } = require('../src/lib/progress');

const CACHE = path.join(__dirname, '.cache'); // yt-dlp binary (kept between runs)
const WORK = path.join(__dirname, '.work'); // per-run outputs (wiped)

function log(msg) {
  console.log('[smoke] ' + msg);
}

function progressLogger(label) {
  let lastPct = -10;
  return (p) => {
    const pct = p.total ? Math.round((p.received / p.total) * 100) : 0;
    if (pct >= lastPct + 20) {
      lastPct = pct;
      log(`${label}: ${pct}% (${(p.received / 1048576).toFixed(1)} MB)`);
    }
  };
}

async function step1_ytdlpBinary() {
  log('ensuring yt-dlp.exe (real GitHub release download)...');
  const binPath = await dl.ensureYtdlp(CACHE, progressLogger('yt-dlp'));
  assert.ok(fs.existsSync(binPath), 'yt-dlp binary exists');
  const size = fs.statSync(binPath).size;
  assert.ok(size > 5 * 1024 * 1024, 'yt-dlp binary is plausibly sized (>5MB), got ' + size);
  log('yt-dlp binary: ' + binPath + ' (' + (size / 1048576).toFixed(1) + ' MB)');

  const version = dl.getYtdlpVersion(binPath);
  assert.ok(version, 'yt-dlp --version produced output');
  assert.ok(/\d{4}\.\d{2}/.test(version), 'yt-dlp version looks like YYYY.MM(.DD): got ' + JSON.stringify(version));
  log('yt-dlp version: ' + version);
  return binPath;
}

function step2_ffmpegStatic() {
  log('checking ffmpeg-static resolves and runs -version...');
  const { spawnSync } = require('child_process');
  const bin = ffmpeg.ffmpegPath();
  assert.ok(fs.existsSync(bin), 'ffmpeg-static binary path exists: ' + bin);
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(res.status, 0, 'ffmpeg -version exited 0');
  assert.ok(/ffmpeg version/i.test(res.stdout), 'ffmpeg -version printed a version banner');
  log('ffmpeg: ' + bin);
}

async function step3and4_localPipeline() {
  const fixture = path.join(WORK, 'fixture.mp4');
  log('generating 10s local test fixture (testsrc + sine, no network)...');
  await ffmpeg.makeTestFixture(fixture, 10);
  assert.ok(fs.existsSync(fixture), 'fixture mp4 exists');
  assert.ok(fs.statSync(fixture).size > 1000, 'fixture mp4 has content');
  const fixtureDur = await ffmpeg.probeDuration(fixture);
  assert.ok(fixtureDur !== null && Math.abs(fixtureDur - 10) <= 0.5, 'fixture duration ~10s, got ' + fixtureDur);
  log('fixture: ' + fixture + ' (' + fixtureDur.toFixed(2) + 's)');

  log('trimming fixture 2s -> 5s...');
  const trimmed = path.join(WORK, 'trimmed.mp4');
  await ffmpeg.trim(fixture, trimmed, 2, 5);
  assert.ok(fs.existsSync(trimmed), 'trimmed file exists');
  const trimmedDur = await ffmpeg.probeDuration(trimmed);
  assert.ok(trimmedDur !== null && Math.abs(trimmedDur - 3) <= 0.5, 'trimmed duration ~3s, got ' + trimmedDur);
  log('trimmed: ' + trimmed + ' (' + trimmedDur.toFixed(2) + 's)');

  log('extracting MP3 from fixture...');
  const mp3 = path.join(WORK, 'audio.mp3');
  await ffmpeg.extractMp3(fixture, mp3, 128);
  assert.ok(fs.existsSync(mp3), 'mp3 exists');
  const mp3Size = fs.statSync(mp3).size;
  assert.ok(mp3Size > 10 * 1024, 'mp3 file is >10KB, got ' + mp3Size);
  const head = Buffer.alloc(4);
  const fd = fs.openSync(mp3, 'r');
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  const isID3 = head.toString('ascii', 0, 3) === 'ID3';
  const isMpegSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  assert.ok(isID3 || isMpegSync, 'mp3 starts with ID3 tag or MPEG frame sync, got bytes ' + head.toString('hex'));
  log('mp3: ' + mp3 + ' (' + (mp3Size / 1024).toFixed(1) + ' KB, ' + (isID3 ? 'ID3' : 'MPEG-sync') + ')');
}

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 15 } = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function step5_queueUnitTests() {
  log('exercising JobQueue with a stubbed runner...');
  const qdir = path.join(WORK, 'queue-test');
  fs.mkdirSync(qdir, { recursive: true });

  const executionOrder = [];
  const progressEvents = [];
  let failOnce = true;

  const runner = (job, { onProgress, signal }) =>
    new Promise((resolve, reject) => {
      executionOrder.push(job.id);
      if (job.shouldFail && failOnce) {
        failOnce = false;
        return reject(new Error('simulated failure'));
      }
      let pct = 0;
      const tick = setInterval(() => {
        if (signal.aborted) {
          clearInterval(tick);
          return reject(new Error('Cancelled'));
        }
        pct += 25;
        onProgress({ progress: pct });
        progressEvents.push({ id: job.id, progress: pct });
        if (pct >= 100) {
          clearInterval(tick);
          resolve();
        }
      }, 15);
      signal.addEventListener('abort', () => clearInterval(tick));
    });

  const queue = new JobQueue({ dataDir: qdir, concurrency: 1, runner });
  const updates = [];
  queue.on('update', (job) => updates.push({ id: job.id, status: job.status, progress: job.progress }));

  const idA = queue.enqueue({ url: 'https://example.com/a' });
  const idB = queue.enqueue({ url: 'https://example.com/b', shouldFail: true });
  const idC = queue.enqueue({ url: 'https://example.com/c' });

  // Sequential execution: with concurrency 1, job B must not START until A has settled.
  // Poll for a terminal state instead of racing fixed sleeps against timer jitter.
  const aDone = await waitFor(() => ['done', 'error'].includes(queue.get(idA).status));
  assert.ok(aDone, 'job A reached a terminal state');
  assert.strictEqual(queue.get(idA).status, 'done', 'job A completed');
  assert.ok(progressEvents.some((e) => e.id === idA), 'progress events fired for job A');
  assert.ok(executionOrder.indexOf(idA) < executionOrder.indexOf(idB), 'A ran before B (sequential)');

  // Wait for B to fail (first attempt) and C to complete.
  const bFailed = await waitFor(() => queue.get(idB).status === 'error');
  assert.ok(bFailed, 'job B failed on first attempt');
  const cDone = await waitFor(() => queue.get(idC).status === 'done');
  assert.ok(cDone, 'job C eventually completed');

  // Retry after error.
  queue.retry(idB);
  const bRetried = await waitFor(() => queue.get(idB).status === 'done');
  assert.ok(bRetried, 'job B succeeded after retry');

  // Cancel mid-run: enqueue a fresh job and cancel it partway through.
  const idD = queue.enqueue({ url: 'https://example.com/d' });
  const dStarted = await waitFor(() => executionOrder.includes(idD));
  assert.ok(dStarted, 'job D started running');
  queue.cancel(idD);
  const dCancelled = await waitFor(() => queue.get(idD).status === 'error');
  assert.ok(dCancelled, 'cancelled job settles into error status');
  assert.strictEqual(queue.get(idD).error, 'Cancelled', 'cancelled job records Cancelled error');

  // queue.json round-trips through JSON.parse (BOM-free).
  const raw = fs.readFileSync(path.join(qdir, 'queue.json'), 'utf8');
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.jobs) && parsed.jobs.length === 4, 'queue.json round-trips with 4 jobs');

  log('queue: sequential=' + JSON.stringify(executionOrder) + ' updates=' + updates.length);
}

function step6_progressParser() {
  log('parsing sample yt-dlp stdout lines...');
  const samples = [
    '[download]  45.2% of   10.00MiB at    1.20MiB/s ETA 00:05',
    '[download] 100.0% of 9.98MiB in 00:08',
    '[download]  12.3% of ~  50.00MiB at  Unknown speed ETA Unknown',
    '[Merger] Merging formats into "video [abc123].mp4"',
    'some unrelated line'
  ];
  const p1 = parseProgressLine(samples[0]);
  assert.ok(p1 && p1.percent === 45.2, 'parsed 45.2%');
  assert.strictEqual(p1.speed, '1.20MiB/s', 'parsed speed');
  assert.strictEqual(p1.eta, '00:05', 'parsed ETA');

  const p2 = parseProgressLine(samples[1]);
  assert.ok(p2 && p2.percent === 100, 'parsed 100%');

  const p3 = parseProgressLine(samples[2]);
  assert.ok(p3 && p3.percent === 12.3, 'parsed 12.3% with unknown speed/eta');
  assert.strictEqual(p3.speed, null, 'unknown speed normalized to null');
  assert.strictEqual(p3.eta, null, 'unknown ETA normalized to null');

  const p4 = parseProgressLine(samples[3]);
  assert.strictEqual(p4, null, 'merger line is not a progress line (parser is defensive, not a crash)');

  const p5 = parseProgressLine(samples[4]);
  assert.strictEqual(p5, null, 'unrelated line returns null instead of throwing');

  log('progress parser: OK');
}

async function step7_optionalLiveProbe() {
  if (process.env.SMOKE_LIVE !== '1') {
    log('SMOKE_LIVE not set — skipping live probe (this is the default, deterministic path).');
    return;
  }
  log('SMOKE_LIVE=1 — running live probe against a known CC-licensed video...');
  const { probe } = require('../src/lib/ytdlp');
  const binPath = dl.ytdlpBinaryPath(CACHE);
  // Big Buck Bunny trailer — Blender Foundation, CC BY 3.0.
  const meta = await probe(binPath, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  assert.ok(meta.title, 'live probe returned a title');
  assert.ok(Array.isArray(meta.formats) && meta.formats.length > 0, 'live probe returned formats');
  log('live probe OK: ' + meta.title);
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  await step1_ytdlpBinary();
  step2_ffmpegStatic();
  await step3and4_localPipeline();
  await step5_queueUnitTests();
  step6_progressParser();
  await step7_optionalLiveProbe();

  log('ALL SMOKE TESTS PASSED');
})().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
