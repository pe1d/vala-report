/**
 * Dịch các thông báo ĐÃ LƯU trong CSDL (source_grants.last_error, crawl_runs.error_detail, core.spider_launches.error…)
 * khi trả cho giao diện. Lúc ghi vẫn lưu tiếng Việt (nhật ký giữ nguyên); khi đọc, nếu người dùng chọn tiếng Anh thì
 * dịch các câu cố định / tiền tố do chính code này sinh ra — phần đuôi kỹ thuật (đường dẫn, mã HTTP, tên cookie…) giữ nguyên.
 * Câu không nhận ra (vd spider Python tự ghi) ⇒ trả nguyên.
 */
import type { Lang } from './errors.js';

/** Câu cố định (tiêu đề / chi tiết Problem, lý do ghi tay) ⇒ bản tiếng Anh. */
const EXACT: Record<string, string> = {
  'Chuyển hướng ra ngoài các host được phép': 'Redirected outside the allowed hosts',
  'Phiên SSO không còn hiệu lực': 'SSO session is no longer valid',
  'SSO yêu cầu đăng nhập lại': 'SSO requires signing in again',
  'Hệ thống nguồn không cấp đủ cookie phiên': 'Source system did not issue all session cookies',
  'Phiên uỷ quyền đã hết hạn': 'Authorized session has expired',
  'Hệ thống nguồn đã đổi cấu trúc dữ liệu': 'Source system has changed its data structure',
  'Bản ghi trùng khoá trong cùng một lượt gửi': 'Duplicate record key within one submission',
  'Endpoint không nằm trong allowed_endpoints': 'Endpoint is not in allowed_endpoints',
  'Hệ thống nguồn không phản hồi': 'Source system is not responding',
  'Hệ thống nguồn đang lỗi': 'Source system is failing',
  'Phản hồi không phải JSON': 'Response is not JSON',
  'Không thấy trang đăng nhập': 'Login page not found',
  'Trang đăng nhập đã thay đổi': 'Login page has changed',
  'không đủ trường để điền form đăng nhập': 'not enough fields to fill in the login form',
  'Sai tên đăng nhập hoặc mật khẩu hệ thống nguồn': 'Incorrect source system username or password',
  'Tài khoản bật xác thực hai lớp (OTP)': 'Account has two-factor authentication (OTP) enabled',
  'Không thể tự đăng nhập bằng mật khẩu': 'Cannot sign in automatically with a password',
  'Đăng nhập không thành công': 'Sign-in failed',
  'Đăng nhập xong nhưng thiếu cookie phiên': 'Signed in but session cookies are missing',
  'Cookie thiếu trường bắt buộc': 'Cookie is missing required fields',
  'Thiếu tên đăng nhập hoặc mật khẩu': 'Username or password is missing',
  'Trình duyệt chưa đăng nhập hệ thống nguồn': 'The browser is not signed in to the source system',
  'Cookie đã hết hạn': 'Cookie has expired',
  'Quản trị cần dán cookie mới cho kết nối này': 'An admin needs to paste a new cookie for this connection',
  'Phiên từ tiện ích trình duyệt đã hết hạn': 'Session from the browser extension has expired',
  'Mở hệ thống nguồn trên trình duyệt có cài tiện ích Vala và đăng nhập — tiện ích tự gửi phiên mới': 'Open the source system in a browser with the Vala extension installed and sign in — the extension sends the new session automatically',
  'Chưa cấu hình SSO cho luồng uỷ quyền': 'SSO is not configured for the authorization flow',
  'Chưa có tài khoản/mật khẩu cho kết nối này': 'No username/password saved for this connection',
  'Không cấu hình cách lấy lại phiên': 'No way to renew the session is configured',
  'Phiên đã lưu bị mất': 'Saved session was lost',
  'Phiên đã lưu bị mất (kho bí mật không còn phiên này) — mở hệ thống nguồn trên trình duyệt, tiện ích tự gửi lại': 'Saved session was lost (the secret store no longer has it) — open the source system in the browser, the extension will resend it automatically',
  'Tài khoản nguồn đã gắn với người dùng khác': 'This source account is already linked to another user',
  'Không có spider này': 'Spider not found',
  'Không có lượt chạy này': 'Run not found',
  'Lượt chạy đã kết thúc': 'Run has already finished',
  'Spider đang tắt': 'Spider is disabled',
  'Preset không hợp lệ': 'Invalid preset',
  'Kết nối không còn hiệu lực': 'The connection is no longer valid',
  'Nguồn từ chối request': 'Source rejected the request',
  'Phiên đã hết hạn': 'Session has expired',
  'source_user_id không hợp lệ': 'Invalid source_user_id',
  'Capability không có bảng đích (sink) trong cấu hình adapter': 'Capability has no target table (sink) in the adapter config',
  'items phải là mảng ≤ 5000 phần tử': 'items must be an array of ≤ 5000 elements',
  'Chưa có phiên SSO': 'No SSO session yet',
  'Người dùng cần đăng nhập để uỷ quyền': 'The user needs to sign in to authorize',
  'Spider chưa được đồng bộ lên Crawlab': 'Spider has not been synced to Crawlab',
  'Quản trị cần bấm "Đồng bộ Crawlab"': 'An admin needs to click "Sync Crawlab"',
  'Không chạy được spider trên Crawlab': 'Could not run the spider on Crawlab',
  'Phiên SSO đã hết hạn': 'SSO session has expired',
  'SSO từ chối refresh token': 'SSO rejected the refresh token',
  'SSO không xác nhận được người dùng': 'SSO could not verify the user',
  'SSO không trả định danh người dùng': 'SSO did not return a user identifier',
  'SSO không cấp refresh token': 'SSO did not issue a refresh token',
  'Thiếu scope offline_access': 'Missing offline_access scope',
  'Không có hệ thống nguồn này': 'Source system not found',
  'Hệ thống này có xác thực 2 lớp (OTP)': 'This system uses two-factor authentication (OTP)',
  'Máy chủ không tự đăng nhập bằng mật khẩu được — kết nối qua tiện ích trình duyệt': 'The server cannot sign in with a password — connect via the browser extension',
  'Hệ thống này không cho kết nối theo cách đã chọn': 'This system does not allow the selected connection method',
  'Hệ thống này chưa có cách tự đăng nhập bằng mật khẩu': 'This system does not support password sign-in yet',
  'Dùng tiện ích trình duyệt hoặc dán cookie': 'Use the browser extension or paste a cookie',
  'Cần tên đăng nhập hệ thống nguồn': 'Source system username is required',
  'Cần mật khẩu hệ thống nguồn': 'Source system password is required',
  'Cần dán chuỗi cookie': 'Please paste the cookie string',
  'Kết nối chưa được cấu hình': 'Connection is not configured',
  'Chưa có phiên trong kho bí mật': 'No session in the secret store',
  'Mở hệ thống nguồn trên trình duyệt có tiện ích Vala và đăng nhập lại': 'Open the source system in a browser with the Vala extension and sign in again',
  'Dán cookie mới': 'Paste a new cookie',
  'Không kết nối được': 'Could not connect',
  'không có uỷ quyền còn hiệu lực': 'no valid authorization',
  'capability ngoài phạm vi đã đồng ý': 'capability is outside the consented scope',
  'Phiên đã lưu bị mất — cần gửi lại qua tiện ích': 'Saved session was lost — it needs to be resent via the browser extension',
  'kết nối không còn hiệu lực': 'the connection is no longer valid',
  'Phiên trên trình duyệt đã quá thời hạn của cookie': 'The browser session is past its cookie expiry time',
  'Spider chưa được đồng bộ lên Crawlab — quản trị bấm "Đồng bộ Crawlab"': 'Spider has not been synced to Crawlab — an admin needs to click "Sync Crawlab"',
  'không phản hồi': 'no response',
  'Chuyển hướng không có Location': 'Redirect without a Location header',
  'vault_ref không hợp lệ': 'Invalid vault_ref',
  // tiêu đề lỗi chung của API (spider lưu lại khi API trả lỗi)
  'Lỗi hệ thống': 'System error',
  'Yêu cầu không hợp lệ': 'Invalid request',
  // crawlers/_sdk/vala_sdk.py
  'phiên vẫn hỏng sau khi đã lấy phiên mới': 'the session is still broken after getting a new one',
  'sink.table chỉ nhận \'records\' (kho chung cho mọi hệ thống)': 'sink.table only accepts \'records\' (the shared store for all systems)',
  'tên cookie không hợp lệ': 'invalid cookie name',
  'tên miền không hợp lệ': 'invalid domain',
  'đường dẫn phải bắt đầu bằng / và không có ?/#': 'path must start with / and contain no ?/#',
  'mẫu phải là biểu thức chính quy hợp lệ và có một nhóm bắt ( … )': 'pattern must be a valid regular expression with one capture group ( … )',
};

