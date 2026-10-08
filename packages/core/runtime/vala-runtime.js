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

  // ---------------------------------------------------------------------------------------------
  // vala.webform — gửi form ASP.NET WebForms trực tiếp (T07, docs/tich-hop-aspnet.md)
  //
  // Tải trang NGẦM (fetch, cookie của trang), đọc HTML bằng DOMParser và giữ trang đó làm trạng thái form. postback() /
  // submit() dựng thân như trình duyệt (trạng thái hiện tại + trường đè), gửi, rồi lấy trang trả về làm trạng thái mới — nên
  // __VIEWSTATE / __EVENTVALIDATION luôn đúng qua nhiều lần gửi. Không đụng trang người dùng đang xem.
  // ---------------------------------------------------------------------------------------------

  /** Lỗi có mã (het_phien, loi_may_chu, du_lieu_khong_hop_le, khong_tim_thay_truong, truong_trung_ten, khong_co_form). */
  function vErr(code, message, chiTiet) {
    var e = new Error(message);
    e.code = code;
    if (chiTiet) e.chi_tiet = chiTiet;
    return e;
  }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function isHidden(e) {
    var st = (e.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
    return e.hidden || st.indexOf('display:none') >= 0 || st.indexOf('visibility:hidden') >= 0;
  }
  function pathOf(u) { try { return new URL(u, location.href).pathname.toLowerCase(); } catch (_) { return ''; } }

  /** Trang lỗi ASP.NET / HTTP ≥ 500 ⇒ câu lỗi ngắn; không phải ⇒ null. */
  function serverError(doc, status, text) {
    var title = clean(doc && doc.title);
    var body = clean(doc && doc.body ? doc.body.textContent : text);
    if (status < 500 && !/Server Error in|Runtime Error|^Error \d{3}$/i.test(title)) return null;
    var known = /(Invalid postback or callback argument|Validation of viewstate MAC failed|The state information is invalid for this page)/i.exec(body);
    if (known) return known[1];
    var exc = /(System\.[A-Za-z.]+Exception)\s*:?\s*([^\r\n]{0,200})/.exec(text || body);
    if (exc) return clean(exc[1] + (exc[2] ? ': ' + exc[2] : ''));
    return title || ('HTTP ' + status);
  }

  /** Lỗi kiểm tra dữ liệu đang hiện: ValidationSummary (<ul><li>) hoặc validator có thông báo. */
  function validationErrors(doc) {
    var out = [];
    $$('div, span', doc).forEach(function (e) {
      if (isHidden(e) || !/color:\s*red/i.test(e.getAttribute('style') || '')) return;
      var lis = $$('ul > li', e);
      if (lis.length) lis.forEach(function (li) { var t = clean(li.textContent); if (t && out.indexOf(t) < 0) out.push(t); });
    });
    if (out.length) return out;
    $$('span[id]', doc).forEach(function (e) {
      var t = clean(e.textContent);
      if (!isHidden(e) && /color:\s*red/i.test(e.getAttribute('style') || '') && t && t !== '*' && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  /** Phản hồi UpdatePanel `độ dài|loại|id|nội dung|` ⇒ mảng mục; không đúng dạng ⇒ null. */
  function parseDelta(text) {
    var items = [];
    var i = 0;
    function until() { var j = text.indexOf('|', i); if (j < 0) throw new Error('x'); var v = text.slice(i, j); i = j + 1; return v; }
    try {
      while (i < text.length) {
        var len = until();
        if (!/^\d+$/.test(len)) return null;
        var type = until();
        var id = until();
        var content = text.substr(i, Number(len));
        if (text.charAt(i + Number(len)) !== '|') return null;
        i += Number(len) + 1;
        items.push({ type: type, id: id, content: content });
      }
    } catch (_) { return null; }
    return items.length ? items : null;
  }

  function WebForm(opts) { this._opts = opts || {}; }

  WebForm.prototype._load = function (url, status, text, redirected, sentPath) {
    var doc = new DOMParser().parseFromString(text, 'text/html');
    var lp = pathOf(url);
    if (/[?&]ReturnUrl=/i.test(url) || (/login/i.test(lp) && !/login/i.test(sentPath))) {
      throw vErr('het_phien', 'Phiên đăng nhập hệ thống đã hết — đăng nhập lại rồi thử lại');
    }
    var err = serverError(doc, status, text);
    if (err) throw vErr('loi_may_chu', 'Hệ thống báo lỗi: ' + err);
    this.doc = doc;
    this.url = url;
    this.status = status;
    this.redirected = redirected;
    this.form = this._opts.form ? $(this._opts.form, doc)
      : (($('input[name="__VIEWSTATE"]', doc) || {}).form || doc.forms[0] || null);
  };

  WebForm.prototype._script = function () {
    return $$('script', this.doc).map(function (s) { return s.textContent; }).join('\n');
  };

  /**
   * Mọi tên trường của form (cả tên gốc CheckBoxList `tên` của `tên$0`, `tên$1`…) và mọi ĐÍCH postback trên trang (GridView,
   * LinkButton… không phải ô nhập: tên chỉ có trong `__doPostBack('…')` / `WebForm_PostBackOptions("…")`).
   */
  WebForm.prototype._names = function () {
    var names = [];
    var add = function (n) { if (n && names.indexOf(n) < 0) names.push(n); };
    if (this.form) {
      Array.prototype.forEach.call(this.form.elements, function (e) {
        if (!e.name) return;
        add(e.name);
        var base = /^(.*)\$\d+$/.exec(e.name);
        if (base) add(base[1]);
      });
    }
    $$('[href], [onclick], [onchange]', this.doc).forEach(function (e) {
      ['href', 'onclick', 'onchange'].forEach(function (k) {
        var v = e.getAttribute(k) || '';
        var re = /__doPostBack\(\\?['"]([^'"\\]+)\\?['"]|WebForm_PostBackOptions\(\s*\\?["']([^"'\\]+)/g;
        for (var m = re.exec(v); m; m = re.exec(v)) add(m[1] || m[2]);
      });
    });
    return names;
  };

  /** Tên ngắn ⇒ tên đầy đủ (khớp đúng, hoặc khớp đuôi `$tên`). Trường `__…` giữ nguyên. */
  WebForm.prototype.name = function (ten) {
    if (/^__/.test(ten)) return ten;
    var names = this._names();
    if (names.indexOf(ten) >= 0) return ten;
    var hit = names.filter(function (n) { return n.slice(-(ten.length + 1)) === '$' + ten; });
    if (hit.length === 1) return hit[0];
    if (!hit.length) throw vErr('khong_tim_thay_truong', 'Trang không có trường ' + ten);
    throw vErr('truong_trung_ten', 'Có nhiều trường tên ' + ten + ': ' + hit.join(', ') + ' — dùng tên đầy đủ');
  };

  /** Các cặp [tên, giá trị] như trình duyệt sẽ gửi (không gồm nút, không gồm tệp). */
  WebForm.prototype._pairs = function () {
    var out = [];
    if (!this.form) return out;
    Array.prototype.forEach.call(this.form.elements, function (e) {
      if (!e.name || e.disabled) return;
      var tag = e.tagName;
      var type = (e.getAttribute('type') || '').toLowerCase();
      if (tag === 'BUTTON' || (tag === 'INPUT' && /^(submit|button|image|reset|file)$/.test(type))) return;
      if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
        if (e.hasAttribute('checked')) out.push([e.name, e.hasAttribute('value') ? e.getAttribute('value') : 'on']);
        return;
      }
      if (tag === 'SELECT') {
        var opts = $$('option', e);
        var sel = opts.filter(function (o) { return o.hasAttribute('selected'); });
        if (!sel.length && !e.multiple && opts.length) sel = [opts[0]];
        sel.forEach(function (o) { out.push([e.name, o.hasAttribute('value') ? o.getAttribute('value') : o.textContent]); });
        return;
      }
      if (tag === 'TEXTAREA') { out.push([e.name, e.textContent.replace(/^\r?\n/, '')]); return; }
      out.push([e.name, e.hasAttribute('value') ? e.getAttribute('value') : '']);
    });
    return out;
  };

  /** Trạng thái form ⇒ object (trường lặp ⇒ mảng). */
  WebForm.prototype.fields = function () {
    var o = {};
    this._pairs().forEach(function (p) {
      if (p[0] in o) o[p[0]] = [].concat(o[p[0]], p[1]); else o[p[0]] = p[1];
    });
    return o;
  };

  /**
   * Lựa chọn của ô chọn / CheckBoxList / RadioButtonList: [{ value, text, selected, field }]. Ô chưa có mục nào (vd danh
   * sách người nhận trước khi chọn đơn vị — WebForms không vẽ ô nào) ⇒ [].
   */
  WebForm.prototype.options = function (ten) {
    var full;
    try { full = this.name(ten); } catch (e) { if (e.code === 'khong_tim_thay_truong') return []; throw e; }
    var doc = this.doc;
    var sel = $$('select', this.form || doc).filter(function (e) { return e.name === full; })[0];
    if (sel) {
      return $$('option', sel).map(function (o) {
        return { value: o.hasAttribute('value') ? o.getAttribute('value') : clean(o.textContent), text: clean(o.textContent), selected: o.hasAttribute('selected'), field: full };
      });
    }
    var re = new RegExp('^' + full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\$\\d+)?$');
    return $$('input[type=checkbox], input[type=radio]', this.form || doc).filter(function (e) { return re.test(e.name); }).map(function (e, i) {
      var label = e.id ? doc.querySelector('label[for="' + e.id + '"]') : null;
      return { value: e.hasAttribute('value') ? e.getAttribute('value') : String(i), text: clean(label ? label.textContent : ''), selected: e.hasAttribute('checked'), field: e.name };
    });
  };

  /** Đè trường vào danh sách cặp. Mảng ⇒ CheckBoxList (tích đúng các mục) / ô chọn nhiều. */
  WebForm.prototype._apply = function (pairs, fields) {
    var self = this;
    Object.keys(fields || {}).forEach(function (k) {
      var v = fields[k];
      var full = self.name(k);
      if (Array.isArray(v)) {
        var items = self.options(full);
        var isList = items.length && items[0].field !== full;            // CheckBoxList: tên$i
        pairs = pairs.filter(function (p) { return isList ? items.every(function (it) { return it.field !== p[0]; }) : p[0] !== full; });
        v.forEach(function (x) {
          var it = items.filter(function (o) { return o.value === String(x); })[0]
            || items.filter(function (o) { return o.text.toLowerCase() === clean(String(x)).toLowerCase(); })[0];
          if (!it) throw vErr('khong_tim_thay_truong', 'Ô ' + k + ' không có lựa chọn ' + x);
          if (isList) {
            var input = $$('input', self.form).filter(function (e) { return e.name === it.field; })[0];
            pairs.push([it.field, input && input.hasAttribute('value') ? input.getAttribute('value') : 'on']);
          } else pairs.push([full, it.value]);
        });
        return;
      }
      // Ô chọn / RadioButtonList: nhận cả chữ hiển thị (không phân biệt hoa thường) ⇒ đổi sang mã.
      var opts = self.options(full).filter(function (o) { return o.field === full; });
      if (opts.length && !opts.some(function (o) { return o.value === String(v); })) {
        var byText = opts.filter(function (o) { return o.text.toLowerCase() === clean(String(v)).toLowerCase(); })[0];
        if (!byText) throw vErr('khong_tim_thay_truong', 'Ô ' + k + ' không có lựa chọn ' + v);
        v = byText.value;
      }
      var i = -1;
      pairs.forEach(function (p, j) { if (i < 0 && p[0] === full) i = j; });
      if (i >= 0) pairs[i] = [full, String(v)]; else pairs.push([full, String(v)]);
      pairs = pairs.filter(function (p, j) { return p[0] !== full || j === (i >= 0 ? i : pairs.length - 1); });
    });
    return pairs;
  };

  /** UpdatePanel chứa control `target` (tên đầy đủ). */
  WebForm.prototype._panel = function (target, explicit) {
    if (explicit) return explicit.indexOf('$') >= 0 ? explicit : explicit.replace(/_/g, '$');
    var listed = (/_updateControls\(\[([^\]]*)\]/.exec(this._script()) || [])[1] || '';
    var panels = (listed.match(/'[tf]([^']+)'/g) || []).map(function (x) { return x.slice(2, -1); });
    var e = $$('[name]', this.doc).filter(function (x) { return x.getAttribute('name') === target; })[0]
      || this.doc.getElementById(target.replace(/\$/g, '_'));
    for (var a = e && e.parentElement; a; a = a.parentElement) {
      if (!a.id || a.tagName === 'FORM') continue;
      var hit = panels.filter(function (u) { return u.replace(/\$/g, '_') === a.id; })[0];
      if (hit) return hit;
      // Mono không liệt kê UpdatePanel ⇒ khối cha gần nhất có id.
      if (!panels.length && a.tagName === 'DIV') return a.id.replace(/_/g, '$');
    }
    if (panels.length) return panels[0];
    throw vErr('khong_tim_thay_truong', 'Không tìm thấy UpdatePanel chứa ' + target + ' — truyền { panel }');
  };

  WebForm.prototype._send = async function (pairs, opts) {
    if (!this.form) throw vErr('khong_co_form', 'Trang ' + this.url + ' không có form');
    opts = opts || {};
    var action = new URL(this.form.getAttribute('action') || this.url, this.url).toString();
    var init = { method: 'POST', credentials: 'include', headers: {} };
    if (opts.async) {
      var sm = (/PageRequestManager\._initialize\('([^']+)'/.exec(this._script()) || [])[1];
      if (!sm) throw vErr('khong_tim_thay_truong', 'Trang không có ScriptManager (không gửi kiểu UpdatePanel được)');
      var target = (pairs.filter(function (p) { return p[0] === '__EVENTTARGET'; })[0] || [])[1] || opts.button;
      pairs = [[sm, this._panel(target, opts.panel) + '|' + target]].concat(pairs, [['__ASYNCPOST', 'true']]);
      init.headers['X-MicrosoftAjax'] = 'Delta=true';
      init.headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    var files = opts.files ? Object.keys(opts.files) : [];
    if (files.length || /multipart/i.test(this.form.getAttribute('enctype') || '')) {
      var fd = new FormData();
      pairs.forEach(function (p) { fd.append(p[0], p[1]); });
      var self = this;
      files.forEach(function (k) {
        var t = opts.files[k];
        var bin = atob(t.base64 || '');
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        fd.append(self.name(k), new Blob([bytes], { type: t.loai || 'application/octet-stream' }), t.ten);
      });
      init.body = fd;
    } else {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      init.body = pairs.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]); }).join('&');
    }
    var res = await fetch(action, init);
    var text = await res.text();
    if (opts.async) return this._delta(res, text);
    var before = pathOf(this.url);
    this._load(res.url, res.status, text, res.redirected, pathOf(action));
    if (pathOf(this.url) === before) {
      var bad = validationErrors(this.doc);
      if (bad.length) throw vErr('du_lieu_khong_hop_le', 'Dữ liệu không hợp lệ: ' + bad.join('; '), bad);
    }
    return this;
  };

  /** Áp phản hồi UpdatePanel vào trang đang giữ. */
  WebForm.prototype._delta = async function (res, text) {
    var items = res.status < 500 ? parseDelta(text) : null;
    if (!items) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      throw vErr('loi_may_chu', 'Hệ thống báo lỗi: ' + (serverError(doc, Math.max(res.status, 500), text) || 'phản hồi UpdatePanel không đúng dạng'));
    }
    var self = this;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.type === 'error') throw vErr('loi_may_chu', 'Hệ thống báo lỗi: ' + clean(it.content || it.id));
      if (it.type === 'pageRedirect') {
        var to = new URL(decodeURIComponent(it.content), this.url).toString();
        var r = await fetch(to, { credentials: 'include' });
        this._load(r.url, r.status, await r.text(), true, pathOf(to));
        return this;
      }
      if (it.type === 'updatePanel') {
        var el = self.doc.getElementById(it.id);
        if (el) el.innerHTML = it.content;
      } else if (it.type === 'hiddenField' && self.form) {
        var h = $$('input', self.form).filter(function (x) { return x.name === it.id; })[0];
        if (!h) { h = self.doc.createElement('input'); h.type = 'hidden'; h.name = it.id; self.form.appendChild(h); }
        h.setAttribute('value', it.content);
      }
    }
    this.form = this._opts.form ? $(this._opts.form, this.doc) : (($('input[name="__VIEWSTATE"]', this.doc) || {}).form || this.doc.forms[0] || null);
    var bad = validationErrors(this.doc);
    if (bad.length) throw vErr('du_lieu_khong_hop_le', 'Dữ liệu không hợp lệ: ' + bad.join('; '), bad);
    return this;
  };

  /** Như __doPostBack(target, đối số): AutoPostBack, LinkButton, phân trang GridView (đối số Page$2). */
  WebForm.prototype.postback = function (target, fields, opts) {
    opts = opts || {};
    var t = this.name(target);
    fields = Object.assign({}, fields || {});
    var arg = opts.argument !== undefined ? opts.argument : (fields.__EVENTARGUMENT || '');
    delete fields.__EVENTARGUMENT;
    var pairs = this._apply(this._pairs(), fields).filter(function (p) { return p[0] !== '__EVENTTARGET' && p[0] !== '__EVENTARGUMENT'; });
    pairs.unshift(['__EVENTTARGET', t], ['__EVENTARGUMENT', String(arg)]);
    return this._send(pairs, opts);
  };

  /** Bấm nút gửi `button` (null ⇒ gửi form không qua nút). */
  WebForm.prototype.submit = function (button, fields, opts) {
    opts = opts || {};
    var pairs = this._apply(this._pairs(), fields).map(function (p) { return p[0] === '__EVENTTARGET' || p[0] === '__EVENTARGUMENT' ? [p[0], ''] : p; });
    if (button) {
      var b = this.name(button);
      var el = $$('input, button', this.form).filter(function (e) { return e.name === b; })[0];
      if (el && (el.getAttribute('type') || '').toLowerCase() === 'image') pairs.push([b + '.x', '0'], [b + '.y', '0']);
      else pairs.push([b, el ? (el.getAttribute('value') || clean(el.textContent)) : '']);
      opts = Object.assign({ button: b }, opts);
    }
    return this._send(pairs, opts);
  };

  WebForm.prototype.$ = function (sel) { return $(sel, this.doc); };
  WebForm.prototype.read = function (sel) { return read($(sel, this.doc)); };
  /** Bảng ⇒ mảng object theo tiêu đề (hàng có th); bỏ hàng số trang của GridView (chứa bảng lồng). */
  WebForm.prototype.table = function (sel) {
    var t = $(sel, this.doc);
    if (!t || !t.rows) return [];
    var rows = Array.prototype.filter.call(t.rows, function (r) { return !r.querySelector('table'); });
    var head = rows.length && rows[0].querySelector('th') ? $$('th,td', rows.shift()).map(function (c) { return clean(c.textContent); }) : null;
    return rows.map(function (r) {
      var cells = Array.prototype.map.call(r.cells, function (c) { return clean(c.textContent); });
      if (!head) return cells;
      var o = {};
      head.forEach(function (k, i) { o[k || ('cot_' + (i + 1))] = cells[i]; });
      return o;
    });
  };

  /** Mở trang có form ASP.NET để gửi trực tiếp (không đổi trang đang xem). opts.form: CSS chọn form. */
  async function webform(url, opts) {
    var f = new WebForm(opts);
    var u = new URL(url, location.href).toString();
    var res = await fetch(u, { credentials: 'include' });
    f._load(res.url, res.status, await res.text(), res.redirected, pathOf(u));
    return f;
  }

  /*
   * DWR 1.x (Direct Web Remoting — vd VNPT iOffice: quanlyvanban.hanoi.gov.vn, docs/van-ban-ha-noi.md). Tham số của mỗi
   * lời gọi là một BIỂU THỨC gọi hàm phía máy chủ dạng chuỗi và máy chủ chạy nguyên biểu thức đó ⇒ chỉ dựng bằng
   * dwr.expr (tên hàm phải là hằng, mọi giá trị qua dwrValue như `replace_sc` của trang gốc: không còn nháy / gạch chéo
   * nên không đóng được chuỗi để chèn lời gọi khác). Gọi qua đối tượng DWR sẵn có của trang (NEORemoting, DataRemoting…)
   * ⇒ CSRF-Token và cách gửi do engine.js của trang lo.
   */
  function dwrValue(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\\/g, '&#92;')
      .replace(/[\u0000-\u001f\u007f]/g, ' ');
  }
  function dwrDeep(v) {
    if (typeof v === 'string') return dwrValue(v);
    if (Array.isArray(v)) return v.map(dwrDeep);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[dwrValue(k)] = dwrDeep(v[k]); });
      return o;
    }
    return v;
  }
  /** dwr.expr('qlvb.van_ban_den.getVanBanDenPaging', -1, 10, { kho: '…' }) ⇒ `…("-1","10",'{"kho":"…"}')`. */
  function dwrExpr(fn) {
    if (!/^[a-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){1,5}$/.test(fn)) throw new Error('Tên hàm DWR không hợp lệ: ' + fn);
    var parts = Array.prototype.slice.call(arguments, 1).map(function (a) {
      if (typeof a === 'number') { if (!isFinite(a)) throw new Error('Số không hợp lệ'); return '"' + a + '"'; }
      if (typeof a === 'string') return '"' + dwrValue(a) + '"';
      if (a && typeof a === 'object') return "'" + JSON.stringify(dwrDeep(a)) + "'";
      throw new Error('Đối số DWR không hợp lệ');
    });
    return fn + '(' + parts.join(',') + ')';
  }
  /**
   * vala.dwr('NEORemoting.getRSet', dwr.expr(...), { timeout }) ⇒ giá trị trả về (chuỗi JSON thì giải luôn). Trang chưa có
   * đối tượng DWR (chưa đăng nhập / đang ở trang đăng nhập) ⇒ lỗi mã `het_phien`.
   */
  function dwr(call, expression, opts) {
    var m = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(call || '');
    if (!m) return Promise.reject(new Error('Lời gọi DWR không hợp lệ: ' + call));
    var obj = window[m[1]];
    if (!obj || typeof obj[m[2]] !== 'function') {
      var e = new Error('Chưa đăng nhập hệ thống (trang không có ' + call + ')');
      e.code = 'het_phien';
      return Promise.reject(e);
    }
    var timeout = (opts && opts.timeout) || 30000;
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('Hệ thống không trả lời sau ' + timeout / 1000 + ' giây')); } }, timeout);
      obj[m[2]](expression, {
        callback: function (v) {
          if (done) return;
          done = true; clearTimeout(t);
          if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { v = JSON.parse(v); } catch (_) { /* giữ chuỗi */ } }
          resolve(v);
        },
        errorHandler: function (msg) {
          if (done) return;
          done = true; clearTimeout(t);
          var er = new Error('Hệ thống báo lỗi: ' + (msg || 'không rõ'));
          er.code = 'loi_he_thong';
          reject(er);
        },
        timeout: timeout,
      });
    });
  }
  dwr.expr = dwrExpr;
  dwr.value = dwrValue;

  /** Khai báo thao tác có tên: vala.action(ten, fn) hoặc vala.action(ten, { mo_ta, params }, fn). */
  function action(name, meta, fn) {
    if (typeof meta === 'function') { fn = meta; meta = {}; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Tên thao tác không hợp lệ: ' + name);
    actions.set(name, { pkg: current ? current.code : null, meta: meta || {}, fn: fn });
  }

  var vala = Object.freeze({
    sleep: sleep, $: $, $$: $$, waitFor: waitFor, click: click, fill: fill, read: read, table: table, form: form,
    request: request, css: css, log: log, action: action, webform: webform, dwr: dwr,
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
        try { return { ok: true, result: await a.fn(args || {}) }; } catch (e) {
          var out = { ok: false, error: String(e && e.message || e) };
          if (e && e.code) out.code = e.code;            // lỗi có mã (vala.webform: het_phien, du_lieu_khong_hop_le…)
          if (e && e.chi_tiet) out.chi_tiet = e.chi_tiet;
          return out;
        }
      },
      loaded: function () { return Object.fromEntries(loaded); },
      logs: function () { return logs.slice(); },
    }),
  });
})();
