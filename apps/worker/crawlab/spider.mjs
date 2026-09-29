#!/usr/bin/env node
/**
 * Spider Crawlab — cố ý mỏng. Mỗi task tĩnh trong Crawlab (capability × preset) chạy file này với
 * biến môi trường VALA_SOURCE, VALA_CAPABILITY, VALA_PRESET. Spider không crawl gì: nó nhờ API
 * fan-out, rồi chờ các job của lần chạy này kết thúc để Crawlab hiện đúng trạng thái.
 *
 * Thoát mã 1 khi tỉ lệ người dùng lỗi vượt VALA_FAIL_THRESHOLD (mặc định 0.5) — lỗi của một
 * người không làm hỏng cả lần chạy (per_user_isolation trong adapter spec).
 */
const api = process.env.VALA_API_URL ?? 'http://api:3000';
const token = process.env.VALA_INTERNAL_TOKEN;
const threshold = Number(process.env.VALA_FAIL_THRESHOLD ?? 0.5);
const runId = process.env.CRAWLAB_TASK_ID ?? `manual-${Date.now()}`; // Crawlab đặt id lần chạy vào env

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const res = await fetch(`${api}/internal/crawl/fan-out`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    source: process.env.VALA_SOURCE,
    capability: process.env.VALA_CAPABILITY,
    preset: process.env.VALA_PRESET,
    crawlab_task_id: process.env.VALA_TASK_KEY,
    crawlab_run_id: runId,
  }),
});
if (!res.ok) {
  console.error(`fan-out thất bại: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { run_key: runKey, users } = await res.json();
console.log(`đã đẩy ${users} người dùng vào hàng đợi, run_key=${runKey}`);

const deadline = Date.now() + Number(process.env.VALA_WAIT_MINUTES ?? 90) * 60_000;
for (;;) {
  await new Promise((r) => setTimeout(r, 30_000));
  const s = await (await fetch(`${api}/internal/crawl/fan-out/${encodeURIComponent(runKey)}`, { headers })).json();
  console.log(`tiến độ: ${s.done}/${users} xong, ok=${s.ok} failed=${s.failed} skipped=${s.skipped}`);
  if (s.done >= users || Date.now() > deadline) {
    const ratio = users ? s.failed / users : 0;
    if (s.done < users) console.error('hết thời gian chờ, còn job chưa xong');
    process.exit(ratio > threshold || s.done < users ? 1 : 0);
  }
}
