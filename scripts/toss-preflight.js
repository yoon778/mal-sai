import { deployment } from '../lib/access.js';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { directoryHash } from './artifact-integrity.js';

const issues = [];
try { deployment({ ...process.env, APP_PLATFORM: 'toss' }); } catch (error) { issues.push(`서버 설정: ${error.code ?? error.message}`); }
if (process.env.VITE_API_ORIGIN !== process.env.API_PUBLIC_ORIGIN) issues.push('클라이언트와 서버 API 주소 불일치');
if (/example|\.invalid|localhost|127\.0\.0\.1/.test(process.env.API_PUBLIC_ORIGIN ?? '')) issues.push('실제 HTTPS API 도메인 필요');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPPORT_EMAIL ?? '')) issues.push('고객지원 이메일 필요');
if (process.env.PRIVACY_REVIEWED !== 'true') issues.push('운영자 정보·개인정보 처리방침·국외 처리 안내 확정 필요');
if (process.env.TOSS_DEVICE_TESTED !== 'true') issues.push('토스 Android/iOS 실제 기기 체크 필요');
const artifact = `${process.env.TOSS_APP_NAME || 'mal-sai'}.ait`;
if (!existsSync(artifact)) issues.push('토스 패키지 빌드 필요');
try {
  const build = JSON.parse(readFileSync('dist/build-info.json', 'utf8'));
  if (build.apiOrigin !== process.env.API_PUBLIC_ORIGIN || build.appName !== process.env.TOSS_APP_NAME) issues.push('최종 API 주소·앱 이름으로 패키지 재빌드 필요');
  const manifest = JSON.parse(readFileSync(`${artifact}.manifest.json`, 'utf8'));
  if (manifest.apiOrigin !== build.apiOrigin || manifest.appName !== build.appName || manifest.webSha256 !== directoryHash('dist') || manifest.sha256 !== createHash('sha256').update(readFileSync(artifact)).digest('hex')) issues.push('패키지와 빌드 정보 불일치 · 다시 빌드 필요');
} catch { issues.push('빌드 정보 확인 불가'); }
if (existsSync('dist/index.html') && !readFileSync('dist/index.html', 'utf8').includes('/assets/')) issues.push('정상적인 클라이언트 빌드 확인 필요');
console.log(issues.length ? issues.map(item => `- ${item}`).join('\n') : '로컬 출시 준비 검사 통과 · 토스 콘솔 심사·배포는 별도 진행');
process.exitCode = issues.length ? 1 : 0;
