// Chỉ các bộ e2e CHỈ ĐỌC, chạy với server bản build nối DB thật (cổng 3004).
// Không thêm bộ nào có tạo/sửa/xóa dữ liệu vào đây.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: ['auth.spec.ts', 'menu-navigation.spec.ts', 'permissions.spec.ts', 'projects.spec.ts'],
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results-realdb',
  use: {
    baseURL: 'http://localhost:3004',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: undefined,
});
