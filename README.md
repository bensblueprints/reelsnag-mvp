# Reelsnag

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A clean desktop GUI for yt-dlp. Paste a URL, pick a quality, queue it. Trim clips, extract MP3s, grab subtitles, batch a whole list — $24 once, no subscription.**

Reelsnag wraps the excellent open-source [yt-dlp](https://github.com/yt-dlp/yt-dlp) project in a friendly dark-mode desktop app: a download queue with real progress bars, per-job trim/MP3/subtitle options, and batch import from a text file. No account, no monthly fee, no ads.

![Screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to run it from source? Grab the packaged Windows installer (one-time purchase, lifetime updates):

**→ [https://whop.com/benjisaiempire/reelsnag](https://whop.com/benjisaiempire/reelsnag)**

The source here is MIT-licensed and always will be — the installer is just the convenient, pre-packaged version.

## Positioning — please read

> Reelsnag is a GUI for the open-source yt-dlp project, intended for **personal use**: downloading your own uploads, content you have rights to, Creative Commons / public-domain media, and material the platform's terms permit you to download. Respect each platform's Terms of Service and copyright law. Don't use it to redistribute or pirate content.

In practice that means: creators backing up their **own** uploaded videos, archivists saving Creative Commons or public-domain footage, and offline access to material a platform's own terms allow you to download. It is not a tool for mass-ripping other people's copyrighted content — that's on you to avoid, and it's against most platforms' terms anyway.

## Features

- 🔗 **Paste a URL → probe** — fetches title, thumbnail, duration, uploader, and every available format via `yt-dlp -J`
- 📊 **Format/quality picker** — grouped by resolution, audio-only option, "best" default, automatic video+audio merge via ffmpeg when needed
- 📥 **Download queue** — multiple jobs, sequential-by-default (1–3 concurrent), live progress/speed/ETA, pause-as-cancel, retry, remove, open-in-folder
- ✂️ **Trim** — optional start/end trim per job, fast stream-copy with an automatic accurate re-encode fallback
- 🎵 **Extract MP3** — audio-only downloads with a bitrate picker (128/192/320 kbps)
- 💬 **Subtitles** — download available subs or auto-captions as `.srt` alongside the video
- 📋 **Batch mode** — paste a list of URLs or load a `.txt` file (one URL per line), enqueue them all at once
- ⚙️ **Settings** — output folder, filename template, default quality, concurrency, default subtitle languages
- 🍪 **Cookie import** — for sites like Facebook and Instagram that only serve full video info to a logged-in session, import cookies live from an installed browser (Chrome/Edge/Firefox/Brave/Opera/Vivaldi) or load a `cookies.txt` export — for your own account's permitted content, same as opening it in that browser
- 🔄 **Self-updating engine** — one-click "Update yt-dlp" because extractors break and yt-dlp ships fixes weekly
- 🕘 **History** — every completed download recorded locally, jump straight to the file

## Quick start

```bash
git clone https://github.com/bensblueprints/clip-grabber
cd clip-grabber
npm i
npm start
```

On first use the app downloads two things (with a visible progress bar), then everything runs offline:

1. **yt-dlp.exe** — the current release, straight from `github.com/yt-dlp/yt-dlp/releases`
2. **ffmpeg** — bundled via the `ffmpeg-static` npm package (no separate install)

Neither binary is committed to this repo — they're fetched on first run, exactly like the `whisper-transcriber` app in this same suite.

## How it compares

| | **Reelsnag** | Typical "downloader" subscription service |
|---|---|---|
| Price | **$24 one-time** | $10–15/month |
| Cost after 1 year | **$24** | $120–180 |
| Runs locally | **Yes — nothing leaves your machine** | No — video is proxied through their servers |
| Format/quality control | **Full yt-dlp format list** | Usually locked to a few presets |
| Batch downloads | **Yes, from a queue or .txt file** | Often a paid tier |
| Trim / MP3 / subtitles | **Built in** | Rare, or paywalled |
| Engine updates | **One-click "Update yt-dlp"** | Depends on their backend |
| Account required | **No** | Yes |

*Pays for itself in under 2 months versus a $12/mo converter subscription.*

## Tech stack

- **Electron** — main + preload + renderer, plain HTML/CSS/JS (no framework bloat)
- **yt-dlp** — the actively-maintained fork of youtube-dl, downloaded from official GitHub releases on first run
- **ffmpeg-static** — bundled ffmpeg handles merging, trimming, and MP3 extraction
- **JobQueue** (`src/lib/queue.js`) — a plain-Node queue module with persisted state (`queue.json`), decoupled from Electron so it's independently unit-testable

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Launch the app |
| `npm test` | Network-independent-by-default smoke test — downloads the real yt-dlp binary, generates a local ffmpeg test fixture, trims it, extracts MP3, exercises the queue (sequential execution, cancel, retry) and the progress parser. Set `SMOKE_LIVE=1` to additionally run a live probe against a known CC-licensed video. |
| `npm run dist` | Build the Windows NSIS installer (electron-builder) |

## Privacy

No telemetry, no analytics, no accounts. The only network calls are the one-time yt-dlp binary download (GitHub) and whatever URL you explicitly paste in — both clearly surfaced in the UI. Downloaded files and history live in your local app-data folder.

## License

[MIT](LICENSE) © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
