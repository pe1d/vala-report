"""
vala_sdk — thư viện cho spider Python chạy trong Crawlab.

Spider chỉ lo phần "gọi trang nào, lấy dữ liệu gì". Phần còn lại do SDK và backend lo:
  * hỏi backend ai cần crawl (người đã đặt lịch preset này, có kết nối còn hiệu lực);
  * lấy cookie phiên của từng người — backend tự đăng nhập lại khi cần, spider KHÔNG thấy mật khẩu;
  * phiên hỏng giữa chừng (bị chuyển hướng / 401 / 403) ⇒ xin phiên mới và thử lại một lần;
  * gửi bản ghi thô về backend (chuẩn hoá, phát hiện lệch schema, lưu lịch sử làm ở backend);
  * lỗi của một người không làm hỏng cả lượt chạy.

Không in cookie, header hay nội dung phiên ra log.

Cách dùng:

    from vala_sdk import Vala, SessionExpired, SchemaDrift

    def crawl(run):
        home = run.get('/Home/Index')
        ...
        run.save('ten_capability', items, context={...})

    Vala().run('ma_spider', crawl)

Hệ thống không có API (ASP.NET WebForms): run.webform('/Trang.aspx') ⇒ WebForm — đọc bảng, gửi lại form / phân trang
(xem lớp WebForm, docs/tich-hop-aspnet.md).

Biến môi trường (Crawlab đặt sẵn qua "Environments", do "Đồng bộ Crawlab" cấu hình):
    VALA_API_URL, VALA_INTERNAL_TOKEN, CRAWLAB_TASK_ID (Crawlab tự đặt)
Tham số dòng lệnh: --user <id> (chạy riêng một người — lịch do worker Vala hẹn giờ, hoặc "chạy ngay"),
--trigger schedule|manual (ghi nhận lượt chạy theo lịch hay chạy tay), --preset <preset> (cũ, trước 015)
"""
import argparse
import os
import re
import sys
import time
from urllib.parse import unquote, urljoin, urlparse

import requests

__all__ = ['Vala', 'Run', 'WebForm', 'WebFormError', 'SessionExpired', 'SchemaDrift', 'SourceUnavailable', 'SourceResponseError', 'ApiError']

REDIRECT_OR_DENIED = {301, 302, 303, 307, 308, 401, 403}


class SessionExpired(Exception):
    """Phiên của người dùng không còn dùng được trên hệ thống nguồn."""


class SchemaDrift(Exception):
    """Hệ thống nguồn đã đổi cấu trúc dữ liệu (mất trường/khối dữ liệu mong đợi)."""


class SourceUnavailable(Exception):
    """Hệ thống nguồn lỗi (HTTP 5xx) hoặc không phản hồi — KHÔNG phải do phiên; không bắt người dùng đăng nhập lại."""


class SourceResponseError(Exception):
    """Hệ thống nguồn trả phản hồi không dùng được (vd không phải JSON: trang lỗi proxy, 204 rỗng, HTML)."""


def _json_or_explain(r, method, path):
    """r.json() nhưng lỗi thì nói rõ request nào, mã HTTP, loại nội dung và vài ký tự đầu (không chứa cookie)."""
    try:
        return requests.Response.json(r)
    except ValueError:
        ctype = r.headers.get('content-type') or '(không có content-type)'
        head = (r.text or '')[:120].replace('\n', ' ').strip()
        raise SourceResponseError(
            f'{method} {path} → HTTP {r.status_code} {ctype}, không phải JSON: {head!r}' if head
            else f'{method} {path} → HTTP {r.status_code} {ctype}, thân phản hồi rỗng') from None


class ApiError(Exception):
    def __init__(self, status, body):
        self.status = status
        self.type = body.get('type') if isinstance(body, dict) else None
        self.title = body.get('title') if isinstance(body, dict) else str(body)
        self.detail = body.get('detail') if isinstance(body, dict) else None
        super().__init__(f'{status} {self.type}: {self.title}')


class _Api:
    def __init__(self, base_url, token):
        self.base = base_url.rstrip('/')
        self.http = requests.Session()
        self.http.headers['Authorization'] = f'Bearer {token}'

    def post(self, path, body):
        r = self.http.post(f'{self.base}/internal/spider{path}', json=body, timeout=60)
        try:
            data = r.json() if r.content else {}
        except ValueError:
            data = {'title': r.text[:200]}
        if r.status_code >= 400:
            raise ApiError(r.status_code, data)
        return data


