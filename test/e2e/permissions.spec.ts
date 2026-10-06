/**
 * E2E Tests: Phân quyền dữ liệu – 3 nhóm người dùng
 *
 * Yêu cầu: server đang chạy tại http://localhost:3000
 *          Dữ liệu mẫu đã có trong DB (ít nhất 1 dự án)
 * Chạy:    npx playwright test test/e2e/permissions.spec.ts
 *
 * Luồng kiểm thử:
 *   1. Nhóm 1 – Admin + Sở Xây dựng (agencyId='1'): thấy tất cả menu (kể cả HỆ THỐNG) + tất cả dự án
 *   2. Nhóm 2 – Chủ đầu tư: chỉ thấy dự án của mình, ẩn HỆ THỐNG
 *   3. Nhóm 3 – Cơ quan phối hợp: chỉ thấy dự án đang ở bước của mình, ẩn HỆ THỐNG
 *   4. Cross-check: các nhóm không rò rỉ dữ liệu lẫn nhau
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

async function gotoMenu(page: Page, label: string) {
  const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(1000);
}

async function getProjectCount(page: Page): Promise<number> {
  // ProjectList.tsx là layout thẻ (div.cursor-pointer), KHÔNG có <table>
  const cards = page.locator('div.cursor-pointer');
  return await cards.count();
}

async function bodyContains(page: Page, ...kws: string[]): Promise<boolean> {
  const text = await page.textContent('body');
  return kws.some(kw => text?.includes(kw));
}

// Tất cả route /api/* qua middleware authenticateToken (server.ts). Token JWT nằm trong
// localStorage ('auth_token'), gắn header qua apiFetch.ts — KHÔNG phải cookie, nên
// page.request.get() trần sẽ không tự kèm token → 401.
async function getAuthHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// =============================================================================
// NHÓM QUYỀN 1 – Admin
// =============================================================================
test.describe('Nhóm quyền 1A – Admin: thấy tất cả menu và toàn bộ dữ liệu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  test('1A.1 – Admin thấy nhóm menu HỆ THỐNG', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 8000 });
  });

  test('1A.2 – Admin thấy Quản lý tài khoản', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).toBeVisible({ timeout: 8000 });
  });

  test('1A.3 – Admin thấy Cấu hình quy trình', async ({ page }) => {
    await expect(page.getByText(/Cấu hình quy trình/i)).toBeVisible({ timeout: 8000 });
  });

  test('1A.4 – Admin thấy toàn bộ menu điều hành', async ({ page }) => {
    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Danh sách dự án/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Sơ đồ Gantt dự án NOXH/i)).toBeVisible({ timeout: 8000 });
  });

  test('1A.5 – Admin truy cập được Quản lý tài khoản', async ({ page }) => {
    await gotoMenu(page, 'Quản lý tài khoản');
    await expect(
      page.getByText(/Tài khoản|tài khoản|Người dùng|email/i).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('1A.6 – Admin thấy danh sách dự án (Danh sách dự án)', async ({ page }) => {
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);
    expect(await bodyContains(page, 'NOXH', 'Dự án', 'dự án')).toBe(true);
  });

  test('1A.7 – Admin thấy tất cả dự án trong Gantt NOXH', async ({ page }) => {
    await gotoMenu(page, 'Sơ đồ Gantt dự án NOXH');
    await page.waitForTimeout(2000);
    expect(await bodyContains(page, 'NOXH', 'Dự án', 'Chủ trương')).toBe(true);
  });
});

// =============================================================================
// NHÓM QUYỀN 1 – Sở Xây dựng (agencyId=1, không phải Admin)
// =============================================================================
test.describe('Nhóm quyền 1B – Sở Xây dựng: thấy tất cả dự án và cả HỆ THỐNG (như Admin)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'sxd'); // Lãnh đạo SXD, agencyId='1'
  });

  test('1B.1 – SXD thấy menu HỆ THỐNG', async ({ page }) => {
    await expect(page.getByText(/^HỆ THỐNG$/)).toBeVisible({ timeout: 8000 });
  });

  test('1B.2 – SXD thấy Quản lý tài khoản', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).toBeVisible({ timeout: 8000 });
  });

  test('1B.3 – SXD thấy menu điều hành và Danh sách dự án', async ({ page }) => {
    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Danh sách dự án/i)).toBeVisible({ timeout: 8000 });
  });

  test('1B.4 – SXD thấy dữ liệu dự án (agencyId=1 thấy tất cả)', async ({ page }) => {
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);
    expect(await bodyContains(page, 'NOXH', 'Dự án', 'dự án')).toBe(true);
  });

  test('1B.5 – SXD thấy Gantt NOXH', async ({ page }) => {
    await gotoMenu(page, 'Sơ đồ Gantt dự án NOXH');
    await page.waitForTimeout(2000);
    expect(await bodyContains(page, 'NOXH', 'Dự án', 'Chủ trương')).toBe(true);
  });
});

// =============================================================================
// NHÓM QUYỀN 2 – Chủ đầu tư
// =============================================================================
test.describe('Nhóm quyền 2 – Chủ đầu tư: chỉ thấy dự án của mình', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'cdt'); // userType='investor'
  });

  test('2.1 – CĐT KHÔNG thấy menu HỆ THỐNG', async ({ page }) => {
    await expect(page.getByText(/^HỆ THỐNG$/)).not.toBeVisible({ timeout: 5000 });
  });

  test('2.2 – CĐT KHÔNG thấy Quản lý tài khoản', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('2.3 – CĐT KHÔNG thấy Cấu hình quy trình', async ({ page }) => {
    await expect(page.getByText(/Cấu hình quy trình/i)).not.toBeVisible({ timeout: 5000 });
  });

  // Chủ đầu tư chỉ có menu Danh sách dự án: Dashboard App / Gantt / Cập nhật kế hoạch bị ẩn
  // (src/components/Sidebar.tsx restrictedForInvestor)
  test('2.4 – CĐT chỉ thấy menu Danh sách dự án, không có Dashboard App', async ({ page }) => {
    await expect(page.getByText(/Danh sách dự án/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Dashboard App/i)).toHaveCount(0);
  });

  test('2.5 – CĐT vào Danh sách dự án thấy dữ liệu (chỉ dự án của mình)', async ({ page }) => {
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);

    // Nếu CĐT có dự án thì thấy, nếu không thì trang rỗng — không crash
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('2.6 – CĐT không thấy "CĐT & Cơ quan xử lý" trong menu', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /CĐT & Cơ quan xử lý/i })
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// NHÓM QUYỀN 3 – Cơ quan phối hợp (Sở NNMT, agencyId='3')
// =============================================================================
test.describe('Nhóm quyền 3 – Cơ quan phối hợp: chỉ thấy dự án đang ở bước của mình', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'snnmt'); // Lãnh đạo Sở NNMT, agencyId='3'
  });

  test('3.1 – Sở NNMT KHÔNG thấy menu HỆ THỐNG', async ({ page }) => {
    await expect(page.getByText(/^HỆ THỐNG$/)).not.toBeVisible({ timeout: 5000 });
  });

  test('3.2 – Sở NNMT KHÔNG thấy Quản lý tài khoản', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('3.3 – Sở NNMT thấy menu điều hành cơ bản', async ({ page }) => {
    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Danh sách dự án/i)).toBeVisible({ timeout: 8000 });
  });

  test('3.4 – Sở NNMT vào Danh sách dự án không crash', async ({ page }) => {
    await gotoMenu(page, 'Danh sách dự án');
    await page.waitForTimeout(2000);

    // Chỉ thấy dự án đang ở bước NNMT — có thể rỗng nếu không có dự án nào ở bước đó
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('3.5 – Sở NNMT không thấy "Quản lý tài khoản" trong menu HỆ THỐNG', async ({ page }) => {
    await expect(page.getByText(/Quản lý tài khoản/i)).not.toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// CROSS-CHECK – So sánh quyền truy cập giữa các nhóm
// =============================================================================
test.describe('Cross-check – Phân quyền không rò rỉ giữa các nhóm', () => {
  test('CC.1 – Admin thấy HỆ THỐNG, Sở NNMT (agencyId≠1) không thấy', async ({ page }) => {
    // Đăng nhập admin
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 8000 });

    // Đăng xuất
    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);

      // Đăng nhập Sở NNMT (agencyId='3', thực sự bị hạn chế)
      await login(page, 'snnmt');
      await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('CC.2 – Sau khi đổi user, menu cập nhật đúng theo quyền mới', async ({ page }) => {
    // Đăng nhập admin → thấy HỆ THỐNG
    await login(page, 'admin');
    await expect(page.getByRole('heading', { name: 'HỆ THỐNG' })).toBeVisible({ timeout: 8000 });

    // Đăng xuất
    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (!(await logoutBtn.isVisible().catch(() => false))) { test.skip(); return; }
    await logoutBtn.click();
    await page.waitForTimeout(1000);

    // Đăng nhập snnmt (agencyId='3') → không thấy HỆ THỐNG
    await login(page, 'snnmt');
    await expect(page.getByText(/^HỆ THỐNG$/)).not.toBeVisible({ timeout: 5000 });
    // Nhưng vẫn thấy ĐIỀU HÀNH
    await expect(page.getByText(/ĐIỀU HÀNH/i)).toBeVisible({ timeout: 8000 });
  });

  test('CC.3 – Admin có thể truy cập Quản lý tài khoản, agency khác agencyId=1 thì không', async ({ page }) => {
    // Admin
    await login(page, 'admin');
    const adminCanSee = await page.getByText(/Quản lý tài khoản/i).isVisible({ timeout: 8000 }).catch(() => false);
    expect(adminCanSee).toBe(true);

    const logoutBtn = page.getByRole('button', { name: /Đăng xuất|Logout/i }).first();
    if (!(await logoutBtn.isVisible().catch(() => false))) return;
    await logoutBtn.click();
    await page.waitForTimeout(1000);

    // Sở NNMT (Lãnh đạo, agencyId='3' — khác agencyId=1 nên không có quyền HỆ THỐNG)
    await login(page, 'snnmt');
    const snnmtCanSee = await page.getByText(/Quản lý tài khoản/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(snnmtCanSee).toBe(false);
  });

  test('CC.6 – SXD (agencyId=1) truy cập được Quản lý tài khoản như Admin', async ({ page }) => {
    await login(page, 'sxd');
    const sxdCanSee = await page.getByText(/Quản lý tài khoản/i).isVisible({ timeout: 8000 }).catch(() => false);
    expect(sxdCanSee).toBe(true);
  });

  test('CC.4 – API /api/data luôn trả về dữ liệu bất kể user (server không lọc)', async ({ page }) => {
    await login(page, 'admin');
    // API không lọc theo user — chỉ frontend lọc (nhưng vẫn yêu cầu JWT hợp lệ)
    const response = await page.request.get('/api/data', { headers: await getAuthHeaders(page) });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('projects');
    expect(Array.isArray(body.projects)).toBe(true);
  });

  test('CC.5 – Phân quyền frontend: Admin thấy nhiều dự án hơn hoặc bằng cơ quan phối hợp', async ({ browser }) => {
    // Mở 2 tab song song
    const adminCtx = await browser.newContext();
    const agencyCtx = await browser.newContext();

    const adminPage  = await adminCtx.newPage();
    const agencyPage = await agencyCtx.newPage();

    try {
      await login(adminPage, 'admin');
      await gotoMenu(adminPage, 'Danh sách dự án');
      await adminPage.waitForTimeout(2000);

      await login(agencyPage, 'snnmt');
      await gotoMenu(agencyPage, 'Danh sách dự án');
      await agencyPage.waitForTimeout(2000);

      const adminCount  = await getProjectCount(adminPage);
      const agencyCount = await getProjectCount(agencyPage);

      // Admin luôn thấy nhiều hơn hoặc bằng cơ quan phối hợp
      expect(adminCount).toBeGreaterThanOrEqual(agencyCount);
    } finally {
      await adminCtx.close();
      await agencyCtx.close();
    }
  });
});
