// Node.js 22+, npm install pg
// 고정 commit의 로컬 pedals.json -> 검증 -> pg 트랜잭션 upsert.
// 이미지 다운로드/배포는 수행하지 않는다. 사용 권한 확인 후 별도 작업으로 분리한다.
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const [inputPath, revision] = process.argv.slice(2);
if (!inputPath || !/^[a-f0-9]{40}$/i.test(revision ?? '')) {
  throw new Error('Usage: node import-pedals.mjs /path/to/pedals.json <40-char commit SHA>');
}
const raw = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(raw) || raw.length === 0) throw new Error('Non-empty array required');
const seen = new Set();
const records = raw.map((row, index) => {
  if (typeof row.Brand !== 'string' || !row.Brand.trim() ||
      typeof row.Name !== 'string' || !row.Name.trim() ||
      typeof row.Image !== 'string' || !/^[a-zA-Z0-9._-]+\.png$/i.test(row.Image)) {
    throw new Error(`Invalid text/image fields at row ${index}`);
  }
  for (const key of ['Width', 'Height']) {
    if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) ||
        row[key] <= 0 || row[key] * 25.4 > 5000) {
      throw new Error(`Invalid ${key} at row ${index}`);
    }
  }
  // 임시 source key: 파일명. upstream 파일명 변경은 diff 검토 후 기존 ID에 재연결.
  if (seen.has(row.Image)) throw new Error(`Duplicate image key: ${row.Image}`);
  seen.add(row.Image);
  return {
    brand: row.Brand.trim(), name: row.Name.trim(), key: row.Image,
    width: (row.Width * 25.4).toFixed(3), height: (row.Height * 25.4).toFixed(3),
    payload: row,
  };
});
// 전체 검증 후 쓰기 시작. 모델/색상 이름은 자동 분리하지 않는다.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  for (const r of records) {
    await client.query(`
      INSERT INTO pedals
        (brand, model_name, width_mm, height_mm, dimension_basis,
         source_name, source_key, source_revision, source_payload)
      VALUES ($1,$2,$3,$4,'envelope','pedalplayground',$5,$6,$7::jsonb)
      ON CONFLICT (source_name, source_key) DO UPDATE SET
        width_mm = EXCLUDED.width_mm, height_mm = EXCLUDED.height_mm,
        source_revision = EXCLUDED.source_revision,
        source_payload = EXCLUDED.source_payload
    `, [r.brand, r.name, r.width, r.height, r.key, revision, JSON.stringify(r.payload)]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ imported: records.length, revision }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
