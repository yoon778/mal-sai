import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { defaultReplyModel, defaultCoachModel, modelRates } from './models.js';

export function httpsOrigin(value, name) {
  let origin;
  try { origin = new URL(value); } catch { throw new Error(`${name} must be an HTTPS origin`); }
  if (origin.protocol !== 'https:' || origin.origin !== value) throw new Error(`${name} must be an HTTPS origin`);
  return origin;
}
export function appName(value) {
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(value ?? '')) throw new Error('TOSS_APP_NAME is required and must contain only lowercase letters, digits and hyphens');
  return value;
}
export function publicBuildSettings(env) {
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !['VITE_API_ORIGIN', 'VITE_PLATFORM'].includes(name)) throw new Error(`Unsupported public build variable: ${name}`);
  }
  return { apiOrigin: httpsOrigin(env.VITE_API_ORIGIN, 'VITE_API_ORIGIN').origin, appName: appName(env.TOSS_APP_NAME || 'mal-sai') };
}
export function validateOperationSettings(env) {
  if (!env.DATA_DIRECTORY || !isAbsolute(env.DATA_DIRECTORY)) throw new Error('DATA_DIRECTORY must be an absolute persistent directory');
  if (!isIP(env.TRUSTED_PROXY_IP ?? '')) throw new Error('TRUSTED_PROXY_IP must be one TLS reverse-proxy IP address');
  const limits = [
    ['AI_BUDGET_USD', 3, 3, false], ['AI_DAILY_REQUEST_LIMIT', 30, 1000, true],
    ['AI_MINUTE_REQUEST_LIMIT', 6, 60, true], ['AI_MAX_CONCURRENT_REQUESTS', 3, 20, true],
  ];
  for (const [name, fallback, maximum, integer] of limits) {
    const value = Number(env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0 || value > maximum || integer && !Number.isInteger(value)) throw new Error(`Invalid ${name}`);
  }
  modelRates(env.AI_REPLY_MODEL ?? defaultReplyModel);
  modelRates(env.AI_COACH_MODEL ?? defaultCoachModel);
}
