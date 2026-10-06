import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// Config build rieng cho ban Capacitor (Android/iOS) - chi dong goi
// index-mobile.html (Login + Dashboard App), khong dung chung dist/ voi web
// nen khong anh huong pipeline deploy web (ci_deploy.ps1 dung vite.config.ts goc).
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-mobile',
      rollupOptions: {
        input: path.resolve(__dirname, 'index-mobile.html'),
      },
    },
  };
});
