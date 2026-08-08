---
name: video-to-code
description: Build the application from a coding tutorial video, chapter by chapter, with the user testing between sections. Use when the user passes a tutorial URL and wants the project built along with it — "build this tutorial", "follow this video", "/video-to-code <url>". Requires the Downstream server running locally.
---

# Video to code

Turn a coding tutorial into a working project by following it section by
section, stopping after each one so the user can run and test what was built.

The user stays in the loop by design. You are not trying to produce the whole
app in one shot — you are the pair of hands doing what the tutorial says, and
the user is the one who confirms it actually works before you continue.

## Narration first, frames to confirm

The transcript is the primary source: it carries the architecture, commands,
file names, package choices and ordering, it is cheap, and it is complete.
Start there and write the code yourself.

Frames are the second source, and they are more useful than they look. A short
file fits on screen and reads verbatim at 1080p. Use them to resolve what
narration cannot express — exact JSX, class strings, prop names, a file tree —
but see "Reading frames" below, because *which* frame you pick decides whether
you get truth or fiction.

When the video's stack has moved on since recording (a major version bump, a
renamed API, a deprecated package), **use the current approach and tell the user
you deviated and why.** Faithfully reproducing a broken 2-year-old API helps
nobody. Note that a version the tutorial deliberately pins is not drift — honour
the pin, since the rest of the course depends on it.

## Step 1 — Preflight

The skill reads from the local Downstream API. Check it is up:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5174/api/capabilities
```

If that is not `200`, start it from the Downstream repo and wait for it:

```bash
cd <downstream-repo> && (pnpm -F @downstream/server start &) && sleep 6
```

If the repo path is unknown, ask the user for it once.

## Step 2 — Get the outline

```bash
curl -s -X POST http://127.0.0.1:5174/api/lesson \
  -H 'Content-Type: application/json' \
  -d '{"url":"<VIDEO_URL>"}'
```

Returns `title`, `duration`, `chapters[]` (with `index`, `title`, `start`,
`end`, `minutes`), `repos[]`, `links[]`, and `hasTranscript`.

**Check `repos` first.** If the tutorial links its finished repository, say so
and ask whether the user wants to clone it as a reference. It is faster and
exact. Continue building from the video regardless — the point is to learn the
path, not just have the destination — but a reference implementation is worth
having open.

If `hasTranscript` is false, stop. Without captions there is nothing to read;
tell the user rather than guessing from the title.

## Step 3 — Agree the scope before writing anything

Show the user the chapter list with durations, and state plainly:

- what is being built (from title, description links and chapter titles),
- which chapters are actual build work versus sponsor reads, course promos and
  outros — **skip those, and say which ones you are skipping**,
- the services that will need accounts or API keys, inferred from `links` and
  the chapter titles.

**Do not classify chapters by keyword.** Titles lie in both directions:
"Introduction to Background Jobs with Inngest" is real setup work despite the
word *introduction*, and "Chatting with AI to update the design" is a feature
build despite the word *update*. Meanwhile a 44-minute chapter can be pure
course promo. When a title is ambiguous, pull the first minute of its
transcript and decide from what is actually said.

Then ask which chapters to do in this session. Long courses are 30+ chapters
and 10+ hours; nobody wants all of it in one run.

Create `.video-to-code/progress.json` in the project root to track state:

```json
{
  "url": "...",
  "title": "...",
  "completed": [2, 3],
  "current": 4,
  "notes": ["deviated: Next 16 app router instead of pages router"],
  "blocked": []
}
```

Read it at the start of every run so the work resumes instead of restarting.

## Step 4 — Work one chapter at a time

For each chapter, fetch just that slice:

```bash
curl -s -X POST http://127.0.0.1:5174/api/lesson/transcript \
  -H 'Content-Type: application/json' \
  -d '{"url":"<VIDEO_URL>","chapter":<INDEX>}'
