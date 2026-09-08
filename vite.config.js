import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, 'VITE_'), ...process.env };
  const api = new URL(env.VITE_API_ORIGIN);
  if (api.protocol !== 'https:' || api.origin !== env.VITE_API_ORIGIN) throw new Error('VITE_API_ORIGIN must be an HTTPS origin');
  return {
    root: `${root}/public`, envDir: root, publicDir: false,
    define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify('toss') },
    plugins: [{ name: 'build-info', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ apiOrigin: api.origin, appName: process.env.TOSS_APP_NAME || 'mal-sai', sdk: '3.3.0' }) });
    } }],
    build: { outDir: `${root}/dist`, emptyOutDir: true, target: 'es2022', sourcemap: false },
  };
});
