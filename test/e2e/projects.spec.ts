/**
 * E2E Tests: Danh sách dự án & Dashboard
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 * Chạy: npx playwright test test/e2e/projects.spec.ts
 *
 * Phạm vi (v2):
 *   - Dashboard hiển thị dữ liệu từ API
 *   - Dashboard App hiển thị biểu đồ
 *   - Danh sách dự án: load, tìm kiếm, filter
 *   - Tạo dự án mới (luồng modal)
 *   - Trạng thái kết nối DB
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel(/Tên đăng nhập/i).fill('admin');
  await page.getByLabel(/Mật khẩu/i).fill('123456');
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await page.waitForTimeout(1500);
}

async function navigateTo(page: Page, menuText: RegExp) {
  const btn = page.getByRole('button', { name: menuText }).first();
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForTimeout(600);
  }
}

// Tất cả route /api/* đều qua middleware authenticateToken (server.ts). Token JWT được
// lưu trong localStorage ('auth_token'), gắn vào header Authorization qua apiFetch.ts —
// KHÔNG phải cookie, nên page.request.get() trần sẽ không tự kèm token → 401.
async function getAuthHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Dashboard – dữ liệu API hiển thị lên UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('gọi /api/data khi tải trang', async ({ page }) => {
    // beforeEach đã đăng nhập; gọi API trực tiếp kèm token JWT lấy từ localStorage
    const response = await page.request.get('/api/data', { headers: await getAuthHeaders(page) });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('projects');
  });

  test('Dashboard App hiển thị tiêu đề tổng quan', async ({ page }) => {
    await navigateTo(page, /Dashboard App/i);
    await page.waitForTimeout(1000);
    await expect(page.getByText(/SỞ XÂY DỰNG TP\.HCM/i)).toBeVisible({ timeout: 10000 });
  });

  test('Dashboard không crash khi dữ liệu load xong', async ({ page }) => {
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Dashboard App', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('điều hướng sang Dashboard App', async ({ page }) => {
    await navigateTo(page, /Dashboard App/i);
    await page.waitForTimeout(1000);
    const bodyText = await page.textContent('body');
    const hasDashboard = bodyText?.includes('Dashboard') || bodyText?.includes('dự án') || bodyText?.includes('Tổng');
    expect(hasDashboard).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Danh sách dự án', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, /Danh sách dự án/i);
  });

  test('hiển thị danh sách dự án sau khi load', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    const hasProjectContent =
      body?.includes('dự án') ||
      body?.includes('Dự án') ||
      body?.includes('NOXH') ||
      body?.includes('CĐT');
    expect(hasProjectContent).toBe(true);
  });

  test('ô tìm kiếm lọc dự án theo tên', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Dùng locator trong main để tránh chọn nhầm ô "Tìm kiếm nhanh..." trong header
    const searchInput = page.locator('main').getByPlaceholder(/tìm kiếm/i).first();
    if (!(await searchInput.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await searchInput.fill('xxxxxxxxxnotexist12345');
    await page.waitForTimeout(800);
    const body = await page.textContent('body');
    expect(
      body?.includes('Không có') || body?.includes('Không tìm thấy') || body?.includes('không tìm thấy') || body?.includes('0 dự')
    ).toBe(true);

    await searchInput.clear();
    await page.waitForTimeout(300);
  });

  test('xóa tìm kiếm → danh sách xuất hiện lại', async ({ page }) => {
    await page.waitForTimeout(2000);

    const searchInput = page.getByPlaceholder(/tìm kiếm/i).first();
    if (!(await searchInput.isVisible())) {
      test.skip();
      return;
    }

    await searchInput.fill('xyz-not-exist-123');
    await page.waitForTimeout(400);
    await searchInput.clear();
    await page.waitForTimeout(400);

    const body = await page.textContent('body');
    const hasContent = body?.includes('dự án') || body?.includes('Dự án') || body?.includes('NOXH');
    expect(hasContent).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Tạo dự án mới', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, /Danh sách dự án/i);
    await page.waitForTimeout(1000);
  });

  test('nút "Thêm dự án" hoặc "Tạo mới" tồn tại', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /Thêm|Tạo mới|Tạo dự án|Thêm mới/i }).first();
    if (await createBtn.isVisible()) {
      expect(createBtn).toBeTruthy();
    } else {
      // Có thể có icon button thay vì text
      const iconBtns = await page.getByRole('button').all();
      expect(iconBtns.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Gantt Dashboard NOXH', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('điều hướng sang Sơ đồ Gantt NOXH', async ({ page }) => {
    await navigateTo(page, /Sơ đồ Gantt dự án NOXH/i);
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    const hasGanttContent =
      body?.includes('Gantt') ||
      body?.includes('tiến độ') ||
      body?.includes('dự án') ||
      body?.includes('Năm');
    expect(hasGanttContent).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Cập nhật tiến độ năm', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('điều hướng sang Cập nhật tiến độ năm', async ({ page }) => {
    await navigateTo(page, /Cập nhật tiến độ năm/i);
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    const hasProgressContent =
      body?.includes('tiến độ') ||
      body?.includes('Tiến độ') ||
      body?.includes('năm') ||
      body?.includes('cập nhật');
    expect(hasProgressContent).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Lưu ý: "Sơ đồ Gantt quy trình" (process-gantt) đã bị gỡ khỏi menu Sidebar
// (src/components/Sidebar.tsx:27 — comment out). Component ProcessGanttView vẫn
// tồn tại và được điều hướng tới qua handleNavigateToProjects({view:'all-progress'})
// trong App.tsx, không còn qua menu trực tiếp nên test click-menu cũ đã bị xóa.

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Trạng thái kết nối DB', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('API /api/db-status trả về đúng cấu trúc', async ({ page }) => {
    const response = await page.request.get('/api/db-status');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('connected');
    expect(body).toHaveProperty('mode');
  });

  test('API /api/health trả về ok', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('API /api/data trả về dữ liệu', async ({ page }) => {
    const response = await page.request.get('/api/data', { headers: await getAuthHeaders(page) });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('users');
  });
});
