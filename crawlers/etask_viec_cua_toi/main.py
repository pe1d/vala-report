"""
Spider eTask — việc được giao cho tôi.

Khảo sát API thật 29/09/2026 (xem docs/etask-api.md):
  - Portal đăng nhập: etask.bkav.com. API: serviceetask.bkav.com. Cookie ở tên miền bkav.com.
  - Xác thực: cookie (valaToken/meId/companyId) + header "Company-Id: {companyId}".
  - meId = userId của người dùng; companyId = id công ty.
  - Danh sách việc: GET /v2/{userId}/issues?query=...&inbox=true&limit=N  (phản hồi là đồ thị
    theo id: Issue.<id>.data). Bảng mã trạng thái/độ ưu tiên/loại lấy từ các endpoint riêng.

Spider chỉ đọc; enrich id→tên tại đây rồi gửi bản ghi phẳng, backend chuẩn hoá theo adapters/etask.tasks.yaml.
Không in cookie/nội dung phiên ra log.
"""
from datetime import datetime, timezone

from vala_sdk import SchemaDrift, SessionExpired, Vala

API_BASE = 'https://serviceetask.bkav.com'
PAGE = 100          # LIMIT mỗi trang
MAX_ISSUES = 5000   # chặn trên an toàn


def _entity(body, name):
    """Lấy nhánh {name: {id: {data: {...}}}} → dict id→data."""
    branch = (body or {}).get(name) or {}
    return {i: (v or {}).get('data') or {} for i, v in branch.items() if isinstance(v, dict)}


def _date(ms):
    """epoch ms (số hoặc chuỗi số) → 'YYYY-MM-DD' theo giờ VN; rỗng → None."""
    try:
        n = int(ms)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return datetime.fromtimestamp(n / 1000, tz=timezone.utc).astimezone().strftime('%Y-%m-%d')


def _default_issue_scheme(run):
    """Id workflow_scheme mặc định cho Issue (để lấy bảng trạng thái có tên)."""
    body = run.get('/{}/workflow_schemes?maxscore=0&minscore=0'.format(run.company_id)).json()
    for sid, v in _entity(body, 'WorkflowScheme').items():
        if v.get('supportType') == 'Issue' and v.get('identifier') == 'default':
            return sid
    schemes = _entity(body, 'WorkflowScheme')
    for sid, v in schemes.items():
        if v.get('supportType') == 'Issue':
            return sid
    return next(iter(schemes), None)


def _lookups(run):
    """Bảng mã id→tên cho trạng thái, độ ưu tiên, loại việc."""
    statuses, status_type = {}, {}
    scheme = _default_issue_scheme(run)
    if scheme:
        wf = run.get('/{}/workflows?maxscore=0&minscore=0'.format(scheme)).json()
        for sid, d in _entity(wf, 'IssueStatus').items():
            statuses[sid] = d.get('name')
            status_type[sid] = str(d.get('type') or '')
    prio = run.get('/default_issue_priorities').json()
    priorities = {i: d.get('name') for i, d in _entity(prio, 'IssuePriority').items()}
    types_body = run.get('/{}/issue_types?active=2&maxscore=0&minscore=0'.format(run.company_id)).json()
    types = {i: d.get('name') for i, d in _entity(types_body, 'IssueType').items()}
    return statuses, status_type, priorities, types


def crawl(run):
    # Cookie do backend cấp: lấy meId (userId) và companyId để dựng URL + header.
    cookies = run.session_cookies
    user_id = cookies.get('meId')
    company_id = cookies.get('companyId')
    if not user_id or not company_id:
        raise SessionExpired('thiếu cookie meId/companyId — phiên eTask chưa đủ')
    run.account(user_id)

    # API eTask ở tên miền khác portal (serviceetask); cookie bkav.com vẫn áp dụng. Thêm header bắt buộc.
    run.use_api_base(API_BASE)
    run.company_id = company_id
    run.http.headers['Company-Id'] = company_id

    statuses, status_type, priorities, types = _lookups(run)

    def q(offset):
        return (
            'companyId="{c}" AND memberIds in "{u}" AND hasIssue.archived="false" '
            'ORDER BY hasIssue.lastUpdateTime desc LIMIT {o},{n}'
        ).format(c=company_id, u=user_id, o=offset, n=PAGE)

    records, offset = [], 0
    while offset < MAX_ISSUES:
        body = run.get(
            '/v2/{}/issues'.format(user_id),
            params={'query': q(offset), 'inbox': 'true', 'limit': str(PAGE), 'maxscore': '0', 'minscore': '0'},
        ).json()
        if 'Issue' not in body:
            raise SchemaDrift('phản hồi issues không còn nhánh "Issue"')
        page = _entity(body, 'Issue')
        if not page:
            break
        for d in page.values():
            done = status_type.get(d.get('statusId')) == '3'
            records.append({
                'ma_cong_viec': d.get('key') or d.get('id'),
                'tieu_de': d.get('summary'),
                'mo_ta_ngan': (d.get('description') or '')[:500],
                'nguoi_giao': d.get('reporterId'),
                'nguoi_thuc_hien_id': d.get('assigneeId'),
                'trang_thai': statuses.get(d.get('statusId')) or d.get('statusId'),
                'trang_thai_type': status_type.get(d.get('statusId')),
                'do_uu_tien': priorities.get(d.get('priorityId')) or d.get('priorityId'),
                'loai': types.get(d.get('typeId')) or d.get('typeId'),
                'ngay_giao': _date(d.get('start')) or _date(d.get('createdTime')),
                'han_hoan_thanh': _date(d.get('end')),
                'ngay_hoan_thanh': _date(d.get('lastUpdateTime')) if done else None,
            })
        if len(page) < PAGE:
            break
        offset += PAGE

    run.save('my_tasks', records)


if __name__ == '__main__':
    Vala().run('etask_viec_cua_toi', crawl)
