# Launch Strategy — Reelsnag

## Positioning note (required — verbatim)
> Reelsnag is a GUI for the open-source yt-dlp project, intended for **personal use**: downloading your own uploads, content you have rights to, Creative Commons / public-domain media, and material the platform's terms permit you to download. Respect each platform's Terms of Service and copyright law. Don't use it to redistribute or pirate content.

Every community pitch and post below leads with the personal-archive/creator-backup framing, not "free video downloader."

## Target communities

- **r/DataHoarder** — Angle: "Local archival tool for your own uploads + CC/public-domain media, queue-based, format picker, one-click yt-dlp engine updates." This sub is rules-strict about piracy talk — lead entirely with self-archival and CC/public-domain use cases, and be explicit that it's a GUI over yt-dlp (a tool they already know and largely approve of) rather than a new scraper.
- **r/NewTubers** — Angle: "Backup tool for your own uploaded videos" — many small creators don't have a local copy of everything they've published across platforms; frame as a channel-backup utility, mention batch mode for backing up an entire channel's worth of URLs at once.
- **r/podcasting** — Angle: extracting an MP3 backup of your own video episodes for redistribution on audio-only feeds you own.
- **r/archivists / r/degoogle** — Angle: personal digital preservation, running locally instead of trusting a cloud "downloader" site with your files.
- **r/electron** or **r/SideProject** — Angle: technical build post (Electron + yt-dlp + ffmpeg-static, JobQueue architecture, first-run binary download pattern) for maker-community feedback, not a promotional post.

## Hacker News "Show HN" draft

**Title:** Show HN: Reelsnag – a desktop GUI for yt-dlp, for backing up your own videos

**Body:**
I built Reelsnag because I kept needing to back up my own channel's videos (and some CC-licensed footage I use in a personal archive) and didn't want to keep typing yt-dlp flags into a terminal or trust a random "downloader" website with the process.

It's an Electron app: paste a URL, it probes with `yt-dlp -J` and shows you title/thumbnail/format list, you pick quality (or audio-only MP3), optionally trim start/end and grab subtitles, and it queues the download with real progress parsing. Batch mode takes a `.txt` file of URLs. ffmpeg is bundled via `ffmpeg-static`; yt-dlp itself is downloaded from the official GitHub releases on first run (never bundled, since it needs frequent updates) — there's a one-click "Update yt-dlp" button in Settings for when extractors break.

This is explicitly a personal-use tool — your own uploads, content you have rights to, CC/public-domain media, and whatever a platform's terms allow you to download. Not built or intended for pirating other people's content.

Source is MIT (`github.com/bensblueprints/clip-grabber`), `npm start` runs it free. There's also a packaged Windows installer for $24 one-time if you'd rather skip `npm i`.

Happy to answer questions about the queue architecture or the yt-dlp/ffmpeg wiring.

## SEO keywords (10)

1. yt-dlp desktop app
2. yt-dlp GUI Windows
3. video downloader queue app
4. back up my own YouTube videos
5. desktop video download manager
6. extract MP3 from video local
7. yt-dlp update GUI
8. batch video downloader desktop
9. one-time purchase video downloader
10. local video archive tool

## AppSumo / PitchGround pitch paragraph

Reelsnag is a one-time-purchase desktop GUI for yt-dlp aimed at creators and archivists who need a reliable, private way to back up their own uploaded content and permitted media (CC-licensed, public domain, or platform-approved downloads). It adds the pieces yt-dlp's command line doesn't give you out of the box: a persistent download queue with live progress, a visual format/quality picker, per-job trim and MP3 extraction, subtitle grabbing, batch import from a text file, and a one-click updater for the yt-dlp engine itself (critical, since extractors break as platforms change). Everything runs 100% locally — no cloud upload, no account, no per-download fee. AppSumo audiences that respond well to "own it forever" desktop utilities (see: Whisper Transcriber, PDF toolkits) are a strong fit; suggested one-time price point is $24, sold explicitly as a personal-archival tool, not a mass-download service.

## Suggested one-time price + payback math

**Price: $24 one-time.**

Comparable "downloader"/converter subscription services commonly charge **$10–15/month**. At $12/mo:
- 1 month: $12 spent, you own nothing
- 2 months: $24 spent — **Reelsnag has already paid for itself**
- 12 months: $144 spent vs. Reelsnag's $24 — **6x cheaper in year one, and free forever after**

Pitch line: *"Pays for itself in under 2 months — everything after that is free."*