class Run:
    """Một người dùng trong lượt chạy. Mọi request tới hệ thống nguồn đi qua get()/post()."""

    def __init__(self, api, target, delay_s=0.3):
        self._api = api
        self.run_id = target['run_id']
        self.user_id = target['user_id']
        self.base_url = target['base_url'].rstrip('/')
        self._host = urlparse(self.base_url).hostname
        self._delay = delay_s
        self._last = 0.0
        self._refreshed = False
        self._pinned_base = None
        self.http = requests.Session()
        self.http.headers['User-Agent'] = 'ValaReporting-Spider/1.0'
        # Cookie phiên do backend cấp (tên→giá trị). Spider dùng để lấy định danh (vd meId/companyId của eTask);
        # KHÔNG chứa mật khẩu (backend không bao giờ trả mật khẩu cho spider). Không in ra log.
        self.session_cookies = {}
        self.calls = 0
        self.saved = 0

    def use_api_base(self, url):
        """Ghim base URL của API nếu khác portal (vd eTask: portal etask.bkav.com, API serviceetask.bkav.com).
        Giữ nguyên qua cả lần refresh phiên."""
        self._pinned_base = url.rstrip('/')
        self.base_url = self._pinned_base

    # ---- phiên ----
    def session(self, refresh=False, reason=None):
        body = {'refresh': refresh}
        if reason:
            body['reason'] = reason
        s = self._api.post(f'/runs/{self.run_id}/session', body)
        # Gửi thẳng header Cookie: đúng bộ cookie backend cấp, không phụ thuộc cách jar khớp domain.
        self.http.cookies.clear()
        self.session_cookies = s.get('cookies') or {}
        self.http.headers['Cookie'] = '; '.join(f'{k}={v}' for k, v in self.session_cookies.items())
        # Base do backend cấp, TRỪ khi spider đã ghim base API riêng (use_api_base) — giữ qua refresh.
        if self._pinned_base:
            self.base_url = self._pinned_base
        elif s.get('base_url'):
            self.base_url = s['base_url'].rstrip('/')
        return s

    def refresh(self, reason=None):
        """Xin backend phiên mới (tối đa một lần mỗi người mỗi lượt chạy). `reason` = request bị từ chối
        ({'status', 'path'} — không có query) để backend kiểm tra lại phiên và ghi đúng lý do, không đoán "hết hạn"."""
        if self._refreshed:
            raise SessionExpired('phiên vẫn hỏng sau khi đã lấy phiên mới')
        self._refreshed = True
        self.session(refresh=True, reason=reason)

    # ---- gọi hệ thống nguồn ----
    def _throttle(self):
        wait = self._last + self._delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _request(self, method, path, **kw):
        if not path.startswith('/'):
            raise ValueError('path phải bắt đầu bằng / (chỉ gọi trong hệ thống nguồn của kết nối)')
        plain = path.split('?', 1)[0]
        for attempt in (1, 2):
            self._throttle()
            self.calls += 1
            try:
                r = self.http.request(method, self.base_url + path, allow_redirects=False, timeout=30, **kw)
            except (requests.ConnectionError, requests.Timeout) as e:
                # Nguồn không phản hồi: đợi rồi thử lại một lần; vẫn không được ⇒ "nguồn đang lỗi", không đụng tới phiên.
                if attempt == 1:
                    time.sleep(5)
                    continue
                raise SourceUnavailable(f'{method} {plain} không phản hồi ({type(e).__name__})')
            if r.status_code >= 500:
                if attempt == 1:
                    time.sleep(5)
                    continue
                raise SourceUnavailable(f'{method} {plain} → HTTP {r.status_code}')
            if r.status_code not in REDIRECT_OR_DENIED:
                r.raise_for_status()
                # .json() lỗi thì báo rõ request nào — thay vì JSONDecodeError trơn không biết ở đâu.
                r.json = lambda *a, _r=r, _m=method, _p=path, **k: _json_or_explain(_r, _m, _p)
                return r
            if attempt == 1 and not self._refreshed:
                self.refresh({'status': r.status_code, 'path': plain})
                continue
            raise SessionExpired(f'{method} {plain} → {r.status_code}')

    def get(self, path, **kw):
        return self._request('GET', path, **kw)

    def webform(self, path, form=None):
        """Trang ASP.NET WebForms (không có API): đọc bảng, gửi lại form / phân trang — xem WebForm."""
        return WebForm(self, path, form=form)

    def post(self, path, **kw):
        return self._request('POST', path, **kw)

    # ---- gửi về backend ----
    def account(self, source_user_id):
        """Định danh của người dùng bên hệ thống nguồn (vd puid eGov) — chống gán nhầm chủ dữ liệu."""
        self._api.post(f'/runs/{self.run_id}/account', {'source_user_id': str(source_user_id)})

    def save(self, capability, items, context=None, meta=None):
        """Gửi bản ghi THÔ (nguyên văn từ hệ thống nguồn). Backend chuẩn hoá theo adapter spec."""
        items = list(items)
        for i in range(0, max(len(items), 1), 2000):
            chunk = items[i:i + 2000]
            r = self._api.post(f'/runs/{self.run_id}/records', {
                'capability': capability, 'items': chunk, 'context': context or {}, 'meta': meta or {},
            })
            self.saved += r.get('seen', 0)
            if not items:
                break

    def _finish(self, status, error_code=None, error_detail=None):
        self._api.post(f'/runs/{self.run_id}/finish', {
            'status': status, 'error_code': error_code,
            'error_detail': (error_detail or '')[:500] or None, 'http_calls': self.calls,
        })


