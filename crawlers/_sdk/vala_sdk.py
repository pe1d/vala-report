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

Biến môi trường (Crawlab đặt sẵn qua "Environments", do "Đồng bộ Crawlab" cấu hình):
    VALA_API_URL, VALA_INTERNAL_TOKEN, CRAWLAB_TASK_ID (Crawlab tự đặt)
Tham số dòng lệnh: --preset <preset> (lịch cố định truyền vào), --user <id> (chạy riêng một người)
"""
import argparse
import os
import sys
import time
from urllib.parse import urlparse

import requests

__all__ = ['Vala', 'Run', 'SessionExpired', 'SchemaDrift', 'ApiError']

REDIRECT_OR_DENIED = {301, 302, 303, 307, 308, 401, 403}


class SessionExpired(Exception):
    """Phiên của người dùng không còn dùng được trên hệ thống nguồn."""


class SchemaDrift(Exception):
    """Hệ thống nguồn đã đổi cấu trúc dữ liệu (mất trường/khối dữ liệu mong đợi)."""


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
    def session(self, refresh=False):
        s = self._api.post(f'/runs/{self.run_id}/session', {'refresh': refresh})
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

    def refresh(self):
        """Xin backend phiên mới (tối đa một lần mỗi người mỗi lượt chạy)."""
        if self._refreshed:
            raise SessionExpired('phiên vẫn hỏng sau khi đã lấy phiên mới')
        self._refreshed = True
        self.session(refresh=True)

    # ---- gọi hệ thống nguồn ----
    def _throttle(self):
        wait = self._last + self._delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _request(self, method, path, **kw):
        if not path.startswith('/'):
            raise ValueError('path phải bắt đầu bằng / (chỉ gọi trong hệ thống nguồn của kết nối)')
        for attempt in (1, 2):
            self._throttle()
            self.calls += 1
            r = self.http.request(method, self.base_url + path, allow_redirects=False, timeout=30, **kw)
            if r.status_code not in REDIRECT_OR_DENIED:
                r.raise_for_status()
                # .json() lỗi thì báo rõ request nào — thay vì JSONDecodeError trơn không biết ở đâu.
                r.json = lambda *a, _r=r, _m=method, _p=path, **k: _json_or_explain(_r, _m, _p)
                return r
            if attempt == 1 and not self._refreshed:
                self.refresh()
                continue
            raise SessionExpired(f'{method} {path} → {r.status_code}')

    def get(self, path, **kw):
        return self._request('GET', path, **kw)

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


class Vala:
    def __init__(self, argv=None):
        p = argparse.ArgumentParser()
        p.add_argument('--preset')
        p.add_argument('--user', type=int)
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
                # Backend đã tự đánh dấu lượt chạy (hết phiên, sai mật khẩu, lệch schema…).
                failed += 1
                _safe_finish(run, e.type or 'api_error', e.title)
                print(f'[vala] user={run.user_id} lỗi: {e.type} — {e.title}', flush=True)
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
