import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
  return dir;
}

export const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

// Biến môi trường thật (docker, CI) được ưu tiên hơn file .env.
config({ path: join(REPO_ROOT, '.env'), override: false, quiet: true });

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

export function envBool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export const TENANT = process.env.TENANT ?? 'tenant_bkav';
