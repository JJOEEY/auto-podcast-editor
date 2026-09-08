# Auto Podcast Editor — Design Spec (v2)

Ngày: 2026-09-08. Trạng thái: đã duyệt khung + 6 điểm review. Stack: Electron + React + Remotion + whisper.cpp + FFmpeg. Chạy local 100% trên Windows, 0đ chi phí API.

## 0. Mục tiêu và phi mục tiêu

Mục tiêu: video podcast dài, 1 người nói → app tự cắt silence / ậm ừ / frame thừa, tự gắn SFX / transition / caption trong safezone → người dùng sửa tay trên timeline kiểu Premiere/CapCut → xuất dọc 9:16 (mặc định) hoặc ngang 16:9 (chọn mỗi lần render).

Tiêu chí thành công:
- Video ≤ 20 phút xong auto trong vài phút.
- Video 60 phút: transcribe 1–6 phút (model base, CPU desktop thường) + render riêng.
- Mọi thứ auto sinh ra đều là clip thường trên timeline, sửa/xóa tay được, Undo được.

Phi mục tiêu (để phase sau hoặc không làm): voice-command điều khiển AI, cắt multicam đổi góc theo người nói, cắt theo beat nhạc (P2), đăng trực tiếp lên TikTok/YouTube, plugin Premiere.

## 1. Kiến trúc tổng thể

Ba khối:

1. **Electron Main (Node):** quản lý file project, gọi `ffprobe` lấy metadata, render waveform peaks, spawn tiến trình `whisper.cpp` (sidecar binary đóng gói kèm app), chạy job FFmpeg/Remotion render, điều phối hàng đợi job.
2. **React Renderer:** timeline kéo-thả 4 track, panel đề xuất cắt, preview realtime bằng Remotion Player, Inspector, panel lệnh AI (text + chạy/dừng/Cancel).
3. **Project model (1 file JSON):** nguồn media, đoạn keep/remove, clip SFX, transition, caption, preset xuất, settings snapshot.

Luồng chạy: Import → probe + waveform (hiện ngay) → transcribe full-file (progress %) → đề xuất cắt nhả dần theo khúc 30–60s đúng thứ tự timeline → user duyệt/sửa tay → auto polish (SFX/transition/caption) → preview → render.

## 2. Giao diện (kiểu Premiere/CapCut)

- **Trên-trái:** tab Media (file nguồn, waveform tổng) + tab Đề xuất cắt (mỗi dòng: thời gian, loại silence/ậm ừ/âm nhỏ, độ dài, độ chắc chắn, nút Giữ/Bỏ, tick chọn nhiều). Bấm 1 dòng → preview nhảy tới đúng frame.
- **Trên-phải:** Remotion Player preview đúng preset đang chọn, overlay khung safezone mờ (bật/tắt được), nút play/pause, nhảy tới đoạn cắt trước/tiếp, bật/tắt caption và SFX khi preview.
- **Dưới:** timeline 4 track — V1 video (trim/split/ripple/delete, tắt tiếng 1 đoạn), A1 giọng nói, A2 SFX + nhạc nền (thư viện tìm theo từ khóa, kéo-thả vào frame, volume/fade), CC caption (bấm sửa text). Toolbar: Select, Trim, Dao cắt, Snap, Zoom timeline, Undo/Redo không giới hạn.
- **Phải:** Inspector theo clip đang chọn (tốc độ, âm lượng, fade in/out, reframe, transition vào/ra, animation chữ, chỉnh màu nhanh) + panel lệnh AI (ô gõ lệnh text, nút chạy, tiến trình, Cancel all, lịch sử lệnh).

## 3. Cỗ máy auto-cut

1. `ffprobe` probe + FFmpeg xuất waveform peaks ngay để user nhìn được trước.
2. whisper.cpp full-file một lần: model `base` đa ngôn ngữ (~74MB, tải 1 lần lúc cài), flag `-l vi`, word timestamps bật, progress callback hiện % trên UI. Không chia chunk cố định (tránh cắt đứt từ ở biên).
3. Phát hiện frame thừa:
   - Silence: khoảng không tiếng dài hơn ngưỡng, mặc định 0.6s, chỉnh 0.3–1.5s (đo bằng VAD/energy + đối chiếu transcript).
   -ậm ừ: token trong transcript khớp lexicon tiếng Việt (`ừm, ừ, à, ờ, ơ, nhỉ, nhé` mở rộng được trong settings) VÀ thời lượng token ≤ 1.0s (chỉnh 0.5–2.0s).
   - Âm nhỏ: đoạn RMS dưới ngưỡng (mặc định −40dB, chỉnh được), dài hơn 0.5s.
4. Đề xuất cắt hiện dần theo khúc 30–60s sau khi có transcript (giữ cảm giác live realtime), mỗi đề xuất có lý do + confidence. Chế độ duyệt tay hoặc auto-apply hết rồi sửa sau. Cả đợt auto gộp thành 1 bước Undo.

