# Auto Podcast Editor — Master Plan v3 status

Ngày kiểm tra: 2026-09-11

## Đã triển khai trong codebase

- Project schema v2 additive, migration v1 → v2, backup `.bak` và normalize v2 thiếu trường.
- Timebase 30fps, tracks/items/source handles, ripple-delete model và đồng bộ legacy `clips` với v2 `items`.
- CapabilitySnapshot refresh lúc runtime, phát hiện VRAM và rule-based fallback dưới 8GB.
- RenderGraph contract với compile preview/export riêng và semantic equivalence test.
- Waveform cache, FFmpeg streaming RMS peaks, IPC và hiển thị waveform trên Timeline.
- Timeline hiển thị theo track, drag/nudge/trim/split/delete, trim handle kéo trực quan, snap theo frame/biên clip, hỗ trợ lock/mute/hide UI.
- Editor command schema, adapter parser, dry-run diff/warning, confirmation và một undo transaction.
- Audio graph/preset đi vào export voice chain; sidechain đã có đường ghép voice/SFX thật qua FFmpeg. Player có A/B voice preview bằng WAV cache tạo từ cùng filter; track mute/solo/volume và SFX editor đã nối vào project/export.
- Transition presets, overlap thật theo source handles trong Remotion, fallback hard-cut có cảnh báo, audio containers, codec capability filtering và collision suffix khi export.
- Local asset server loopback cho Remotion đọc media Windows có range request.
- PCM equivalence comparator có ngưỡng SNR và absolute-error cho đoạn gần im lặng.
- Golden frame comparator RGBA8 đã có SSIM, mean absolute error và seed gate cho deterministic/stochastic filter groups; thêm comparator video thật bằng FFmpeg với ngưỡng 0.98. Capture Player thành video tự động vẫn còn.
- Codec smoke report đã xác nhận 13 format bằng file thật + ffprobe; H.264/ProRes/AV1/VVC/FFV1 đã có thêm sample 4K một frame.
- Performance gate evaluator và Whisper benchmark metric evaluator.
- Whisper benchmark runner local cho nhiều model tier, fixture validation, word alignment, WER và report JSON.
- Whisper benchmark runner mặc định đã có 3 profile: `base`, `small`, `small+DTW`; report ghi `extractElapsedSec`, `whisperElapsedSec`, `elapsedSec`, raw/non-special token count, zero-duration count/rate và CLI args thực tế.
- Installer bundle build được với FFmpeg, FFprobe, Whisper CLI và model.
- Đã bổ sung `ggml-small.bin`; smoke transcription local trên audio 193.6s chạy thành công: base 25.2s, small 68.5s. Đây chưa phải acceptance benchmark.
- Đã tạo product candidate runner `scripts/run-product-candidate.ts`: transcribe base, review-first auto-cut, subtitle SRT, project v2, proxy-first Remotion preview/export, ducking, WAV/MP3, ffprobe và cancel smoke.

## Bằng chứng kiểm tra hiện tại

