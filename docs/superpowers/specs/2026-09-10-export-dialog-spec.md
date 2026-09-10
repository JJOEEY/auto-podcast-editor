# Export Dialog Spec (P1 Phase D input)

Approved 2026-09-10. Implemented by P1 Task D3 (`src/components/ExportDialog.tsx`) on top of `core/export.ts` (Task D2). Emits one `ExportRequest`, sent via extended `job:render` IPC.

## 1. Tên file (file name)

- Text field + template variables: `{tenproject}` `{preset}` `{ngay}` (ngay = YYYY-MM-DD). Example: `podcast-tap12_4k-tiktok_2026-09-10.mp4`.
- Extension auto-appended from format (user never types it; strip if typed).
- On collision: auto-suffix `(1)`, `(2)`… — never silent overwrite.
- Full resolved path shown + "Đổi thư mục" button; last dir remembered (localStorage).

## 2. Định dạng (format dropdown)

| Value | Container/codec | Dùng cho |
|---|---|---|
| `mp4-h264` (default) | MP4 H.264 + AAC | TikTok/YouTube/FB universal |
| `mp4-hevc` | MP4 HEVC + AAC | File nhẹ hơn, máy mới |
| `webm-vp9` | WebM VP9 + Opus | Web/YouTube, encode chậm nhất |
| `mov-prores` | MOV ProRes 422 + PCM | Ném sang Premiere/CapCut edit tiếp |
| `mp3` | MP3 192kbps | Podcast audio |
| `wav` | WAV PCM 16-bit | Lưu trữ / master audio |

## 3. Chất lượng (quality radio, vertical 9:16)

720p (720×1280) · 1080p (1080×1920, default) · 2K (1440×2560) · 4K (2160×3840). Implemented as Remotion `scale` 0.667 / 1 / 1.333 / 2 over the 1080×1920 composition — layout/caption/safezone never reflow.
- Warning copy (non-blocking, shown when target pixels > source pixels): "Nguồn chỉ {srcW}×{srcH} — xuất {label} là upscale, không nét hơn thật (TikTok/YouTube vẫn ưu tiên file 4K)." Source dims come from probe metadata (Phase B stores them on project? If unavailable, hide warning — never block).

## 4. Bitrate

- Auto (default): per-format table in `core/export.ts` (h264 @1080p ≈ 12Mbps, scaled by pixel ratio; prores = codec default; audio 192kbps).
- Custom: slider Mbps, min 1, max capped per format (h264 ≤ 50, hevc ≤ 40, vp9 ≤ 30, prores n/a → disable custom).
- **Live size estimate** (always visible): `estimateBytes()` formatted MB/GB. Red warning + confirm checkbox when > 2GB ("File > 2GB — ProRes/4K dài rất nặng, vẫn xuất?").

## 5. Xuất video / audio (radio)

- `video-audio` (default): hình + tiếng.
- `audio`: chỉ audio (mp3/wav by format; if video format chosen + audio target → force mp3? NO — validation error: "audio-only cần định dạng MP3/WAV". Fail fast with message.)
- `video-mute`: video không tiếng (B-roll/visual nền).

## 6. Tùy chọn kèm theo

- Captions radio: `burn` (cháy vào hình — caption track hiện tại) / `srt` (file rời) / `both` (default: both for video targets; forced `srt`-only? NO — audio targets skip captions entirely with note).
- Range radio: `all` (cả timeline, default) / `inout` (đoạn in-out đã đánh dấu — disabled with hint if no range set; in-out marking UI is P1-minimal: two buttons "đặt in/out tại playhead"... playhead state must exist in App — if missing, range options reduce to all/clip) / `clip` (clip đang chọn — disabled if none selected).
- Thumbnail: number input seconds (default 1.0) → `thumb.png` via ffmpeg. Preview the frame? P1: no preview, numeric only.

## 7. Lưu preset

- Built-ins (locked, always present): `TikTok 4K` (mp4-h264/4K/auto/video-audio/both/all), `Nháp 720p nhanh` (mp4-h264/720p/auto/video-audio/srt/all), `Lưu trữ ProRes` (mov-prores/1080p/auto/video-audio/both/all), `Audio MP3` (mp3/-/auto/audio/-/-).
- User presets: name + save (localStorage key `ape.exportPresets`), set default, delete. Selecting a preset fills the whole form; editing after select = one-off override (does not mutate saved preset unless re-saved).

## Validation rules (all fail-fast with inline message, Export disabled until valid)

- fileName non-empty after trim; dir exists & writable (checked in main before enqueue? P1: check in main, surface error to dialog).
- audio target requires mp3/wav format; mute target requires video format.
- custom bitrate within format cap.
- range=inout requires range set; range=clip requires selection.
- hashtags: exactly 4 valid tags (reuse `buildCaptionTxt` validation — invalid → inline error, prefilled by `buildHashtags`).

## Explicitly P2 (do NOT build)

Loudness -14 LUFS normalize · multi-job export queue · 8K · auto SFX/transitions · direct TikTok/YouTube upload · thumbnail frame preview.
