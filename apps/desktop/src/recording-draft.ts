/**
 * Bản nháp kịch bản từ bản ghi thao tác (T07 phần 2) — THUẦN, không import electron.
 *
 * Chuyển chuỗi bước đã ghi thành một thao tác `vala.action(…)` dùng `vala.webform()` (phần 3): mở trang có form, gửi lại
 * (`postback`) hoặc bấm nút (`submit`) với đúng các trường người dùng đã điền. Đây chỉ là bản NHÁP để quản trị dán vào
 * Quản trị → Kịch bản Desktop rồi sửa: đổi tên thao tác, thay giá trị cụ thể bằng tham số `p.…`.
 *
 * Quy tắc: bỏ bước đăng nhập (kịch bản chạy trong phiên đã đăng nhập); bỏ trường trạng thái ASP.NET (`__…`), trường của
 * ScriptManager và trường trống; gộp CheckBoxList (`tên$0`, `tên$1`…) về tên gốc thành mảng; chuyển hướng / trang không có
 * form theo sau chỉ là chú thích.
 */
import type { Lang } from './i18n';
import type { PageInfo, RecFile, Recording, RecStep } from './recording';

const T = {
  vi: {
    head: (host: string, at: string) => `Bản nháp sinh từ bản ghi thao tác trên ${host} lúc ${at}. Đọc lại, đổi tên thao tác, thay giá trị cụ thể bằng tham số p.…`,
    skipLogin: 'bỏ qua — kịch bản chạy trong phiên đã đăng nhập',
    redirect: 'chuyển hướng sau bước', unreadable: 'không đọc được thân request của bước này — điền tay',
    file: 'tệp gốc', noForm: 'trang chưa mở trong bản ghi — mở để lấy form',
  },
  en: {
    head: (host: string, at: string) => `Draft generated from the action recording on ${host} at ${at}. Review it, rename the action, replace literal values with p.… parameters.`,
    skipLogin: 'skipped — the script runs in the signed-in session',
    redirect: 'redirect after step', unreadable: 'the request body of this step could not be read — fill it in by hand',
    file: 'original file', noForm: 'page not opened in the recording — open it to get the form',
  },
};

/** Chuỗi JS trong nháy đơn, thoát đủ ký tự đặc biệt. */
export const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}'`;

const pathOf = (url: string) => { try { const u = new URL(url); return u.pathname + u.search; } catch { return url; } };

/** Trường người dùng thật sự điền: bỏ trạng thái `__…`, trường ScriptManager (UpdatePanel), trường trống, nút được bấm. */
function userFields(step: RecStep, button: string | null): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  for (const f of step.fields) {
    // Chỉ khoảng trắng = trống (ô nhiều dòng của WebForms gửi kèm "\r\n" / tab dù người dùng không gõ gì).
    if (f.name.startsWith('__') || f.masked || f.value.trim() === '' || f.name === button) continue;
    if (step.async && /^[^|]+\|[^|]+$/.test(f.value)) continue;           // ScriptManager: "<UpdatePanel>|<control>"
    const cbl = /^(.*)\$\d+$/.exec(f.name);                                // CheckBoxList: tên$<thứ tự>
    const key = cbl ? cbl[1]! : f.name;
    const cur = out.get(key);
    if (cbl || cur !== undefined) out.set(key, [...(cur === undefined ? [] : [cur].flat()), f.value]);
    else out.set(key, f.value);
  }
  return out;
}

function objectLiteral(m: Map<string, string | string[]>, indent: string): string {
  const parts = [...m].map(([k, v]) => `${q(k)}: ${Array.isArray(v) ? `[${v.map(q).join(', ')}]` : q(v)}`);
  const one = `{ ${parts.join(', ')} }`;
  if (!parts.length) return '{}';
  return one.length <= 90 ? one : `{\n${parts.map((p) => `${indent}  ${p},`).join('\n')}\n${indent}}`;
}

function filesLiteral(files: RecFile[]): string {
  const parts = files.map((f, i) => `${q(f.name)}: { ten: ${q(f.filename)}, base64: p.tep${i ? i + 1 : ''}_base64 }`);
  return `{ files: { ${parts.join(', ')} } }`;
}

