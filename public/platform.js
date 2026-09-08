const isToss = import.meta.env?.VITE_PLATFORM === 'toss';
let adapter;
let token;
export const apiOrigin = isToss ? import.meta.env.VITE_API_ORIGIN : '';

export async function initializePlatform(onBack) {
  if (token && !isToss) return;
  if (isToss) {
    adapter = await import('./toss.js');
    token = await adapter.initialize(onBack);
  } else {
    token = localStorage.getItem('sai-user');
    if (!token) { token = crypto.randomUUID(); localStorage.setItem('sai-user', token); }
  }
}
export function authorization() { return { Authorization: `Bearer ${token}` }; }
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
