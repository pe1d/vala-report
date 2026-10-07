import { describe, expect, it } from 'vitest';
import type { AdapterSpec } from '../src/adapter/index';
import { ConnectionSessions } from '../src/connections';
import { MemorySecretStore, vaultRef } from '../src/secrets';

// Adapter tối thiểu: session_probe GET /api/me, lấy puid từ JSON.
const spec = {
  id: 'thu', version: '1', source_system: 'thu', execution: 'server', transport: 'http_api',
  auth: { type: 'delegated_session', vault_ref: 'x', cookies_required: ['SID'], cookies_optional: [], stable_cookies: [], api_headers: {},
    session_probe: { request: { method: 'GET', path: '/api/me' }, extract: { puid: { type: 'regex', pattern: '"id":"(\\w+)"', group: 1 } } } },
  allowed_endpoints: [{ method: 'GET', path: '/api/me' }],
  rate_limit: { max_requests_per_minute: 60, delay_between_calls_ms: 0 },
  capabilities: [], monitoring: { schema_baseline_fields: [] },
} as unknown as AdapterSpec;

function setup(respond: (cookie: string) => Response) {
  const secrets = new MemorySecretStore();
  const seen: string[] = [];
  const conn = new ConnectionSessions({
    secrets, tenant: 't', specs: [spec],
    sourceInfo: async () => ({ baseUrl: 'https://nguon.example', loginHosts: [] }),
    fetchImpl: async (_url, init) => { const c = (init.headers as Record<string, string>).Cookie ?? ''; seen.push(c); return respond(c); },
  });
  return { secrets, conn, seen, ref: vaultRef('t', 7, 'thu') };
}
const ok = (headers: Record<string, string> = {}) => new Response('{"id":"u1"}', { status: 200, headers });

describe('giữ phiên (keepAlive)', () => {
  it('phiên sống ⇒ alive, gửi đúng cookie đang lưu, không đổi gì', async () => {
    const { secrets, conn, seen, ref } = setup(() => ok());
    await secrets.put(ref, { cookies: { SID: 'cu' }, obtained_at: 'x' });
    expect(await conn.keepAlive(7, 'thu')).toEqual({ state: 'alive', rotated: 0 });
    expect(seen).toEqual(['SID=cu']);
    expect((await secrets.get<{ cookies: Record<string, string> }>(ref))!.cookies).toEqual({ SID: 'cu' });
  });
  it('nguồn cấp cookie mới (Set-Cookie) ⇒ lưu đè; cookie lạ / lệnh xoá cookie bị bỏ qua', async () => {
    const h = new Headers();
    h.append('set-cookie', 'SID=moi; Path=/; HttpOnly');
    h.append('set-cookie', 'Khac=x; Path=/');
    const { secrets, conn, ref } = setup(() => new Response('{"id":"u1"}', { status: 200, headers: h }));
    await secrets.put(ref, { cookies: { SID: 'cu' }, obtained_at: 'x' });
    expect(await conn.keepAlive(7, 'thu')).toEqual({ state: 'alive', rotated: 1 });
    expect((await secrets.get<{ cookies: Record<string, string> }>(ref))!.cookies).toEqual({ SID: 'moi' });

    const h2 = new Headers(); h2.append('set-cookie', 'SID=; Max-Age=0; Path=/');
    const b = setup(() => new Response('{"id":"u1"}', { status: 200, headers: h2 }));
    await b.secrets.put(b.ref, { cookies: { SID: 'cu' }, obtained_at: 'x' });
    expect((await b.conn.keepAlive(7, 'thu')).rotated).toBe(0);
  });
  it('nguồn từ chối phiên (302 sang trang đăng nhập / 401) ⇒ expired', async () => {
    const { secrets, conn, ref } = setup(() => new Response(null, { status: 302, headers: { location: 'https://sso.example/login' } }));
    await secrets.put(ref, { cookies: { SID: 'cu' }, obtained_at: 'x' });
    expect((await conn.keepAlive(7, 'thu')).state).toBe('expired');
  });
  it('nguồn lỗi 5xx ⇒ unavailable (không coi là hết hạn); không có phiên ⇒ missing', async () => {
    const { secrets, conn, ref } = setup(() => new Response('lỗi', { status: 503 }));
    expect((await conn.keepAlive(7, 'thu')).state).toBe('missing');
    await secrets.put(ref, { cookies: { SID: 'cu' }, obtained_at: 'x' });
    expect((await conn.keepAlive(7, 'thu')).state).toBe('unavailable');
  });
});
