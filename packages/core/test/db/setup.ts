import { prepareTestDatabase } from '../../src/testing/index';

/** Tạo lại database vala_test (migration + dữ liệu mẫu) rồi trỏ hai pool vào đó cho các file test. */
export default async function setup() {
  const { readerUrl, writerUrl } = await prepareTestDatabase();
  process.env.DATABASE_READER_URL = readerUrl;
  process.env.DATABASE_WRITER_URL = writerUrl;
}
