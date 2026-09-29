/**
 * JSONPath tối giản, đủ cho spec: `$`, `.ten`, `['ten']`, `[n]`, `[*]`.
 * Có `[*]` ⇒ luôn trả mảng; không có ⇒ trả một giá trị (hoặc undefined).
 */
type Token = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'wildcard' };

function tokenize(path: string): Token[] {
  if (!path.startsWith('$')) throw new Error(`JSONPath phải bắt đầu bằng $: ${path}`);
  const tokens: Token[] = [];
  const re = /\.([A-Za-z_$][\w$]*)|\[\*\]|\[(\d+)\]|\['([^']+)'\]/y;
  re.lastIndex = 1;
  while (re.lastIndex < path.length) {
    const start = re.lastIndex;
    const m = re.exec(path);
    if (!m) throw new Error(`JSONPath không hỗ trợ tại vị trí ${start}: ${path}`);
    if (m[1] !== undefined) tokens.push({ kind: 'key', key: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: 'index', index: Number(m[2]) });
    else if (m[3] !== undefined) tokens.push({ kind: 'key', key: m[3] });
    else tokens.push({ kind: 'wildcard' });
  }
  return tokens;
}

export function evaluate(path: string, root: unknown): unknown {
  const tokens = tokenize(path);
  const multi = tokens.some((t) => t.kind === 'wildcard');
  let current: unknown[] = [root];
  for (const tok of tokens) {
    const next: unknown[] = [];
    for (const v of current) {
      if (v === null || typeof v !== 'object') continue;
      if (tok.kind === 'key') {
        if (tok.key in (v as object)) next.push((v as Record<string, unknown>)[tok.key]);
      } else if (tok.kind === 'index') {
        if (Array.isArray(v) && tok.index < v.length) next.push(v[tok.index]);
      } else if (Array.isArray(v)) {
        next.push(...v);
      } else {
        next.push(...Object.values(v as object));
      }
    }
    current = next;
  }
  return multi ? current : current[0];
}