# ---------------------------------------------------------------------------------------------
# WebForm — hệ thống ASP.NET WebForms không có API (T07, docs/tich-hop-aspnet.md)
# ---------------------------------------------------------------------------------------------

class WebFormError(Exception):
    """Lỗi khi dùng form: khong_tim_thay_truong, truong_trung_ten, du_lieu_khong_hop_le (chi_tiet: các câu lỗi), khong_co_form."""

    def __init__(self, code, message, chi_tiet=None):
        super().__init__(message)
        self.code = code
        self.chi_tiet = chi_tiet


def _clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def _hidden_style(el):
    st = re.sub(r'\s', '', (el.get('style') or '')).lower()
    return 'display:none' in st or 'visibility:hidden' in st or el.has_attr('hidden')


_POSTBACK = re.compile(r"""__doPostBack\(\\?['"]([^'"\\]+)\\?['"]\s*,\s*\\?['"]([^'"\\]*)|WebForm_PostBackOptions\(\s*\\?["']([^"'\\]+)""")


class WebForm:
    """
    Một trang ASP.NET WebForms đang mở (cùng mô hình với vala.webform của gói kịch bản): giữ form của trang làm trạng thái;
    postback() / submit() dựng thân như trình duyệt (trạng thái hiện tại + trường đè) nên __VIEWSTATE / __EVENTVALIDATION
    luôn đúng qua nhiều lần gửi.

        f = run.webform('/VanBan.aspx')
        rows = []
        while True:
            rows += f.table('[id$="_gvVanBan"]')
            nxt = f.next_page('gvVanBan')
            if not nxt: break
            f.postback('gvVanBan', argument=nxt)

    Bị đưa về trang đăng nhập (ReturnUrl=) ⇒ SessionExpired (Vala.run tự xin phiên mới rồi chạy lại crawl). Trang lỗi ASP.NET
    (EventValidation, ViewState…) ⇒ SourceResponseError kèm câu lỗi. Chuyển hướng khác sau khi gửi form ⇒ đi theo.
    Cần BeautifulSoup (có sẵn trong Crawlab).
    """

    def __init__(self, run, path, form=None):
        self._run = run
        self._form_sel = form
        self.url = ''
        r, url, redirected, _ = self._go('GET', urljoin(run.base_url + '/', path.lstrip('/')))
        self._load(r, url, redirected)

    # ---- HTTP ----
    def _go(self, method, url, data=None, files=None, headers=None, check=False):
        before = urlparse(getattr(self, 'url', '') or '').path.lower()
        sent_path = urlparse(url).path.lower()
        redirected = False
        for _hop in range(6):
            r = self._call(method, url, data=data, files=files, headers=headers)
            loc = r.headers.get('Location') or r.headers.get('location')
            if 300 <= r.status_code < 400 and loc:
                url = urljoin(url, loc)
                if self._is_login(url, sent_path):
                    raise SessionExpired(f'bị chuyển về trang đăng nhập ({urlparse(url).path})')
                method, data, files, headers, redirected = 'GET', None, None, None, True
                continue
            break
        else:
            raise SourceResponseError(f'quá nhiều lần chuyển hướng từ {sent_path}')
        if self._is_login(url, sent_path):
            raise SessionExpired(f'bị chuyển về trang đăng nhập ({urlparse(url).path})')
        if r.status_code in (401, 403):
            raise SessionExpired(f'{sent_path} → HTTP {r.status_code}')
        return r, url, redirected, before

    def _call(self, method, url, **kw):
        run = self._run
        for attempt in (1, 2):
            run._throttle()
            run.calls += 1
            try:
                return run.http.request(method, url, allow_redirects=False, timeout=30,
                                        **{k: v for k, v in kw.items() if v is not None})
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt == 1:
                    time.sleep(5)
                    continue
                raise SourceUnavailable(f'{method} {urlparse(url).path} không phản hồi ({type(e).__name__})')

    @staticmethod
    def _is_login(url, sent_path):
        u = urlparse(url)
        return bool(re.search(r'[?&]ReturnUrl=', u.query, re.I)) or ('login' in u.path.lower() and 'login' not in sent_path)

    @staticmethod
    def _decode(r):
        """
        Thân phản hồi ⇒ chuỗi. KHÔNG dùng r.text: hệ thống ASP.NET cũ (và Mono) hay trả `Content-Type: text/html` không có
        charset ⇒ requests đoán ISO-8859-1 ⇒ vỡ dấu tiếng Việt. Thứ tự: charset trong header ⇒ <meta charset> ⇒ UTF-8.
        """
        raw = r.content or b''
        m = re.search(r'charset=["\']?([\w-]+)', r.headers.get('Content-Type') or r.headers.get('content-type') or '', re.I)
        if not m:
            m = re.search(r'<meta[^>]+charset=["\']?([\w-]+)', raw[:4096].decode('ascii', 'ignore'), re.I)
        try:
            return raw.decode(m.group(1) if m else 'utf-8')
        except (LookupError, UnicodeDecodeError):
            return raw.decode('utf-8', 'replace')

    def _load(self, r, url, redirected):
        from bs4 import BeautifulSoup   # chỉ spider dùng WebForm mới cần thư viện này (Crawlab có sẵn)
        text = self._decode(r)
        err = self._server_error(r.status_code, text)
        if err:
            raise SourceResponseError(f'Hệ thống nguồn báo lỗi: {err}')
        if r.status_code >= 400:
            raise SourceResponseError(f'{urlparse(url).path} → HTTP {r.status_code}')
        self.soup = BeautifulSoup(text, 'html.parser')
        self.url, self.status, self.redirected = url, r.status_code, redirected
        self._pick_form()

    def _pick_form(self):
        if self._form_sel:
            self.form = self.soup.select_one(self._form_sel)
        else:
            vs = self.soup.find('input', attrs={'name': '__VIEWSTATE'})
            self.form = vs.find_parent('form') if vs else self.soup.find('form')

    @staticmethod
    def _server_error(status, text):
        title = _clean((re.search(r'<title>([\s\S]*?)</title>', text, re.I) or [None, ''])[1])
        if status < 500 and not re.search(r'Server Error in|Runtime Error|^Error \d{3}$', title, re.I):
            return None
        known = re.search(r'(Invalid postback or callback argument|Validation of viewstate MAC failed|The state information is invalid for this page)', text, re.I)
        if known:
            return known.group(1)
        exc = re.search(r'(System\.[A-Za-z.]+Exception)\s*:?\s*([^\r\n<]{0,200})', text)
        if exc:
            return _clean(exc.group(1) + (': ' + exc.group(2) if exc.group(2) else ''))
        return title or f'HTTP {status}'

    def _validation_errors(self):
        out = []
        for el in self.soup.find_all(['div', 'span']):
            if _hidden_style(el) or not re.search(r'color:\s*red', el.get('style') or '', re.I):
                continue
            for li in el.select('ul > li'):
                t = _clean(li.get_text())
                if t and t not in out:
                    out.append(t)
        if out:
            return out
        for el in self.soup.find_all('span', id=True):
            t = _clean(el.get_text())
            if not _hidden_style(el) and re.search(r'color:\s*red', el.get('style') or '', re.I) and t and t != '*' and t not in out:
                out.append(t)
        return out

    # ---- tên trường, trạng thái form ----
    def _elements(self):
        return self.form.find_all(['input', 'select', 'textarea', 'button']) if self.form else []

    def _names(self):
        names = []
        for el in self._elements():
            n = el.get('name')
            if not n:
                continue
            if n not in names:
                names.append(n)
            base = re.match(r'^(.*)\$\d+$', n)
            if base and base.group(1) not in names:
                names.append(base.group(1))
        for el in self.soup.find_all(attrs={'href': True}) + self.soup.find_all(attrs={'onclick': True}) + self.soup.find_all(attrs={'onchange': True}):
            for k in ('href', 'onclick', 'onchange'):
                for m in _POSTBACK.finditer(el.get(k) or ''):
                    n = m.group(1) or m.group(3)
                    if n and n not in names:
                        names.append(n)
        return names

    def name(self, ten):
        """Tên ngắn ⇒ tên đầy đủ (khớp đúng / khớp đuôi `$tên`), kể cả đích postback (GridView, LinkButton). `__…` giữ nguyên."""
        if ten.startswith('__'):
            return ten
        names = self._names()
        if ten in names:
            return ten
        hit = [n for n in names if n.endswith('$' + ten)]
        if len(hit) == 1:
            return hit[0]
        if not hit:
            raise WebFormError('khong_tim_thay_truong', f'Trang không có trường {ten}')
        raise WebFormError('truong_trung_ten', f'Có nhiều trường tên {ten}: {", ".join(hit)} — dùng tên đầy đủ')

    def _pairs(self):
        """Các cặp (tên, giá trị) như trình duyệt sẽ gửi (không gồm nút, tệp)."""
        out = []
        for el in self._elements():
            n = el.get('name')
            if not n or el.has_attr('disabled'):
                continue
            typ = (el.get('type') or '').lower()
            if el.name == 'button' or (el.name == 'input' and typ in ('submit', 'button', 'image', 'reset', 'file')):
                continue
            if el.name == 'input' and typ in ('checkbox', 'radio'):
                if el.has_attr('checked'):
                    out.append((n, el.get('value', 'on')))
                continue
            if el.name == 'select':
                opts = el.find_all('option')
                sel = [o for o in opts if o.has_attr('selected')]
                if not sel and not el.has_attr('multiple') and opts:
                    sel = [opts[0]]
                out.extend((n, o.get('value', _clean(o.get_text()))) for o in sel)
                continue
            if el.name == 'textarea':
                out.append((n, re.sub(r'^\r?\n', '', el.get_text())))
                continue
            out.append((n, el.get('value', '')))
        return out

    def fields(self):
        """Trạng thái form ⇒ dict (trường lặp ⇒ list)."""
        o = {}
        for k, v in self._pairs():
            o[k] = (o[k] if isinstance(o[k], list) else [o[k]]) + [v] if k in o else v
        return o

    def options(self, ten):
        """Lựa chọn của ô chọn / CheckBoxList / RadioButtonList: [{value, text, selected, field}]. Ô chưa có mục ⇒ []."""
        try:
            full = self.name(ten)
        except WebFormError as e:
            if e.code == 'khong_tim_thay_truong':
                return []
            raise
        sel = self.form.find('select', attrs={'name': full}) if self.form else None
        if sel:
            return [{'value': o.get('value', _clean(o.get_text())), 'text': _clean(o.get_text()), 'selected': o.has_attr('selected'), 'field': full}
                    for o in sel.find_all('option')]
        pat = re.compile('^' + re.escape(full) + r'(\$\d+)?$')
        out = []
        for i, el in enumerate(x for x in self._elements() if x.name == 'input' and (x.get('type') or '').lower() in ('checkbox', 'radio') and pat.match(x.get('name') or '')):
            label = self.soup.find('label', attrs={'for': el.get('id')}) if el.get('id') else None
            out.append({'value': el.get('value', str(i)), 'text': _clean(label.get_text() if label else ''), 'selected': el.has_attr('checked'), 'field': el['name']})
        return out

    def _apply(self, pairs, fields):
        for k, v in (fields or {}).items():
            full = self.name(k)
            if isinstance(v, (list, tuple)):
                items = self.options(full)
                is_list = bool(items) and items[0]['field'] != full
                pairs = [p for p in pairs if (all(it['field'] != p[0] for it in items) if is_list else p[0] != full)]
                for x in v:
                    it = next((o for o in items if o['value'] == str(x)), None) or next((o for o in items if o['text'].lower() == _clean(str(x)).lower()), None)
                    if not it:
                        raise WebFormError('khong_tim_thay_truong', f'Ô {k} không có lựa chọn {x}')
                    pairs.append((it['field'], it['value']) if is_list else (full, it['value']))
                continue
            opts = [o for o in self.options(full) if o['field'] == full]
            if opts and not any(o['value'] == str(v) for o in opts):
                hit = next((o for o in opts if o['text'].lower() == _clean(str(v)).lower()), None)
                if not hit:
                    raise WebFormError('khong_tim_thay_truong', f'Ô {k} không có lựa chọn {v}')
                v = hit['value']
            idx = next((i for i, p in enumerate(pairs) if p[0] == full), None)
            pairs = [p for i, p in enumerate(pairs) if p[0] != full or i == idx]
            if idx is None:
                pairs.append((full, str(v)))
            else:
                pairs[idx] = (full, str(v))
        return pairs

    # ---- gửi ----
    def _panel(self, target, explicit):
        if explicit:
            return explicit if '$' in explicit else explicit.replace('_', '$')
        scripts = '\n'.join(s.get_text() for s in self.soup.find_all('script'))
        listed = (re.search(r'_updateControls\(\[([^\]]*)\]', scripts) or [None, ''])[1]
        panels = [x[1:] for x in re.findall(r"'([tf][^']+)'", listed)]
        el = self.soup.find(attrs={'name': target}) or self.soup.find(id=target.replace('$', '_'))
        for a in (el.parents if el else []):
            if not getattr(a, 'get', None) or not a.get('id') or a.name == 'form':
                continue
            hit = next((u for u in panels if u.replace('$', '_') == a['id']), None)
            if hit:
                return hit
            if not panels and a.name == 'div':
                return a['id'].replace('_', '$')            # Mono không khai UpdatePanel ⇒ khối cha gần nhất có id
        if panels:
            return panels[0]
        raise WebFormError('khong_tim_thay_truong', f'Không tìm thấy UpdatePanel chứa {target} — truyền panel=')

    def _send(self, pairs, async_=False, panel=None, button=None, files=None):
        if not self.form:
            raise WebFormError('khong_co_form', f'Trang {self.url} không có form')
        action = urljoin(self.url, self.form.get('action') or self.url)
        headers = {}
        if async_:
            scripts = '\n'.join(s.get_text() for s in self.soup.find_all('script'))
            sm = re.search(r"PageRequestManager\._initialize\('([^']+)'", scripts)
            if not sm:
                raise WebFormError('khong_tim_thay_truong', 'Trang không có ScriptManager (không gửi kiểu UpdatePanel được)')
            target = dict(pairs).get('__EVENTTARGET') or button
            pairs = [(sm.group(1), f'{self._panel(target, panel)}|{target}')] + pairs + [('__ASYNCPOST', 'true')]
            headers = {'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest'}
        if files or 'multipart' in (self.form.get('enctype') or '').lower():
            data = pairs
            up = {self.name(k): (t[0], t[1], t[2] if len(t) > 2 else 'application/octet-stream') for k, t in (files or {}).items()}
            r, url, redirected, before = self._go('POST', action, data=data, files=up or {'': ('', b'')}, headers=headers or None)
        else:
            from urllib.parse import urlencode
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
            r, url, redirected, before = self._go('POST', action, data=urlencode(pairs), headers=headers)
        if async_:
            return self._delta(r)
        self._load(r, url, redirected)
        if urlparse(self.url).path.lower() == before:
            bad = self._validation_errors()
            if bad:
                raise WebFormError('du_lieu_khong_hop_le', 'Dữ liệu không hợp lệ: ' + '; '.join(bad), bad)
        return self

    def _delta(self, r):
        text = self._decode(r)
        items = self._parse_delta(text) if r.status_code < 500 else None
        if items is None:
            raise SourceResponseError('Hệ thống nguồn báo lỗi: ' + (self._server_error(max(r.status_code, 500), text) or 'phản hồi UpdatePanel không đúng dạng'))
        from bs4 import BeautifulSoup
        for typ, ident, content in items:
            if typ == 'error':
                raise SourceResponseError('Hệ thống nguồn báo lỗi: ' + _clean(content or ident))
            if typ == 'pageRedirect':
                to = urljoin(self.url, unquote(content))
                r2, url, _, _ = self._go('GET', to)
                self._load(r2, url, True)
                return self
            if typ == 'updatePanel':
                el = self.soup.find(id=ident)
                if el is not None:
                    el.clear()
                    for child in list(BeautifulSoup(content, 'html.parser').contents):
                        el.append(child)
            elif typ == 'hiddenField' and self.form is not None:
                h = self.form.find('input', attrs={'name': ident})
                if h is None:
                    h = self.soup.new_tag('input', type='hidden', attrs={'name': ident})
                    self.form.append(h)
                h['value'] = content
        self._pick_form()
        bad = self._validation_errors()
        if bad:
            raise WebFormError('du_lieu_khong_hop_le', 'Dữ liệu không hợp lệ: ' + '; '.join(bad), bad)
        return self

    @staticmethod
    def _parse_delta(text):
        """`độ dài|loại|id|nội dung|` (nội dung có thể chứa "|") ⇒ [(loại, id, nội dung)]; sai dạng ⇒ None."""
        items, i = [], 0
        while i < len(text):
            parts = []
            for _ in range(3):
                j = text.find('|', i)
                if j < 0:
                    return None
                parts.append(text[i:j])
                i = j + 1
            if not parts[0].isdigit():
                return None
            n = int(parts[0])
            if text[i + n:i + n + 1] != '|':
                return None
            items.append((parts[1], parts[2], text[i:i + n]))
            i += n + 1
        return items or None

    def postback(self, target, fields=None, async_=False, panel=None, argument=None):
        """Như __doPostBack(target, argument): AutoPostBack, LinkButton, phân trang GridView (argument='Page$2')."""
        t = self.name(target)
        fields = dict(fields or {})
        arg = argument if argument is not None else fields.pop('__EVENTARGUMENT', '')
        fields.pop('__EVENTARGUMENT', None)
        pairs = [p for p in self._apply(self._pairs(), fields) if p[0] not in ('__EVENTTARGET', '__EVENTARGUMENT')]
        return self._send([('__EVENTTARGET', t), ('__EVENTARGUMENT', str(arg))] + pairs, async_=async_, panel=panel)

    def submit(self, button=None, fields=None, files=None):
        """Bấm nút gửi `button` (None ⇒ gửi form không qua nút). files: {tên: (tên tệp, bytes, loại?)}."""
        pairs = [(k, '') if k in ('__EVENTTARGET', '__EVENTARGUMENT') else (k, v) for k, v in self._apply(self._pairs(), fields)]
        b = None
        if button:
            b = self.name(button)
            el = next((e for e in self._elements() if e.get('name') == b), None)
            if el is not None and (el.get('type') or '').lower() == 'image':
                pairs += [(b + '.x', '0'), (b + '.y', '0')]
            else:
                pairs.append((b, (el.get('value') or _clean(el.get_text())) if el is not None else ''))
        return self._send(pairs, button=b, files=files)

    # ---- đọc ----
    def select(self, sel):
        return self.soup.select_one(sel)

    def read(self, sel):
        """Chữ của phần tử (đã bỏ khoảng trắng thừa); không có ⇒ None."""
        el = self.soup.select_one(sel)
        return None if el is None else _clean(el.get_text())

    def value(self, sel):
        """Giá trị (thuộc tính value) của ô nhập; không có ⇒ None."""
        el = self.soup.select_one(sel)
        return None if el is None else el.get('value')

    def table(self, sel, links=False):
        """Bảng ⇒ list dict theo tiêu đề (hàng có th); bỏ hàng số trang của GridView. links=True ⇒ thêm `_links` (cột ⇒ href)."""
        t = self.soup.select_one(sel)
        if t is None:
            return []
        rows = [tr for tr in t.find_all('tr') if tr.find_parent('table') is t and not tr.find('table')]
        head = None
        if rows and rows[0].find('th'):
            head = [_clean(c.get_text()) for c in rows.pop(0).find_all(['th', 'td'])]
        out = []
        for tr in rows:
            cells = tr.find_all(['td', 'th'], recursive=False)
            if head is None:
                out.append([_clean(c.get_text()) for c in cells])
                continue
            row = {(k or f'cot_{i + 1}'): (_clean(cells[i].get_text()) if i < len(cells) else '') for i, k in enumerate(head)}
            if links:
                row['_links'] = {(k or f'cot_{i + 1}'): cells[i].find('a')['href'] for i, k in enumerate(head) if i < len(cells) and cells[i].find('a', href=True)}
            out.append(row)
        return out

    def next_page(self, grid):
        """Đối số trang sau của GridView phân trang số (vd 'Page$3'); hết trang ⇒ None."""
        full = self.name(grid)
        args = []
        for a in self.soup.find_all('a', href=True):
            for m in _POSTBACK.finditer(a['href']):
                if m.group(1) == full and m.group(2).startswith('Page$'):
                    args.append((m.group(2), _clean(a.get_text())))
        cur = None
        t = self.soup.find(id=full.replace('$', '_'))
        pager = next((tr for tr in (t.find_all('tr') if t else []) if tr.find('table')), None)
        if pager:
            span = next((s for s in pager.find_all('span') if _clean(s.get_text()).isdigit()), None)
            cur = int(_clean(span.get_text())) if span else None
        if cur is None:
            return None
        want = f'Page${cur + 1}'
        if any(a == want for a, _ in args):
            return want
        more = [a for a, txt in args if txt == '...' and a.split('$')[1].isdigit() and int(a.split('$')[1]) > cur]
        return more[0] if more else None


