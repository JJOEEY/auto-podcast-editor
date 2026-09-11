# Auto Podcast Editor — Project Memory

File này là nhật ký kỹ thuật và nguồn ghi nhớ làm việc của project. Sau mỗi mốc code/test quan trọng, phải cập nhật file này trước khi kết thúc lượt làm việc.

## 1. Mục tiêu ban đầu

Xây dựng desktop editor podcast offline cho Windows 10/11 x64, UI tiếng Việt trước, workflow:

`video thật → Whisper tiếng Việt → auto-cut → subtitle → SFX/transition → voice enhancement → timeline → preview → export`

Phạm vi mục tiêu gần AutoEdit + CapCut/Premiere cho podcast một người nói; kiến trúc phải mở rộng được cho nhiều track, nhạc nền, multicam và nested sequence về sau.

## 2. Tình trạng codebase khi bắt đầu audit

Codebase đã có một vertical slice end-to-end chạy được, gồm Electron, Remotion, FFmpeg/FFprobe, Whisper CLI, subtitle, SFX, export và installer.

Nhưng chưa phải CapCut/Premiere hoàn chỉnh. Các thiếu hụt ban đầu được xác nhận:

- Timeline kéo-thả, trim/ripple/multi-select chưa đầy đủ.
- Waveform chưa tương tác đầy đủ.
- Chưa có audio stem/multi-track hoàn chỉnh và sidechain ducking thật.
- Transition ban đầu chỉ là overlay, chưa overlap bằng source handle thật.
- AI command ban đầu chưa có local LLM thật.
- Chưa smoke-test đủ codec bằng file thật.
- Chưa benchmark bằng video podcast tiếng Việt thật từ đầu đến cuối.
- Installer chưa code-sign (được loại khỏi phạm vi lượt này), chưa clean-install/update test production.

## 3. Source of truth đã chốt

Master Plan v3 là kế hoạch chính thức. Các quyết định khóa:

- Windows 10/11 x64, offline 100%, UI tiếng Việt.
- SDR Rec.709 8-bit, audio mono/stereo.
- Proxy-first cho media lớn.
- Project schema v2 migrate an toàn từ v1.
- RenderGraph là abstract graph compile thành preview backend và export FFmpeg backend.
- Handle đơn giản 18 frame, transition phức tạp 30 frame ở 30fps.
- Whisper benchmark phải dùng tối thiểu 3 fixture tiếng Việt thật, mỗi fixture tối thiểu 30 phút.
- Whisper production tier chọn sau benchmark base/small.
- Local LLM GPU khi VRAM >= 8GB; máy yếu dùng rule-based mặc định.
- Multicam live và nested sequence để sau production gate Phase 10.

## 4. Nhật ký công việc đã thực hiện

### Mốc A — Schema, migration và timeline model

- Bổ sung các cấu trúc v2: `MediaAsset`, `Track`, `TimelineItem`, `SourceRange`, `AudioChain`, `Marker`, `ProxyMetadata`, `EditorCommand`, `RenderGraph`.
- Thêm migration v1 → v2, normalize project lỗi/thiếu field và backup `.bak` khi lưu.
- Timeline item lưu source in/out, timeline frame, timebase và handle trước/sau.
- Thêm kiểm tra handle, transition requirement, snap frame và ripple-delete model.
- Đồng bộ legacy `clips` với v2 `items` để nâng cấp từ code cũ, không xây lại từ đầu.

### Mốc B — Runtime Doctor, capability và media foundation

- CapabilitySnapshot được tạo lại khi app khởi động.
- Runtime Doctor kiểm tra FFmpeg, FFprobe, Whisper, model, Remotion và VRAM.
- Dưới 8GB VRAM báo rule-based fallback, không im lặng fallback.
- Thêm waveform RMS cache qua FFmpeg, IPC và waveform hiển thị trên Timeline.
- Sửa Remotion renderer để media local trên Windows được phục vụ qua loopback HTTP có range request.

### Mốc C — Editor command và dry-run

- Thêm parser/adapter cho command panel.
- Command được schema validate, dry-run trên project copy, hiển thị diff/warning rồi mới apply.
- Apply là một transaction có undo.
- Không cho command panel gọi shell/FFmpeg trực tiếp.

### Mốc D — Whisper benchmark foundation

- Thêm `core/whisperBenchmark.ts` với word alignment, WER, timestamp deviation và filler precision/recall.
- Thêm runner `scripts/run-whisper-benchmark.ts`.
- Runner bắt buộc tối thiểu 3 fixture, mỗi fixture >= 1800 giây và có `ground-truth.json`.
- Bundle thêm `ggml-small.bin` bên cạnh base model.
- Smoke transcription local đã chạy thành công:
  - Base trên audio 193.6 giây: khoảng 25.2 giây.
  - Small trên audio 193.6 giây: khoảng 68.5 giây.
- Đây chỉ là smoke test kỹ thuật, chưa phải acceptance benchmark.

### Mốc E — Transition backend thật