## 4. Auto polish (SFX + transition + caption safezone)

- **SFX:** quét transcript tìm hook mở đầu, số liệu, cảnh báo, outro → đặt SFX tương ứng lên track A2, ducking tự hạ nhạc nền né giọng nói. Clip SFX thường, xóa/đổi/kéo tay được.
- **Transition:** mặc định hard-cut giữ nhịp nhanh. Pause **> 2.0s (chỉnh 1.0–4.0s), đo trên timeline SAU silence-cut (không đo trên audio gốc)** → coi là chuyển ý, gắn fade/slide/scale 6–12 frame (mặc định 8). Đổi/gỡ từng cái trên timeline.
- **Caption:** sinh từ word timestamps sau khi chốt cắt, 5–7 từ/dòng kiểu CapCut, highlight từng từ theo giọng, track CC riêng, sửa text tay.
- **Safezone dọc 9:16 (1080×1920):** lề mặc định top 160 / bottom 420 / trái-phải 48 (né nút Like/comment, thanh caption, tai thỏ), chỉnh được. Subtitle + brand header mặc định nằm gọn trong vùng an toàn. Đổi preset ngang/dọc → layout tự nhảy, preview hiện khung safezone mờ.
- Beat-cut kiểu Recap Mode (Fast/Medium/Slow) để phase 2.

## 5. Render và hàng đợi

- Preset mỗi lần render: dọc 9:16 1080×1920 (mặc định) hoặc ngang 16:9 1920×1080. Remotion render frame + FFmpeg encode H.264/AAC.
- Output: MP4 + SRT + caption.txt (caption + hashtag) + 1 thumbnail.
- **Hàng đợi tuần tự: tối đa 1 job nặng tại 1 thời điểm** (transcribe hoặc render). Job tới sau xếp hàng, UI báo vị trí. Mở giới hạn concurrency trong settings ở P2.
- Render chạy nền, vẫn edit được; render fail → log ghi rõ frame lỗi + nút render tiếp từ frame đó.

## 6. Lưu trữ và chống corrupt

- Project JSON ghi theo kiểu **write-to-temp-then-rename** cho mọi lần ghi (không sửa trực tiếp file chính). Autosave 30s + backup snapshot trước mỗi đợt auto. Cancel giữa chừng giữ nguyên phần đã xong.
- `waveform.json` cạnh project: `{ version: 1, durationSec, peaksPerSecond: 50, peaks: [...] }`, peaks RMS 0–1 đã downsample, tính 1 lần rồi cache (video 60 phút ≈ 180k số, dưới 1MB).
- Media bị xóa/di chuyển → báo relink, không crash.

## 7. Xử lý lỗi

| Lỗi | Cách xử lý |
|---|---|
| Whisper treo/quá lâu | timeout theo độ dài audio + nút hủy, cho chạy lại, giữ transcript khúc đã xong nếu dùng overlap fallback |
| Model chưa tải | báo dung lượng (~74MB), tải 1 lần, cho dùng waveform-only mode trong lúc đợi |
| Render fail | log frame lỗi + nút render tiếp từ frame đó |
| Mất file nguồn | cảnh báo relink |
| File lỗi import (codec lạ) | báo rõ + tự transcode proxy bằng FFmpeg rồi edit tiếp |

## 8. Kiểm thử

- Unit: ngưỡng silence/ậm ừ, chia dòng caption 5–7 từ, kiểm tra caption nằm trong safezone, merge biên chunk overlap.
- Tích hợp: video mẫu 2 phút đi hết import → auto → polish → render ra MP4 + SRT.
- Tay: checklist 10 thao tác (split, trim, undo batch, kéo SFX, đổi transition, sửa caption, đổi preset, cancel giữa auto-cut, relink, render tiếp từ frame lỗi).

## 9. Roadmap

- **MVP:** import + probe + waveform, whisper base + cắt silence/ậm ừ, timeline cơ bản (split/trim/delete/undo), caption safezone, render 1 preset, settings (đổi model tiny/base/small + GPU, ngưỡng silence/ậm ừ).
- **P1:** SFX/transition auto + heuristic chuyển ý pause 2.0s, nhả đề xuất theo khúc (live feel), preset dọc + ngang, Undo batch, hàng đợi job + Cancel.
- **P2:** beat-cut Recap, tracking mặt reframe dọc, concurrency setting, semantic chuyển ý (LLM local nhỏ, cân nhắc).

## 10. Settings mặc định đã chốt

Preset dọc 9:16 · silence 0.6s (0.3–1.5) · ậm ừ lexicon + token ≤ 1.0s (0.5–2.0) · chuyển ý pause > 2.0s sau silence-cut (1.0–4.0) · model base (đổi tiny/small/GPU) · transition 8 frame · caption 5–7 từ/dòng · safezone 160/420/48.
