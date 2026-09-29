import { env } from '../src/env.js';
import { migrate } from '../src/db/migrate.js';

const applied = await migrate({
  ownerUrl: env('DATABASE_OWNER_URL'),
  readerUrl: env('DATABASE_READER_URL'),
  writerUrl: env('DATABASE_WRITER_URL'),
  seed: process.argv.includes('--seed'),
  log: (m) => console.log(m),
});
console.log(applied.length ? `xong, ${applied.length} migration mới` : 'không có migration mới');
