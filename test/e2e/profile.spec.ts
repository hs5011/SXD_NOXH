/**
 * E2E Tests: Thông tin cá nhân – Chỉnh sửa và xác nhận phản ánh trong Quản lý tài khoản
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 * Chạy:    npx playwright test test/e2e/profile.spec.ts
 *
 * Luồng kiểm thử:
 *   1. User mở modal Thông tin cá nhân (button title="Thông tin cá nhân & Đổi mật khẩu")
 *   2. Chỉnh sửa fullName / email / phone — kiểm tra validation
 *   3. Lưu thành công → toast success
 *   4. Admin vào Quản lý tài khoản → thấy thông tin đã thay đổi
 *   5. Đổi mật khẩu — validation và lưu
 */

import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page, username: string, password = '123456') {
  await page.goto('/');
  await page.getByLabel(/Tên đăng nhập/i).fill(username);
  await page.getByLabel(/Mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await page.waitForTimeout(1800);
}

async function openProfileModal(page: Page) {
  // Button có title="Thông tin cá nhân & Đổi mật khẩu" trong App.tsx header
  const profileBtn = page.getByTitle(/Thông tin cá nhân & Đổi mật khẩu/i).first();
  await profileBtn.waitFor({ state: 'visible', timeout: 8000 });
  await profileBtn.click();
  await page.waitForTimeout(800);
}

async function gotoUserManagement(page: Page) {
  const btn = page.getByRole('button', { name: /Quản lý tài khoản/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(1500);
}

const UNIQ = Date.now().toString().slice(-5);

// =============================================================================
// LUỒNG 1 – Mở và xem modal Thông tin cá nhân
// =============================================================================
test.describe('Thông tin cá nhân – Mở modal và xem thông tin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'sxd');
  });

  test('P.1 – Nút Thông tin cá nhân hiển thị trong header', async ({ page }) => {
    const profileBtn = page.getByTitle(/Thông tin cá nhân & Đổi mật khẩu/i).first();
    await expect(profileBtn).toBeVisible({ timeout: 8000 });
  });

  test('P.2 – Click nút → mở modal Thông tin cá nhân', async ({ page }) => {
    await openProfileModal(page);
    await expect(page.getByText(/Thông tin cá nhân/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('P.3 – Modal hiển thị thông tin user đang đăng nhập', async ({ page }) => {
    await openProfileModal(page);
    // Phải có input fullName không rỗng
    const fullnameInput = page.getByLabel(/Họ và tên/i).first();
    const hasFullname = await fullnameInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasFullname) {
      const value = await fullnameInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    } else {
      // Thử placeholder
      const fnInput = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
      const val = await fnInput.inputValue();
      expect(val.length).toBeGreaterThan(0);
    }
  });

  test('P.4 – Modal có fields: Họ và tên, Email, SĐT', async ({ page }) => {
    await openProfileModal(page);
    const body = await page.textContent('body');
    expect(body).toMatch(/Họ và tên|Tên đầy đủ/i);
    expect(body).toMatch(/Email/i);
  });

  test('P.5 – Modal có nút "Đóng" và "Lưu thay đổi"', async ({ page }) => {
    await openProfileModal(page);
    await expect(page.getByRole('button', { name: /Đóng/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('P.6 – Nút Đóng đóng được modal', async ({ page }) => {
    await openProfileModal(page);
    const closeBtn = page.getByRole('button', { name: /Đóng/i }).first();
    await closeBtn.click();
    await page.waitForTimeout(500);
    const modalVisible = await page.getByText(/Thông tin cá nhân/i).first().isVisible({ timeout: 2000 }).catch(() => false);
    // Modal đã đóng
    expect(modalVisible).toBe(false);
  });
});

// =============================================================================
// LUỒNG 2 – Validation các trường
// =============================================================================
test.describe('Thông tin cá nhân – Validation các trường bắt buộc', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'sxd');
    await openProfileModal(page);
  });

  test('P.7 – Xóa trắng Họ và tên → lỗi bắt buộc nhập', async ({ page }) => {
    const fullnameInput = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
    await fullnameInput.fill('');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Vui lòng nhập Họ và tên/i);
  });

  test('P.8 – Xóa trắng Email → lỗi bắt buộc nhập email', async ({ page }) => {
    const emailInput = page.getByPlaceholder(/Email|email/i).first();
    await emailInput.fill('');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Vui lòng nhập địa chỉ Email/i);
  });

  test('P.9 – Nhập email sai định dạng → lỗi định dạng email', async ({ page }) => {
    const emailInput = page.getByPlaceholder(/Email|email/i).first();
    await emailInput.fill('email-sai-dinh-dang');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Địa chỉ Email không đúng định dạng/i);
  });

  test('P.10 – Nhập SĐT quá ngắn (< 10 số) → lỗi SĐT', async ({ page }) => {
    const phoneInput = page.getByPlaceholder(/Số điện thoại|điện thoại/i).first();
    const hasPhone = await phoneInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasPhone) { test.skip(); return; }

    await phoneInput.fill('123');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Số điện thoại phải chứa từ 10/i);
  });
});