- `npm test`: 40 test files, 178 tests pass.
- `npm run typecheck`: pass.
- `npm run dist`: pass.
- `npm run golden:video`: runner đã được thêm; chưa chạy gate Player/export vì chưa có cặp capture tương ứng.
- Remotion transition smoke: file H.264 120 frame / 4.000 giây, render qua local asset server.
- Sidechain smoke: WAV PCM 4.000 giây tạo bằng `sidechaincompress`, đọc lại bằng ffprobe.
- Codec smoke: 13 format pass file thật + ffprobe; 5 format có thêm 4K sample.
- Timeline UX đã thêm chọn nhiều, move nhóm một transaction, đổi track, ripple-delete, trim handle kéo trực quan và snap cơ bản.
- `npm run installer`: tạo được installer x64 và portable unpacked bundle.
- Installer smoke: launcher trong `release/win-unpacked` chạy ổn định ít nhất 5 giây rồi được dừng sau kiểm tra.
- Audio preview smoke trên DJI: WAV PCM 48kHz stereo, duration 275.776 giây, được tạo bằng voice filter dùng chung với export — pass.
- Golden comparator smoke: hai MP4 thật 270×480, 31 frame; SSIM Y/U/V/All = 1.0, gate 0.98 — pass. Artifact: `qa/golden-smoke/report.json`.
- Launcher smoke sau build mới: `Auto Podcast Editor.exe` chạy liên tục ít nhất 5 giây — pass.
- `scripts/verify-installer-signature.ps1`: installer hiện tại trả `NotSigned`; code-sign được loại khỏi phạm vi theo yêu cầu hiện tại.
- `npm run installer`: rebuild installer x64 sau các thay đổi audio/timeline, pass; artifact `release/Auto Podcast Editor-Setup-0.1.0.exe` đã cập nhật.
- Sau product candidate: `npm test -- --run` pass 40 test files / 178 tests; `npm run typecheck`, `npm run dist` và `npm run installer` pass. Silent-install vào `qa/product-candidate/installed` tạo đủ bundle; launcher sau cài sống ít nhất 5 giây.
- Candidate preliminary benchmark: 2 fixture dài × 3 profile (`base`, `small`, `small+DTW`) exit code 0; report `qa/product-candidate/whisper-results/report.json`. Không có ground truth nên WER/timestamp/filler chưa được chấm.
- Candidate E2E pass trên hai fixture: transcribe → auto-cut proposal → subtitle → preview dọc/ngang → H.264 4K → ducking → WAV/MP3 → ffprobe → cancel. Reports nằm trong `qa/product-candidate/e2e/slow-camera-mic/report.json` và `qa/product-candidate/e2e/medium-laptop-mic/report.json`.
- Reopen validation pass trên cả hai project artifact: đọc lại JSON và migrate schema v2, 2 items / 4 tracks mỗi fixture.
- E2E cần proxy 10 giây 1280×720 khi render Remotion vì master nhiều GB gây `ERR_EMPTY_RESPONSE` qua loopback asset server; full master vẫn được dùng cho probe/transcribe và được lưu trong project.
- Performance backend đã đo trên hai fixture thật: preview decode/scale đạt `146.39 fps` và `29.09 fps`; export H.264 4K 10 phút mất `474.71s` và `781.45s`; timeline reducer p95 `0.108ms` và `0.121ms`. Đây là số đo FFmpeg backend, chưa phải Player capture và chưa gồm stability 2 giờ.
- Đã bổ sung `scripts/run-performance-gate.ts` và `qa/product-candidate/performance/report.json`; report giữ fail-closed khi metric Whisper theo fixture hoặc stability chưa có.
- Smoke test binary: FFmpeg tạo media, FFprobe đọc duration, Whisper CLI chạy version.

## Smoke test video người dùng — 2026-09-11

Đã chạy trên `D:\CLIP PROJECT\DJI_20250516150338_0001_D.MP4`:

- 275.776 giây, HEVC 1728×3072 dọc, 60000/1001 fps, AAC mono 48kHz.
- Whisper `base`: 29.32 giây; Whisper `small`: 88.44 giây; cả hai đều chạy hết file và sinh JSON.
- Auto-analysis: base 14 đề xuất (10 silence, 4 filler); small 16 đề xuất silence.
- Remotion render thật có caption karaoke: H.264 270×480, 10.048 giây, có audio AAC — pass.
- Transition overlap thật trên hai source range: H.264 270×480, 6.000 giây — pass.
- Audio export WAV PCM mono 48kHz 10 giây — pass.
- Sidechain ducking audio video + SFX WAV PCM mono 48kHz 10 giây — pass.
- Kết quả transcript còn nhiều token tiếng Việt bị tách/lặp; video dài 4 phút 36 giây và không có ground truth nên chỉ được tính là smoke test, chưa đóng Phase 0.5/2/3/10.
- Artifact lưu tại `qa/user-fixture-dji/`.

