import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { publicBuildSettings } from './lib/deployment-config.js';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, 'VITE_'), ...process.env };
  const settings = publicBuildSettings(env);
  return {
    root: `${root}/public`, envDir: root, publicDir: false,
    define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify('toss') },
    plugins: [{ name: 'build-info', transformIndexHtml() {
      // API response headers do not protect the document served by the Toss CDN.
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${settings.apiOrigin}; object-src 'none'; base-uri 'none'; form-action 'none'` }, injectTo: 'head-prepend' }];
    }, generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({ ...settings, sdk: '3.3.0' }) });
    } }],
    build: { outDir: `${root}/dist`, emptyOutDir: true, target: 'es2022', sourcemap: false },
  };
});
