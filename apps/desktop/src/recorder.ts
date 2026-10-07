/**
 * Ghi thao tác trên một tab (T07 phần 2): gắn giao thức gỡ lỗi của Chromium (`webContents.debugger`, mục Network) vào ĐÚNG
 * tab đang ghi — không đụng tab khác, không cần mở DevTools. Mỗi lần tải trang / gửi form / XHR thành một bước; tách thân,
 * che giá trị, đặt tên bằng recording.ts. Iframe khác tiến trình: Target.setAutoAttach (flatten) ⇒ bật Network theo phiên.
 *
 * Form có tệp đính kèm: Chromium không đưa thân request ra giao thức ("No post data available") ⇒ trong lúc ghi, gài vào trang
 * một đoạn script đọc FormData lúc form được gửi (cả sự kiện submit lẫn form.submit() của __doPostBack) — chỉ tên/giá trị
 * chữ, tệp chỉ lấy tên/loại/kích thước — gửi về qua Runtime.addBinding; chỉ dùng khi phía mạng không có thân. Gỡ khi dừng.
 *
 * Chỉ giữ trong bộ nhớ (bản ghi cuối cùng). Không ghi cookie / header khác content-type; nội dung phản hồi chỉ đọc để lấy
 * TÊN trường (pageInfo / deltaInfo) rồi bỏ.
 */
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { getSettings } from './settings';
import { deltaInfo, MAX_STEPS, maskFields, pageInfo, parseBody, stepLabel, type PageInfo, type Recording, type RecStep } from './recording';

/** 'changed' — bản ghi đổi (bước mới, bắt đầu, dừng). 'stopped' (rec, reason) — dừng không do người dùng bấm. */
export const recorderEvents = new EventEmitter();

export class RecorderError extends Error {
  constructor(readonly code: 'dang_mo_devtools' | 'khong_gan_duoc', message: string) { super(message); }
}

interface CdpRequest { url: string; method: string; headers: Record<string, string>; postData?: string; hasPostData?: boolean; postDataEntries?: { bytes?: string }[] }

/** Form trang vừa gửi (đọc phía trang) — dùng khi phía mạng không có thân request. */
interface PageForm { at: number; action: string; fields: [string, string][]; files: [string, string, string, number][] }

const BINDING = '__valaGhiThaoTac';
/** Chạy trong trang (thế giới chính) mỗi lần tải trang trong lúc ghi. */
const PAGE_HOOK = `(() => {
  if (window.__valaGhiHooked) return;
  window.__valaGhiHooked = true;
  const send = (form, submitter) => {
    try {
      if (typeof window.${BINDING} !== 'function') return;
      const fd = submitter ? new FormData(form, submitter) : new FormData(form);
      const fields = [], files = [];
      for (const [k, v] of fd) {
        if (typeof v === 'string') fields.push([k, v]);
        else if (v && v.name) files.push([k, v.name, v.type || '', v.size]);
      }
      window.${BINDING}(JSON.stringify({ action: form.action, fields, files }));
    } catch (_) { /* không làm hỏng trang */ }
  };
  addEventListener('submit', (e) => send(e.target, e.submitter), true);
  const orig = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () { send(this, null); return orig.call(this); };
})();`;

interface Live {
  key: string;
  wc: WebContents;
  rec: Recording;
  /** requestId (theo phiên CDP) ⇒ bước. Chuyển hướng dùng lại requestId ⇒ trỏ sang bước mới. */
  byReq: Map<string, RecStep>;
  passwords: Set<string>;
  lastPage?: PageInfo;
  mainFrameId?: string;
  pageForm?: PageForm;
  /** Bước gửi form chưa có thân (chờ form phía trang). */
  awaiting?: RecStep;
  hookId?: string;
  stopping: boolean;
  cleanup: () => void;
}

let live: Live | null = null;
let last: Recording | null = null;

export const recordingKey = (): string | null => live?.key ?? null;
/** Bản ghi đang ghi, hoặc bản ghi gần nhất đã dừng. */
export const lastRecording = (): Recording | null => live?.rec ?? last;

const header = (h: Record<string, string> | undefined, name: string) =>
  Object.entries(h ?? {}).find(([k]) => k.toLowerCase() === name)?.[1];
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return ''; } };

