# Văn phòng Agent

Dashboard xem các session Claude Code và sub-agent đang làm gì, theo thời gian thực. Chỉ cần Node.js, không cài thêm gói nào.

## Chạy thử (không cần Claude Code)
```bash
node server.js --demo
```
Mở http://localhost:4317

## Nối với Claude Code thật
1. Chạy `node server.js` (để cửa sổ này mở).
2. Mở `~/.claude/settings.json`, chép khối `"hooks"` trong `hook-settings.json` vào (nếu đã có `hooks` thì gộp từng sự kiện).
3. Khởi động lại Claude Code. Mỗi session thành một "nhóm", mỗi sub-agent (tool Task) thành một nhân viên ngồi bàn.

Hook dùng `curl` với `--max-time 1` và `|| true`, nên nếu server tắt thì Claude Code vẫn chạy bình thường.
Trên Windows, dùng WSL/Git Bash hoặc sửa lệnh cho hợp với shell của bạn.

## Ánh xạ dữ liệu
| Sự kiện hook | Trên màn hình |
|---|---|
| SessionStart | Nhóm mới xuất hiện ở Phòng chờ việc (tên = thư mục dự án) |
| UserPromptSubmit | Cờ nhóm hiện yêu cầu, nhóm đi sang Khu làm việc |
| PreToolUse (Bash, Read, Edit…) | Bong bóng của trưởng nhóm |
| PreToolUse (Task) | Thêm một sub-agent ngồi vào bàn |
| PostToolUse (Task) | Sub-agent xong, ra Góc cà phê |
| Notification | Nhóm đi sang Phòng sếp xếp hàng chờ bạn duyệt |
| Stop / SessionEnd | Nhóm về Phòng chờ việc / rời văn phòng |

## Các phòng
Văn phòng chia thành 5 phòng theo trạng thái. Khi trạng thái đổi, cả nhóm (trưởng nhóm và bàn sub-agent) đi sang phòng mới:
- **Khu làm việc**: nhóm đang chạy.
- **Phòng sếp**: nhóm đang chờ bạn duyệt. Bạn ngồi ở bàn sếp và vẫy tay khi có nhóm chờ.
- **Phòng chờ việc**: nhóm rảnh.
- **Phòng ngủ gật**: nhóm mất tín hiệu quá `STALE_MIN` phút.
- **Góc cà phê**: sub-agent đã xong.

Biển tên mỗi phòng có số nhóm trong phòng. Đồng hồ trên tường và cửa sổ (ngày/đêm theo giờ máy) chạy theo giờ của khung hình khi đang xem lại. Hiệu ứng đi lại tắt khi hệ điều hành bật giảm chuyển động hoặc khi tab bị ẩn. Nội thất pixel art nằm trong `FURN` của index.html, vẽ theo cùng kiểu ký tự như nhân vật.

Đổi cổng: `PORT=5000 node server.js` (nhớ sửa URL trong hook).

## Lỗi tool, thời gian chạy, thông báo và cảnh báo vòng lặp
- Tool lỗi (`PostToolUse` có `tool_response.is_error`/`error`/exit code khác 0, hoặc `is_error` từ omp): trưởng nhóm đổ mồ hôi và bong bóng đỏ trong 20 giây. Xoá khi có yêu cầu mới hoặc `Stop`.
- **Cảnh báo vòng lặp vô tận (Runaway Loop)**: khi agent gọi lặp lại cùng một tool/lệnh liên tiếp từ 3 lần trở lên hoặc gặp lỗi liên tiếp 3 lần, pod chuyển viền đỏ nhấp nháy, hiện còi báo động `🚨 VÒNG LẶP`, và phát âm thanh còi báo động 8-bit. Giúp phát hiện sớm agent bị kẹt vòng lặp để tránh đốt token.
- Cạnh "Trưởng nhóm" hiện thời gian nhóm đã chạy. Sub-agent chạy quá 10 phút hiện cảnh báo đỏ `⚠` (có thể bị treo). Ngưỡng là `STUCK_MS` trong `index.html`.
- Nút "Bật thông báo": khi tab bị ẩn và có nhóm chuyển sang chờ duyệt, trình duyệt hiện thông báo hệ thống. Tiêu đề tab đổi thành `(n) Chờ duyệt · Văn phòng Agent`.

## Retro Terminal Inspector
- Bấm nút **"🖥️ Terminal"** (hoặc phím tắt `T` trên bàn phím, hoặc bấm vào bất kỳ tool nào trong bảng chi tiết): mở cửa sổ terminal CRT retro phong cách màn hình máy tính thập niên 80-90.
- Xem chi tiết từng command/tool đã gọi: thời gian gọi, câu lệnh đầu vào (`INPUT`), trạng thái trả về (`EXIT 0` / `EXIT 1 (LỖI)`), và kết quả stdout/stderr (`OUTPUT`).
- Có nút chuyển đổi màu hiển thị đèn phosphor CRT giữa **🟢 Xanh lá (Green Phosphor)** và **🟠 Hổ phách (Amber Phosphor)**, nút sao chép log nhanh. Phím `Esc` để đóng.

