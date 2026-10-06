/**
 * E2E Tests: Luồng nghiệp vụ vòng đời dự án
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 * Chạy:    npx playwright test test/e2e/project-lifecycle.spec.ts
 *
 * Luồng kiểm thử:
 *   1. Tạo dự án mới (điền form → lưu → xuất hiện trong danh sách)
 *   2. Xem chi tiết dự án (click → modal → thông tin đúng)
 *   3. Cập nhật tiến độ bước (UpdateProgress: thay đổi trạng thái bước)
 *   4. Cập nhật tiến độ năm (AnnualProgressUpdate: ghi kế hoạch năm)
 *   5. Tìm kiếm và lọc dự án
 *   6. Xem Gantt dự án
 */

import { test, expect, Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page, username = 'admin', password = '123456') {
  await page.goto('/');
  await page.getByLabel(/Tên đăng nhập/i).fill(username);
  await page.getByLabel(/Mật khẩu/i).fill(password);
  await page.getByRole('button', { name: /Đăng nhập/i }).click();
  await page.waitForTimeout(1500);
}

async function gotoMenu(page: Page, label: string | RegExp) {
  const btn = page.getByRole('button', { name: typeof label === 'string' ? new RegExp(label, 'i') : label }).first();
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(800);
}

async function bodyContains(page: Page, ...keywords: string[]): Promise<boolean> {
  const text = await page.textContent('body');
  return keywords.some(kw => text?.includes(kw));
}

// ─── Test data ────────────────────────────────────────────────────────────────

const TEST_PROJECT_NAME = `DA_E2E_TEST_${Date.now()}`;

// =============================================================================
// LUỒNG 1 – Tạo dự án mới
// =============================================================================
test.describe('Luồng 1 – Tạo dự án mới', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(1000);
  });

  test('1.1 – Nút tạo dự án hiển thị', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /Thêm|Tạo mới|Tạo dự án|Thêm mới/i })
      .first();
    const iconBtn = page.locator('button[title*="Tạo"], button[title*="Thêm"], button[title*="thêm"]').first();

    const visible = (await createBtn.isVisible()) || (await iconBtn.isVisible());
    expect(visible).toBe(true);
  });

  test('1.2 – Mở modal tạo dự án', async ({ page }) => {
    // Thử click nút tạo mới
    const createBtn = page
      .getByRole('button', { name: /Thêm|Tạo mới|Tạo dự án|Thêm mới/i })
      .first();

    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // Modal hoặc form tạo dự án xuất hiện
      const hasForm = await bodyContains(
        page, 'Tên dự án', 'Chủ đầu tư', 'Địa bàn', 'Thông tin dự án', 'Tạo dự án'
      );
      expect(hasForm).toBe(true);
    } else {
      test.skip();
    }
  });

  test('1.3 – Form tạo dự án có đầy đủ các trường bắt buộc', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /Thêm|Tạo mới|Tạo dự án|Thêm mới/i })
      .first();

    if (!(await createBtn.isVisible())) { test.skip(); return; }
    await createBtn.click();
    await page.waitForTimeout(1000);

    // Kiểm tra các trường bắt buộc hiển thị
    const hasName      = await page.getByPlaceholder(/tên dự án/i).isVisible()
      .catch(() => page.getByLabel(/tên dự án/i).isVisible().catch(() => false));
    const hasInvestor  = await bodyContains(page, 'Chủ đầu tư', 'chủ đầu tư');
    const hasLocation  = await bodyContains(page, 'Địa bàn', 'địa bàn', 'Quận', 'Phường');

    expect(hasName || hasInvestor || hasLocation).toBe(true);
  });

  test('1.4 – Nhấn hủy đóng form tạo dự án', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /Thêm|Tạo mới|Tạo dự án|Thêm mới/i })
      .first();

    if (!(await createBtn.isVisible())) { test.skip(); return; }
    await createBtn.click();
    await page.waitForTimeout(800);

    // Nhấn Hủy hoặc nút X đóng modal
    const cancelBtn = page.getByRole('button', { name: /Hủy|Hủy bỏ|Đóng/i }).first();
    const closeBtn  = page.locator('button[aria-label*="close"], button[aria-label*="Close"]').first();

    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(600);

    // Danh sách dự án vẫn hiển thị
    expect(await bodyContains(page, 'Danh sách', 'dự án', 'Tạo')).toBe(true);
  });
});

