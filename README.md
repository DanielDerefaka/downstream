# Downstream

**Take any video offline.** A local-first video downloader with a real quality
ladder, keyframe-honest trimming, and a queue that tells you the truth about
what it is doing.

## Everything happens on your machine

There is no Downstream server. Nothing is uploaded, nothing is queued on
someone else's hardware, and no link you paste is transmitted anywhere except
directly to the site it points at. The "server" in this repo is a local process
on `127.0.0.1` that talks to `yt-dlp` and `ffmpeg` for you — it binds to
localhost only, and it is not designed or intended to be exposed to the
internet.

That is also why it can offer 8K, unlimited length, no watermark, no ads and no
queue: your bandwidth pulls the bytes and your CPU does the muxing, so there is
no hosting bill shaping the feature set.

---

## Why this over the web tools

| | Typical web downloader | Downstream |
|---|---|---|
| Qualities offered | 1080p / 720p / audio | every rung the source publishes, to 8K |
| Codec | whatever the site picked | your choice — H.264, AV1, VP9, with the tradeoff spelled out |
| File size shown | after you commit | before, per rung, with a relative-weight bar |
| Trimming | download the whole file, cut locally | only the selected range is fetched |
| A 30s cut of a 2h 4K video | ~8 GB downloaded | ~40 MB downloaded |
| Progress | a spinner | live bytes, speed, ETA, and the actual phase |
| Concurrency | one at a time | a real queue, 1–6 in parallel |

The trimming difference is the big one. `--download-sections` asks the CDN for a
byte range rather than pulling the asset and cutting it afterwards, so trimming
is bounded by the length of your clip, not the length of the video.

## Requirements

```bash
brew install yt-dlp ffmpeg
```

Both are checked at boot; `pnpm doctor` reports what is missing and how to get it.

## Running it

```bash
pnpm install
pnpm dev          # API on :5174, UI on :5173
```

For a single-process build that serves the UI from the API:

```bash
pnpm build && pnpm start   # everything on :5174
```

## How it fits together

```
shared/types.ts     the wire contract — both sides import it, nothing else is shared
server/
  bin.ts            locates yt-dlp and ffmpeg, reports capabilities to the UI
  probe.ts          one yt-dlp JSON dump per URL, cached 5 minutes
  ladder.ts         turns ~40 raw formats into the ladder you actually see
  runner.ts         runs one job; parses progress out of yt-dlp and ffmpeg
  queue.ts          concurrency, retry, cancel, history persistence
  index.ts          Fastify routes + the SSE stream
web/
  state/store.ts    one zustand store; SSE events fold straight into it
  screens/          Intake (paste a link) and Studio (everything else)
  components/       studio/ · queue/ · chrome
```

### The ladder

YouTube publishes the same resolution in AV1, VP9 and H.264, as video-only DASH
streams that each need muxing with one of four audio streams. `ladder.ts`
collapses that into one rung per resolution by:

1. picking a codec per rung from your preference (`auto` leads with H.264,
   because it is the only family that plays everywhere without a re-encode),
2. pairing it with an audio stream whose container matches, so the mux is a
   stream copy rather than a transcode — VP9 gets Opus in WebM, H.264 and AV1
   get AAC in MP4,
3. resolving to an exact `format_id` pair with a `bv*[height<=N]+ba` fallback,
   so a stale probe degrades instead of failing.

### Trimming, honestly

Two modes, and the UI says which you are getting:

- **Lossless** (default) — a stream copy. Keeps the exact codec and quality you
  picked. Starts at the nearest keyframe, typically within a second or two.
- **Frame-accurate** — exact to the millisecond, but ffmpeg re-encodes the clip,
  and it re-encodes to H.264. Your AV1 4K pick stops being AV1.

Most tools silently do the second and let you discover the codec change later.

## Keyboard

| | |
|---|---|
| `⌘V` anywhere | paste a link and fetch formats |
| `⌘J` | toggle the queue |
| `⌘,` | settings |
| `Esc` | back to the link screen |
| arrows on a trim handle | nudge 1s, or 10s with `Shift` |

## Settings

Stored in `~/.downstream/settings.json`; history in `~/.downstream/history.json`.
Downloads land in `~/Downloads/Downstream` unless you change it. Partial files
stay in the system temp directory so a cancelled job never litters your
Downloads folder.

## Debugging

`DOWNSTREAM_DEBUG=1 pnpm start` echoes every yt-dlp and ffmpeg line. Useful when
a site changes its player and the format list goes strange.

## Supported sources

The intake screen has a tab per first-class source; the tab also auto-selects
itself from whatever you paste.

| Source | Notes |
|---|---|
| **YouTube** | Videos, Shorts and playlists. Up to 8K, plus captions and chapters. |
| **X** | Link a post, not a profile. Public posts only; 4K where present. |
| **TikTok** | No watermark, original vertical resolution. Often H.265. |
| **Instagram** | Reels and posts from public accounts. Private accounts and Stories need a login Downstream does not carry. |
| **Other** | ~1,800 more via yt-dlp — Vimeo, Reddit, Twitch, SoundCloud, Dailymotion. |

Non-YouTube sources needed real work rather than a URL passthrough, because
they break assumptions YouTube never does:

- **Vertical video** is named by its short edge, so a 1080x1920 TikTok reads
  `1080p`, not `1920p`, and the player switches to a height-driven portrait
  stage instead of letterboxing into 16:9.
- **Unreported codecs** are common. X returns `acodec: undefined` on its audio
  tracks rather than a codec name; treating that as "no audio" silently
  produced video with no sound. Only the literal string `none` counts as absent.
- **Container** is chosen from the file extension before the codec family, so a
  Twitter MP4 with unreported codecs is not mislabelled as Matroska.
- TikTok reports a bare `h265` that matches none of the usual fourcc prefixes.

## Scope and responsibility

Downstream will not fetch private, purchased, or DRM-protected media, and
age-gated videos need a signed-in session it deliberately does not carry.

It is a tool, not a licence. Downloading a video does not grant you any rights
to it, and most platforms' terms of service restrict downloading to the features
they provide themselves. You are responsible for having the right to keep a copy
of whatever you point it at — your own uploads, Creative Commons and public
domain material, content you have permission to archive, or whatever your local
law allows. Check before you download, not after.

## Contributing

Issues and pull requests are welcome. Two things to know before opening one:

- Run `pnpm doctor` first — most "it doesn't work" reports turn out to be a
  missing or outdated `yt-dlp`.
- Please do not add specific third-party video URLs to the repo, in tests or
  anywhere else. Use Creative Commons or public domain material if a fixture is
  genuinely needed.

`DOWNSTREAM_DEBUG=1 pnpm start` echoes every yt-dlp and ffmpeg line, which is
usually the fastest way to see what an extractor actually returned.

## License

MIT — see [LICENSE](LICENSE).

Downstream shells out to [yt-dlp](https://github.com/yt-dlp/yt-dlp) and
[ffmpeg](https://ffmpeg.org) as external programs rather than bundling or
linking them, so it carries neither project's licence. Both are the work of
their own authors and do the genuinely hard part.
