import { api, periodLabel, type JsonProp } from '../api';
import { useAsync } from '../hooks';
import { Field, Input, Select } from './ui';
import { messages, useT } from '../i18n';

const M = messages({ all: 'Tất cả' }, { all: 'All' });

/** Form sinh từ param_schema của báo cáo. Chỉ hỗ trợ các kiểu mà danh mục bản 1 dùng. */
export function ParamForm({ code, props, value, onChange }: {
  code: string; props: Record<string, JsonProp>; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void;
}) {
  useT(M);   // đăng ký đổi ngôn ngữ để nhãn khoảng thời gian (periodLabel) vẽ lại
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v === '' || v === undefined ? undefined : v });
  const custom = value.khoang_thoi_gian === 'tuy_chon';
  return (
    <>
      {Object.entries(props).map(([k, p]) => {
        const label = p.title ?? k;
        if ((k === 'tu_ngay' || k === 'den_ngay') && !custom) return null;
        if (k === 'khoang_thoi_gian') {
          return (
            <Field key={k} label={label}>
              <Select value={String(value[k] ?? 'thang_hien_tai')} onChange={(e) => set(k, e.target.value)}>
                {p.enum?.map((o) => <option key={o} value={o}>{periodLabel(o)}</option>)}
              </Select>
            </Field>
          );
        }
        if (p.type === 'array' && p['x-options']) {
          return <OptionsField key={k} code={code} name={k} label={label} numeric={p.items?.type === 'integer'}
            value={value[k] as unknown[] | undefined} onChange={(v) => set(k, v)} />;
        }
        if (p.format === 'date') {
          return <Field key={k} label={label}><Input type="date" value={String(value[k] ?? '')} onChange={(e) => set(k, e.target.value)} /></Field>;
        }
        if (p.type === 'integer') {
          return <Field key={k} label={label}><Input type="number" min={p.minimum} max={p.maximum} value={String(value[k] ?? '')}
            onChange={(e) => set(k, e.target.value ? Number(e.target.value) : undefined)} /></Field>;
        }
        return <Field key={k} label={label}><Input value={String(value[k] ?? '')} onChange={(e) => set(k, e.target.value)} /></Field>;
      })}
    </>
  );
}

/** Lọc theo một giá trị, danh sách lấy từ chính dữ liệu người xem được thấy (GET /reports/:code/options/:param). */
function OptionsField({ code, name, label, numeric, value, onChange }: {
  code: string; name: string; label: string; numeric: boolean; value: unknown[] | undefined; onChange: (v: unknown[] | undefined) => void;
}) {
  const t = useT(M);
  const opts = useAsync(() => api.get<Array<{ value: unknown; label: string }>>(`/reports/${code}/options/${name}`), [code, name]);
  const cur = value?.[0];
  return (
    <Field label={label}>
      <Select value={cur === undefined ? '' : String(cur)} disabled={opts.loading}
        onChange={(e) => onChange(e.target.value ? [numeric ? Number(e.target.value) : e.target.value] : undefined)}>
        <option value="">{t.all}</option>
        {opts.data?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </Select>
    </Field>
  );
}