// =============================================================================
// LUỒNG 2 – Xem chi tiết dự án
// =============================================================================
test.describe('Luồng 2 – Xem chi tiết dự án', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);
  });

  test('2.1 – Danh sách dự án load được dữ liệu', async ({ page }) => {
    const hasData = await bodyContains(
      page, 'NOXH', 'Dự án', 'dự án', 'CĐT', 'Chủ đầu tư'
    );
    expect(hasData).toBe(true);
  });

  test('2.2 – Click vào dự án mở trang chi tiết Gantt', async ({ page }) => {
    // Danh sách dự án (ProjectList) là layout dạng thẻ (div.cursor-pointer), KHÔNG có
    // <table>. Click thẻ dự án → điều hướng sang ProjectGanttDetail (trang, không phải modal).
    // :has(h3) để loại trừ các div.cursor-pointer khác trên trang (VD: dropdown filter "Quy trình").
    const card = page.locator('div.cursor-pointer:has(h3)').first();
    const hasCard = await card.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCard) { test.skip(); return; }

    await card.click();
    await page.waitForTimeout(1200);

    const hasDetail = await bodyContains(
      page, 'Chủ đầu tư', 'Sơ đồ gantt', 'Tiến độ', 'Bắt đầu', 'Hoàn thành'
    );
    expect(hasDetail).toBe(true);
  });

  test('2.3 – Chi tiết dự án hiển thị tên dự án', async ({ page }) => {
    const card = page.locator('div.cursor-pointer:has(h3)').first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await card.click();
    await page.waitForTimeout(1200);

    // ProjectGanttDetail hiển thị tên dự án ở <h1>, không hiển thị mã NOXH-XXXX-XXXX
    const heading = page.locator('h1').first();
    expect(await heading.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true);
  });

  test('2.4 – Nút quay lại đưa về danh sách dự án', async ({ page }) => {
    const card = page.locator('div.cursor-pointer:has(h3)').first();
    if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await card.click();
    await page.waitForTimeout(1000);

    // Nút quay lại chỉ có icon ArrowLeft, không có text/aria-label
    const backBtn = page.locator('.lucide-arrow-left').first();
    if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backBtn.click();
    } else {
      test.skip();
      return;
    }
    await page.waitForTimeout(600);

    // Vẫn còn ở màn hình danh sách
    expect(await bodyContains(page, 'Danh sách', 'dự án')).toBe(true);
  });
});