export function draftScript(rec: Recording, lang: Lang): string {
  const t = T[lang];
  const lines: string[] = [];
  const say = (s: string) => lines.push(`  // ${s.replace(/\n/g, ' ')}`);
  const code = (s: string) => lines.push(`  ${s}`);
  let current: string | null = null;           // đường dẫn trang mà `f` đang giữ form
  let usedForm = false;
  let prevPage: PageInfo | undefined;
  const steps = rec.steps;

  steps.forEach((step, i) => {
    const path = pathOf(step.url);
    const n = `${i + 1}. ${step.label}`;
    if (step.kind === 'trang') {
      if (step.redirectedFrom !== undefined) {
        say(`${i + 1}. → ${path} (${t.redirect} ${step.redirectedFrom})`);
        current = path;
      } else {
        const next = steps.slice(i + 1).find((x) => x.kind !== 'trang' || x.redirectedFrom === undefined);
        if (next && next.kind === 'form' && pathOf(next.url) === path && !next.fields.some((f) => f.masked === 'mat_khau')) {
          say(n);
          code(`f = await vala.webform(${q(path)});`);
          usedForm = true;
          current = path;
        } else say(n);                         // trang chỉ xem, không có form theo sau
      }
    } else if (step.kind === 'form') {
      if (step.fields.some((f) => f.masked === 'mat_khau')) { say(`${n} — ${t.skipLogin}`); current = null; }
      else {
        say(n);
        if (current !== path) {
          say(t.noForm);
          code(`f = await vala.webform(${q(path)});`);
          usedForm = true;
          current = path;
        }
        if (step.bodyUnreadable) say(t.unreadable);
        const target = step.fields.find((f) => f.name === '__EVENTTARGET')?.value ?? '';
        const button = target ? null : step.fields.find((f) => prevPage?.submits.includes(f.name))?.name
          ?? step.fields.find((f) => /\$(btn|cmd|imgbtn)[^$]*$/i.test(f.name))?.name ?? null;
        const fields = objectLiteral(userFields(step, button), '  ');
        for (const f of step.files) say(`${t.file}: ${f.filename}, ${f.type || '?'}, ${f.size ?? '?'} byte`);
        const opts = step.async ? ', { async: true }' : step.files.length ? `, ${filesLiteral(step.files)}` : '';
        if (target) {
          const arg = step.fields.find((f) => f.name === '__EVENTARGUMENT')?.value ?? '';
          // postback(target, fields, opts); có đối số sự kiện (vd Page$2) thì đưa vào trường __EVENTARGUMENT
          const withArg = arg ? objectLiteral(new Map([['__EVENTARGUMENT', arg], ...userFields(step, null)]), '  ') : fields;
          code(`await f.postback(${q(target)}, ${withArg}${opts});`);
        } else code(`await f.submit(${button ? q(button) : 'null'}, ${fields}${opts});`);
      }
    } else {
      say(n);
      const ct = step.contentType ?? '';
      if (step.method === 'GET') code(`await vala.request(${q(path)});`);
      else if (/urlencoded/i.test(ct)) code(`await vala.request(${q(path)}, { method: ${q(step.method)}, form: ${objectLiteral(userFields(step, null), '  ')} });`);
      else {
        const body = step.fields[0]?.value ?? '';
        code(`await vala.request(${q(path)}, { method: ${q(step.method)}, body: ${q(body)}${ct ? `, headers: { 'Content-Type': ${q(ct.split(';')[0]!)} }` : ''} });`);
      }
    }
    if (step.page) prevPage = step.page;
  });

  // Mô tả: bước gửi form cuối cùng (thường là nút nghiệp vụ: "Bấm btnChuyen"), không thì tiêu đề trang.
  const main = [...steps].reverse().find((x) => x.kind === 'form' && !x.async && !x.fields.some((f) => f.masked === 'mat_khau'));
  return [
    `// ${t.head(rec.host, rec.startedAt)}`,
    `vala.action('thao_tac_moi', { mo_ta: ${q(main?.label ?? rec.title)}, params: {} }, async (p) => {`,
    ...(usedForm ? ['  let f;'] : []),
    ...lines,
    `  return ${usedForm ? '{ url: f.url }' : '{}'};`,
    '});',
    '',
  ].join('\n');
}

