// Log JSON một dòng. KHÔNG bao giờ truyền cookie, header hay SessionSecret vào đây.
type Fields = Record<string, unknown>;
const emit = (level: string, msg: string, f?: Fields) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, svc: 'worker', msg, ...f }));
export const log = {
  info: (m: string, f?: Fields) => emit('info', m, f),
  warn: (m: string, f?: Fields) => emit('warn', m, f),
  error: (m: string, f?: Fields) => emit('error', m, f),
};