```

Returns `text` as `[mm:ss] narration` lines. Then:

1. **Extract the concrete steps.** Shell commands, package installs, file paths,
   component names, schema fields, env var names, config values. Narration is
   full of filler — pull out what is actionable and ignore the rest.
2. **Implement them.** Real code in real files, matching the project's existing
   conventions. Follow the tutorial's naming exactly when it specifies names —
   later chapters will refer back to them.
3. **Verify what you can yourself.** Run the typecheck, the build, the linter.
   Fix what you broke before handing over.
4. **Hand over for testing.** See Step 5.

Keep a running note of anything the tutorial states but never shows — "I set up
my keys earlier", "I already installed this", jump cuts. These are the usual
cause of a project that looks right and does not run. Surface them explicitly
rather than inventing values.

## Reading frames

When narration leaves the exact code ambiguous, pull the picture. Download a
short window at 1080p — code is illegible below about 720p — and sample it:

```bash
yt-dlp --no-warnings --no-playlist -f "bv*[height<=1080]+ba/b[height<=1080]" \
  --download-sections "*<START>-<END>" -o "frames/clip.%(ext)s" "<VIDEO_URL>"
ffmpeg -v error -i frames/clip.webm -vf "fps=1/4" -q:v 2 frames/f_%02d.png -y
```

A 20-second 1080p window is about 1.2 MB, so this is cheap in bandwidth. It is
*not* cheap in vision tokens — roughly 1.5k per frame — so sample deliberately
rather than blanketing the chapter.

**Pick the right moment.** Two things ruin a frame, and both are detectable:

- **Occlusion.** Autocomplete dropdowns, hover tooltips, inline error lenses and
  "Fix in Chat" buttons routinely cover half the editor. In one sampled pair
  eight seconds apart, the first frame had a completion list hiding lines 9–12
  and the second was perfectly clean. If a popup covers code, discard the frame
  and take a neighbouring one.
- **Mid-typing and AI ghost text.** Editors like Cursor render greyed
  suggestions inline that are *not* what the author accepted. Code caught
  mid-keystroke will not compile and was never meant to.

**Sample at the end of a section, not the middle.** During a build the file is
broken by design — the browser panel will be showing `X is not defined` because
the component does not exist yet. The frame you want is the one after it works.
The error panel is a useful signal: a clear one usually means the code on screen
is the settled version.

**Read structure, not just code.** The file tree, the breadcrumb, the tab bar
and the framework version in the dev-server panel are all reliably legible and
tell you the project layout for free — often more valuable than any single file.

Never paste frame-read code in blind. Treat it as a strong hint, reconcile it
with the narration, and say when you took something from the screen so the user
can check that timestamp.

## Step 5 — Hand back after every chapter

This is the point of the skill. After each chapter, stop and give the user:

- **What was built** — a couple of sentences, not a file list.
- **How to test it** — the exact command to run and what they should see.
  Be concrete: "run `pnpm dev`, open /dashboard, you should see the empty
  project grid with a New Project button."
- **What you could not determine** — missing keys, off-camera steps, anything
  where the narration was ambiguous. Ask directly for what you need.
- **What is next** — the next chapter title, one line on what it adds.

Then **stop and wait.** Do not start the next chapter unprompted. If the user
reports a problem, fix it before moving on, and record the fix in `notes`.

## Judgement calls

**Version drift.** Prefer current, correct APIs. Record the deviation in
`notes` and mention it once, briefly, when handing over.

**Secrets.** Never invent API keys, project IDs or connection strings. Write
`.env.example` with the names, add `.env` to `.gitignore`, and ask the user to
fill in the real values.

**Ambiguity.** If the narration is genuinely unclear about a name or a value,
ask. A wrong guess in chapter 3 becomes twenty broken imports by chapter 9.

**Timestamps.** When you reference something specific, cite the `[mm:ss]` mark
so the user can jump to it and check you read it right.

**Scope.** Do not build ahead. If chapter 4 makes you want to add error handling
the tutorial adds in chapter 11, don't — the user is following along, and code
appearing before its explanation is confusing.