class Vala:
    def __init__(self, argv=None):
        p = argparse.ArgumentParser()
        p.add_argument('--preset')
        p.add_argument('--user', type=int)
        p.add_argument('--trigger', choices=['schedule', 'manual'])
        self.args, _ = p.parse_known_args(argv)
        url = os.environ.get('VALA_API_URL')
        token = os.environ.get('VALA_INTERNAL_TOKEN')
        if not url or not token:
            sys.exit('Thiếu VALA_API_URL hoặc VALA_INTERNAL_TOKEN — chạy "Đồng bộ Crawlab" trên cổng quản trị.')
        self.api = _Api(url, token)
        self.task_id = os.environ.get('CRAWLAB_TASK_ID')

    def targets(self, spider):
        body = {'spider': spider, 'crawlab_task_id': self.task_id}
        if self.args.preset:
            body['preset'] = self.args.preset
        if self.args.user is not None:
            body['user_id'] = self.args.user
        if self.args.trigger:
            body['trigger'] = self.args.trigger
        return self.api.post('/runs', body)

    def run(self, spider, crawl, max_fail_ratio=0.5, delay_s=0.3):
        plan = self.targets(spider)
        targets = plan.get('targets', [])
        print(f'[vala] spider={spider} preset={plan.get("preset")} người dùng={len(targets)}', flush=True)
        ok = failed = 0
        for t in targets:
            run = Run(self.api, t, delay_s=delay_s)
            try:
                run.session()
                try:
                    crawl(run)
                except SessionExpired:
                    # Trang trả 200 nhưng không phải trang đã đăng nhập (vd probe không thấy định danh).
                    run.refresh()
                    crawl(run)
                run._finish('ok')
                ok += 1
                print(f'[vala] user={run.user_id} ok, bản ghi={run.saved}, request={run.calls}', flush=True)
            except ApiError as e:
                # Backend đã tự đánh dấu lượt chạy (phiên mất/hết hạn, nguồn lỗi, sai mật khẩu, lệch schema…).
                failed += 1
                _safe_finish(run, e.type or 'api_error', e.detail or e.title)
                print(f'[vala] user={run.user_id} lỗi: {e.type} — {e.title}{" — " + e.detail if e.detail else ""}', flush=True)
            except SourceUnavailable as e:
                failed += 1
                _safe_finish(run, 'source_unavailable', f'Hệ thống nguồn đang lỗi: {e}')
                print(f'[vala] user={run.user_id} nguồn đang lỗi: {e}', flush=True)
            except SessionExpired as e:
                failed += 1
                _safe_finish(run, 'session_expired', str(e))
                print(f'[vala] user={run.user_id} hết phiên: {e}', flush=True)
            except SchemaDrift as e:
                failed += 1
                _safe_finish(run, 'schema_drift', str(e))
                print(f'[vala] user={run.user_id} lệch schema: {e}', flush=True)
            except Exception as e:  # lỗi của một người không làm hỏng cả lượt
                failed += 1
                _safe_finish(run, 'spider_error', f'{type(e).__name__}: {e}')
                print(f'[vala] user={run.user_id} lỗi spider: {type(e).__name__}: {e}', flush=True)
        total = ok + failed
        print(f'[vala] xong: ok={ok} lỗi={failed}', flush=True)
        if total and failed / total > max_fail_ratio:
            sys.exit(1)


def _safe_finish(run, code, detail):
    try:
        run._finish('failed', code, detail)
    except Exception:
        pass