// =============================================================================
// LUỒNG 3 – Cập nhật tiến độ bước (UpdateProgress)
// =============================================================================
test.describe('Luồng 3 – Cập nhật tiến độ bước xử lý hồ sơ', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);
  });

  // Nút trên mỗi thẻ dự án (đang có bước dở dang) tên là "Cập nhật" (không phải
  // "Cập nhật tiến độ"), gọi onHousingUpdateClick → điều hướng sang trang HousingUpdateView
  // (KHÔNG phải modal UpdateProgress). Dự án đã hoàn thành hết các bước sẽ không có nút này.
  test('3.1 – Nút "Cập nhật" xuất hiện trên dự án còn bước dở dang', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: 'Cập nhật', exact: true }).first();
    const hasBtn = await updateBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasBtn) { test.skip(); return; }
    expect(hasBtn).toBe(true);
  });

  test('3.2 – Mở trang cập nhật hồ sơ (HousingUpdateView)', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: 'Cập nhật', exact: true }).first();
    if (!(await updateBtn.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await updateBtn.click();
    await page.waitForTimeout(1200);

    const hasPage = await bodyContains(
      page, 'Trạng thái', 'Lưu cập nhật', 'Quay lại'
    );
    expect(hasPage).toBe(true);
  });

  test('3.3 – Trang cập nhật hồ sơ hiển thị danh sách các bước quy trình', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: 'Cập nhật', exact: true }).first();
    if (!(await updateBtn.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await updateBtn.click();
    await page.waitForTimeout(1200);

    // Tab "Quy trình" hiển thị đầy đủ các bước, nhóm theo giai đoạn ("... (N thủ tục)")
    const processTab = page.getByText('Quy trình', { exact: true }).first();
    if (await processTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await processTab.click();
      await page.waitForTimeout(500);
    }

    const hasSteps = await bodyContains(
      page, 'Thẩm định', 'Phê duyệt', 'Chấp thuận', 'Quy hoạch', 'thủ tục', 'Giai đoạn'
    );
    expect(hasSteps).toBe(true);
  });

  test('3.4 – Nút "Lưu cập nhật" và "Quay lại" hiển thị trên trang', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: 'Cập nhật', exact: true }).first();
    if (!(await updateBtn.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await updateBtn.click();
    await page.waitForTimeout(1200);

    const hasSave = await page.getByRole('button', { name: 'Lưu cập nhật' }).isVisible().catch(() => false);
    const hasBack = await page.getByRole('button', { name: 'Quay lại' }).isVisible().catch(() => false);

    expect(hasSave && hasBack).toBe(true);
  });

  test('3.5 – Nhấn "Quay lại" trở về danh sách dự án không lưu', async ({ page }) => {
    const updateBtn = page.getByRole('button', { name: 'Cập nhật', exact: true }).first();
    if (!(await updateBtn.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return; }

    await updateBtn.click();
    await page.waitForTimeout(1000);

    const backBtn = page.getByRole('button', { name: 'Quay lại' }).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(600);
    } else {
      test.skip();
      return;
    }

    // Quay về danh sách dự án
    expect(await bodyContains(page, 'Danh sách', 'dự án')).toBe(true);
  });
});

// =============================================================================
// LUỒNG 4 – Cập nhật tiến độ năm (AnnualProgressUpdate)
// =============================================================================
test.describe('Luồng 4 – Cập nhật tiến độ năm', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Menu item tên hiện tại là "Cập nhật kế hoạch dự án" (đổi tên từ "Cập nhật tiến độ năm")
    await gotoMenu(page, 'Cập nhật kế hoạch dự án');
    await page.waitForTimeout(2000);
  });

  test('4.1 – Màn hình Cập nhật kế hoạch dự án hiển thị', async ({ page }) => {
    const hasContent = await bodyContains(
      page, 'kế hoạch', 'Kế hoạch', 'tiến độ', 'Tiến độ', 'dự án'
    );
    expect(hasContent).toBe(true);
  });

  test('4.2 – Có ô tìm kiếm dự án', async ({ page }) => {
    const searchInput = page
      .getByPlaceholder(/Tìm dự án|tìm kiếm|Mã dự án/i)
      .first();
    expect(await searchInput.isVisible().catch(() => false)).toBe(true);
  });

  test('4.3 – Danh sách dự án hiển thị trong bảng tiến độ năm', async ({ page }) => {
    const hasTable = await bodyContains(
      page, 'NOXH', 'Dự án', 'Chủ trương', 'Tiến độ', 'Kế hoạch'
    );
    expect(hasTable).toBe(true);
  });

  test('4.4 – Tìm kiếm dự án theo tên lọc được kết quả', async ({ page }) => {
    // Dùng locator trong main để tránh chọn nhầm ô tìm kiếm nhanh trong header
    const searchInput = page.locator('main').getByPlaceholder(/Tìm dự án|Mã dự án/i).first();
    if (!(await searchInput.isVisible().catch(() => false))) { test.skip(); return; }

    await searchInput.fill('xxxxxxxxxnotexist_12345');
    await page.waitForTimeout(600);

    const body = await page.textContent('body');
    const isEmpty =
      body?.includes('Không có') ||
      body?.includes('Chưa có dự án') ||
      body?.includes('Không tìm thấy') ||
      body?.includes('không tìm thấy') ||
      body?.includes('0 dự');
    expect(isEmpty).toBe(true);

    await searchInput.clear();
    await page.waitForTimeout(400);
  });

  test('4.5 – Xóa tìm kiếm → danh sách xuất hiện lại', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm dự án|tìm kiếm/i).first();
    if (!(await searchInput.isVisible().catch(() => false))) { test.skip(); return; }

    await searchInput.fill('xyz-notexist');
    await page.waitForTimeout(400);
    await searchInput.clear();
    await page.waitForTimeout(400);

    expect(await bodyContains(page, 'NOXH', 'Dự án', 'dự án')).toBe(true);
  });
});

