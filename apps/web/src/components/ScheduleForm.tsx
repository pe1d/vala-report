import { useEffect, useState } from 'react';
import { api, fmtDateTime, type Preset } from '../api';
import { ErrorBox } from './States';
import { Button, Card, Field, Muted, Select } from './ui';

/** Chọn preset và xem các lần chạy kế tiếp. Người dùng không bao giờ thấy hay nhập cron. */
export function ScheduleForm({ reportCode, params, onDone }: { reportCode: string; params: Record<string, unknown>; onDone: () => void }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState('hang_ngay_07');
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<Preset[]>('/presets').then(setPresets, setErr); }, []);
  const cur = presets.find((p) => p.code === preset);
  const save = async () => {
    setSaving(true); setErr(null);
    try { await api.post('/subscriptions', { report_code: reportCode, params, schedule_preset: preset }); onDone(); }
    catch (e) { setErr(e); } finally { setSaving(false); }
  };
  return (
    <Card className="my-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Lịch chạy">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {presets.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </Select>
        </Field>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>Lưu lịch</Button>
        <Button onClick={onDone}>Huỷ</Button>
      </div>
      {cur && <Muted className="mt-3">Các lần chạy kế tiếp: <span className="tabular-nums">{cur.next_runs.map(fmtDateTime).join(' · ')}</span></Muted>}
      <Muted className="mt-1">Khoảng thời gian như “Tháng hiện tại” tự trượt theo ngày chạy.</Muted>
      {err ? <ErrorBox error={err} /> : null}
    </Card>
  );
}