### Điều tra chênh lệch base/small

- Cùng một WAV 16kHz mono dài 275.776 giây, cùng tham số `-l vi --max-len 1 --output-json-full`.
- Cả hai process exit code 0 và chạy tới cuối file; không phải timeout/cắt audio.
- Base: 939 raw token, 44 zero-duration token, 844 word hợp lệ sau parser.
- Small: 541 raw token, 127 zero-duration token, 381 word hợp lệ sau parser.
- Đã tạo `qa/user-fixture-dji/whisper-diff-report.md` và chạy lại base để xác nhận kết quả ổn định bằng SHA-256.
- Chưa chốt production tier; cần benchmark có ground truth.
- Đã tạo `qa/user-fixture-dji/ground-truth.template.json` để bắt đầu gán tay DJI như fixture điều tra ngắn.
- Kiểm tra thêm các cờ CLI: `--split-on-word`/`--max-len 0` không cải thiện full audio; `--word-thold 0.10` chỉ giảm nhẹ còn 21.63%.
- DTW phải chạy cùng `--no-flash-attn`; cấu hình `--no-flash-attn --dtw small` giảm zero-duration xuống 1.63% trên full audio, nhưng tăng thời gian lên khoảng 109.9 giây và chưa được chốt production.
- Đã chạy lại baseline small và xác nhận SHA-256 reproducible; cần benchmark ground truth để quyết định giữa base, small và small+DTW.

## Chưa được đánh dấu hoàn tất

- Chưa có benchmark Whisper chính thức: hiện mới có 2 fixture candidate không ground truth; còn thiếu fixture nhanh/nhiễu và ground truth để chấm WER/timestamp/filler.
- Preliminary đã chạy đủ `base`, `small`, `small+DTW` trên hai fixture; zero-duration dao động theo profile/fixture và không được dùng để chốt production tier.
- Khi có ground truth, phải chạy lại benchmark chính thức theo `qa/whisper-fixtures/README.md`, dùng kết quả tệ nhất của từng fixture.
- Performance backend đã có số đo thật trên 2 fixture candidate và đạt các ngưỡng preview/export/timeline; chưa đủ để đóng gate vì thiếu Whisper metric gắn theo từng fixture và stability 2 giờ.
- Timeline chưa đạt mức Premiere/CapCut: trim handle kéo trực quan, ripple/multi-select và đổi track cơ bản đã có; magnetic snap nâng cao, cross-track editing phức tạp và UX nhiều track vẫn còn thiếu.
- Golden SSIM frame-by-frame giữa video Player và export vẫn chưa tự capture; comparator FFmpeg đã sẵn sàng nhận hai file thật và chấm ngưỡng.
- EQ/noise-reduction A/B preview trong Player đã nối bằng audio stem WAV cache từ cùng filter export; voice/music/SFX mute/solo/volume và SFX trim/fade/duplicate đã có UI. Candidate đã smoke audio end-to-end; vẫn cần acceptance dài và PCM equivalence chính thức.
- Local LLM runtime/model và CPU opt-in mode đã được bundle ở Mốc U; chưa hoàn tất acceptance offline/VRAM và 50-command safety test trên bản cài.
- Codec matrix cơ bản và sample 4K đã có file thật + ffprobe; vẫn cần chạy acceptance trên media dài và xác nhận từng encoder trên máy mục tiêu khi chốt release.
- Code-sign được loại khỏi phạm vi release theo yêu cầu hiện tại; chữ ký Authenticode vẫn là `NotSigned` và không dùng để đánh giá các gate kỹ thuật còn lại.
- Chưa clean-install/update test trên máy Windows sạch.
- Đã có product candidate field-test với hai fixture thật và artifact E2E, nhưng chưa được gọi là production-ready vì thiếu ground truth/fixture thứ ba, Whisper benchmark theo fixture, stability 2 giờ, Player golden capture, clean-install/update và acceptance 5 track dài. Code-sign đã được loại khỏi phạm vi.

