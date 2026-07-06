'use strict';
/**
 * ffmpeg-static wrapper: trimming, MP3 extraction, duration probing, and a
 * synthetic test-fixture generator (testsrc + sine) used by the smoke test so
 * `npm test` never depends on downloading real video content.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpegPath() {
  // ffmpeg-static resolves to the platform binary inside node_modules.
  // In a packaged app the module lives in app.asar.unpacked (see package.json build config).
  const p = require('ffmpeg-static');
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-2000)}`));
    });
  });
}

function toSeconds(t) {
  if (typeof t === 'number') return t;
  const parts = String(t).split(':').map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** Generate a synthetic N-second MP4 fixture (video testsrc + sine tone). */
async function makeTestFixture(outPath, durationSec = 10) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await run([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc=duration=${durationSec}:size=320x240:rate=15`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15',
    '-c:a', 'aac', '-shortest',
    outPath
  ]);
  return outPath;
}

/** Duration of a media file in seconds (parsed from ffmpeg -i stderr), or null. */
function probeDuration(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', inputPath], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

/**
 * Trim [start, end) seconds/mm:ss. Tries a fast stream-copy first; if the
 * result's duration isn't close to what was requested (common when the
 * nearest keyframe is far from the seek point) it falls back to an accurate
 * re-encode with -ss placed after -i.
 */
async function trim(inputPath, outputPath, start, end) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const ss = toSeconds(start);
  const to = toSeconds(end);
  const expected = to - ss;

  let copyOk = false;
  try {
    await run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(ss), '-to', String(to), '-i', inputPath, '-c', 'copy', outputPath]);
    copyOk = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
  } catch (_) {
    copyOk = false;
  }

  if (copyOk) {
    const dur = await probeDuration(outputPath);
    if (dur !== null && Math.abs(dur - expected) <= 0.75) return outputPath;
  }

  // Accurate fallback: -ss after -i forces frame-accurate (slower) seeking.
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-ss', String(ss), '-to', String(to), '-c:v', 'libx264', '-c:a', 'aac', outputPath]);
  return outputPath;
}

/** Extract the audio track as MP3 at the given bitrate (kbps). */
async function extractMp3(inputPath, outputPath, bitrateKbps = 192) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`, outputPath]);
  return outputPath;
}

module.exports = { ffmpegPath, run, makeTestFixture, probeDuration, trim, extractMp3, toSeconds };
