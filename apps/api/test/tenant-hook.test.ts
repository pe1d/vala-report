import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { currentTenant, Problem } from '@vala/core';
import { sign } from '../src/tokens';
import { installTenantHook } from '../src/tenant-hook';

const SECRET = 'x'.repeat(32);
const STATUS: Record<string, string> = { bkav: 'hoat_dong', thu: 'hoat_dong', khoa: 'tam_khoa' };

async function get(headers: Record<string, string>) {
  const a = Fastify();
  a.setErrorHandler((err, _req, reply) => reply.status(err instanceof Problem ? err.status : 500).send({ e: err.message }));
  installTenantHook(a, { jwtSecret: SECRET, internalToken: 'noi-bo-123', status: async (m) => (STATUS[m] ?? null) as never });
  // Hook con (như authenticate) và handler đều phải thấy ngữ cảnh, kể cả sau await.
  a.register(async (child) => {
    child.addHook('onRequest', async (req) => { await new Promise((r) => setTimeout(r, 1)); (req as unknown as { seen: string }).seen = currentTenant(); });
    child.get('/t', async (req) => { await new Promise((r) => setTimeout(r, 2)); return { t: currentTenant(), hook: (req as unknown as { seen: string }).seen }; });
  });
  return a.inject({ method: 'GET', url: '/t', headers });
}
const jwt = (p: Record<string, unknown>) => `Bearer ${sign({ uid: 1, kind: 'portal', ...p }, SECRET, 60)}`;

describe('hook đơn vị', () => {
  it('không token ⇒ bkav', async () => expect((await get({})).json()).toEqual({ t: 'bkav', hook: 'bkav' }));
  it('JWT có tnt ⇒ đơn vị đó (hook con + handler, sau await); không có tnt (token cũ) ⇒ bkav', async () => {
    expect((await get({ authorization: jwt({ tnt: 'thu' }) })).json()).toEqual({ t: 'thu', hook: 'thu' });
    expect((await get({ authorization: jwt({}) })).json()).toEqual({ t: 'bkav', hook: 'bkav' });
  });
  it('token thiết bị vxt_<mã>.… ⇒ đơn vị; vxt_ cũ ⇒ bkav', async () => {
    expect((await get({ authorization: 'Bearer vxt_thu.abcdefghijklmnopqrstuvwxyz' })).json()).toMatchObject({ t: 'thu' });
    expect((await get({ authorization: 'Bearer vxt_abcdefghijklmnopqrstuvwxyz' })).json()).toMatchObject({ t: 'bkav' });
  });
  it('X-Vala-Tenant chỉ có tác dụng kèm token nội bộ', async () => {
    expect((await get({ authorization: 'Bearer noi-bo-123', 'x-vala-tenant': 'thu' })).json()).toMatchObject({ t: 'thu' });
    expect((await get({ 'x-vala-tenant': 'thu' })).json()).toMatchObject({ t: 'bkav' });
    expect((await get({ authorization: jwt({}), 'x-vala-tenant': 'thu' })).json()).toMatchObject({ t: 'bkav' });
  });
  it('đơn vị tạm khoá / không tồn tại ⇒ 401', async () => {
    expect((await get({ authorization: jwt({ tnt: 'khoa' }) })).statusCode).toBe(401);
    expect((await get({ authorization: 'Bearer vxt_khong.abcdefghijklmnopqrstuvwxyz' })).statusCode).toBe(401);
  });
  it('JWT chữ ký sai ⇒ không tin tnt (bkav — authenticate sẽ từ chối sau)', async () => {
    const bad = `Bearer ${sign({ uid: 1, kind: 'portal', tnt: 'thu' }, 'y'.repeat(32), 60)}`;
    expect((await get({ authorization: bad })).json()).toMatchObject({ t: 'bkav' });
  });
});
