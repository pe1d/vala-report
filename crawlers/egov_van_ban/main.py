"""
Spider eGov — văn bản theo thư mục (port của adapters/egov.documents.yaml).

Ba endpoint đã kiểm chứng trên egov.bkav.com:
  GET  /Home/Index                              → puid (egov.userid = N;)
  GET  /Home/GetFunctionByParentId?parentId=0   → danh sách thư mục
  POST /home/GetDocuments                       → văn bản trong một thư mục
Luôn gửi đúng puid của phiên đang dùng (tài liệu kỹ thuật mục 07).
"""
import re

from vala_sdk import SchemaDrift, SessionExpired, Vala

PUID = re.compile(r'egov\.userid\s*=\s*(\d+)\s*;')


def crawl(run):
    home = run.get('/Home/Index')
    m = PUID.search(home.text)
    if not m:
        raise SessionExpired('không thấy egov.userid trên /Home/Index')
    puid = m.group(1)
    run.account(puid)

    nodes = run.get('/Home/GetFunctionByParentId', params={'parentId': 0, 'puid': puid}).json()
    if not isinstance(nodes, list):
        raise SchemaDrift('GetFunctionByParentId không còn trả về danh sách')

    for node in nodes:
        r = run.post('/home/GetDocuments', data={
            'id': node['functionId'], 'paramsQuery': node.get('params') or '[]', 'puid': puid,
        })
        body = r.json()
        if 'documents' not in body:
            raise SchemaDrift('GetDocuments không còn trường documents')
        run.save('documents_by_node', body['documents'],
                 context={'node_id': node['functionId'], 'node_ten': node.get('name')},
                 meta={'page_size': body.get('pageSize')})


if __name__ == '__main__':
    Vala().run('egov_van_ban', crawl)