- Thêm `core/transitionPlan.ts` để tính overlap thật từ source handles.
- Thiếu handle thì cảnh báo và fallback hard-cut; không còn overlay giả làm transition.
- Preview và export Remotion dùng cùng placement/transition plan.
- Hỗ trợ effect thực tế như fade, dip, slide/push, wipe, zoom, blur, glitch, flash, film burn, light leak, whip, shake, pixel dissolve, shape wipe và elastic push ở mức deterministic.
- Sửa các import `.tsx`/`.ts` để Remotion bundler thực sự bundle được source.
- Render smoke thật: H.264 120 frame, thời lượng 4.000 giây; kiểm tra lại bằng FFprobe.
- Golden unit test kiểm tra chính xác output placement, overlap, source range và fallback handle.
- Golden SSIM frame-by-frame giữa preview backend và export backend vẫn còn phải hoàn thiện.

### Mốc F — Audio graph và sidechain

- Audio graph/preset được nối vào export voice chain.
- Thêm sidechain filter graph thật: voice + nhiều background/SFX → `sidechaincompress` → mix output.
- Export có công tắc duck nhạc/SFX theo voice.
- Export có công tắc A/B bypass voice enhancement.
- Thêm PCM equivalence comparator với:
  - SNR gate tối thiểu mặc định 60dB.
  - Absolute-error gate riêng cho đoạn gần im lặng.
- FFmpeg sidechain smoke thật tạo WAV PCM 4.000 giây và FFprobe đọc thành công.
- EQ/noise-reduction A/B preview trực tiếp trong Player và audio stem đầy đủ vẫn còn thiếu.

### Mốc G — Codec smoke và capability UI

- Tạo file thật và kiểm tra bằng FFprobe cho 13 format:
  - H.264, HEVC, AV1, VVC, VP9, ProRes, DNxHR, FFV1.
  - MP3, WAV, FLAC, AAC, Opus.
- Tạo thêm sample 4K cho H.264, ProRes, AV1, VVC và FFV1.
- Thêm `assets/codec-smoke-report.json`.
- Capability UI chỉ hiển thị codec vừa có encoder và có trong smoke report; không còn chỉ dựa vào tên encoder.
- Bằng chứng: `qa/codec-smoke/report.json`.

### Mốc H — Timeline UX cơ bản

- Multi-select clip.
- Move nhóm clip trong một undo transaction.
- Đổi track từ Timeline.
- Ripple-delete clip.
- Giữ lock/mute/hide track trong UI hiện có.
- Trim bằng nút và keyboard nudge vẫn có.
- Trim handle kéo trực quan, magnetic snap nâng cao, cross-track editing kiểu Premiere và multi-track audio editor vẫn chưa hoàn tất.

### Mốc I — Build, installer và signing audit

- `npm run dist` pass.
- `npm run installer` pass, tạo installer NSIS x64 và unpacked bundle.
- Launcher trong `release/win-unpacked` chạy ổn định ít nhất 5 giây trong smoke test.
- Installer đã được kiểm tra bằng Authenticode.
- Kết quả hiện tại: `NotSigned` vì máy chưa có chứng chỉ Authenticode/PFX hợp lệ.
- Khi có chứng chỉ, dùng `CSC_LINK` và `CSC_KEY_PASSWORD`; không lưu password trong repo, log hoặc chat.

### Mốc J — Tạo project memory

- Tạo file này để lưu lịch sử triển khai từ lúc audit codebase đến hiện tại.
- Ghi rõ các thay đổi đã làm, bằng chứng test, lỗi đã sửa và blocker.
- Đã thống nhất sẽ cập nhật file sau mỗi mốc code/test hoàn thành.

### Mốc K — Smoke test bằng video người dùng gửi

- Fixture: `D:\CLIP PROJECT\DJI_20250516150338_0001_D.MP4`.
- Metadata đọc được: 275.776 giây, video HEVC dọc 1728×3072 ở 60000/1001 fps, audio AAC mono 48kHz, dung lượng khoảng 3.15GB.
- Tách toàn bộ audio sang WAV 16kHz thành công.
- Whisper local chạy toàn bộ audio thành công:
  - `base`: 29.32 giây, 844 word token hợp lệ.
  - `small`: 88.44 giây, 381 word token hợp lệ.
- Auto-analysis chạy được trên transcript: base tạo 14 đề xuất (10 silence, 4 filler), small tạo 16 đề xuất silence; caption chunk và keep-range pipeline nhận được dữ liệu.
- Render Remotion thật trên video dọc thành công: H.264 270×480, 10.048 giây, có audio AAC và caption karaoke.
- Kiểm tra hình ảnh một frame đầu ra: video và caption render được; transcript hiện còn lỗi tách/lặp từ tiếng Việt nên chưa đạt chất lượng acceptance.
- Transition overlap thật trên hai source range của cùng video thành công: H.264 270×480, 6.000 giây, ffprobe đọc được.
- Kiểm tra hình ảnh trước/sau vùng transition cho thấy hai source range có chuyển động/pose khác nhau, không phải một frame tĩnh bị overlay.
- Audio export thật thành công: WAV PCM 48kHz mono, 10.000 giây.
- Sidechain ducking thật trên audio video + SFX thành công: WAV PCM 48kHz mono, 10.000 giây.
- Artifact QA được lưu tại `qa/user-fixture-dji/`, gồm audio, transcript base/small, render smoke, transition smoke, audio export, ducked audio và log.
- Đây là smoke test media thật, không phải acceptance benchmark: video chỉ dài khoảng 4 phút 36 giây, không có ground truth gán tay và không phải fixture podcast 30 phút đã khóa trong Master Plan v3.

