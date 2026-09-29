import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../env.js';
import type { Tx } from '../db/index.js';
import { readFileSync } from 'node:fs';
import { parseSpec, type AdapterSpec } from './spec.js';

const REPO_DIR = join(REPO_ROOT, 'adapters');
let cache: Array<{ file: string; text: string; spec: AdapterSpec }> | undefined;
let provider: (() => AdapterSpec[]) | null = null;

/**
 * adapters/*.yaml trong repo — chỉ còn là MẪU KHỞI TẠO: lần chạy đầu SourceRegistry chép vào CSDL
 * (core.source_systems.adapter_yaml), từ đó cấu hình trong CSDL mới là nguồn sự thật.
 */
export function repoSpecFiles(dir = REPO_DIR): Array<{ file: string; text: string; spec: AdapterSpec }> {
  const read = () => readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    return { file: f, text, spec: parseSpec(text) };
  });
  if (dir !== REPO_DIR) return read();
  if (!cache) cache = read();
  return cache;
}

/** Tiến trình đã nạp cấu hình từ CSDL (SourceRegistry.install) ⇒ mọi nơi gọi loadAllSpecs() dùng cấu hình đó. */
export function setSpecProvider(p: (() => AdapterSpec[]) | null): void {
  provider = p;
}

/** Mọi adapter đang dùng: theo CSDL nếu đã nạp, không thì theo file mẫu trong repo (test, công cụ). */
export function loadAllSpecs(dir?: string): AdapterSpec[] {
  if (!dir && provider) return provider();
  return repoSpecFiles(dir).map((x) => x.spec);
}

export function findSpec(source: string, capabilityId: string, specs = loadAllSpecs()): AdapterSpec {
  const s = specs.find((x) => x.source_system === source && x.capabilities.some((c) => c.id === capabilityId));
  if (!s) throw new Error(`Không có adapter cho ${source}/${capabilityId}`);
  return s;
}

/** Ghi spec đang dùng vào core.adapters (một bản active cho mỗi source × capability). */
export async function registerSpecs(t: Tx, specs = loadAllSpecs()): Promise<void> {
  for (const spec of specs) {
    for (const cap of spec.capabilities) {
      await t.none(
        `UPDATE core.adapters SET is_active = false
          WHERE source_system = $1 AND capability = $2 AND version <> $3 AND is_active`,
        [spec.source_system, cap.id, spec.version],
      );
      await t.none(
        `INSERT INTO core.adapters (source_system, capability, version, spec, schema_baseline, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, true, 'worker')
         ON CONFLICT (source_system, capability, version)
         DO UPDATE SET spec = EXCLUDED.spec, schema_baseline = EXCLUDED.schema_baseline, is_active = true`,
        [spec.source_system, cap.id, spec.version, JSON.stringify(spec), JSON.stringify(spec.monitoring.schema_baseline_fields)],
      );
    }
  }
}