### Mốc U — Master Plan v3 hợp nhất: timeline, LLM, build identity và offline bundle

- Sửa timeline để dùng `TimelineItem.startFrame` làm vị trí chính thức; giữ khoảng trống khi không có ripple; transition chỉ overlap clip liền biên cùng track.
- Bổ sung tính thời lượng theo item video/audio/caption/SFX lớn nhất. Audio đuôi sau video vẫn giữ thời lượng project; mute/solo/hide không cắt đuôi.
- Bổ sung `trackId` cho SFX, track A3 riêng và UI chọn Music/SFX; migration giữ nghĩa SFX cũ ở A2.
- Export H.264 4K candidate dùng master source; preview vẫn proxy. Renderer ghi file `.part`, truyền cancel signal thật vào Remotion và chỉ đổi tên output sau khi thành công.
- Preview Player dùng duration/timing/audio track controls thống nhất hơn với export; revision project tăng theo transaction.
- AI command panel đã nối local Qwen3-4B GGUF Q4_K_M qua llama.cpp; parser chỉ nhận JSON command allowlist, giới hạn context/input/output, timeout toàn yêu cầu 120 giây, CPU dưới 8GB VRAM chỉ chạy khi user bấm chủ động.
- Preview AI gắn với `project revision`; project đổi, undo/redo, cancel hoặc request mới sẽ làm preview cũ hết hiệu lực.
- Bundle browser Remotion offline, llama.cpp, model Qwen3-4B và license/notice; capability Doctor kiểm tra dependency bundle, không tự tải dependency.
- Đồng bộ version package/lockfile `0.1.1`; build manifest hiện tại: buildId `6b58216cac7f6907139cbd23`, 447 file.
- Validator performance chính thức đã thêm: bắt buộc bản cài đúng buildId, workload 600 clip/1.200 caption/9.000 word/120 transition/12 music/60 SFX, 5 track, 100 seek, 1.000 thao tác, metric finite và threshold đầy đủ. Report hiện tại chỉ là diagnostic nên gate chính thức vẫn blocked.
- NSIS một file không tạo được vì payload nén 3,246 MiB vượt giới hạn memory-map của `makensis`; không coi đây là pass giả. Đã tạo offline bundle 0.1.1 chia 2 phần 7z, tổng 3,402,629,462 bytes, manifest SHA-256 và script kiểm tra/giải nén.
- Offline bundle final đã test integrity bằng 7-Zip, giải nén vào QA, launcher chạy ổn định ít nhất 5 giây; model 2,497,280,256 bytes, llama.cpp, FFprobe và browser Remotion đều hiện diện.

### Trạng thái sau Mốc U

- `passed`: typecheck; 43 test files/186 tests; dist; transition/timeline duration/revision/local LLM/performance validator tests; master export smoke; cancel smoke; offline bundle integrity; extracted launcher smoke.
- `deferred-by-user`: Block 1 — benchmark chất lượng chính thức với 3 fixture và ground truth.
- `blocked`: performance chính thức từ bản cài (chưa có Player windows/100 seek/1.000 thao tác/stability 2 giờ); Player-vs-export capture golden; clean-install/update/rollback trên Windows sạch; acceptance 5 track dài trên bản cài.
- `excluded-by-user`: Authenticode certificate.
- `candidate`: bản bundle offline field-test có thể chạy, nhưng toàn bộ sản phẩm chưa được gọi production-ready.

### Mốc V — Sửa lỗi launcher thiếu React trong app.asar