### Mốc L — Điều tra chênh lệch Whisper base/small và chuẩn bị ground truth DJI

- Chạy lại `base` với cùng WAV, cùng tham số và lưu `whisper-base.log`; exit code 0, tổng thời gian 29.770 giây.
- Đối chiếu hash `transcript-base.json` và `transcript-base-rerun.json`: giống hệt nhau.
- `small` cũng exit code 0, tổng thời gian 88.271 giây; cả hai tier đều phủ hết audio 275.776 giây, không có dấu hiệu timeout/cắt file.
- Phân rã output:
  - Base: 939 raw token, 888 non-special token, 44 token zero-duration, 844 word hợp lệ sau parser.
  - Small: 541 raw token, 508 non-special token, 127 token zero-duration, 381 word hợp lệ sau parser.
- Kết luận: chênh lệch không phải lỗi timeout; chủ yếu do model `small` sinh ít token nội dung hơn và nhiều timestamp bằng 0 hơn. Cả hai vẫn có lỗi tách/lặp token tiếng Việt.
- Tạo báo cáo chi tiết: `qa/user-fixture-dji/whisper-diff-report.md`.
- Tạo template gán tay: `qa/user-fixture-dji/ground-truth.template.json`. Template cố ý không được gọi là ground truth và không thay thế 3 fixture 30 phút chính thức.
- JSON template đã được parse kiểm tra thành công; `git diff --check` không báo lỗi nội dung.
- Verification sau mốc: `npm test -- --run` pass 36 test files / 158 tests; `npm run typecheck` pass.

### Mốc M — Điều tra sâu zero-duration và thử alignment DTW

- Kiểm tra help của bundled `whisper-cli`; xác nhận binary có `--max-len`, `--split-on-word`, `--word-thold`, `--dtw`.
- Sweep đoạn 60 giây đầu trên cả base/small: các cờ split/max-len/word-thold không tạo kết luận đủ mạnh vì lỗi tập trung ở phần sau của file.
- Sweep full audio với small:
  - baseline: 23.48% zero-duration.
  - `--split-on-word` và `--max-len 0`: vẫn 23.48%.
  - `--word-thold 0.05`: 22.55%.
  - `--word-thold 0.10`: 21.63%.
- Xác nhận lần thử `--dtw small` đầu tiên không thực sự bật DTW vì flash attention; log ghi `dtw_token_timestamps is not supported with flash_attn`.
- Chạy đúng `--no-flash-attn --dtw small --max-len 1 --word-thold 0.10` trên full audio:
  - zero-duration giảm còn 9/552 = 1.63%.
  - 515 word hợp lệ.
  - exit code 0, log xác nhận `flash attn = 0`, `dtw = 1`.
  - thời gian 109.879 giây, chậm hơn baseline small khoảng 18–20 giây.
- Dùng FFmpeg silencedetect xác nhận 2.29 giây cuối là silence thật; timestamp cuối DTW khoảng 273.75 giây không phải bằng chứng cắt phần lời.
- Chạy lại baseline small và đối chiếu SHA-256: trùng `BD4876913D8C2A8B2319A250306F112896A5EA9F9F9E2ED877A130A34A7B38D8`; baseline small deterministic trên fixture DJI.
- Kết luận: vấn đề zero-duration có liên quan mạnh đến cơ chế timestamp; DTW là ứng viên tham số cho benchmark chính thức. Chưa chốt production vì chưa có WER/median/p95/filler trên ground truth.
- Báo cáo đầy đủ: `qa/user-fixture-dji/whisper-diff-report.md`; toàn bộ sweep nằm trong `qa/user-fixture-dji/param-sweep/`.
- Verification sau mốc: `npm test -- --run` pass 36 test files / 158 tests; `npm run typecheck` pass; `git diff --check` không có lỗi nội dung (chỉ có cảnh báo line-ending hiện hữu).

### Mốc N — Chuẩn bị benchmark chính thức với profile small+DTW

- Bổ sung `core/whisperProfiles.ts` với profile mặc định: `base`, `small`, `small+DTW`.
- `small+DTW` dùng đúng cấu hình đã kiểm chứng trên DJI: `--max-len 1 --word-thold 0.10 --no-flash-attn --dtw small`.
- Benchmark runner dùng parser có thống kê token, không còn parse riêng một bản sao logic.
- Report benchmark sắp tới sẽ ghi thêm model tier, CLI args, thời gian tách audio, thời gian Whisper, tổng thời gian, raw/non-special token count, zero-duration count/rate và invalid-duration count.
- Cập nhật README fixture để hướng dẫn chạy đủ 3 profile và theo dõi zero-duration theo từng fixture.
- Chưa chạy benchmark chính thức vì vẫn thiếu 3 fixture podcast tiếng Việt >=30 phút và ground truth.
- Verification lát này: test parser/profile 8/8 pass; `npm run typecheck` pass.
- Verification đầy đủ sau khi nối runner: 37 test files / 163 tests pass; `npm run typecheck` pass; `git diff --check` không có lỗi nội dung.