type Rule = [RegExp, (m: RegExpExecArray) => string];
const g = (m: RegExpExecArray, i: number) => m[i] ?? '';
/** Tiền tố tuỳ chọn "<định danh>: " (nhóm 1) của các thông báo kiểm tra cấu hình. */
const pre = (m: RegExpExecArray) => (m[1] !== undefined ? `${tr(m[1])}: ` : '');
/** Mẫu có biến (khớp cả chuỗi). Nhóm bắt còn chữ tiếng Việt ⇒ dịch tiếp bằng tr(). */
const RULES: Rule[] = [
  // ingest/crawl.ts, ingest/spider.ts, connections.ts
  [/^Phiên hết hạn: ([\s\S]*)$/, (m) => `Session expired: ${tr(g(m, 1))}`],
  [/^Kho bí mật không còn phiên (\S+) \(vd máy chủ khởi động lại\) — mở (\S+) trên trình duyệt có tiện ích Vala, tiện ích tự gửi lại$/,
    (m) => `The secret store no longer has the ${g(m, 1)} session (e.g. the server restarted) — open ${g(m, 2)} in a browser with the Vala extension, it will resend the session automatically`],
  [/^(\S+) từ chối phiên \(([\s\S]*)\) — đăng nhập lại (\S+) trên trình duyệt, tiện ích tự gửi phiên mới$/,
    (m) => `${g(m, 1)} rejected the session (${tr(g(m, 2))}) — sign in to ${g(m, 3)} again in the browser, the extension will send a new session automatically`],
  [/^([\s\S]*) bị từ chối nhưng phiên vẫn còn hiệu lực \(kiểm tra lại phiên: OK\) — không phải hết hạn$/,
    (m) => `${g(m, 1) === 'Một request' ? 'A request' : tr(g(m, 1))} was rejected but the session is still valid (session re-check: OK) — not expired`],
  [/^([\s\S]*?)kiểm tra phiên: ([\s\S]*)$/, (m) => `${tr(g(m, 1))}session check: ${tr(g(m, 2))}`],
  [/^([\s\S]*) puid đã thuộc người dùng khác$/, (m) => `${g(m, 1)} puid already belongs to another user`],
  [/^dừng ở ([\s\S]*)$/, (m) => `stopped at ${g(m, 1)}`],
  [/^thiếu cookie: ([\s\S]*)$/, (m) => `missing cookies: ${g(m, 1)}`],
  [/^thiếu: ([\s\S]*)$/, (m) => `missing: ${g(m, 1)}`],
  [/^trạng thái ([\s\S]*)$/, (m) => `status ${g(m, 1)}`],
  // adapter/engine.ts, adapter/normalize.ts
  [/^([\s\S]*)session_probe không lấy được (\S+) \(HTTP (\d+)(?:, trang "([\s\S]*)")?, (\d+) byte\)$/,
    (m) => `${tr(g(m, 1))}session_probe could not get ${g(m, 2)} (HTTP ${g(m, 3)}${m[4] !== undefined ? `, page "${m[4]}"` : ''}, ${g(m, 5)} bytes)`],
  [/^([\s\S]*) không còn là danh sách$/, (m) => `${tr(g(m, 1))} is no longer a list`],
  [/^([\s\S]*): có bản ghi thiếu khoá ([\s\S]*)$/, (m) => `${tr(g(m, 1))}: some records are missing key ${g(m, 2)}`],
  [/^([\s\S]*) xuất hiện nhiều lần — trường có key: true phải duy nhất cho mỗi bản ghi$/,
    (m) => `${tr(g(m, 1))} appears more than once — a field with key: true must be unique per record`],
  [/^(?:([\s\S]*): )?thiếu input bắt buộc '([^']*)'$/, (m) => `${pre(m)}missing required input '${g(m, 2)}'`],
  [/^([\s\S]*): thiếu ([^:]*)$/, (m) => `${tr(g(m, 1))}: missing ${g(m, 2)}`],
  [/^(?:([\s\S]*): )?session_probe phải trích được puid$/, (m) => `${pre(m)}session_probe must extract puid`],
  // adapter/bootstrap.ts, adapter/login.ts, sso.ts, sessions.ts, adapter/template.ts …
  [/^Lỗi mạng khi gọi (\S*): ([\s\S]*)$/, (m) => `Network error calling ${g(m, 1)}: ${g(m, 2)}`],
  [/^Quá (\d+) lần chuyển hướng$/, (m) => `More than ${g(m, 1)} redirects`],
  [/^Lấy phiên: ([\s\S]*)$/, (m) => `Getting session: ${g(m, 1)}`],
  [/^Trang đăng nhập trả HTTP (\d+)$/, (m) => `Login page returned HTTP ${g(m, 1)}`],
  [/^Không gọi được SSO token endpoint: ([\s\S]*)$/, (m) => `Could not call the SSO token endpoint: ${g(m, 1)}`],
  [/^Không biết base_url của (\S+)$/, (m) => `Unknown base_url for ${g(m, 1)}`],
  [/^Chưa có cấu hình adapter cho (\S+)$/, (m) => `No adapter config for ${g(m, 1)}`],
  [/^Không có adapter spec cho (\S+)$/, (m) => `No adapter spec for ${g(m, 1)}`],
  [/^Không có adapter cho (\S+)$/, (m) => `No adapter for ${g(m, 1)}`],
  [/^Adapter (\S+) chưa khai báo sink \(nơi lưu\)$/, (m) => `Adapter ${g(m, 1)} does not declare a sink (storage)`],
  [/^(?:([\s\S]*): )?spec chưa khai báo (\S+)$/, (m) => `${pre(m)}spec does not declare ${g(m, 2)}`],
  [/^Template tham chiếu biến không tồn tại: ([\s\S]*)$/, (m) => `Template references an unknown variable: ${g(m, 1)}`],
  [/^Template tham chiếu biến rỗng: ([\s\S]*)$/, (m) => `Template references an empty variable: ${g(m, 1)}`],
  [/^JSONPath phải bắt đầu bằng \$: ([\s\S]*)$/, (m) => `JSONPath must start with $: ${g(m, 1)}`],
  [/^JSONPath không hỗ trợ tại vị trí (\d+): ([\s\S]*)$/, (m) => `Unsupported JSONPath at position ${g(m, 1)}: ${g(m, 2)}`],
  // adapter/spec.ts, sources.ts (kiểm tra cấu hình adapter)
  [/^(?:([\s\S]*): )?cần một trường output_schema có key: true \(khoá bản ghi\)$/, (m) => `${pre(m)}needs an output_schema field with key: true (record key)`],
  [/^(?:([\s\S]*): )?(\S+) có '([^']*)' không nằm trong (\S+)$/, (m) => `${pre(m)}${g(m, 2)} has '${g(m, 3)}' which is not in ${g(m, 4)}`],
  [/^(?:([\s\S]*): )?tên trường ngữ cảnh '([^']*)' không hợp lệ$/, (m) => `${pre(m)}invalid context field name '${g(m, 2)}'`],
  [/^(?:([\s\S]*): )?không có capability '([^']*)'$/, (m) => `${pre(m)}no capability '${g(m, 2)}'`],
  [/^adapter\.source_system = '([^']*)' nhưng hệ thống là '([^']*)'$/, (m) => `adapter.source_system = '${g(m, 1)}' but the system is '${g(m, 2)}'`],
  // crawlers/_sdk/vala_sdk.py
  [/^([\s\S]*) không phản hồi \((\w+)\)$/, (m) => `${tr(g(m, 1))} did not respond (${g(m, 2)})`],
  // spiderOps.ts, crawlab.ts
  [/^([\s\S]*) — Crawlab vừa khởi động, đã tự chạy lại$/, (m) => `${tr(g(m, 1))} — Crawlab had just started, so the run was retried automatically`],
  [/^Crawlab không chạy được spider: ([\s\S]*)$/, (m) => `Crawlab could not run the spider: ${tr(g(m, 1))}`],
  [/^Spider không gọi tới Vala(?: \(task Crawlab: ([^)]*)\))?$/, (m) => `The spider did not call Vala${m[1] !== undefined ? ` (Crawlab task: ${m[1]})` : ''}`],
  [/^Crawlab từ chối đăng nhập: ([\s\S]*)$/, (m) => `Crawlab rejected the sign-in: ${g(m, 1)}`],
  [/^(?:([\s\S]*): )?chưa có mã main\.py — viết mã cho spider này trên trang "Script crawl"$/,
    (m) => `${pre(m)}no main.py code yet — write the code for this spider on the "Crawl scripts" page`],
];