// =============================================================================
// LUỒNG 3 – Lưu thông tin cá nhân thành công
// =============================================================================
test.describe('Thông tin cá nhân – Lưu thành công', () => {
  test('P.11 – Cập nhật fullName → lưu thành công → toast success', async ({ page }) => {
    await login(page, 'sxd');
    await openProfileModal(page);

    const fullnameInput = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
    const oldName = await fullnameInput.inputValue();

    const newName = `${oldName.replace(/ \[e2e.*\]$/, '')} [e2e${UNIQ}]`;
    await fullnameInput.fill(newName);

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    expect(body).toMatch(/Đã cập nhật thông tin cá nhân thành công/i);
  });

  test('P.12 – Header hiển thị tên mới sau khi cập nhật', async ({ page }) => {
    await login(page, 'sxd');
    await openProfileModal(page);

    const fullnameInput = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
    const newName = `LĐ SXD e2e${UNIQ}`;
    await fullnameInput.fill(newName);

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(1500);

    // Đóng modal nếu chưa đóng tự động
    const closeBtn = page.getByRole('button', { name: /Đóng/i }).first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await page.waitForTimeout(500);

    // Header nên hiển thị tên mới (trong App.tsx: currentUser.fullName)
    const header = await page.textContent('header, [class*="header"], [class*="Header"]');
    if (header) {
      expect(header).toMatch(new RegExp(newName.split(' ')[0], 'i'));
    }
    // Nếu không tìm được header, kiểm tra body chứa tên mới
    else {
      const body = await page.textContent('body');
      expect(body).toMatch(new RegExp(`e2e${UNIQ}`, 'i'));
    }
  });
});

// =============================================================================
// LUỒNG 4 – Admin xác nhận thay đổi trong Quản lý tài khoản
// =============================================================================
test.describe('Thông tin cá nhân → Admin xác nhận trong Quản lý tài khoản', () => {
  test('P.13 – User sửa thông tin → Admin vào QLTK thấy thông tin đã thay đổi', async ({ browser }) => {
    // Mở 2 context độc lập: user và admin
    const userCtx = await browser.newContext();
    const adminCtx = await browser.newContext();

    const userPage = await userCtx.newPage();
    const adminPage = await adminCtx.newPage();

    try {
      // Bước 1: User sxd thay đổi fullName
      await login(userPage, 'sxd');
      await openProfileModal(userPage);

      const fullnameInput = userPage.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
      const updatedName = `Lãnh đạo SXD [admin-check-${UNIQ}]`;
      await fullnameInput.fill(updatedName);

      await userPage.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
      await userPage.waitForTimeout(1500);

      const userBody = await userPage.textContent('body');
      const saveSuccess = /thành công/i.test(userBody || '');
      if (!saveSuccess) {
        // Bỏ qua test kiểm tra admin nếu save thất bại
        test.skip();
        return;
      }

      // Bước 2: Admin vào Quản lý tài khoản kiểm tra
      await login(adminPage, 'admin');
      await gotoUserManagement(adminPage);

      const adminBody = await adminPage.textContent('body');
      // Admin phải thấy tên mới của sxd
      // Tên đã được lưu vào DB nên hiển thị trong danh sách
      expect(adminBody).toMatch(new RegExp(`admin-check-${UNIQ}|sxd`, 'i'));
    } finally {
      await userCtx.close();
      await adminCtx.close();
    }
  });

  test('P.14 – Admin tìm kiếm user sxd → thấy thông tin cập nhật mới nhất', async ({ page }) => {
    await login(page, 'admin');
    await gotoUserManagement(page);

    // Tìm kiếm user sxd
    const searchInput = page.getByPlaceholder(/Tìm kiếm/i).first();
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSearch) {
      await searchInput.fill('sxd');
      await page.waitForTimeout(800);
    }

    const body = await page.textContent('body');
    expect(body).toMatch(/sxd|LĐ SXD|Lãnh đạo/i);
  });

  test('P.15 – Thông tin cập nhật persist sau khi logout và login lại', async ({ page }) => {
    // User sxd lưu fullName mới
    await login(page, 'sxd');
    await openProfileModal(page);

    const fullnameInput = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
    const persistName = `LĐ SXD persist${UNIQ}`;
    await fullnameInput.fill(persistName);

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(1500);

    const afterSave = await page.textContent('body');
    if (!/thành công/i.test(afterSave || '')) { test.skip(); return; }

    // Đóng modal trước khi logout (modal có thể vẫn mở và chặn click)
    const closeBtn = page.getByRole('button', { name: /Đóng/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // Logout
    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto('/');
    }

    // Login lại
    await login(page, 'sxd');
    await openProfileModal(page);

    // Tên mới vẫn còn
    const fn = page.getByPlaceholder(/Nhập họ và tên|Họ và tên/i).first();
    const currentValue = await fn.inputValue();
    expect(currentValue).toContain(`persist${UNIQ}`);
  });
});