### Mốc O — Đồng bộ lệnh benchmark trong status

- Sửa dòng lệnh mẫu còn sót trong `docs/MASTER_PLAN_V3_STATUS.md` từ `base,small` thành `base,small,small+DTW`.
- README fixture và status hiện dùng cùng một lệnh benchmark 3 profile.
- Không thay đổi code xử lý, không chạy lại DJI; `npm run typecheck` pass và `git diff --check` không có lỗi nội dung.

### Mốc P — Golden frame comparator cho preview/export equivalence

- Thêm `core/goldenFrames.ts` với comparator RGBA8 dùng global SSIM, mean absolute error và kiểm tra seed.
- Filter deterministic yêu cầu SSIM tối thiểu mặc định 0.98 và sai số trung bình tối đa 0.02.
- Filter stochastic bắt buộc `expectedSeed === actualSeed`; không coi hai frame giống pixel là đủ nếu seed khác.
- Thêm 4 unit test: frame deterministic giống hệt, mismatch cấu trúc, stochastic seed mismatch và kích thước RGBA sai.
- Đây là hạ tầng/contract test cho golden equivalence; chưa tuyên bố đã hoàn tất capture frame-by-frame giữa Remotion Player preview và FFmpeg export thực tế.
- Verification lát này: golden test 4/4 pass; `npm run typecheck` pass.
- Verification đầy đủ sau mốc: `npm test -- --run` pass 38 test files / 167 tests; `git diff --check` không có lỗi nội dung.

### Mốc Q — Audio A/B, audio stem controls, trim handle và release signing gate

- Thêm `core/audioPreview.ts` và IPC `audio:preview`: FFmpeg tạo WAV preview cache từ đúng voice preset + `AudioChain`; Player có hai nút A/B, mute audio gốc khi đang phát stem đã xử lý, tránh phát trùng hai lần.
- RenderProps/Remotion nhận `previewAudioPath` và `originalAudioVolume`; export giữ chung chuỗi filter voice với preview. Track có `mute`, `solo`, `volumeDb`; export áp dụng gain/mute/solo cho voice và SFX background trước sidechain.
- Thêm `AudioMixer` với voice preset, mute/solo/volume; các thay đổi là undoable. Thêm `SfxEditor` cho start, duration, volume, fade in/out, mute, duplicate và delete; tất cả là undoable.
- Timeline có trim handle kéo trực quan, snap theo frame và biên clip trong phạm vi 2 frame; vẫn giữ ripple delete, multi-select, đổi track và lock/mute/hide cơ bản.
- Thêm `core/videoGolden.ts` và `scripts/compare-golden-video.ts` để so SSIM file video thật bằng FFmpeg, ngưỡng mặc định 0.98; đây là comparator/gate, chưa tự capture Player thành video.
- Thêm `scripts/sign-installer.ps1`, `scripts/verify-installer-signature.ps1`, `docs/RELEASE_SIGNING.md` và npm scripts. Không có PFX thật nên installer hiện tại vẫn `NotSigned`, không được gọi production-ready.
- Smoke thật trên DJI: FFmpeg tạo audio preview podcast WAV PCM 48kHz stereo, duration 275.776s, file 52,949,090 bytes; pass.
- Golden comparator smoke bằng hai MP4 thật 270×480, 31 frame: FFmpeg SSIM Y/U/V/All đều 1.0, gate 0.98 pass; artifact ở `qa/golden-smoke/report.json`.
- Launcher smoke sau thay đổi: `release/win-unpacked/Auto Podcast Editor.exe` chạy liên tục ít nhất 5 giây rồi được dừng đúng process đã khởi chạy.
- Rebuild installer sau các thay đổi: `npm run installer` pass, tạo lại `release/Auto Podcast Editor-Setup-0.1.0.exe` x64. Kiểm tra chữ ký trả `NotSigned` đúng blocker hiện tại vì chưa có PFX.
- Verification tổng: `npm test` pass 40 test files / 175 tests; `npm run typecheck` pass; `npm run dist` pass; `git diff --check` không có lỗi nội dung.

### Mốc R — Product candidate preliminary và E2E trên hai fixture thật

- Chốt candidate field-test dùng hai fixture dài: `C0012.MP4` (38:04, nói chậm/mic máy ảnh) và file ghép copy-stream từ hai DJI (38:19.864, nói vừa/mic laptop). DJI ngắn giữ làm smoke fixture; chưa dùng fixture nói nhanh/nhiễu và chưa có ground truth.
- Tạo `qa/product-candidate/fixtures/`; dùng hard-link cho C0012 để không nhân bản 15 GB, ghép DJI bằng FFmpeg `-c copy`, ffprobe xác nhận HEVC 3840×2160, AAC stereo 48 kHz, duration 2299.864 giây.
- Benchmark preliminary đủ `base`, `small`, `small+DTW` trên cả hai fixture. Vì thiếu ground truth, WER/timestamp/filler để `null`; chỉ ghi thời gian và zero-duration:
  - `base`: 350.635s / 384.366s; zero-duration 1.892% / 0.442%.
  - `small`: 880.841s / 841.195s; zero-duration 4.828% / 4.334%.
  - `small+DTW`: 852.547s / 893.915s; zero-duration 8.429% / 1.147%.
  - Artifact: `qa/product-candidate/whisper-results/report.json`.
