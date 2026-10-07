/*
 * Bộ hàm `vala` cho gói kịch bản Vala Desktop — chạy TRONG trang hệ thống nguồn (main world), giống hệt ở hai nơi:
 *   - Vala Desktop: tiến trình chính chèn vào mỗi trang khớp mẫu địa chỉ (apps/desktop/src/scripts.ts).
 *   - Máy chủ (trình duyệt tự động): chèn cùng tệp này vào trang rồi nạp cùng gói ⇒ kịch bản viết một lần chạy hai nơi.
 *
 * Kịch bản của quản trị là thân một hàm async nhận `vala`: mã ở ngoài cùng chạy mỗi lần trang tải (sửa giao diện), thao
 * tác có tên khai báo bằng vala.action(...) để ứng dụng / AI gọi sau:
 *
 *   vala.css('.banner-loi { display: none }');
 *   vala.action('lay_danh_sach_van_ban', { mo_ta: 'Văn bản chờ xử lý' }, async ({ trang = 1 }) => {
 *     const r = await vala.request(`/api/vanban?page=${trang}`);
 *     return r.json;
 *   });
 *
 * Tệp này là JS thuần, không phụ thuộc gì; chèn nhiều lần vào cùng trang vẫn chỉ cài một lần.
 */
(function () {
  'use strict';
  if (window.__vala) return;

  var actions = new Map();   // tên ⇒ { pkg, meta, fn }
  var loaded = new Map();    // mã gói ⇒ version đã nạp vào trang này
  var logs = [];
  var current = null;        // gói đang nạp (gắn thao tác vào gói)

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** Chờ tới khi có phần tử (CSS selector) hoặc hàm trả giá trị khác rỗng. */
  async function waitFor(target, opts) {
    var timeout = (opts && opts.timeout) || 10000;
    var interval = (opts && opts.interval) || 100;
    var t0 = Date.now();
    for (;;) {
      var v = typeof target === 'function' ? await target() : $(target);
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error('Hết thời gian chờ: ' + (typeof target === 'string' ? target : 'điều kiện'));
      await sleep(interval);
    }
  }
  async function el(t) { return typeof t === 'string' ? waitFor(t) : t; }

  async function click(t) {
    var e = await el(t);
    if (e.scrollIntoView) e.scrollIntoView({ block: 'center' });
    e.click();
    return true;
  }

  /** Điền ô nhập như người gõ: đặt giá trị bằng setter gốc (React/Vue nhận ra) rồi phát input + change. */
  async function fill(t, value) {
    var e = await el(t);
    if (e.focus) e.focus();
    if (e.isContentEditable) e.textContent = value;
    else if (e.tagName === 'SELECT') e.value = value;
    else {
      var proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && d.set) d.set.call(e, value); else e.value = value;
    }
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Chữ của phần tử (ô nhập ⇒ giá trị). Không có ⇒ null. */
  function read(t) {
    var e = typeof t === 'string' ? $(t) : t;
    if (!e) return null;
    var v = 'value' in e && typeof e.value === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) ? e.value : e.textContent;
    return (v || '').replace(/\s+/g, ' ').trim();
  }

  /** Bảng HTML ⇒ mảng hàng; có hàng tiêu đề (th) ⇒ mảng object theo tiêu đề. */
  function table(t) {
    var e = typeof t === 'string' ? $(t) : t;
    if (!e) return [];
    var rows = $$('tr', e).map(function (tr) { return $$('th,td', tr).map(function (c) { return read(c); }); });
    var head = e.querySelector('thead tr, tr:first-child');
    if (head && head.querySelector('th')) {
      var keys = rows.shift();
      return rows.map(function (r) { var o = {}; keys.forEach(function (k, i) { o[k || ('cot_' + (i + 1))] = r[i]; }); return o; });
    }
    return rows;
  }

  /** Các trường của form (gồm ô ẩn như __VIEWSTATE của ASP.NET) ⇒ object. */
  function form(t) {
    var e = typeof t === 'string' ? $(t) : (t || document.forms[0]);
    var o = {};
    if (!e) return o;
    new FormData(e).forEach(function (v, k) { if (typeof v === 'string') o[k] = v; });
    return o;
  }

  /** Gọi HTTP trong phiên của trang (cookie của người dùng đi kèm). Trả { ok, status, url, text, json }. */
  async function request(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'include', headers: Object.assign({}, opts.headers || {}) };
    if (opts.form) {
      init.method = opts.method || 'POST';
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      init.body = new URLSearchParams(opts.form).toString();
    } else if (opts.json !== undefined) {
      init.method = opts.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.json);
    } else if (opts.body !== undefined) init.body = opts.body;
    var res = await fetch(new URL(url, location.href).toString(), init);
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (_) { /* không phải JSON */ }
    return { ok: res.ok, status: res.status, url: res.url, text: text, json: json };
  }

  /**
   * Thêm / thay CSS (mỗi gói một bảng kiểu, nạp lại thì thay chứ không chồng). Dùng bảng kiểu dựng sẵn (adoptedStyleSheets)
   * — trang có CSP chặn thẻ <style> nội tuyến (style-src 'self') vẫn áp dụng được; trình duyệt cũ mới dùng thẻ <style>.
   */
  var sheets = new Map();
  function css(text, id) {
    var key = id || (current && current.code) || 'kich-ban';
    if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document) {
      var sh = sheets.get(key);
      if (!sh) {
        sh = new CSSStyleSheet();
        sheets.set(key, sh);
        document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sh]);
      }
      sh.replaceSync(text);
      return;
    }
    var s = document.getElementById('vala-css-' + key);
    if (!s) {
      s = document.createElement('style');
      s.id = 'vala-css-' + key;
      (document.head || document.documentElement).appendChild(s);
    }
    s.textContent = text;
  }

  function log() {
    var a = Array.prototype.slice.call(arguments);
    logs.push({ at: new Date().toISOString(), pkg: current ? current.code : null, msg: a.map(String).join(' ') });
    if (logs.length > 200) logs.shift();
    console.info.apply(console, ['[vala]'].concat(a));
  }

  /** Khai báo thao tác có tên: vala.action(ten, fn) hoặc vala.action(ten, { mo_ta, params }, fn). */
  function action(name, meta, fn) {
    if (typeof meta === 'function') { fn = meta; meta = {}; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Tên thao tác không hợp lệ: ' + name);
    actions.set(name, { pkg: current ? current.code : null, meta: meta || {}, fn: fn });
  }

  var vala = Object.freeze({
    sleep: sleep, $: $, $$: $$, waitFor: waitFor, click: click, fill: fill, read: read, table: table, form: form,
    request: request, css: css, log: log, action: action,
  });

  Object.defineProperty(window, '__vala', {
    configurable: false, enumerable: false, writable: false,
    value: Object.freeze({
      /** Nạp một gói vào trang (bỏ qua nếu đúng bản này đã nạp). */
      load: async function (pkg, body) {
        if (loaded.get(pkg.code) === pkg.version) return { ok: true, skipped: true };
        loaded.set(pkg.code, pkg.version);
        current = pkg;
        try {
          if (pkg.css) css(pkg.css, pkg.code);
          await body(vala);
          return { ok: true };
        } catch (e) {
          log('Lỗi khi nạp gói ' + pkg.code + ': ' + (e && e.message || e));
          return { ok: false, error: String(e && e.message || e) };
        } finally { current = null; }
      },
      has: function (name) { return actions.has(name); },
      list: function () {
        return Array.from(actions.entries()).map(function (x) {
          return { name: x[0], pkg: x[1].pkg, mo_ta: x[1].meta.mo_ta || '', params: x[1].meta.params || null };
        });
      },
      /** Chạy thao tác. Luôn trả object (không ném lỗi) để bên gọi nhận được thông báo lỗi. */
      run: async function (name, args) {
        var a = actions.get(name);
        if (!a) return { ok: false, error: 'Trang này không có thao tác ' + name };
        try { return { ok: true, result: await a.fn(args || {}) }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
      },
      loaded: function () { return Object.fromEntries(loaded); },
      logs: function () { return logs.slice(); },
    }),
  });
})();
