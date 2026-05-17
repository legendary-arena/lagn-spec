---
title: After Effects Stop-Motion Hero Loop
type: Tutorial
tags:
  - design
  - brand
  - after-effects
  - video
  - marketing
related:
  - figma-logo-design.md
  - hugo-web-system.md
status: draft
source: []
last-reviewed: 2026-05-17
---

## Summary

A four-phase pipeline for producing a 5-7 second seamlessly-looping
stop-motion hero video for the marketing site: plan the loop,
capture the source clip, post-produce in After Effects, then
publish to `www.legendary-arena.com`. The page locks an output
contract (file names, formats, size ceiling) so reruns produce
drop-in replacements without re-deriving conventions, and it
documents the controlled image-sequence workflow alongside a
one-effect Posterize Time fallback for quick passes.

## Mechanics

### Output contract (lock first)

The final artifacts and their constraints. Every step in the
pipeline serves these targets.

| Field | Value |
|---|---|
| Primary file | `hero-loop.webm` |
| Fallback file | `hero-loop.mp4` |
| Poster image | `hero-fallback.jpg` (first frame, JPG) |
| Loop length | 5-7 seconds |
| Style | 2-4 fps stop-motion (posterized motion) |
| Target size | < 5 MB per video file |
| Resolution | 1280×720 (recommended) or 1920×1080 |

File names are fixed, not iterated (`hero-loop-v2.mp4` is wrong).
Re-renders overwrite. Version control is in git, not in filenames.

### Working folder structure

