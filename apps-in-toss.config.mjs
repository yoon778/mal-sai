import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: process.env.TOSS_APP_NAME || 'mal-sai',
  brand: { primaryColor: '#ee7257' },
  permissions: [],
  navigationBar: { withBackButton: true, withHomeButton: true, withTitle: true, theme: 'light' },
  webView: { bounces: false, pullToRefreshEnabled: false, allowsBackForwardNavigationGestures: false },
  webBundleDir: 'dist',
});