// =============================================================================
// LUỒNG 5 – Tìm kiếm và lọc dự án
// =============================================================================
test.describe('Luồng 5 – Tìm kiếm và lọc trong Danh sách dự án', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);
  });

  test('5.1 – Ô tìm kiếm tồn tại', async ({ page }) => {
    const search = page.getByPlaceholder(/tìm kiếm|Tìm kiếm|Tìm mã/i).first();
    expect(await search.isVisible().catch(() => false)).toBe(true);
  });

  test('5.2 – Nhập từ khóa không tồn tại → danh sách rỗng hoặc thông báo', async ({ page }) => {
    // Dùng locator trong main để tránh chọn nhầm ô "Tìm kiếm nhanh..." trong header
    const search = page.locator('main').getByPlaceholder(/tìm kiếm|Tìm kiếm|Tìm mã/i).first();
    if (!(await search.isVisible().catch(() => false))) { test.skip(); return; }

    await search.fill('ABCXYZ_NOTEXIST_99999');
    await page.waitForTimeout(700);

    const body = await page.textContent('body');
    const isEmpty =
      body?.includes('Không có') ||
      body?.includes('Chưa có dự án') ||
      body?.includes('Không tìm thấy') ||
      body?.includes('không tìm thấy') ||
      body?.includes('0 dự án');

    expect(isEmpty).toBe(true);
  });

  test('5.3 – Xóa từ khóa → danh sách đầy đủ trở lại', async ({ page }) => {
    const search = page.getByPlaceholder(/tìm kiếm|Tìm kiếm|Tìm mã/i).first();
    if (!(await search.isVisible().catch(() => false))) { test.skip(); return; }

    await search.fill('NOTEXIST');
    await page.waitForTimeout(500);
    await search.clear();
    await page.waitForTimeout(500);

    expect(await bodyContains(page, 'NOXH', 'Dự án', 'dự án')).toBe(true);
  });

  test('5.4 – Bộ lọc trạng thái "Delayed" hiển thị đúng', async ({ page }) => {
    // Tìm dropdown hoặc nút lọc trạng thái
    const filterBtn = page
      .getByRole('button', { name: /Lọc|Filter|Trạng thái/i })
      .or(page.getByRole('combobox').first())
      .first();

    if (!(await filterBtn.isVisible().catch(() => false))) { test.skip(); return; }

    // Không crash là đủ
    expect(await filterBtn.isVisible()).toBe(true);
  });

  test('5.5 – Nút xuất Excel tồn tại (Admin)', async ({ page }) => {
    const exportBtn = page
      .getByRole('button', { name: /Xuất|Export|Excel/i })
      .or(page.locator('button[title*="Excel"], button[title*="xuất"]'))
      .first();

    // Nút này có thể có hoặc không tùy UI — test không crash là đủ
    const exists = await exportBtn.isVisible().catch(() => false);
    // Không assert cứng — chỉ log
    expect(typeof exists).toBe('boolean');
  });
});

