import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    pool: 'forks',
    testTimeout: 15000,
    // Component tests khai báo // @vitest-environment jsdom ở đầu file
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/lib/**', 'src/services/**', 'server/db.ts', 'src/components/**'],
      exclude: ['node_modules/**', 'src/data/**', 'dist/**'],
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
});
