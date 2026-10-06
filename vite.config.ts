import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // `.env` may carry NODE_ENV=development (read by the server). Vite would then bundle React's
  // development build into `vite build`: StrictMode runs every effect twice (each API call is sent
  // twice) and the bundle is far larger. A production build always uses production React.
  // This function runs before Vite reads .env; an empty VITE_USER_NODE_ENV stops Vite from
  // copying NODE_ENV=development out of .env, so React and the JSX transform both stay in production.
  if (mode === 'production') {
    process.env.NODE_ENV = 'production';
    process.env.VITE_USER_NODE_ENV = '';
  }
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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