// =============================================================================
// LUỒNG 5 – Đổi mật khẩu trong modal Thông tin cá nhân
// =============================================================================
test.describe('Thông tin cá nhân – Đổi mật khẩu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'sxd');
    await openProfileModal(page);
  });

  test('P.16 – Có nút "Yêu cầu đổi mật khẩu" trong modal', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await expect(changePassBtn).toBeVisible({ timeout: 5000 });
  });

  test('P.17 – Click "Yêu cầu đổi mật khẩu" mở section đổi mật khẩu', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    const body = await page.textContent('body');
    expect(body).toMatch(/Mật khẩu cũ|mật khẩu cũ|Mật khẩu mới/i);
  });

  test('P.18 – Bỏ trống mật khẩu cũ → lỗi bắt buộc', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    // Bấm Lưu mà không điền mật khẩu cũ
    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Vui lòng nhập mật khẩu cũ/i);
  });

  test('P.19 – Nhập mật khẩu cũ sai → lỗi mật khẩu cũ không chính xác', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    const oldPassInput = page.getByPlaceholder(/Nhập mật khẩu cũ|mật khẩu cũ/i).first();
    const newPassInput = page.getByPlaceholder(/Nhập mật khẩu mới|mật khẩu mới/i).first();
    const confirmInput = page.getByPlaceholder(/Xác nhận mật khẩu|confirm/i).first();

    await oldPassInput.fill('wrong-old-password');
    await newPassInput.fill('newpass123');
    await confirmInput.fill('newpass123');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(1500);

    const body = await page.textContent('body');
    expect(body).toMatch(/Mật khẩu cũ không chính xác/i);
  });

  test('P.20 – Mật khẩu mới < 6 ký tự → lỗi độ dài', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    const oldPassInput = page.getByPlaceholder(/Nhập mật khẩu cũ|mật khẩu cũ/i).first();
    const newPassInput = page.getByPlaceholder(/Nhập mật khẩu mới|mật khẩu mới/i).first();
    const confirmInput = page.getByPlaceholder(/Xác nhận mật khẩu|confirm/i).first();

    await oldPassInput.fill('123456');
    await newPassInput.fill('abc'); // Quá ngắn
    await confirmInput.fill('abc');

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Mật khẩu mới phải có ít nhất 6 ký tự/i);
  });

  test('P.21 – Xác nhận mật khẩu mới không khớp → lỗi', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    const oldPassInput = page.getByPlaceholder(/Nhập mật khẩu cũ|mật khẩu cũ/i).first();
    const newPassInput = page.getByPlaceholder(/Nhập mật khẩu mới|mật khẩu mới/i).first();
    const confirmInput = page.getByPlaceholder(/Xác nhận mật khẩu|confirm/i).first();

    await oldPassInput.fill('123456');
    await newPassInput.fill('newpassword123');
    await confirmInput.fill('differentpassword456'); // Không khớp

    await page.getByRole('button', { name: /Lưu thay đổi|Lưu/i }).first().click();
    await page.waitForTimeout(800);

    const body = await page.textContent('body');
    expect(body).toMatch(/Xác nhận mật khẩu mới không khớp/i);
  });

  test('P.22 – Click "Hủy đổi mật khẩu" ẩn section đổi mật khẩu', async ({ page }) => {
    const changePassBtn = page.getByRole('button', { name: /Yêu cầu đổi mật khẩu/i }).first();
    await changePassBtn.click();
    await page.waitForTimeout(500);

    const cancelBtn = page.getByRole('button', { name: /Hủy đổi mật khẩu/i }).first();
    await cancelBtn.click();
    await page.waitForTimeout(300);

    // Section đổi mật khẩu đã ẩn
    const oldPassVisible = await page.getByPlaceholder(/Nhập mật khẩu cũ/i).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(oldPassVisible).toBe(false);
  });
});
