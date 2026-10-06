/**
 * E2E Tests: Điều hướng Menu (Navigation)
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 * Chạy: npx playwright test test/e2e/menu-navigation.spec.ts
 *
 * Phạm vi:
 *   - Admin có thể điều hướng đến tất cả menu item
 *   - Các trang HỆ THỐNG (Admin, và agency agencyId='1' / Sở Xây dựng dù không phải Admin):
 *       Cấu hình quy trình, Cấu hình giai đoạn dự án, CĐT & Cơ quan xử lý,
 *       Danh mục dự án, Danh mục trạng thái, Quản lý tài khoản
 *   - Chuyên viên agency khác (agencyId != '1') chỉ truy cập menu được phép
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/Tên đăng nhập/i).fill(username);
  await page.getByLabel(/Mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await page.waitForTimeout(1500);
}

async function loginAsAdmin(page: Page) {
  return loginAs(page, 'admin', '123456');
}

async function clickMenu(page: Page, label: string) {
  const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
  await btn.click();
  await page.waitForTimeout(800);
}

async function pageHasContent(page: Page): Promise<boolean> {
  const text = await page.textContent('body');
  return (text?.length ?? 0) > 200;
}

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Admin – ĐIỀU HÀNH', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Dashboard App load được', async ({ page }) => {
    await clickMenu(page, 'Dashboard App');
    expect(await pageHasContent(page)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Admin – QUẢN LÝ TIẾN ĐỘ', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Sơ đồ Gantt dự án NOXH load được', async ({ page }) => {
    await clickMenu(page, 'Sơ đồ Gantt dự án NOXH');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Cập nhật kế hoạch dự án load được', async ({ page }) => {
    await clickMenu(page, 'Cập nhật kế hoạch dự án');
    expect(await pageHasContent(page)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Admin – QUẢN LÝ', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Danh sách dự án load được', async ({ page }) => {
    await clickMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(1500);
    expect(await pageHasContent(page)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Admin – HỆ THỐNG', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Đảm bảo menu HỆ THỐNG đã hiển thị
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 10000 });
  });

  test('Cấu hình quy trình load được', async ({ page }) => {
    await clickMenu(page, 'Cấu hình quy trình');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Cấu hình giai đoạn dự án load được', async ({ page }) => {
    await clickMenu(page, 'Cấu hình giai đoạn dự án');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('CĐT & Cơ quan xử lý load được', async ({ page }) => {
    await clickMenu(page, 'CĐT & Cơ quan xử lý');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Danh mục dự án load được', async ({ page }) => {
    await clickMenu(page, 'Danh mục dự án');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Danh mục trạng thái load được', async ({ page }) => {
    await clickMenu(page, 'Danh mục trạng thái');
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Quản lý tài khoản load được', async ({ page }) => {
    await clickMenu(page, 'Quản lý tài khoản');
    await page.waitForTimeout(1000);
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Quản lý tài khoản hiển thị bảng hoặc danh sách user', async ({ page }) => {
    await clickMenu(page, 'Quản lý tài khoản');
    await page.waitForTimeout(1500);
    const body = await page.textContent('body');
    const hasUserContent =
      body?.includes('tài khoản') ||
      body?.includes('Tài khoản') ||
      body?.includes('email') ||
      body?.includes('Email') ||
      body?.includes('admin');
    expect(hasUserContent).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('SXD (agencyId=1, không phải Admin) vẫn thấy HỆ THỐNG', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await page.waitForTimeout(1500);
  });

  test('SXD thấy nhóm HỆ THỐNG', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 8000 });
  });

  test('SXD có thể vào Quản lý tài khoản', async ({ page }) => {
    await clickMenu(page, 'Quản lý tài khoản');
    await page.waitForTimeout(1000);
    expect(await pageHasContent(page)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Chuyên viên agency khác (agencyId≠1) – menu bị hạn chế', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'snnmt', '123456');
    await page.waitForTimeout(1500);
  });

  test('Thấy menu ĐIỀU HÀNH', async ({ page }) => {
    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 8000 });
  });

  test('Thấy "Dashboard App" và có thể click', async ({ page }) => {
    const btn = page.getByRole('button', { name: /Dashboard App/i }).first();
    await expect(btn).toBeVisible({ timeout: 8000 });
    await btn.click();
    expect(await pageHasContent(page)).toBe(true);
  });

  test('Thấy "Danh sách dự án"', async ({ page }) => {
    await expect(page.getByText(/Danh sách dự án/i)).toBeVisible({ timeout: 8000 });
  });

  test('KHÔNG thấy HỆ THỐNG', async ({ page }) => {
    await expect(page.getByText(/^HỆ THỐNG$/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('KHÔNG thấy "Quản lý tài khoản"', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('KHÔNG thấy "Cấu hình quy trình"', async ({ page }) => {
    await expect(page.getByText(/Cấu hình quy trình/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('KHÔNG thấy "CĐT & Cơ quan xử lý" (menu item)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /CĐT & Cơ quan xử lý/i })).not.toBeVisible({ timeout: 5000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Chuyển tab và quay lại', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('có thể chuyển giữa Dashboard App và Danh sách dự án', async ({ page }) => {
    await clickMenu(page, 'Dashboard App');
    await page.waitForTimeout(1000);
    expect(await pageHasContent(page)).toBe(true);

    await clickMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(1000);
    expect(await pageHasContent(page)).toBe(true);

    await clickMenu(page, 'Dashboard App');
    await page.waitForTimeout(1000);
    expect(await pageHasContent(page)).toBe(true);
  });

  test('có thể chuyển giữa các trang HỆ THỐNG', async ({ page }) => {
    await clickMenu(page, 'Quản lý tài khoản');
    await page.waitForTimeout(800);
    expect(await pageHasContent(page)).toBe(true);

    await clickMenu(page, 'CĐT & Cơ quan xử lý');
    await page.waitForTimeout(800);
    expect(await pageHasContent(page)).toBe(true);

    await clickMenu(page, 'Danh mục trạng thái');
    await page.waitForTimeout(800);
    expect(await pageHasContent(page)).toBe(true);
  });
});
