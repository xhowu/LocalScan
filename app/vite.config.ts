import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// mode=online → 联网版（含条码联网查询），产物 dist-online
// 默认 production → 离线版，产物 dist
export default defineConfig(({ mode }) => {
  const online = mode === 'online';
  return {
    plugins: [react()],
    define: {
      __ONLINE__: JSON.stringify(online),
    },
    build: {
      // Capacitor WebView (Android 7+) / modern browsers
      target: 'es2022',
      outDir: online ? 'dist-online' : 'dist',
      sourcemap: false,
    },
    server: {
      host: true,
      port: 5173,
    },
  };
});