- Phát hiện và sửa deadlock benchmark: runner tạo stdout pipe nhưng không consume progress output, khiến Whisper dài bị block khi pipe đầy. Runner giờ tiêu thụ stdout trước khi chờ process kết thúc.
- Thêm `scripts/run-product-candidate.ts` và npm script `candidate:e2e`. Runner thực hiện probe → extract → Whisper base → đề xuất auto-cut/review-first → subtitle SRT → project v2 → render proxy → preview dọc/ngang → H.264 4K → ducking → WAV/MP3 → ffprobe → cancel smoke.
- Lượt render đầu tiên lộ lỗi Remotion đọc trực tiếp master nhiều GB qua loopback (`ERR_EMPTY_RESPONSE`). Sửa candidate theo proxy-first: full media vẫn dùng cho probe/transcribe/project, Remotion dùng proxy 10 giây 1280×720; project vẫn lưu đường dẫn master.
- E2E pass trên cả hai fixture:
  - `slow-camera-mic`: 462.937s, 14,681 words, 21 proposals; preview 270×480 và 480×270; H.264 3840×2160; WAV/MP3; ducking; cancel.
  - `medium-laptop-mic`: 500.787s, 14,011 words, 95 proposals; cùng toàn bộ output và cancel pass.
  - Reports: `qa/product-candidate/e2e/slow-camera-mic/report.json` và `qa/product-candidate/e2e/medium-laptop-mic/report.json`.
- Reopen validation trên cả hai `project.json`: migrate lại thành schema v2, mỗi project có 2 timeline items và 4 tracks; stage `reopen.ok=true` đã ghi vào hai report.
- Cập nhật README candidate ghi rõ đây là product candidate field-testing, chưa production-ready; base là mặc định, review-first giữ nguyên.
- Verification sau mốc: `npm run typecheck` pass; benchmark preliminary exit code 0; cả hai candidate E2E exit code 0 và mọi output được ffprobe đọc được.
- Verification cuối lượt: `npm test -- --run` pass 40 test files / 175 tests; `npm run dist` pass; `npm run installer` pass; launcher unpacked và launcher sau silent-install đều sống ít nhất 5 giây; `verify-installer-signature.ps1` trả `NotSigned`.
- Chưa đóng production gate: thiếu ground truth/fixture thứ ba, chưa đo performance gate chính thức trên 60 phút, chưa có Player capture golden tự động, chưa clean-install/update và chưa có Authenticode PFX.

### Mốc S — Đo performance backend thật trên hai fixture candidate

- Bổ sung `scripts/run-performance-gate.ts` và npm script `performance:gate`. Runner đo bằng FFmpeg backend thật, không ghi nhận số mô phỏng.
- Fixture `slow-camera-mic` / C0012: preview decode/scale 60 giây đạt `146.387 fps`; export H.264 3840×2160 trong 10 phút mất `474.715 giây`; timeline reducer p95 `0.108ms`.
- Fixture `medium-laptop-mic` / DJI ghép: preview đạt `29.087 fps`; export H.264 4K 10 phút mất `781.450 giây`; timeline reducer p95 `0.121ms`.
- Cả hai đạt ngưỡng preview 24fps, export 1800 giây và timeline p95 dưới 100ms. Đây là phép đo export backend, chưa phải capture Player UI.
- Performance report được gộp tại `qa/product-candidate/performance/report.json`; gate vẫn fail-closed vì sample Whisper chưa gắn theo từng fixture và chưa chạy stability 2 giờ.
- Cập nhật `scripts/run-product-gate.ts` để đọc performance report và báo blocker đúng thực tế; certificate vẫn `excluded-by-request`.
- Verification: `npm run typecheck` pass trước khi chạy runner; runner hoàn tất trên cả hai fixture, không lỗi process.

### Mốc T — Verification cuối và installer candidate mới nhất

- Sửa `scripts/run-product-gate.ts` để tách `candidateFieldTestReady` khỏi `productionReady`; performance thiếu không làm sai trạng thái candidate.
- Chạy lại gate: `candidateFieldTestReady=true`; `productionReady=false` đúng với 5 blocker kỹ thuật còn lại; certificate là `excluded-by-request`.
- `npm test -- --run`: 40 test files / 178 tests pass.
- `npm run typecheck`: pass; `git diff --check`: không có lỗi nội dung.
- `npm run dist`: pass; `npm run installer`: pass.
- Launcher unpacked chạy ít nhất 5 giây; silent-install installer mới vào `qa/product-candidate/installed-final` trả exit code 0; launcher sau cài sống ít nhất 5 giây.
- Installer mới nhất: `release/Auto Podcast Editor-Setup-0.1.0.exe`; chữ ký `NotSigned` theo yêu cầu bỏ qua certificate.

## 5. Kết quả kiểm tra mới nhất

Ngày cập nhật: 2026-09-11

