import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  retries: 2,
  workers: 1, // Chạy tuần tự để tránh crash do thiếu bộ nhớ khi chạy nhiều browser song song
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Không tự start server — cần `npm run dev` chạy trước
  webServer: undefined,
});
