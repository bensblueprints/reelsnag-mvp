'use strict';
/**
 * Defensive parser for yt-dlp's `--newline` progress output, e.g.:
 *   [download]  45.2% of   10.00MiB at    1.20MiB/s ETA 00:05
 *   [download] 100% of 9.98MiB in 00:08
 *   [download]  12.3% of ~  50.00MiB at  Unknown speed ETA Unknown
 * yt-dlp's exact format drifts between releases, so this matches loosely on
 * "[download] N%" and treats the rest as optional groups. If nothing matches,
 * callers should fall back to an indeterminate progress bar.
 */

const LINE_RE = /\[download\]\s+([\d.]+)%(?:\s+of\s+~?\s*([\d.]+\S*))?(?:\s+at\s+(\S+))?(?:\s+(?:ETA|in)\s+(\S+))?/i;

function parseProgressLine(line) {
  if (!line || typeof line !== 'string') return null;
  const m = line.match(LINE_RE);
  if (!m) return null;
  const percent = parseFloat(m[1]);
  if (Number.isNaN(percent)) return null;
  const speedRaw = m[3];
  return {
    percent,
    size: m[2] || null,
    speed: speedRaw && !/unknown/i.test(speedRaw) ? speedRaw : null,
    eta: m[4] && !/unknown/i.test(m[4]) ? m[4] : null
  };
}

/** True if the line indicates the download/merge has fully finished. */
function isDestinationLine(line) {
  return /\[download\]\s+Destination:/i.test(line) || /\[Merger\]\s+Merging formats into/i.test(line);
}

module.exports = { parseProgressLine, isDestinationLine };
