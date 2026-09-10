import { deployment } from '../lib/access.js';
import { existsSync } from 'node:fs';

const issues = [];
let settings;
try { settings = deployment({ ...process.env, APP_PLATFORM: 'web' }); }
catch (error) { issues.push(`서버 설정: ${error.code ?? error.message}`); }
if (settings && /example|\.invalid|localhost|127\.0\.0\.1/.test(settings.host)) issues.push('실제 HTTPS 서비스 주소 필요');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPPORT_EMAIL ?? '')) issues.push('고객지원 이메일 필요');
if (process.env.PRIVACY_REVIEWED !== 'true') issues.push('운영자·개인정보 처리방침·국외 처리 안내 확정 필요');
if (process.env.AI_ENABLED !== 'true') issues.push('체험 모드 · 실제 AI 서비스를 열려면 OPENAI_API_KEY와 AI_ENABLED=true 필요');
if (!existsSync(new URL('../render.yaml', import.meta.url))) issues.push('서버 배포 설정 파일 필요');
console.log(issues.length ? issues.map(issue => `- ${issue}`).join('\n') : '웹 출시 설정 검사 통과 · 실제 HTTPS 접속·기록 복원·AI 동작 확인은 별도 필요');
process.exitCode = issues.length ? 1 : 0;