- `npm test -- --run`: 40 test files, 178 tests pass.
- `npm run typecheck`: pass.
- `npm run dist`: pass.
- `npm run installer`: pass.
- Remotion transition smoke: pass.
- Sidechain FFmpeg smoke: pass.
- Codec smoke 13 format: pass.
- Codec 4K sample: pass cho 5 format.
- Installer launcher smoke: pass.
- Authenticode installer: `NotSigned`.
- User video smoke: Whisper base/small, auto-analysis, Remotion render, transition, audio export và sidechain đều pass; transcript quality chưa đủ để dùng làm benchmark.
- Whisper base/small diagnostic: pass về process/coverage; phát hiện small có 127 zero-duration token so với base 44; chưa chốt tier.
- Whisper parameter/DTW diagnostic: regular flags không giải quyết; DTW đúng cách giảm zero-duration small xuống 1.63%; cần benchmark ground truth trước khi chốt.

## 6. Việc còn thiếu và blocker thật

### Blocker cần dữ liệu bên ngoài

1. Ba video podcast tiếng Việt thật, đã ẩn danh, mỗi video ít nhất 30 phút.
2. Ground truth thủ công cho các fixture đó để benchmark WER/timestamp/filler.
3. Chứng chỉ Authenticode/PFX không nằm trong phạm vi release hiện tại.

### Việc code/QA còn lại

- Chạy Whisper benchmark base/small trên đủ 3 fixture.
- Chốt production Whisper tier theo số liệu.
- Chạy performance gate trên máy tham chiếu: preview/export/timeline đã đo đủ trên 2 fixture; còn Whisper metric gắn theo từng fixture và stability >=2 giờ.
- Hoàn thiện golden SSIM/perceptual test cho preview/export.
- Hoàn thiện trim handles kéo, magnetic snap, audio stems và A/B preview trực tiếp.
- Bundle local LLM GPU/CPU và test rule-based fallback đầy đủ.
- Clean-install, update test và offline test trên Windows 10/11 máy sạch.
- Acceptance test end-to-end bằng fixture thật.
- Fixture người dùng hiện tại chỉ là smoke test ngắn; vẫn cần đủ 3 fixture podcast 30 phút và ground truth.
- Ground truth DJI mới chỉ có template; cần người gán tay nghe audio thật trước khi tính WER/timestamp/filler.
- Cần đưa cấu hình DTW vào benchmark so sánh cùng baseline small/base; chưa được đổi production default chỉ từ fixture DJI.

## 7. Quy tắc cập nhật memory cho các lượt sau

Sau mỗi lượt làm việc phải cập nhật:

1. Ngày và mục tiêu lượt làm việc.
2. File/code đã thêm hoặc sửa.
3. Test/command đã chạy và kết quả.
4. Lỗi phát hiện và cách sửa.
5. Blocker còn lại.
6. Phase/mốc nào được chuyển trạng thái.

Mẫu cập nhật:

```md
### YYYY-MM-DD — Tên mốc
- Mục tiêu:
- Đã sửa:
- Đã test:
- Kết quả:
- Còn thiếu/blocker:
```

## 8. Trạng thái tổng quát

Project hiện là vertical slice nâng cao, đã có nhiều backend thật và bundle offline candidate chạy được. Chưa được gọi production-ready cho đến khi có acceptance fixtures, Whisper benchmark chính thức, stability/performance đầy đủ, golden equivalence Player/export, clean-install/update test và acceptance 5 track dài. Local LLM đã được bundle; code-sign được loại khỏi phạm vi hiện tại.

### 2026-09-11 — Mốc U: triển khai Master Plan v3 hợp nhất
- Mục tiêu: sửa các blocker code đã được audit, bundle runtime offline, khóa build identity và tự kiểm bản bàn giao.
- Đã sửa: timeline giữ gap theo `startFrame`; duration tính cả audio/SFX tail; SFX có track A3; export master; cancel Remotion thật với file tạm; AI preview theo revision; local Qwen3-4B/llama.cpp; browser Remotion offline; validator performance chính thức.
- Đã thêm: `core/timelineDuration.ts`, `core/performanceReport.ts`, `core/localLlm.ts`, `electron/localLlmRunner.ts`, script build manifest, offline bundle và offline bundle install.
- Đã test: typecheck pass; 43 test files/186 tests pass; `npm run dist` pass; master export smoke pass; 7-Zip integrity pass; offline bundle giải nén pass; launcher bản giải nén offline sống ít nhất 5 giây; llama.cpp/FFprobe binary smoke pass.
- Artifact: package/lockfile `0.1.1`; buildId `055be9f75d1a3a19287b8349`; offline bundle `release-v011-final/offline-bundle/Auto Podcast Editor-0.1.1-full.7z.001/.002`, manifest SHA-256 đi kèm.
- Lỗi phát hiện và xử lý: NSIS fail `EBUSY` do launcher cũ khóa output; đổi sang output riêng. Sau đó NSIS fail `failed creating mmap` vì payload nén 3,246 MiB; chuyển sang bundle 7z chia 2 phần, không báo pass giả.
- Còn thiếu/blocker: benchmark Block 1 và ground truth (deferred-by-user); official installed performance; Player golden capture; clean-install/update/rollback/offline acceptance trên Windows sạch; acceptance 5 track dài. Certificate `excluded-by-user`.
- Trạng thái: code/runtime/bundle candidate đã pass smoke; chưa production-ready.