export async function startRecording(key: string, wc: WebContents): Promise<void> {
  if (live) stopRecording();
  const dbg = wc.debugger;
  try {
    dbg.attach('1.3');
  } catch (e) {
    throw new RecorderError('dang_mo_devtools', (e as Error).message);
  }
  const rec: Recording = { version: 1, host: hostOf(wc.getURL()), title: wc.getTitle(), startedAt: new Date().toISOString(), truncated: false, steps: [] };
  const l: Live = { key, wc, rec, byReq: new Map(), passwords: new Set(), stopping: false, cleanup: () => {} };
  live = l;

  const onMessage = (_e: unknown, method: string, params: Record<string, unknown>, sessionId?: string) => {
    if (live !== l) return;
    try { handle(l, method, params, sessionId); } catch (err) { console.warn('[ghi-thao-tac]', method, (err as Error).message); }
  };
  const onDetach = (_e: unknown, reason: string) => { if (live === l && !l.stopping) finish(l, reason === 'target closed' ? 'tab_dong' : `mat_ket_noi:${reason}`); };
  const onDestroyed = () => { if (live === l) finish(l, 'tab_dong'); };
  const onLoaded = () => { void collectPasswords(l); };
  dbg.on('message', onMessage);
  dbg.on('detach', onDetach);
  wc.on('did-frame-finish-load', onLoaded);
  wc.once('destroyed', onDestroyed);
  l.cleanup = () => {
    dbg.removeListener('message', onMessage);
    dbg.removeListener('detach', onDetach);
    if (!wc.isDestroyed()) wc.removeListener('did-frame-finish-load', onLoaded);
    wc.removeListener('destroyed', onDestroyed);
  };

  try {
    await dbg.sendCommand('Network.enable', { maxPostDataSize: 1024 * 1024 });
    l.mainFrameId = ((await dbg.sendCommand('Page.getFrameTree')) as { frameTree: { frame: { id: string } } }).frameTree.frame.id;
  } catch (e) {
    finish(l, 'khong_gan_duoc');
    throw new RecorderError('khong_gan_duoc', (e as Error).message);
  }
  // Đọc form phía trang (cho form có tệp) — lỗi thì vẫn ghi được phía mạng.
  try {
    await dbg.sendCommand('Runtime.enable');
    await dbg.sendCommand('Page.enable');                // không bật thì script gài sẵn không chạy ở trang mới
    await dbg.sendCommand('Runtime.addBinding', { name: BINDING });
    l.hookId = ((await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HOOK })) as { identifier: string }).identifier;
    await dbg.sendCommand('Runtime.evaluate', { expression: PAGE_HOOK });
  } catch { /* bỏ qua */ }
  // Iframe khác tiến trình (khác site) — trang WebForms hay nhúng khung; lỗi thì vẫn ghi được khung chính.
  try { await dbg.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }); } catch { /* bỏ qua */ }
  void collectPasswords(l);
  recorderEvents.emit('changed');
}

/** Người dùng bấm "Dừng ghi". */
export function stopRecording(): void {
  if (live) finish(live);
}

function finish(l: Live, reason?: string): void {
  if (live !== l) return;
  l.stopping = true;
  l.cleanup();
  if (!l.wc.isDestroyed() && l.wc.debugger.isAttached()) {
    // Gỡ script đọc form khỏi trang (bản đang mở giữ hook nhưng không còn cầu nối ⇒ không làm gì).
    if (l.hookId) void l.wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: l.hookId }).catch(() => {});
    void l.wc.debugger.sendCommand('Runtime.removeBinding', { name: BINDING }).catch(() => {});
  }
  try { if (!l.wc.isDestroyed() && l.wc.debugger.isAttached()) l.wc.debugger.detach(); } catch { /* đã tách */ }
  l.rec.stoppedAt = new Date().toISOString();
  if (reason) l.rec.stopReason = reason;
  last = l.rec;
  live = null;
  recorderEvents.emit('changed');
  if (reason) recorderEvents.emit('stopped', l.rec, reason);
}

/** Tên các ô type=password trên mọi khung của tab ⇒ luôn che, dù tên không có chữ "pass". */
async function collectPasswords(l: Live): Promise<void> {
  if (l.wc.isDestroyed()) return;
  for (const f of l.wc.mainFrame.framesInSubtree) {
    try {
      const names = (await f.executeJavaScript("[...document.querySelectorAll('input[type=password]')].map((e) => e.name).filter(Boolean)")) as string[];
      for (const n of names) l.passwords.add(n);
    } catch { /* khung đang tải / khác origin bị chặn */ }
  }
}

