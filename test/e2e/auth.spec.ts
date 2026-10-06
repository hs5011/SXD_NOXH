/**
 * E2E Tests: Đăng nhập & Xác thực
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 * Chạy: npx playwright test test/e2e/auth.spec.ts
 *
 * Phạm vi (v2):
 *   - Trang đăng nhập render đúng
 *   - Đăng nhập sai → thông báo lỗi
 *   - Đăng nhập đúng → vào màn hình chính
 *   - Nhiều tài khoản khác nhau
 *   - Đăng xuất
 *   - Phân quyền: menu HỆ THỐNG chỉ Admin và agency agencyId='1' (Sở Xây dựng) thấy
 */
import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel(/Tên đăng nhập/i).fill(username);
  await page.getByLabel(/Mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
}

async function waitForDashboard(page: Page) {
  await expect(page.getByText(/Đăng nhập để truy cập hệ thống/i)).not.toBeVisible({ timeout: 8000 });
}

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Trang đăng nhập', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('hiển thị tiêu đề hệ thống', async ({ page }) => {
    await expect(page.getByText(/Điều hành Dự án NOXH/i)).toBeVisible();
  });

  test('hiển thị input Tên đăng nhập', async ({ page }) => {
    await expect(page.getByLabel(/Tên đăng nhập/i)).toBeVisible();
  });

  test('hiển thị input Mật khẩu', async ({ page }) => {
    await expect(page.getByLabel(/Mật khẩu/i)).toBeVisible();
  });

  test('hiển thị nút Đăng nhập', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Đăng nhập/i })).toBeVisible();
  });

  // Giai đoạn thử nghiệm: khối tài khoản thử nghiệm còn hiển thị (SHOW_TEST_ACCOUNTS trong Login.tsx)
  test('hiển thị khối tài khoản thử nghiệm', async ({ page }) => {
    await expect(page.getByText('Tài khoản thử nghiệm')).toBeVisible();
    await expect(page.getByText(/User: admin/i)).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Đăng nhập thất bại', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('thông báo lỗi khi sai cả username lẫn password', async ({ page }) => {
    await page.getByLabel(/Tên đăng nhập/i).fill('wronguser');
    await page.getByLabel(/Mật khẩu/i).fill('wrongpass');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();

    await expect(page.getByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeVisible();
  });

  test('thông báo lỗi khi đúng username nhưng sai password', async ({ page }) => {
    await page.getByLabel(/Tên đăng nhập/i).fill('admin');
    await page.getByLabel(/Mật khẩu/i).fill('wrongpass');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();

    await expect(page.getByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeVisible();
  });

  test('thông báo lỗi khi để trống username', async ({ page }) => {
    await page.getByLabel(/Mật khẩu/i).fill('123456');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();

    // Form không submit hoặc hiện lỗi
    const hasError = await page.getByText(/không đúng|bắt buộc|required/i).isVisible().catch(() => false);
    const stillOnLogin = await page.getByRole('button', { name: /Đăng nhập/i }).isVisible();
    expect(hasError || stillOnLogin).toBe(true);
  });

  test('không điều hướng sau khi đăng nhập sai', async ({ page }) => {
    await page.getByLabel(/Tên đăng nhập/i).fill('hacker');
    await page.getByLabel(/Mật khẩu/i).fill('hack123');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();

    await expect(page.getByRole('button', { name: /Đăng nhập/i })).toBeVisible();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Đăng nhập thành công', () => {
  test('admin/123456 → vào màn hình chính', async ({ page }) => {
    await loginAs(page, 'admin', '123456');
    await waitForDashboard(page);

    await expect(
      page.getByText(/Dashboard App/i).or(page.getByText(/NOXH/i)).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('sxd/123456 → đăng nhập thành công', async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await waitForDashboard(page);
  });

  test('form đăng nhập ẩn sau khi đăng nhập thành công', async ({ page }) => {
    await loginAs(page, 'admin', '123456');

    await expect(page.getByText(/Đăng nhập để truy cập hệ thống/i)).not.toBeVisible({ timeout: 8000 });
  });

  test('sidebar xuất hiện sau khi đăng nhập', async ({ page }) => {
    await loginAs(page, 'admin', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/NOXH SXD/i)).toBeVisible({ timeout: 10000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
test.describe('Phân quyền sau đăng nhập', () => {
  test('Admin thấy menu HỆ THỐNG', async ({ page }) => {
    await loginAs(page, 'admin', '123456');
    await waitForDashboard(page);

    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 10000 });
  });

  test('Admin thấy "Quản lý tài khoản"', async ({ page }) => {
    await loginAs(page, 'admin', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/Quản lý tài khoản/i)).toBeVisible({ timeout: 10000 });
  });

  test('SXD (agencyId=1, không phải Admin) vẫn thấy menu HỆ THỐNG', async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await waitForDashboard(page);

    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 8000 });
  });

  test('SXD (agencyId=1) vẫn thấy "Quản lý tài khoản"', async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/Quản lý tài khoản/i)).toBeVisible({ timeout: 8000 });
  });

  test('Sở NNMT (agencyId=3, khác agencyId=1) KHÔNG thấy menu HỆ THỐNG', async ({ page }) => {
    await loginAs(page, 'snnmt', '123456');
    await waitForDashboard(page);

    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).not.toBeVisible({ timeout: 5000 });
  });

  test('Sở NNMT (agencyId=3) KHÔNG thấy "Quản lý tài khoản"', async ({ page }) => {
    await loginAs(page, 'snnmt', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/Quản lý tài khoản/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('Mọi user thấy menu ĐIỀU HÀNH', async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 10000 });
  });

  test('Mọi user thấy "Danh sách dự án"', async ({ page }) => {
    await loginAs(page, 'sxd', '123456');
    await waitForDashboard(page);

    await expect(page.getByText(/Danh sách dự án/i)).toBeVisible({ timeout: 10000 });
  });
});