### 2026-09-11 — Mốc V: sửa lỗi launcher thiếu React
- Lỗi người dùng báo: Electron main process báo `Cannot find module 'react'` trong `resources/app.asar/node_modules/remotion`.
- Nguyên nhân: React là peer dependency cần lúc runtime nhưng package chỉ khai báo ở devDependencies; electron-builder loại khỏi production app.
- Đã sửa: chuyển `react` và `react-dom` sang `dependencies`; thêm include trực tiếp `react`, `react-dom`, `scheduler`, `loose-envify` trong cấu hình build.
- Đã thêm regression test `tests/packaging.test.ts` để ngăn dependency runtime quay lại devDependencies.
- Đã test: typecheck pass; regression test pass; app.asar mới chứa cả `react` và `react-dom`; bundle 7-Zip integrity/extract pass; launcher bản mới sống ít nhất 8 giây.
- Artifact mới: `release-v011-fixed2/offline-bundle/Auto Podcast Editor-0.1.1-full.7z.001/.002`; buildId `6b58216cac7f6907139cbd23`.
- Kết luận: lỗi trong ảnh đã được sửa ở artifact mới; không dùng lại bundle `release-v011-final` cũ.

### 2026-09-11 — Mốc W: đổi UX/UI sang editor workbench cố định
- Mục tiêu: sửa cảm giác app như một trang web cuộn dài, đưa về bố cục editor gần ShotCraft/CapCut hơn.
- Đã sửa: top bar cố định; rail trái cho AI/cut/SFX; preview ở trung tâm; timeline cố định phía dưới; inspector/audio ở rail phải; status bar cuối app.
- Đã sửa: scroll độc lập theo từng rail, không scroll toàn app; các panel có header, badge, spacing và màu trạng thái thống nhất.
- Đã thêm: `src/app.css`; cập nhật `src/App.tsx` và các panel `CommandPanel`, `CutProposals`, `SfxLibrary`, `AudioMixer`, `SfxEditor`, `Preview`.
- Đã test: typecheck pass; 44 test files/187 tests pass; `npm run dist` pass; bản Windows unpacked khởi động và sống ít nhất 8 giây.
- Artifact: `release-v011-ui/win-unpacked/Auto Podcast Editor.exe`; buildId `8692075bacf2c579f53dec7a`.
- Đã rebuild offline bundle 7z hai phần: `release-v011-ui/offline-bundle/Auto Podcast Editor-0.1.1-full.7z.001/.002`; checksum hai phần khớp manifest, giải nén pass, app.asar có React và CSS giao diện mới, launcher bản cài sống ít nhất 8 giây.
- Các blocker production khác không bị coi là đã đóng.

### 2026-09-11 — Mốc X: installer mỏng và tải runtime sau cài
- Mục tiêu: đổi từ offline bundle 4GB sang installer nhỏ bằng Electron Builder, sau đó tải runtime lớn khi chạy lần đầu.
- Đã sửa: bỏ `extraResources` lớn khỏi `package.json`; exclude `assets/bin`, `assets/models`, `assets/remotion-browser` và `assets/sfx` khỏi app package.
- Đã thêm: `core/runtimeAssets.ts`, `electron/runtimeAssets.ts`, `src/components/RuntimeSetup.tsx`, `scripts/build-runtime-payload.ps1`, `scripts/write-runtime-manifest.ts`, `scripts/build-online-installer.ps1`.
- Hành vi mới: runtime lưu ở `%LOCALAPPDATA%\Auto Podcast Editor\runtime`; tải có resume HTTP Range, hash/kích thước, file tạm, giải nén ZIP, tiến độ và không bật chức năng chính khi thiếu runtime bắt buộc.
- Đã tạo payload/hash thật: core runtime, Whisper base, Qwen, Remotion browser và SFX; manifest có 5 asset.
- Đã test: typecheck pass; 45 test files/190 tests pass; `npm run dist` pass; Electron Builder NSIS pass.
- Artifact: `release-online-preview/Auto Podcast Editor-Setup-0.1.1.exe`, 115,412,523 bytes; app.asar có `assets/runtime-manifest.json` và không chứa model/FFmpeg lớn.
- Còn thiếu: cần upload `runtime-payload` lên CDN/máy chủ HTTPS thật rồi build với `RUNTIME_ASSET_BASE_URL`; chưa gọi installer online production-ready khi chưa có endpoint đó.