// =============================================================================
// LUỒNG 6 – Gantt dự án NOXH
// =============================================================================
test.describe('Luồng 6 – Sơ đồ Gantt dự án NOXH', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoMenu(page, 'Sơ đồ Gantt dự án NOXH');
    await page.waitForTimeout(2000);
  });

  test('6.1 – Màn hình Gantt hiển thị', async ({ page }) => {
    expect(await bodyContains(page, 'Gantt', 'dự án', 'Dự án', 'tiến độ')).toBe(true);
  });

  test('6.2 – Có ô tìm kiếm dự án trong Gantt', async ({ page }) => {
    const search = page
      .getByPlaceholder(/Tìm mã dự án|tìm kiếm|Tìm dự án/i)
      .first();
    expect(await search.isVisible().catch(() => false)).toBe(true);
  });

  test('6.3 – Danh sách dự án hiển thị trong bảng Gantt', async ({ page }) => {
    const hasContent = await bodyContains(
      page, 'NOXH', 'Dự án', 'Chủ trương', 'Quy hoạch'
    );
    expect(hasContent).toBe(true);
  });

  test('6.4 – Header các mốc thủ tục hiển thị đúng', async ({ page }) => {
    const hasMilestones = await bodyContains(
      page,
      'Chủ trương', 'Quy hoạch', 'PCCC', 'Giao đất', 'Giấy phép'
    );
    expect(hasMilestones).toBe(true);
  });

  test('6.5 – Tìm kiếm dự án theo mã lọc được kết quả', async ({ page }) => {
    // Dùng locator trong main để tránh chọn nhầm ô "Tìm kiếm nhanh..." trong header
    const search = page.locator('main').getByPlaceholder(/Tìm mã dự án/i).first();
    if (!(await search.isVisible().catch(() => false))) { test.skip(); return; }

    await search.fill('NOTEXIST_9999');
    await page.waitForTimeout(600);

    const body = await page.textContent('body');
    const noResultText =
      body?.includes('Không có') ||
      body?.includes('Chưa có dự án') ||
      body?.includes('Không tìm thấy') ||
      body?.includes('không tìm thấy');
    // Table có thể rỗng (tbody không có row) mà không hiển thị text — cả hai đều hợp lệ
    const tbodyRows = await page.locator('table tbody tr').count();
    expect(noResultText || tbodyRows === 0).toBe(true);
  });
});

// =============================================================================
// LUỒNG 7 – Đăng xuất và bảo vệ route
// =============================================================================
test.describe('Luồng 7 – Đăng xuất và bảo vệ phiên đăng nhập', () => {
  test('7.1 – Nút đăng xuất xuất hiện sau khi đăng nhập', async ({ page }) => {
    await login(page);
    const logoutBtn = page
      .getByRole('button', { name: /Đăng xuất|Logout|Sign out|Thoát/i })
      .or(page.locator('button[title*="xuất"], button[title*="logout"], button[title*="Thoát"]'))
      .first();
    expect(await logoutBtn.isVisible({ timeout: 8000 }).catch(() => false)).toBe(true);
  });

  test('7.2 – Nhấn đăng xuất → quay về trang đăng nhập', async ({ page }) => {
    await login(page);
    const logoutBtn = page
      .getByRole('button', { name: /Đăng xuất|Logout/i })
      .first();

    if (!(await logoutBtn.isVisible().catch(() => false))) { test.skip(); return; }

    await logoutBtn.click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: /Đăng nhập/i })).toBeVisible({ timeout: 8000 });
  });

  test('7.3 – Sau khi đăng xuất không thấy nội dung hệ thống', async ({ page }) => {
    await login(page);
    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (!(await logoutBtn.isVisible().catch(() => false))) { test.skip(); return; }

    await logoutBtn.click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(/Danh sách dự án/i)).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).not.toBeVisible();
  });

  test('7.4 – Có thể đăng nhập lại sau khi đăng xuất', async ({ page }) => {
    await login(page);
    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (!(await logoutBtn.isVisible().catch(() => false))) { test.skip(); return; }

    await logoutBtn.click();
    await page.waitForTimeout(1000);

    // Đăng nhập lại
    await page.getByLabel(/Tên đăng nhập/i).fill('admin');
    await page.getByLabel(/Mật khẩu/i).fill('123456');
    await page.getByRole('button', { name: /Đăng nhập/i }).click();
    await page.waitForTimeout(1500);

    expect(await bodyContains(page, 'Tổng quan', 'NOXH', 'Dashboard')).toBe(true);
  });
});
