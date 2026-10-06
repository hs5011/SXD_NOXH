// Các bộ e2e CÓ GHI dữ liệu: chỉ chạy với server dữ liệu thử (in-memory, cổng 3006), không bao giờ với DB thật.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['user-management.spec.ts', 'project-lifecycle.spec.ts', 'profile.spec.ts', 'gantt-progress.spec.ts'],
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results-memory',
  use: {
    baseURL: 'http://localhost:3006',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: undefined,
});