### 2026-09-11 — Mốc Y: source và online installer trên GitHub
- Mục tiêu: đẩy source lên GitHub và lưu installer/runtime để tải dần.
- Đã tạo repo public: `https://github.com/JJOEEY/auto-podcast-editor`.
- Đã push source và tài liệu trên `main`; commit bàn giao gần nhất `0728435`.
- Đã cập nhật `.gitignore` để không đưa video, QA output, cache, build tạm, browser/model lớn và runtime payload sinh tự động vào repo.
- Đã thêm split runtime cho model Qwen: 2 parts, mỗi part có SHA-256, tải resume và ghép kiểm tra hash toàn file.
- Đã build online installer version `0.1.1`, buildId `4a08236f258f617198d02525`, SHA-256 installer `5af93ca370dc739c6c5a9c59a232c1cef380bb9f6d5efb728206586c3e34aba4`.
- Đã tạo GitHub prerelease `https://github.com/JJOEEY/auto-podcast-editor/releases/tag/v0.1.1-online` và upload đủ installer, core runtime, Whisper base, Remotion browser, SFX và 2 Qwen parts.
- `assets/runtime-manifest.json` đã trỏ tới GitHub Release; 7 URL asset trả HTTP 200; digest GitHub khớp hash local.
- Đã test: `npm run typecheck` pass; `npm test -- --run` pass 45 file/191 test; split/hash pass; Electron Builder NSIS pass; release upload pass.
- Lỗi phát hiện/xử lý: GitHub Release không nhận model Qwen nguyên file do giới hạn từng asset; xử lý bằng split-file thay vì đưa model vào git.
- Còn thiếu/blocker: Block 1 benchmark/ground truth vẫn deferred; performance chính thức trên bản cài; clean-install/update/rollback/offline acceptance và acceptance 5 track dài; certificate `excluded-by-user`.
- Trạng thái: source và product candidate online installer đã có trên GitHub; chưa gọi production-ready.

### 2026-09-12 — Mốc Z: sửa lỗi HTTP 416 khi tải runtime
- Lỗi người dùng báo: Runtime Setup dừng với `Error invoking remote method 'runtime:download'` và HTTP 416.
- Nguyên nhân: `.part` đã đủ kích thước nhưng downloader vẫn gửi Range vượt cuối file; GitHub trả `416 Range Not Satisfiable`.
- Đã sửa `electron/runtimeAssets.ts`: nhận file đã đủ sau khi kiểm SHA-256; Range 416 hoặc part sai thì tự xóa part và tải lại; rename file đích an toàn.
- Đã build installer local mới tại `release-github-fix/Auto Podcast Editor-Setup-0.1.1.exe`, SHA-256 `ba888aaaa19a44cce148bbfe561229bc7e48d2ed8d2a7bb075d6fd0638fdadeb`.
- Đã thay installer trên GitHub Release `v0.1.1-online`; digest remote khớp local và URL trả HTTP 200.
- Đã test: typecheck pass; 45 file/191 test pass; NSIS build pass; launcher bản mới sống 8 giây.
- Khi cập nhật: cài đè installer mới; runtime đã tải đủ được giữ lại, không tải lại.
- Còn thiếu/blocker giữ nguyên: benchmark Block 1/ground truth, performance chính thức trên bản cài, clean-install/update/rollback/offline acceptance và acceptance 5 track dài.

### 2026-09-12 — Mốc AA: hoàn thiện khởi động, import và kho nguồn
- Mục tiêu: sửa màn hình khởi động, bỏ lộ danh sách runtime, cho phép import nhiều video/âm thanh/ảnh và quản lý nguồn trong editor.
- Đã sửa: khi runtime chưa được xác nhận sẵn sàng, app chỉ hiện màn hình cập nhật riêng; không hiển thị tên công cụ, model, đường dẫn hay lỗi kỹ thuật. Khi runtime đã sẵn sàng, editor mở trực tiếp và hoạt động offline.
- Đã thêm: `dialog:open-media`, `media:inspect`, kéo-thả file qua preload Electron, `MediaAsset` dedupe theo đường dẫn, kho nguồn có tìm kiếm/lọc/thumbnail preview, thêm nguồn vào timeline và xóa nguồn an toàn.
- Đã sửa: Import không còn thay project/timeline hiện tại; clip giữ `assetId` và `sourceIn`; preview/export phân giải đường dẫn theo từng asset; audio clip vào A2 và giữ đuôi audio sau video.
- Đã sửa: trim/move/split giữ source range; timeline duration tính cả mọi item audio; renderer local server nhận toàn bộ asset paths. Build package buộc có React/ReactDOM để tránh lỗi launcher thiếu module.
- Đã thêm test: import/dedupe/insert asset và audio tail duration.
- Đã test: `npm run typecheck` pass; 45 test files/193 tests pass; `npm run dist` pass; Electron Builder NSIS pass; app.asar bản cài có React, ReactDOM và Remotion; executable unpacked và executable đã cài sống ít nhất 8 giây.
- Artifact: version `0.1.2`; buildId `691aa53e260163fbf0077dd4`; installer `release/Auto Podcast Editor-Setup-0.1.2.exe`; SHA-256 `FADD56462D2A70C6429AC4B6E9548C54D9412A2EEE4896CF0FE592EAF4D1B080`; QA install `qa/product-candidate/installed-0.1.2`.
- Còn thiếu/blocker: chưa chạy nghiệm thu thủ công đầy đủ bằng C0012/DJI trên giao diện; benchmark Block 1/ground truth vẫn deferred; performance chính thức, clean-install/update/rollback/offline acceptance dài và acceptance 5 track vẫn chưa đóng; certificate `excluded-by-user`.
- GitHub prerelease: `https://github.com/JJOEEY/auto-podcast-editor/releases/tag/v0.1.2`; đã upload installer và blockmap, giữ release cũ `v0.1.1-online` để truy vết.
