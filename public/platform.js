const isToss = import.meta.env?.VITE_PLATFORM === 'toss';
let adapter;
let token;
let webSession = false;
export const apiOrigin = isToss ? import.meta.env.VITE_API_ORIGIN : '';

export async function initializePlatform(onBack) {
  if (token && !isToss) return;
  if (isToss) {
    adapter = await import('./toss.js');
    token = await adapter.initialize(onBack);
  } else {
    const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error ?? '연결을 다시 확인해 주세요');
    webSession = session.platform === 'web';
    if (webSession) return;
    token = localStorage.getItem('sai-user');
    if (!token) { token = crypto.randomUUID(); localStorage.setItem('sai-user', token); }
  }
}
export function authorization() { return webSession ? {} : { Authorization: `Bearer ${token}` }; }
export async function savedGame() {
  if (adapter) return adapter.getItem('sai-game');
  // Preserve the previous tab's practice during the storage migration.
  return localStorage.getItem('sai-game') ?? sessionStorage.getItem('sai-game');
}
export async function rememberGame(id) {
  if (adapter) return adapter.setItem('sai-game', id);
  localStorage.setItem('sai-game', id);
}
export async function forgetGame() {
  if (adapter) return adapter.removeItem('sai-game');
  localStorage.removeItem('sai-game'); sessionStorage.removeItem('sai-game');
}
export async function closeApp() { if (adapter) await adapter.close(); }
