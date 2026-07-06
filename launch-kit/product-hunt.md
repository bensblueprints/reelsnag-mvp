# Product Hunt Launch — Reelsnag

## Positioning note (required — verbatim)
> Reelsnag is a GUI for the open-source yt-dlp project, intended for **personal use**: downloading your own uploads, content you have rights to, Creative Commons / public-domain media, and material the platform's terms permit you to download. Respect each platform's Terms of Service and copyright law. Don't use it to redistribute or pirate content.

All copy below is written around **"back up YOUR content"** — never "download any video free."

## Name
Reelsnag

## Tagline (60 chars max)
Back up your own videos — a friendly desktop yt-dlp.
<!-- 53 chars -->

## Description (260 chars max)
Reelsnag is a desktop GUI for yt-dlp: paste a URL, pick quality, queue it. Trim clips, extract MP3, grab subtitles, batch a list. For backing up your own uploads and permitted content — no subscription, no cloud upload. $24 once.
<!-- ~230 chars -->

## Full description

Reelsnag exists for one very specific, very common problem: you made a video (or you have every right to a piece of media), it lives on a platform, and you want a real local copy — for archiving, editing, or offline access the platform's own terms allow.

Under the hood it's [yt-dlp](https://github.com/yt-dlp/yt-dlp), the actively-maintained fork of youtube-dl, wrapped in a clean queue-based desktop app so you don't have to touch a terminal or remember flags:

**What you get:**
- Paste a URL, see title/thumbnail/duration, pick a format from the full quality list
- A real download queue — multiple jobs, live progress/speed/ETA, retry, cancel, open-in-folder
- Optional trim (start/end), audio-only MP3 extraction with a bitrate picker, and subtitle downloads
- Batch mode: paste a list of URLs or load a `.txt` file and queue them all
- One-click "Update yt-dlp" — because platforms change and extractors break, often weekly

**Who it's for:** creators re-downloading their own channel uploads for local archives or repurposing, hobbyists archiving Creative Commons or public-domain footage, and anyone who wants their own permitted content off someone else's server and onto their own drive.

**Please use it responsibly.** Reelsnag is a tool for personal use — your own content, content you have rights to, CC/public-domain media, and whatever a platform's terms explicitly allow you to save. It is not built or intended for pirating or redistributing other people's copyrighted work. Respect the platforms' Terms of Service and copyright law.

The code is MIT and open source. The one-time purchase is the polished 1-click Windows installer — pay once, own it forever.

## Maker first comment

Hey hunters 👋

I got tired of paying $10–15/mo to a random "video downloader" website just to grab backups of **my own** uploaded content, and I was never thrilled about routing my files through some third-party's servers to do it.

So I built Reelsnag: yt-dlp + ffmpeg wrapped in a clean queue-based desktop app. Paste a URL, pick a format, hit go — trim, MP3 extraction, and subtitles are all built in, plus batch mode for a whole list of URLs at once.

Honest notes:
- This is a personal-use tool for your own uploads, content you have rights to, and CC/public-domain media — please respect each platform's terms and copyright law. It's not meant for ripping other people's copyrighted content.
- First run downloads the current yt-dlp release (~15-20MB) straight from their GitHub — after that it's fully offline except for whatever URL you paste.
- yt-dlp gets extractor-breaking platform changes fairly often, so there's a one-click "Update yt-dlp" button built right into Settings.
- Source is MIT on GitHub — you can run it free with `npm start`. The $24 gets you the 1-click installer and lifetime updates.

Would love feedback on which extra formats/subtitle languages people want prioritized.

## Gallery shots (5)

1. **Hero shot** — Main window in dark mode: URL bar at top, queue list below with a job mid-download (progress bar, speed, ETA), footer positioning note visible.
2. **Format picker modal** — Probe result for a sample video: thumbnail, title, quality table open, audio-only toggle and trim inputs visible.
3. **Batch mode** — Batch modal with a pasted list of URLs and the "Load .txt file" button, caption "Queue a whole list in one go."
4. **Settings panel** — Output folder, filename template, concurrency selector, and the "Update yt-dlp" button/version label, caption "Extractors break weekly — one click keeps it working."
5. **Comparison card** — Simple graphic: "Downloader subscription: $12/mo, uploads to their cloud ❌ vs Reelsnag: $24 once, 100% local ✅ — pays for itself in under 2 months."
