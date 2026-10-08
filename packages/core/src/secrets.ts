import { env } from './env.js';

/**
 * Giá trị phiên của một người dùng với một hệ thống nguồn. CHỈ nằm trong vault.
 * Không log, không trả qua API, không ghi vào bảng nào (mục 07).
 */
export interface SessionSecret {
  cookies: Record<string, string>;
  obtained_at: string;
  expires_at?: string;
  refresh_token?: string;
}

export interface SecretStore {
  get<T extends object = SessionSecret>(ref: string): Promise<T | null>;
  put(ref: string, value: object): Promise<void>;
  /** Xoá hẳn mọi phiên bản — thu hồi phải làm phiên biến mất, không chỉ đánh dấu xoá. */
  destroy(ref: string): Promise<void>;
}

/** `source` là mã hệ thống nguồn, hoặc 'sso' cho refresh token SSO dùng chung cho mọi hệ thống. */
export function vaultRef(tenant: string, userId: number, source: string): string {
  return `vault://${tenant}/users/${userId}/${source}`;
}

export function refToPath(ref: string): string {
  const m = /^vault:\/\/([a-z0-9_]+)\/users\/(\d+)\/([a-z0-9_]+)$/.exec(ref);
  if (m) return `${m[1]}/users/${m[2]}/${m[3]}`;
  // Bí mật của một đơn vị (nhiều đơn vị): client secret SSO — vault://core/tenants/<mã>/sso.
  const t = /^vault:\/\/core\/tenants\/([a-z][a-z0-9]{1,19})\/(sso)$/.exec(ref);
  if (t) return `core/tenants/${t[1]}/${t[2]}`;
  throw new Error('vault_ref không hợp lệ');
}

export class MemorySecretStore implements SecretStore {
  readonly data = new Map<string, object>();
  async get<T extends object = SessionSecret>(ref: string) {
    return (this.data.get(refToPath(ref)) as T | undefined) ?? null;
  }
  async put(ref: string, value: object) {
    this.data.set(refToPath(ref), structuredClone(value));
  }
  async destroy(ref: string) {
    this.data.delete(refToPath(ref));
  }
}

/** HashiCorp Vault, KV v2. */
export class VaultKvStore implements SecretStore {
  constructor(private readonly addr: string, private readonly token: string, private readonly mount = 'secret') {}

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.addr}/v1/${this.mount}/${path}`, {
      method,
      headers: { 'X-Vault-Token': this.token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Vault ${method} ${this.mount}/${path.split('/')[0]}/… → ${res.status}`);
    return res;
  }

  async get<T extends object = SessionSecret>(ref: string) {
    const res = await this.call('GET', `data/${refToPath(ref)}`);
    if (res.status === 404) return null;
    const json = (await res.json()) as { data?: { data?: T } };
    return json.data?.data ?? null;
  }

  async put(ref: string, value: object) {
    await this.call('POST', `data/${refToPath(ref)}`, { data: value });
  }

  async destroy(ref: string) {
    await this.call('DELETE', `metadata/${refToPath(ref)}`);
  }
}

let shared: SecretStore | undefined;

export function secretStore(): SecretStore {
  if (shared) return shared;
  const kind = process.env.SECRET_STORE ?? 'vault';
  shared = kind === 'memory'
    ? new MemorySecretStore()
    : new VaultKvStore(env('VAULT_ADDR'), env('VAULT_TOKEN'), process.env.VAULT_KV_MOUNT ?? 'secret');
  return shared;
}

export function setSecretStore(store: SecretStore): void {
  shared = store;
}