/** Cụm chèn giữa câu (đuôi kỹ thuật giữ nguyên). */
const INLINE: Array<[RegExp, string]> = [
  [/ \(chuyển tới /g, ' (redirected to '],
  [/\(bản ghi không phải object\)/g, '(record is not an object)'],
  [/, thân phản hồi rỗng/g, ', empty response body'],
  [/, không phải JSON: /g, ', not JSON: '],
  [/\(không có content-type\)/g, '(no content-type)'],
];
const inline = (s: string) => INLINE.reduce((acc, [re, en]) => acc.replace(re, en), s);

const SEPARATORS = [': ', ' — ', '; '];

/**
 * Dịch một chuỗi: câu cố định ⇒ mẫu có biến ⇒ tách ở dấu ngăn ĐẦU TIÊN ("tiêu đề: chi tiết", "câu — câu", "lỗi; lỗi")
 * rồi dịch từng phần. Mỗi bước chỉ đệ quy trên phần ngắn hơn ⇒ thời gian tuyến tính theo số dấu ngăn.
 */
function tr(s: string): string {
  if (!s) return s;
  const t = s.trim();
  const exact = EXACT[t];
  if (exact !== undefined) return s.replace(t, exact);
  for (const [re, f] of RULES) {
    const m = re.exec(s);
    if (m) return f(m);
  }
  let at = -1;
  let sep = '';
  for (const x of SEPARATORS) {
    const i = s.indexOf(x);
    if (i > 0 && (at < 0 || i < at)) { at = i; sep = x; }
  }
  if (at > 0) return `${tr(s.slice(0, at))}${sep}${tr(s.slice(at + sep.length))}`;
  return inline(s);
}

/**
 * Thông báo đã lưu trong CSDL (tiếng Việt, do chính hệ thống ghi) ⇒ theo ngôn ngữ người dùng. Không khớp mẫu nào thì
 * trả nguyên; null/undefined trả nguyên.
 */
export function localizeStored<T extends string | null | undefined>(text: T, lang: Lang): T {
  if (lang === 'vi' || typeof text !== 'string' || !text) return text;
  return inline(tr(text)) as T;
}