- Nguyên nhân: `react` và `react-dom` chỉ nằm ở devDependencies; electron-builder không đưa peer dependency của Remotion vào app.asar.
- Đã sửa: chuyển `react/react-dom` sang production dependencies và buộc include trực tiếp `react`, `react-dom`, `scheduler`, `loose-envify` trong build files.
- Đã thêm regression test `tests/packaging.test.ts`.
- Build mới: `0.1.1`, buildId `6b58216cac7f6907139cbd23`.
- Đã kiểm: `react` và `react-dom` có thật trong app.asar; offline bundle 7-Zip integrity pass; giải nén pass; launcher bản mới sống ít nhất 8 giây.
- Trạng thái: lỗi `Cannot find module 'react'` đã được sửa và đã xác nhận trên bundle mới.

### Mốc W — Đổi UX/UI sang editor workbench cố định

- Mục tiêu: loại bỏ giao diện dạng một trang cuộn dài; chuyển sang bố cục editor dày và ổn định, lấy cảm hứng từ Motion Workbench của ShotCraft.
- Đã sửa: khung ứng dụng 5 vùng gồm top bar, asset/AI rail bên trái, preview trung tâm, timeline cố định phía dưới và inspector/mixer bên phải.
- Đã sửa: mỗi rail có vùng cuộn riêng; toàn bộ app không còn cuộn dọc; timeline giữ vị trí và chiều cao ổn định; thêm status bar cuối app.
- Đã sửa: Command Panel, Cut Proposals, SFX Library, Audio Mixer, SFX Editor và Runtime Doctor dùng chung visual system dark editor, accent amber/teal, header và badge nhất quán.
- Đã thêm: `src/app.css`; `src/main.tsx` nạp stylesheet; các panel được gắn class layout riêng để tiếp tục mở rộng UX mà không đổi logic editor.
- Đã test: typecheck pass; 44 test files/187 tests pass; `npm run dist` pass; build Windows unpacked `release-v011-ui` pass; launcher smoke sống ít nhất 8 giây.
- Artifact kiểm tra: `release-v011-ui/win-unpacked/Auto Podcast Editor.exe`; buildId `8692075bacf2c579f53dec7a`.
- Đã đóng gói lại offline bundle 7z hai phần cho thay đổi UX này; checksum, giải nén, React/CSS trong app.asar và launcher bản cài đều đã kiểm tra.
- Các gate production đã ghi ở Mốc U vẫn giữ nguyên trạng thái.

### Mốc X — Chuyển sang installer online và tải runtime sau cài đặt

- Đã sửa cấu hình Electron Builder: không đưa FFmpeg/FFprobe/Whisper/model/llama.cpp/Remotion browser/SFX lớn vào installer.
- Đã thêm `core/runtimeAssets.ts` và `electron/runtimeAssets.ts`: manifest versioned, kiểm tra SHA-256/kích thước, tải tiếp bằng HTTP Range, file `.part`, rename nguyên tử, giải nén ZIP và báo tiến độ.
- Đã thêm Runtime Setup UI: hiển thị thành phần còn thiếu, dung lượng, trạng thái tải và chặn Import/Phân tích/Xuất cho đến khi runtime bắt buộc sẵn sàng.
- Đã thêm các script `runtime:payload`, `runtime:manifest` và `installer:online`; build release yêu cầu `RUNTIME_ASSET_BASE_URL` HTTPS, không chấp nhận URL giả hoặc cấu hình thiếu.
- Installer thử nghiệm đã build bằng Electron Builder NSIS: `release-online-preview/Auto Podcast Editor-Setup-0.1.1.exe`, kích thước 115,412,523 bytes. App.asar có runtime manifest nhưng không chứa FFmpeg/model lớn.
- Đã test: typecheck pass; 45 test files/190 tests pass; dist pass; NSIS thin installer pass; xác nhận model/FFmpeg không nằm trong app.asar.
- Blocker còn lại: chưa có máy chủ/CDN HTTPS của sản phẩm để upload `runtime-payload` và đặt `RUNTIME_ASSET_BASE_URL`; vì vậy `release-online-preview` là build cấu trúc, chưa phải bản online bàn giao cho máy khác.