function handle(l: Live, method: string, p: Record<string, unknown>, sessionId?: string): void {
  const dbg = l.wc.debugger;
  // Khung chính: KHÔNG truyền sessionId (Electron từ chối chuỗi rỗng); khung con khác tiến trình: theo phiên của nó.
  const send = (m: string, params: Record<string, unknown>) => (sessionId ? dbg.sendCommand(m, params, sessionId) : dbg.sendCommand(m, params));
  if (method === 'Target.attachedToTarget') {
    const sid = p.sessionId as string;
    void dbg.sendCommand('Network.enable', { maxPostDataSize: 1024 * 1024 }, sid).catch(() => { /* khung đã đóng */ });
    return;
  }
  const reqKey = (id: unknown) => `${sessionId ?? ''}:${String(id)}`;

  if (method === 'Runtime.bindingCalled' && p.name === BINDING) {
    try {
      const f = JSON.parse(p.payload as string) as Omit<PageForm, 'at'>;
      l.pageForm = { ...f, at: Date.now() };
      const step = l.awaiting;
      if (step && !step.fields.length && sameUrl(step.url, f.action)) fromPageForm(l, step, l.pageForm);
    } catch { /* bỏ qua */ }
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    const type = p.type as string;
    if (!['Document', 'XHR', 'Fetch'].includes(type)) return;
    const req = p.request as CdpRequest;
    if (!/^https?:/.test(req.url)) return;
    const prev = l.byReq.get(reqKey(p.requestId));
    const redirect = p.redirectResponse as { status: number; headers: Record<string, string> } | undefined;
    if (redirect && prev) {
      prev.status = redirect.status;
      prev.location = header(redirect.headers, 'location');
    }
    // GET sau chuyển hướng từ một POST vẫn mang Content-Type cũ trong sự kiện ⇒ chỉ tính cho request có thân.
    const ct = req.method === 'GET' ? '' : header(req.headers, 'content-type') ?? '';
    const ajax = !!header(req.headers, 'x-microsoftajax');
    const step: RecStep = {
      id: l.rec.steps.length + 1,
      at: new Date().toISOString(),
      kind: type === 'Document' ? (req.method === 'GET' ? 'trang' : 'form') : ajax ? 'form' : 'xhr',
      method: req.method,
      url: req.url,
      frame: sessionId || (type === 'Document' && l.mainFrameId && p.frameId !== l.mainFrameId) ? 'khung_con' : 'chinh',
      label: '',
      fields: [],
      files: [],
      ...(ct ? { contentType: ct } : {}),
      ...(ajax ? { async: true } : {}),
      ...(redirect && prev ? { redirectedFrom: prev.id } : {}),
    };
    const body = req.postData !== undefined ? Buffer.from(req.postData, 'utf8')
      : req.postDataEntries?.length ? Buffer.concat(req.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64'))) : undefined;
    const fill = (b: Buffer | undefined) => {
      const parsed = parseBody(ct, b);
      step.fields = maskFields(parsed.fields, l.passwords);
      step.files = parsed.files;
      step.label = stepLabel(step, l.lastPage, getSettings().lang);
    };
    fill(body);
    if (body === undefined && req.hasPostData) {
      // Thân có tệp: trình duyệt không gửi kèm sự kiện ⇒ hỏi riêng; không có ⇒ dùng form đọc phía trang (đến trước hoặc
      // ngay sau request); vẫn không có ⇒ đánh dấu không đọc được.
      const pf = l.pageForm;
      if (pf && Date.now() - pf.at < 5000 && sameUrl(req.url, pf.action)) fromPageForm(l, step, pf);
      else {
        l.awaiting = step;
        void send('Network.getRequestPostData', { requestId: p.requestId })
          .then((r: { postData: string; base64Encoded?: boolean }) => { fill(Buffer.from(r.postData, r.base64Encoded ? 'base64' : 'latin1')); recorderEvents.emit('changed'); })
          .catch(() => setTimeout(() => { if (!step.fields.length) { step.bodyUnreadable = true; recorderEvents.emit('changed'); } }, 1000));
      }
    }
    l.byReq.set(reqKey(p.requestId), step);
    l.rec.steps.push(step);
    if (l.rec.steps.length >= MAX_STEPS) { l.rec.truncated = true; finish(l, 'du_buoc'); return; }
    recorderEvents.emit('changed');
    return;
  }

  if (method === 'Network.responseReceived') {
    const step = l.byReq.get(reqKey(p.requestId));
    const res = p.response as { status: number; mimeType: string; headers: Record<string, string> };
    if (!step) return;
    step.status = res.status;
    step.responseType = res.mimeType;
    const loc = header(res.headers, 'location');
    if (loc) step.location = loc;
    recorderEvents.emit('changed');
    return;
  }

  if (method === 'Network.loadingFinished') {
    const step = l.byReq.get(reqKey(p.requestId));
    if (!step || step.kind === 'xhr' || !step.status || step.status >= 300 || !/html|plain/.test(step.responseType ?? '')) return;
    void send('Network.getResponseBody', { requestId: p.requestId })
      .then((r: { body: string; base64Encoded: boolean }) => {
        const text = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
        if (step.async) {
          const d = deltaInfo(text);
          if (d) step.panels = d.panels;
        } else {
          step.page = pageInfo(text);
          for (const n of step.page.passwords) l.passwords.add(n);
          if (step.frame === 'chinh') l.lastPage = step.page;
        }
        recorderEvents.emit('changed');
      })
      .catch(() => { /* phản hồi đã bị trình duyệt bỏ */ });
  }
}

const sameUrl = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

function fromPageForm(l: Live, step: RecStep, f: PageForm): void {
  step.fields = maskFields(f.fields.map(([name, value]) => ({ name, value })), l.passwords);
  step.files = f.files.map(([name, filename, type, size]) => ({ name, filename, type, size }));
  delete step.bodyUnreadable;
  step.label = stepLabel(step, l.lastPage, getSettings().lang);
  if (l.awaiting === step) l.awaiting = undefined;
  recorderEvents.emit('changed');
}
