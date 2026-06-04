---
title: Video Production Workflow
type: Guide
tags:
  - layer-marketing
  - youtube
  - video
  - production
  - ffmpeg
  - premiere
related:
  - youtube-channel-plan.md
  - homepage-spec.md
  - blog-post-authoring.md
  - hugo-web-system.md
status: draft
source:
  - ../docs/01-VISION.md
last-reviewed: 2026-06-04
---

This page mirrors the authoritative source at
`C:\www\legendary-arena-com\docs\marketing\video-production-workflow.md`.
If they disagree, the marketing repo copy wins.

---

## Summary

Ten-step production pipeline from idea to published video +
cross-referenced blog post + performance review. Produces three
artifacts per video: the video, 3-7 Shorts clips, and a companion blog
post on legendary-arena.com.

## Pipeline Steps

```
 0. Topic Validation
 1. Identify Problem
 2. Select Series
 3. Research & Collect Assets
 4. Write Blog + Script
 4b. Title + Thumbnail Gate
 5. Record (Capture Layer)
 6. Assemble + Normalize (FFmpeg via Claude Code)
 7. Edit + Polish (Premiere)
 8. Upload to YouTube
 8b. Cross-Post Shorts
 9. Cross-Reference Blog
10. Performance Review
```

## Tool Chain

| Layer | Tool | Purpose |
|-------|------|---------|
| Capture | Camtasia (default), OBS, Snagit | Screen recording + voiceover |
| Assembly | FFmpeg via Claude Code | Concat, loudness normalization (-14 LUFS), resolution enforcement, dead-air trimming, intro/outro stubs, Shorts extraction |
| Edit | Adobe Premiere Pro | Narrative timing, overlays, music mix, branding polish |
| Blog | Hugo (legendary-arena.com) | Companion blog post with YouTube embed |
| Distribution | YouTube Studio, TikTok, Instagram | Upload, metadata, cross-posting |

## Core Principles

1. **Automation First** — FFmpeg does the work, Premiere makes the
   choices. If a step is done manually twice, automate it in Step 6.
2. **Packaging Before Production** — Title + Thumbnail Gate must clear
   before recording.
3. **Retention Before Volume** — Fix retention, then scale output.
4. **Good Enough Publish Rule** — Clear hook + clear value + clean
   audio = publish. Don't delay for <10% polish improvements.
5. **Value Density** — Every 15-30 sec must deliver an insight, outcome,
   or escalation. Filler gets cut.

## File System

```
C:\pcloud\LA\
  video-assets\        # Shared reusable assets (intros, outros, music,
                       #   overlays, fonts, thumbnails, hooks, templates)
  videos\              # Per-video production folders
    {prefix}-{NNN}-{slug}\
      01-research\     # Notes, screenshots, card images, b-roll
      02-script\       # Blog draft, script, shot list
      03-recording\    # Raw captures + exported segments
      04-assembly\     # FFmpeg output (rough-cut-normalized.mp4, cuts.json)
      05-edit\         # Premiere project, final export, Shorts, thumbnail
      06-publish\      # YouTube metadata, blog final, performance review
    _archive\          # Completed videos (moved after 90-day review)
```

## Production Time Budget

| Step | Target |
|------|--------|
| Steps 0-4 (validation through script) | 60-90 min |
| Step 5 (recording) | 45-90 min |
| Steps 6-7 (assembly + editing) | 2 hours or less |

## Key References

- **Full document:** `C:\www\legendary-arena-com\docs\marketing\video-production-workflow.md`
- **Channel strategy:** [YouTube Channel Plan](youtube-channel-plan.md)
- **Blog authoring:** [Blog Post Authoring](blog-post-authoring.md)
- **Hugo system:** [Hugo Web System](hugo-web-system.md)
