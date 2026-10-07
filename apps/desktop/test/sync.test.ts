import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, session: {}, webContents: {}, app: {} }));
vi.mock('../src/settings', () => ({ getSettings: () => ({ lang: 'vi', deviceToken: 't' }) }));
vi.mock('../src/cookies', async (orig) => ({
  ...(await orig<typeof import('../src/cookies')>()),
  readCookies: vi.fn(async () => ({ cookies: { valaToken: 'x', meId: 'u', companyId: 'c' }, expires: {} })),
}));
vi.mock('../src/api', async () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly type: string, title: string, readonly detail?: string) { super(title); }
  }
  return { ApiError, api: vi.fn() };
});

const { api, ApiError } = await import('../src/api');
const { syncSource, statusOf } = await import('../src/sync');

const etask = {
  code: 'etask', ten: 'eTask', origin: 'https://etask.bkav.com', login_url: 'https://etask.bkav.com/',
  cookie_names: ['valaToken', 'meId', 'companyId'], stable_cookies: ['meId', 'companyId'], cookie_domain: 'bkav.com',
  state: 'active' as const, auth_method: 'extension' as const, managed: false, last_error: null,
};

afterEach(() => { vi.useRealTimers(); vi.mocked(api).mockReset(); });

describe('syncSource — máy chủ chặn vì gửi phiên quá dày (429)', () => {
  it('không báo lỗi, đợi rồi gửi lại một lần', async () => {
    vi.useFakeTimers();
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Gửi phiên quá dày, thử lại sau vài giây'))
      .mockResolvedValueOnce({ status: 'active' });
    const p = syncSource({ ...etask }, true);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toBe('sent');
    expect(api).toHaveBeenCalledTimes(2);
    expect(statusOf('etask')?.result).toBe('sent');
  });
  it('gửi lại vẫn bị chặn ⇒ mới báo lỗi, không gửi lại mãi', async () => {
    vi.useFakeTimers();
    vi.mocked(api).mockRejectedValue(new ApiError(429, 'rate_limited', 'Gửi phiên quá dày, thử lại sau vài giây'));
    const p = syncSource({ ...etask }, true);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toBe('error');
    expect(api).toHaveBeenCalledTimes(2);
  });
});