Working media files (capture, frames, comps, renders) live under
`C:\pcloud\LA\media\`, separate from the marketing repo. Only the
final three artifacts are copied into the marketing repo at
publish time (Phase 4).

```
C:\pcloud\LA\media\
├── capture\           # raw source recordings (gameplay or screen capture)
├── frames\            # full PNG sequence exported from After Effects
├── selects\           # curated subset of frames after manual edit
├── comps\             # After Effects project files (.aep)
├── renders\
│   ├── mp4\           # final H.264 outputs
│   └── webm\          # final VP9 outputs
└── thumbnails\        # poster frames (hero-fallback.jpg lives here)
```

Each subfolder has a single named purpose. Do not nest by date or
session — the folder layout is the convention, and per-version
discrimination lives in the git history of the AE project file.

### Tool choice

After Effects is the recommended tool because it allows frame-level
edits (deleting, duplicating, and re-ordering individual frames),
which is what gives a stop-motion clip its narrative beats. Premiere
Pro can produce a similar look using the same Posterize Time effect
but does not support per-frame editing of a video clip without first
converting it to a sequence — so for anything beyond a quick pass,
After Effects is the better tool.

### Phase 1 — Plan the loop

Do this before opening After Effects. Skipping planning is the most
common cause of re-shoots.

**Communication objective.** A user with sound off, glancing at the
homepage hero slot for under two seconds, should read:

> "This is a digital Marvel Legendary deck-building game."

If the chosen storyboard does not deliver that read in two seconds,
re-plan before capturing.

**Storyboard** (3 fps, 5-second loop, ~15 frames total):

| Time | Action | Reads as |
|---|---|---|
| 0.0 - 1.0s | Cards slide in / are dealt | "cards exist" |
| 1.0 - 3.0s | Deck or HQ stack grows | "deck-building" |
| 3.0 - 4.0s | A card triggers an effect (highlight ring + counter flash) | "gameplay system" |
| 4.0 - 5.0s | Final board state holds | "outcome" |

The loop returns cleanly to frame 0 (see Step 6).

**Shot requirements:**

- Stable camera (no shake — use OBS scene lock or a fixed
  screen-capture region)
- Clean UI visible in frame (energy, attack, etc.)
- High-contrast cards (avoid dark backgrounds that lose detail at
  low bitrate)
- No cinematic motion blur (kills stop-motion clarity)

**Quality bar.** The clip is ready to publish when all three hold:

- A muted viewer reads "digital card game" within two seconds.
- The loop boundary is invisible (no visible jump, no stutter pause).
- Choppiness reads as intentional, not as broken playback.

### Phase 2 — Capture the source clip

#### Capture method (pick one)

Three paths, in roughly increasing complexity. All three feed the
same `C:\pcloud\LA\media\capture\` folder downstream.

| Method | When to use | Tooling |
|---|---|---|
| Desktop screen recording | Gameplay running in a desktop/laptop browser | OBS, ShareX, Windows Game Bar |
| Phone screen recording | Gameplay running on Android directly | Built-in Android screen recorder |
| Phone camera | Physical cards on a table, or pointing the camera at a desktop screen for cinematic framing | Stock Camera app, Open Camera (FOSS), or Lightroom Mobile |

A fourth path — pre-animated in After Effects directly — skips
Phase 2 entirely.

#### Record settings — desktop screen recording

| Setting | Value |
|---|---|
| Resolution | 1920×1080 |
| Frame rate | 30 fps |
| Duration | 10-20 seconds (provides editing slack) |
| Format | MP4 (H.264) |

Close background apps to prevent capture-side lag. Disable system
notifications so they do not appear in the recording.

#### Record settings — phone screen recording (Android)

| Setting | Value |
|---|---|
| Resolution | 1080p minimum (1440p if the device supports) |
| Frame rate | 30 fps |
| Duration | 10-20 seconds |
| Notifications | Do Not Disturb on |

Background apps can throttle the screen recorder and produce
dropped frames. Close them before recording.

#### Record settings — phone camera (Android)

A modern Android phone is sufficient for shipping-quality source.
The discipline that matters is settings, stability, and lighting —
not the hardware.

| Setting | Value | Why |
|---|---|---|
| Resolution | 4K preferred, 1080p minimum | Cropping headroom for re-framing in Phase 3 |
| Frame rate | 30 fps (not 60) | Stop-motion samples down to 2-4 fps regardless; higher source fps gives no benefit and consumes storage |
| Stabilization | OIS or EIS on | Reduces jitter that becomes obvious once frames are reduced |
| HDR | Off | Frame-to-frame brightness swings cause flicker after frame reduction |
| Focus | Locked (tap and hold) | Prevents focus hunting between frames |
| Exposure | Locked | Prevents brightness flicker between frames |
| Zoom | Optical only — never digital | Digital zoom degrades source quality |
| Shutter speed (if available) | ~1/60 at 30 fps (180° rule) | Controls motion blur per frame |

For full manual control, install Open Camera (free, FOSS) or use
Lightroom Mobile's Pro camera mode. The stock Camera app's auto-
exposure and auto-focus are the primary cause of frame-to-frame
flicker in phone-shot stop-motion — manual lock cleans that up.

#### Physical setup

These matter more than the camera settings. Small jitter and
inconsistent lighting are the most common cause of footage that
reads as "broken" after frame reduction.

**Stability** (pick one, in order of preference):

1. Tripod (best — phone tripod mounts cost ~$15)
2. Phone braced against a fixed object (book stack, monitor stand)
3. Two-hand grip with elbows tucked against the torso

Smartphones have low mass, so any handheld micro-shake is amplified
once the clip is downsampled to 2-4 fps. Footage that looks fine
in real time can look unusable after frame reduction.

**Lighting** (the single largest quality lever):

- Bright and even (window light works; add a fill source if
  shadows are dark)
- No flickering sources — cheap LED panels and fluorescent tubes
  cause per-frame brightness banding that exposure-lock cannot
  cancel out
- Avoid low light entirely — slow shutter produces motion blur per
  frame, which destroys stop-motion clarity

**Lens** — wipe with a microfiber cloth before each session.
Pocket lint on the lens reads as a soft blur on every frame.

#### Technique

- Move slowly and deliberately. Stop-motion exaggerates every
  motion jump — a quick pan that looks fine at 30 fps becomes a
  visible jump-cut at 3 fps.
- No handheld tracking shots. If the camera moves, the background
  moves on every frame and the stop-motion effect reads as broken
  rather than intentional.
- Frame the shot to include cards, at least one UI element (energy
  or attack counter), and high-contrast layout.
- Capture 10-20 seconds per take and shoot 2-3 takes for editorial
  flexibility. The final loop only consumes ~15 frames.

#### Save location

Save raw captures to `C:\pcloud\LA\media\capture\` with a numeric
suffix:

```
C:\pcloud\LA\media\capture\gameplay_raw_001.mp4
```

Numeric suffixes (`_001`, `_002`) are fine for raw captures —
naming discipline applies only to the final outputs.

#### Pre-capture checklist

Run before each session:

- Frame rate set to 30 fps
- Resolution at 4K (phone camera) or 1080p+ (screen recording)
- Stabilization on (phone camera)
- HDR off (phone camera)
- Focus locked (phone camera)
- Exposure locked (phone camera)
- Lens wiped clean (phone camera)
- Lighting bright and even, no flicker sources
- Phone or device stabilized on tripod or fixed surface
- Notifications off / Do Not Disturb on

### Phase 3 — Post-produce in After Effects

Two methods. Method A is the controlled workflow for shipping
clips; Method B is the one-effect fallback for first-pass mockups.

#### Method A — Image-sequence workflow (recommended)

##### Step 1 — Import and convert to a frame sequence

1. `File → Import → File…` and select the capture file from
   `C:\pcloud\LA\media\capture\`.
2. Drag the imported clip into a new composition.
3. `Composition → Add to Render Queue`.
4. In the Render Queue panel, click `Output Module` (default:
   Lossless).
5. Set `Format` to `PNG Sequence`.
6. Set `Output To` to `C:\pcloud\LA\media\frames\`. Naming pattern:
   `frame_[#####].png`.
7. Click `Render`.

##### Step 2 — Curate frames (the step that matters)

Open `C:\pcloud\LA\media\frames\` and manually pick the frames that
carry the narrative beats:

- Delete redundant frames that do not advance the visual story.
- Keep state-change frames (card moves, UI value flips, highlight on).
- Duplicate key frames to hold on a beat for emphasis.

Copy the selected frames into `C:\pcloud\LA\media\selects\`,
renumbered sequentially (`frame_00001.png`, `frame_00002.png`, …).
Do not edit in place — `frames\` is the full output, `selects\` is
the editorial cut, and the separation makes iteration cheap.

This step is what converts a captured video into a designed
stop-motion clip. Skipping it (and dropping the raw sequence
directly into the comp) produces motion that looks like a
low-frame-rate video, not stop-motion.

##### Step 3 — Re-import the curated sequence

1. `File → Import → File…`
2. Select the **first** PNG in `C:\pcloud\LA\media\selects\`.
3. Check the `PNG Sequence` box in the import dialog.
4. Click `Import`.

##### Step 4 — Set the stop-motion frame rate

1. In the Project panel, right-click the imported sequence →
   `Interpret Footage → Main…`.
2. Set `Assume this frame rate` to 2-4 fps.

Frame-rate choice:

| Frame rate | Look | Use when |
|---|---|---|
| 2 fps | Chunky, deliberate, "board game" | The clip needs to feel like distinct game moments |
| 3 fps | Balanced | Most general use |
| 4 fps | Smoother but still stylized | Clip has motion that becomes illegible at 2 fps |

Interpretation must be set on the footage item **before** dropping
it into the comp for the new rate to apply cleanly. If the footage
is already in a comp, remove and re-add it.

##### Step 5 — Add the UI overlay (do not skip)

A bare stop-motion clip of cards moving reads as "some animation."
The same clip with a thin layer of game-system UI elements reads
as "a digital card game." Without this step the hero loop fails
the two-second communication objective.

In a comp above the stop-motion layer, add:

| Element | Purpose |
|---|---|
| A small energy / recruit counter that increments across frames | Signals resource accumulation |
| An attack / damage value that flashes when a card triggers | Signals an action resolving |
| A subtle highlight ring around the currently-active card | Signals focus and selection |

Keep these elements **subtle** — they are signal, not decoration.
Color them from the marketing site's brand tokens
(`C:\www\legendary-arena-com\static\brand-tokens.css`) so they
match the rest of the page.

##### Step 6 — Close the loop

A "seamless loop" means the cut from the last rendered frame back
to the first is visually invisible during muted autoplay. Two
techniques, in order of preference:

1. **Match end to start.** Edit the sequence so the last frame is
   visually identical (or near-identical) to the first frame. The
   playhead jump is then invisible. This works when the closing
   beat naturally returns to the opening state.
2. **Brief overlap.** If end-to-start matching is impossible, add
   a short cross-dissolve transition (3-5 frames at 24 fps render
   rate) between the end and the start within a second comp. The
   transition hides the cut.

Do not pad the end of the timeline with duplicated start-frames
hoping it will "fade back" — duplicating frames inserts a hold,
not a transition. The result is a noticeable pause at the loop
point.

Save the AE project to `C:\pcloud\LA\media\comps\hero-loop.aep`.

##### Step 7 — Export H.264 (MP4)

Render through Adobe Media Encoder rather than directly from After
Effects (recent AE versions removed direct H.264 export from the
Render Queue):

1. `Composition → Add to Adobe Media Encoder Queue…`.
2. In Media Encoder, set:

| Setting | Value | Why |
|---|---|---|
| Format | `H.264` | Universal browser fallback |
| Frame rate | 24 fps (render rate, not the interpreted rate) | Each interpreted frame at 2-4 fps is held across multiple render frames, preserving the choppy stop-motion look |
| Resolution | 1280×720 (or 1920×1080 if the source warrants it) | Hero slots rarely need 4K |
| Bitrate encoding | VBR, two-pass | Avoids banding on flat posterized color |
| Target bitrate | 2-4 Mbps | Keeps file size under 5 MB at 5-7 seconds |
| Output path | `C:\pcloud\LA\media\renders\mp4\hero-loop.mp4` | Fixed filename, no version suffix |

3. Verify in the encoded output: scrub to the loop boundary in a
   browser preview and confirm there is no visible jump.

##### Step 8 — Export WebM (VP9)

WebM is the primary delivery format because VP9 produces ~30-40%
smaller files than H.264 at equivalent visual quality on flat
animation. Browsers that do not support WebM fall back to the MP4.

After Effects and Media Encoder do not natively output WebM.
Either install a third-party WebM plugin for Media Encoder or
post-process the MP4 with FFmpeg (two-pass VBR):

```
ffmpeg -i C:\pcloud\LA\media\renders\mp4\hero-loop.mp4 -c:v libvpx-vp9 -b:v 1M -pass 1 -an -f null NUL
ffmpeg -i C:\pcloud\LA\media\renders\mp4\hero-loop.mp4 -c:v libvpx-vp9 -b:v 1M -pass 2 C:\pcloud\LA\media\renders\webm\hero-loop.webm
```

The first pass writes log files to the current directory; the
second pass produces the output. `1M` is the target bitrate; raise
it if banding appears in flat color regions.

##### Step 9 — Export the poster image

Export the first frame of the comp as a JPG poster:

1. Position the playhead at frame 0.
2. `Composition → Save Frame As → File…`
3. Add to Render Queue, set the `Output Module` format to
   `JPEG Sequence`.
4. Output to `C:\pcloud\LA\media\thumbnails\hero-fallback.jpg`.

The poster image displays while the video buffers and as a
fallback for users who block autoplay.

#### Method B — Posterize Time (fast fallback)

When the goal is a quick pass and per-frame control is not needed,
the `Posterize Time` effect produces the stop-motion look in a
single step. Use this for first-pass mockups; use Method A for
anything that will ship.

1. Drop the source clip into a composition.
2. With the layer selected: `Effect → Time → Posterize Time`.
3. In the Effect Controls panel, set `Frame Rate` to 2-4.

After Effects internally drops frames to match the target rate.
No per-frame edits are possible, and the loop-boundary problem
still has to be solved manually (typically by trimming the comp so
the in-point and out-point are visually matched).

### Phase 4 — Publish to the marketing site

#### What gets committed where

The pipeline crosses two repos and one pCloud-only scratch area.
The mapping is fixed — do not commit working files to either repo.

| Artifact | Lives at | Git? |
|---|---|---|
| Raw captures | `C:\pcloud\LA\media\capture\` | No — pCloud backup only |
| Full PNG sequence | `C:\pcloud\LA\media\frames\` | No — pCloud backup only |
| Curated PNG sequence | `C:\pcloud\LA\media\selects\` | No — pCloud backup only |
| AE project (`.aep`) | `C:\pcloud\LA\media\comps\` | No — pCloud backup only |
| Intermediate renders | `C:\pcloud\LA\media\renders\{mp4,webm}\` | No — pCloud backup only |
| `hero-loop.webm` (final) | `C:\www\legendary-arena-com\static\images\hero\` | Yes — marketing repo |
| `hero-loop.mp4` (final) | `C:\www\legendary-arena-com\static\images\hero\` | Yes — marketing repo |
| `hero-fallback.jpg` (final) | `C:\www\legendary-arena-com\static\images\hero\` | Yes — marketing repo |
| This wiki page | `wiki/after-effects-stop-motion-hero-loop.md` (engine repo) | Yes — engine repo, publishes to `ewiki.legendary-arena.com` |

Working files are large (raw 4K captures and full PNG sequences
run hundreds of MB to multiple GB) and re-derivable from the
capture. Committing them would permanently inflate the git history
of either repo. The 5 MB ceiling on the final three artifacts
keeps the marketing repo's git size manageable.

#### Commit-lane decision (read before staging)

The marketing repo's commit-msg hook enforces a path allowlist per
its content-lane workflow (see
`C:\www\legendary-arena-com\docs\06-CONTENT-LANE-WORKFLOW.md`).
The lane for a `FIX:` commit is `content/**` + `static/images/**`
only — anything else triggers hook rejection.

This page's publish path is `static/images/hero/` (not
`static/media/`) specifically so the steady-state swap of the
three final artifacts stays inside the lane.

Two scenarios:

| Scenario | Files touched | Commit prefix | Ceremony |
|---|---|---|---|
| Steady-state swap (template + CSS already exist) | The 3 files under `static/images/hero/` | `FIX:` | None (no WP file, no pre-flight) |
| First-time setup, or template/CSS change | The 3 files **plus** `layouts/**` and/or `static/brand-tokens.css` | `WP-NNN:` | Work-packet file required |

If the homepage layout does not yet embed a `<video class="hero-video">`
element, the first publish is necessarily a `WP-NNN:` commit — the
HTML embed and CSS live in `layouts/` and `static/brand-tokens.css`,
both outside the `FIX:` lane.

#### Step 1 — Copy artifacts into the marketing repo

Copy the three final artifacts into the marketing site's
hero-media subfolder:

```
C:\www\legendary-arena-com\static\images\hero\
├── hero-loop.webm     (from renders\webm\)
├── hero-loop.mp4      (from renders\mp4\)
└── hero-fallback.jpg  (from thumbnails\)
```

Hugo serves files under `static/` from the site root, so the URLs
become `/images/hero/hero-loop.webm`, etc.

The `static/images/` path is semantically a slight stretch (videos
are not images) but it is the convention the content-lane allowlist
permits — see the Commit-lane decision above.

#### Step 2 — HTML embed

```html
<video class="hero-video"
       autoplay muted loop playsinline
       poster="/images/hero/hero-fallback.jpg">
  <source src="/images/hero/hero-loop.webm" type="video/webm">
  <source src="/images/hero/hero-loop.mp4"  type="video/mp4">
</video>
```

Attribute notes:

- `muted` — browsers block autoplay on unmuted media.
- `autoplay` — required for the loop to start without user action.
- `loop` — the seamless-loop work in Step 6 is wasted without this.
- `playsinline` — required on iOS Safari, which otherwise hijacks
  the video into fullscreen on play.
- `poster` — displays during buffering and for users who block
  autoplay.

The `<source>` order matters: browsers pick the first format they
support. WebM first means VP9-capable browsers (most current
desktop and Android) get the smaller file.

#### Step 3 — CSS

```css
.hero-video {
  width: 100%;
  height: auto;
  object-fit: cover;
}
```

`object-fit: cover` ensures the video fills its container without
letterboxing when the hero slot's aspect ratio differs from the
video's 16:9.

#### Step 4 — Build-check locally

Run a Hugo build against the marketing repo before pushing. Two
options (from
`C:\www\legendary-arena-com\docs\06-CONTENT-LANE-WORKFLOW.md`):

```pwsh
# One-shot build (verify no errors)
hugo --minify

# Or: live preview at http://localhost:1313 with auto-reload
hugo server
```

Run from the repo root (`C:\www\legendary-arena-com`). The build
catches malformed embeds, missing assets, and template errors
before they hit the commit hooks.

#### Step 5 — Verification pass (browser)

Before committing:

| Check | How |
|---|---|
| Total payload of both video files | `< 5 MB` (the Output Contract ceiling) |
| Loop is seamless | Play in `hugo server` preview for 30 seconds; watch the cut |
| Autoplay fires on Chrome, Firefox, Safari | Open the page in each |
| Autoplay fires on iOS Safari | Test on device — simulator playback rules differ |
| Poster image renders for the buffer window | Throttle to "Slow 3G" in DevTools and reload |

#### Step 6 — Commit and push

Stage only the three artifacts (steady-state swap):

```pwsh
git add static/images/hero/hero-loop.webm
git add static/images/hero/hero-loop.mp4
git add static/images/hero/hero-fallback.jpg

git commit -m "FIX: refresh hero loop video"
git push -u origin <branch-name>
```

The commit-msg hook enforces `>= 12` char subject, the prefix
allowlist, and the path allowlist. Staging any file outside
`content/**` or `static/images/**` will reject the `FIX:` commit;
see the Commit-lane decision earlier in Phase 4 for the
`WP-NNN:` path when template or CSS changes are also needed.

## Interactions

- [Figma Logo Design](figma-logo-design.md) — Logo and brand
  assets that may appear inside or alongside the stop-motion clip.
  The exported SVGs from that workflow can be imported into After
  Effects as layered comps.
- [Hugo Web System](hugo-web-system.md) — The marketing site that
  consumes the final MP4 / WebM / poster. Static-asset URL
  conventions and brand tokens used by the UI overlay layer also
  live here.

## Edge Cases

- **AE sequence cache.** Re-exporting a PNG sequence into the same
  folder with the same naming pattern can cause After Effects to
  serve the previously-cached frames. Purge the cache
  (`Edit → Purge → All Memory & Disk Cache`) or render into a
  fresh folder when iterating.
- **Interpret Footage timing.** Setting the interpreted frame rate
  on a footage item that is already in a comp does not retroactively
  update the comp instance. Remove the layer from the comp, set
  the rate on the footage item, then re-add the layer.
- **H.264 direct export removed.** Recent After Effects versions
  removed H.264 from the Render Queue's Output Module dropdown.
  The Adobe-supported path is to round-trip through Adobe Media
  Encoder.
- **No native WebM in AE.** After Effects and Media Encoder have
  no built-in WebM encoder. Either install a third-party plugin
  or post-process with FFmpeg (see Step 8).
- **Loop-boundary stutter.** Padding the end of the timeline with
  duplicated start-frames produces a hold, not a seamless loop.
  The end frame must visually match the start frame, or a short
  cross-dissolve must hide the boundary.
- **Bitrate banding on flat content.** Stop-motion clips with
  large flat color areas (a posterized card background, for
  instance) band at low bitrates. Two-pass VBR encoding mitigates
  this; if banding persists, raise the target bitrate.
- **iOS autoplay.** Without `playsinline`, iOS Safari fullscreens
  the video on play. Without `muted`, all mobile browsers block
  autoplay entirely.
- **File size on mobile data.** A 5 MB hero loop on a 3G
  connection is a noticeable load cost. Always serve a `poster`
  image; consider a lower-bitrate variant for slow connections.
- **Source / selects drift.** If the source capture is re-shot,
  the curated `selects\` folder is now out of sync with `capture\`.
  Either re-curate from scratch or commit the AE project file
  before re-shooting so the prior cut can be re-established.
- **pCloud sync conflicts on shared folders.** The working folders
  under `C:\pcloud\LA\media\` sync via pCloud. Render queues
  writing PNG sequences while pCloud is mid-sync can produce
  `[conflicted N]` duplicates. Pause sync during long renders.
- **Auto-exposure flicker on phone capture.** Phone camera apps
  re-meter exposure several times per second. After a clip is
  reduced to 2-4 fps, the per-frame brightness shifts read as a
  visible flicker. Lock exposure (and ideally ISO) before
  recording — Open Camera and Lightroom Mobile expose these
  controls; the stock Camera app on most Androids does not.
- **The 60 fps trap.** Recording at 60 fps "for smoother motion"
  produces a larger file with no quality benefit downstream — the
  Phase 3 pipeline samples to 2-4 fps regardless. Use 30 fps.
- **HDR-induced banding.** HDR processing on phone cameras blends
  multiple exposures per frame. The blend ratio drifts between
  frames, producing per-frame color shifts that survive into the
  curated stop-motion sequence. Turn HDR off for capture.
- **`FIX:` commit rejection on first-time publish.** The marketing
  repo's commit-msg hook rejects `FIX:` commits that stage files
  outside `content/**` + `static/images/**`. First-time hero-slot
  setup necessarily touches `layouts/**` (the `<video>` embed) and
  `static/brand-tokens.css` (the `.hero-video` rule), both outside
  the lane. Use `WP-NNN:` with a work-packet file for that commit;
  use `FIX:` only for steady-state swaps of the three artifacts.
- **Path mismatch with content-lane convention.** Hugo will happily
  serve `static/media/hero/hero-loop.webm` at `/media/hero/...`,
  but the marketing repo's commit-msg hook will reject staging it
  under a `FIX:` prefix because `static/media/**` is not in the
  allowlist. The convention is `static/images/hero/` even though
  videos are not images — the path is a hook-allowlist contract,
  not a semantic taxonomy.

## References

- [Adobe After Effects — User Guide](https://helpx.adobe.com/after-effects/user-guide.html)
  — official documentation for Render Queue, Interpret Footage,
  and the Posterize Time effect
- [Adobe Media Encoder — User Guide](https://helpx.adobe.com/media-encoder/user-guide.html)
  — official documentation for H.264 export settings and queue
  handoff from After Effects
- [FFmpeg VP9 encoding guide](https://trac.ffmpeg.org/wiki/Encode/VP9)
  — two-pass VBR settings for the WebM conversion step
- [Figma Logo Design](figma-logo-design.md) — companion design
  pipeline; SVG outputs from that workflow are valid inputs to
  the AE compositions described here
- [Hugo Web System](hugo-web-system.md) — marketing-site embed
  conventions, brand tokens, and static asset directory
- `C:\www\legendary-arena-com\docs\06-CONTENT-LANE-WORKFLOW.md` —
  marketing repo content-lane workflow: path allowlist
  (`content/**` + `static/images/**`), `FIX:` vs `WP-NNN:` prefix
  rules, build-check commands, and commit-msg hook contract
- `C:\www\legendary-arena-com\static\brand-tokens.css` — brand
  color tokens for the UI overlay layer
- `C:\www\legendary-arena-com\static\images\hero\` — final publish
  location for the three artifacts (`hero-loop.webm`,
  `hero-loop.mp4`, `hero-fallback.jpg`)
