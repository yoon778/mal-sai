import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const target = new URL('../.env.web', import.meta.url);
if (existsSync(target)) {
  console.log('기존 .env.web 유지 · STORAGE_KEY를 다시 만들지 않았어요');
} else {
  const template = readFileSync(new URL('../.env.web.example', import.meta.url), 'utf8');
  writeFileSync(target, template.replace(/^STORAGE_KEY=$/m, `STORAGE_KEY=${randomBytes(32).toString('hex')}`), { flag: 'wx', mode: 0o600 });
  console.log(`웹 환경 파일 생성: ${fileURLToPath(target)}`);
  console.log('키 값은 출력하지 않아요 Render 환경변수에 직접 등록해 주세요');
}