## Bảo mật
- Server mặc định chỉ nghe `127.0.0.1`. Muốn mở cho máy khác: `HOST=0.0.0.0 node server.js`.
- Đặt `AGENT_OFFICE_TOKEN=bí-mật` cho server để bắt buộc header `X-Agent-Office-Token` ở `POST /event` (sai thì 401). Hook trong `hook-settings.json` và `omp-office.ts` tự gửi header này từ biến môi trường `AGENT_OFFICE_TOKEN`, nên cần export cùng giá trị ở shell chạy Claude Code / omp. Không đặt thì không kiểm tra.

## Lưu trạng thái, bảng chi tiết, xem lại
- **Lưu trạng thái**: server ghi `state.json` mỗi 5 giây (và khi tắt bằng Ctrl+C) rồi nạp lại khi khởi động, nên restart không mất các nhóm đang có. Đồng thời ghi mọi sự kiện vào `events.jsonl` (đã bỏ `tool_response` và cắt các input dài). Khi vượt 5 MB file đổi thành `events.jsonl.old`. Đổi thư mục lưu: `AGENT_OFFICE_DATA=/đường/dẫn`. Chế độ `--demo` không ghi gì.
- **Bảng chi tiết**: bấm vào một nhóm (hoặc Tab tới và Enter) để mở bảng bên phải: yêu cầu đầy đủ, lỗi gần nhất, 20 tool gần nhất, dòng thời gian sub-agent (mỗi sub-agent một thanh từ lúc nhận việc đến lúc xong, thanh sọc là đang chạy) và danh sách sub-agent kèm prompt, số tool đã gọi và tool đang chạy. Đóng bằng nút × hoặc Esc. Danh sách tool tính từ yêu cầu hiện tại.
- **Xem lại**: nút "Xem lại" dựng lại các khung hình từ `events.jsonl` (tối đa 1500 sự kiện gần nhất trong khoảng 15 phút đến 24 giờ). Kéo thanh trượt hoặc bấm Phát. Khi xem lại thì cập nhật trực tiếp và âm thanh tạm dừng; "Về trực tiếp" để quay lại. API: `GET /replay?minutes=60`.
- Lưu ý: `state.json` và `events.jsonl` chứa prompt của bạn dưới dạng văn bản thường. Đừng commit hoặc chia sẻ chúng.
- **Phiên bị treo**: nếu Claude Code/omp bị tắt đột ngột (không có `SessionEnd`/`Stop`), nhóm sẽ không kẹt ở "đang chạy" mãi. Sau 15 phút không có sự kiện nào, nhóm mờ đi với dòng "💤 Không có tín hiệu…" và không tính vào số "đang chạy". Sau 60 phút thì tự chuyển về rảnh và các sub-agent đang làm bị bỏ. Đổi ngưỡng: `STALE_MIN=15 ABANDON_MIN=60 node server.js`. Hook chỉ bắn ở đầu và cuối mỗi tool, nên một lệnh chạy rất lâu hoặc một lần chờ duyệt dài cũng có thể bị đánh dấu nhầm; khi có sự kiện mới, nhóm trở lại bình thường ngay.

## Token, chi phí và công cụ khác
- **Token**: hiện trên cờ nhóm (`9.4k tok · $0.10`), trong bảng chi tiết (vào, ra, cache đọc, cache ghi) và ở ô tổng đầu trang. Số "token" tính vào + ra, không tính cache.
  - **Claude Code**: khi có `Stop`, server đọc `transcript_path` rồi cộng `usage` của từng `message.id` (lấy bản cuối vì cùng một message lặp nhiều dòng). Chỉ đọc file `.jsonl` nằm trong `~/.claude/`. **Không có chi phí** vì Claude Code không ghi giá vào transcript và dự án không tự đặt bảng giá. Chưa đối chiếu với transcript thật của Claude Code (máy này chưa có), chỉ thử bằng file mô phỏng theo định dạng đã biết.
  - **omp**: extension đọc file phiên khi `agent_end` và cộng `usage` (có cả chi phí do omp tính). Đã đối chiếu với file phiên thật của omp. Không tính sub-agent chạy ở file phiên riêng.
