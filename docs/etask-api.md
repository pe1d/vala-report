# API eTask thật (serviceetask.bkav.com) — khảo sát 29/09/2026

Khảo sát từ phiên thật của người dùng (DevTools + gọi lại bằng script). Không chứa bí mật.

## Cơ chế
- Portal (đăng nhập, cookie): `etask.bkav.com`. **API: `serviceetask.bkav.com`**. Cookie ở tên miền `bkav.com` nên áp dụng cho cả hai.
- Xác thực: **cookie** (`valaToken` HttpOnly + `meId`, `companyId` do JS đặt) **+ header `Company-Id: <companyId>`** (bắt buộc; thiếu → lỗi). Không thấy cần `x-header` trong lần thử này.
- `meId` = userId của người dùng (vd 140874927562340). `companyId` = id công ty (vd 71124658431777).
- Kiểu phản hồi chung: `{ "<Entity>": { "<id>": { "data": {…} } }, "Has<Entity>": { "<companyId>": { itemIds:[…] } } }`.

## Danh sách "Việc của tôi" (inbox)
```
GET /v2/{userId}/issues?query={q}&inbox=true&limit={n}&maxscore=0&minscore=0
Header: Company-Id: {companyId}
```
`{q}` (chưa URL-encode), lọc việc của tôi chưa xong:
```
companyId="{companyId}" AND memberIds in "{userId}" AND hasIssue.archived="false"
  AND statusType <= "2" ORDER BY hasIssue.allIssueScore desc LIMIT 0,{n}
```
- `statusType <= "2"` = việc chưa xong (type 1+2). Bỏ điều kiện này để lấy cả việc đã xong.
- Phân trang qua `LIMIT offset,count` trong query và `limit=` trên URL.

### Trường của một việc — `Issue.<id>.data`
| trường | ý nghĩa |
|---|---|
| `id` | id nội bộ |
| `key` | mã việc (hiển thị) |
| `summary` / `summaryMd` | tiêu đề |
| `description` / `descriptionMd` | mô tả |
| `statusId` | → IssueStatus (bảng dưới) |
| `priorityId` | → IssuePriority |
| `typeId` | → IssueType |
| `assigneeId`, `assigneeIds[]` | người thực hiện |
| `reporterId` | người tạo/giao |
| `userId` | chủ sở hữu |
| `projectId`, `parentId`, `parentName` | dự án / việc cha |
| `start`, `end` | epoch ms — bắt đầu / hạn (deadline) |
| `createdTime`, `lastUpdateTime` | epoch ms |
| `timeTodo`, `timeDone` | thời lượng |
| `extend.fields.<fieldId>` | trường tuỳ biến |

## Bảng mã
### Trạng thái — `GET /{workflowSchemeId}/workflows` → `IssueStatus.<id>.data` (scheme mặc định `431352156327527`)
`type`: 1 = chưa làm, 2 = đang làm, 3 = xong.
| id | name | type | identifier |
|---|---|---|---|
| 430115205745823 | Việc cần làm | 1 | todo |
| 78271484576083 | Việc mới tạo | 1 | open |
| 430115205778781 | Chưa hoàn thành | 1 | unresolved |
| 78271485414673 | Góp ý, phản hồi | 1 | — |
| 148640228696512 | Đang thực hiện | 2 | in_progress |
| 500483949955388 | Chờ duyệt | 2 | wait_approved |
| 78271485558559 | Chờ test | 2 | — |
| 78271485558556 | Tạm dừng | 2 | — |
| 359746461607191 | Không được duyệt | 2 | not_approved |
| 430115205398936 | Đã hoàn thành | 3 | done |

### Độ ưu tiên — `GET /default_issue_priorities` → `IssuePriority.<id>.data`
| id | name | identifier |
|---|---|---|
| 429840327966695 | Rất cao | high_priority |
| 500209072143207 | Cao | medium_priority |
| 218734094497606 | Không ưu tiên | no_priority |
| (còn Thấp/Trung bình — lấy đủ khi chạy thật) | | |

### Loại việc — `GET /{companyId}/issue_types` → `IssueType.<id>.data.{name,identifier,supportType}`
Việc thường (task), Lỗi (bug), Ý tưởng (story), Việc cần duyệt (approve_task), Việc phụ (sub_task), Việc cá nhân (not_approve_task), Kế hoạch ngày/tuần/tháng, Sprint…

## Endpoint khác
- `GET /permissions` — quyền (dùng làm probe kiểm tra phiên: 200 + JSON khi phiên sống).
- `GET /issue/{id}?type=full` — chi tiết một việc.
- `GET /{id}/comments`, `/{id}/attachments`, `/{id}/issue_links`, `/{id}/members`.
- `POST /count_issue` — đếm (GET báo "invalid input" → cần payload/POST).
- Người thực hiện/người giao là id; giải mã tên qua endpoint members (chưa khảo sát chi tiết).
