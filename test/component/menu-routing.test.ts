/**
 * BUG-10: màn hình lấy từ URL (#tab) chỉ được mở nếu vai trò có mục đó trong menu.
 */
import { describe, it, expect } from 'vitest';
import { getAllowedMenuTabs } from '../../src/components/Sidebar';

const admin: any = { id: 'u1', roleId: 'Admin', userType: 'agency', agencyId: '1', username: 'admin' };
const sxdStaff: any = { id: 'u2', roleId: 'Chuyên viên', userType: 'agency', agencyId: '1', username: 'sxd_cv' };
const sqhkt: any = { id: 'u3', roleId: 'Lãnh đạo', userType: 'agency', agencyId: '2', username: 'sqhkt' };
const investor: any = { id: 'u4', roleId: 'Lãnh đạo', userType: 'investor', agencyId: '', username: 'cdt' };

describe('getAllowedMenuTabs', () => {
  it('Admin và SXD có đủ các màn hình hệ thống', () => {
    for (const u of [admin, sxdStaff]) {
      const tabs = getAllowedMenuTabs(u);
      expect(tabs).toEqual(expect.arrayContaining(['dashboard-app', 'projects', 'annual-update', 'user-management', 'step-management']));
    }
  });

  it('cơ quan khác: không có kế hoạch dự án và nhóm Hệ thống', () => {
    const tabs = getAllowedMenuTabs(sqhkt);
    expect(tabs).toEqual(expect.arrayContaining(['dashboard-app', 'gantt-dashboard-noxh', 'projects']));
    expect(tabs).not.toContain('annual-update');
    expect(tabs).not.toContain('user-management');
  });

  it('chủ đầu tư chỉ có Danh sách dự án', () => {
    expect(getAllowedMenuTabs(investor)).toEqual(['projects']);
  });

  it('chưa đăng nhập: không có màn hình nào', () => {
    expect(getAllowedMenuTabs(null)).toEqual([]);
  });
});