- **Codex CLI**: dùng hook kiểu Claude. Chép `hook-settings.codex.json` vào `~/.codex/hooks.json` (hoặc bảng `[hooks]` trong `config.toml`) và bật hook theo tài liệu Codex. URL có `?source=codex`.
- **Gemini CLI**: chép `hook-settings.gemini.json` vào `hooks` trong `~/.gemini/settings.json`. Server tự đổi `BeforeAgent`/`BeforeTool`/`AfterTool`/`AfterAgent` thành sự kiện tương ứng và đổi tên tool (`run_shell_command` → Bash, `read_file` → Read…). Lệnh kết thúc bằng `echo '{}'` vì Gemini yêu cầu stdout chỉ có JSON.
- **Chưa chạy thử với Codex và Gemini thật** (máy này chưa cài). Cấu hình dựa trên tài liệu của hai công cụ; payload đã thử bằng bản mô phỏng. Nếu không thấy gì, mở `/debug` để xem server nhận được gì. Codex và Gemini chưa có thống kê token.
- Tên công cụ nay lấy từ trường `agent_source` hoặc tham số `?source=` (không dùng trường `source` của payload nữa, vì Claude Code dùng nó cho `startup`/`resume`). Phiên bản `omp-office.ts` cũ gửi `source` nên cần dùng bản mới.
- **Bảng xếp hạng**: nút "🏆 Xếp hạng" mở bảng trong ngày (chọn được ngày khác): sub-agent chạy lâu nhất, sub-agent gọi nhiều tool nhất, nhóm tốn nhiều token nhất, nhóm chăm chỉ nhất (số tool của trưởng nhóm + số sub-agent). Số liệu dựng lại từ `events.jsonl` nên gồm cả sub-agent đã rời góc cà phê; tự làm mới mỗi 30 giây khi đang xem hôm nay. Token chỉ có theo nhóm vì omp/Claude Code không tách token cho từng sub-agent. Ngày tính theo giờ máy chạy server. API: `GET /leaderboard?day=2026-10-14`.

## Pixel art và âm thanh
- Nhân vật pixel art được ghép từ nhiều lớp (kiểu đầu, mặt, áo trong `HEADS`, `FACES`, `SHIRTS` của index.html). Mỗi agent có ngoại hình riêng cố định theo id, màu áo theo nhóm, trưởng nhóm luôn đeo cà vạt vàng. Thêm kiểu mới bằng cách thêm một mảng ký tự, mỗi ký tự là 1 pixel.
- Phụ kiện theo loại sub-agent (tên agent của omp hoặc `subagent_type` của Claude Code): `scout`/`Explore` cầm kính lúp 🔍 đảo qua lại, loại có chữ `review` cầm bút đỏ 🖍️ viết lia lịa, `sonic` chạy nhanh gấp gần 3 lần kèm vệt 💨. Loại khác giữ như cũ. Thêm loại mới trong `KINDS` và `kindOf` của index.html. Tắt chuyển động khi hệ điều hành bật giảm chuyển động.
- Bấm "Bật âm thanh" ở góc trên (trình duyệt yêu cầu bạn bấm một lần mới cho phát tiếng). Âm thanh:
  - Sub-agent làm xong: tiếng "ting" kiểu nhặt xu
  - Claude chờ bạn duyệt: hai nốt trầm
  - Có sub-agent mới vào bàn: tiếng bíp ngắn

## Theo dõi omp (oh-my-pi) với Claude, OpenAI, Gemini
File `omp-office.ts` là extension cho omp. Nó dịch sự kiện của omp sang cùng định dạng với Claude Code, nên mọi model chạy qua omp đều hiện lên văn phòng, kèm nhãn model trên cờ nhóm (cam = Claude, xanh lá = OpenAI, xanh dương = Gemini).

1. Chạy `node server.js`.
2. Chạy omp kèm extension: `omp -e /đường/dẫn/omp-office.ts`
3. Mở omp và làm việc như bình thường.

Sự kiện omp được dùng (đã đối chiếu với omp 18.7.0): `session_start`, `before_agent_start`, `tool_call`, `tool_result`, `agent_end`, `session_shutdown`. Tool `task` chạy nhiều việc song song sẽ hiện thành nhiều sub-agent.

**Sub-agent của omp chạy nền**: tool `task` trả kết quả ngay khi giao việc, nên extension không coi đó là lúc xong. Phiên con (file `<thư mục phiên cha>/<Tên>.jsonl`) tự báo về bàn của mình trong nhóm cha: tool đang chạy hiện thành bong bóng nhỏ trên bàn (sự kiện `SubagentTool`), và `agent_end` của phiên con mới đưa sub-agent ra góc cà phê. Trưởng nhóm dừng (`Stop`) không làm sub-agent chạy nền xong theo; nếu phiên con bị tắt ngang thì sau `ABANDON_MIN` phút không có tín hiệu sub-agent mới bị bỏ. Sub-agent được nhắn việc tiếp sau khi xong sẽ quay lại bàn. Đã chạy thử với `omp -p` thật giao 2 sub-agent song song: thời điểm xong trên văn phòng khớp với thời gian chạy omp báo (14,5 giây và 22,9 giây).

Nếu văn phòng không hiện gì:
- Mở http://localhost:4317/debug để xem 50 sự kiện server nhận được gần nhất.
- Nếu trống, có thể tên sự kiện hoặc thư mục extension ở bản omp của bạn khác. Hãy đối chiếu với tài liệu extension của omp và sửa tên trong các dòng `on("...")`.

Đổi địa chỉ server: đặt biến môi trường `AGENT_OFFICE_URL=http://localhost:5000/event`.
