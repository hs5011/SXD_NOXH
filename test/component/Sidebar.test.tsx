// @vitest-environment jsdom
/**
 * Component Tests: Sidebar
 *
 * Kiểm tra:
 *   - Render đúng logo và tên hệ thống
 *   - Hiển thị đủ menu cho Admin
 *   - Agency agencyId='1' (Sở Xây dựng) cũng thấy HỆ THỐNG như Admin
 *   - Non-Admin / agency khác agencyId='1' KHÔNG thấy nhóm HỆ THỐNG
 *   - Active tab được highlight
 *   - Click menu item gọi onNavigate với đúng id
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Sidebar from '../../src/components/Sidebar';

// ─── Mock data ────────────────────────────────────────────────────────────────

const adminUser = {
  id: 'u1',
  username: 'admin',
  fullName: 'Quản Trị Viên',
  email: 'admin@example.com',
  password: '',
  userType: 'agency' as const,
  roleId: 'Admin',
  agencyId: '1',
};

// Không phải Admin nhưng agencyId='1' (Sở Xây dựng) -> vẫn thấy HỆ THỐNG
const sxdLeaderUser = {
  id: 'u2',
  username: 'sxd',
  fullName: 'Lãnh Đạo SXD',
  email: 'sxd@example.com',
  password: '',
  userType: 'agency' as const,
  roleId: 'Chuyên viên',
  agencyId: '1',
};

// Agency khác (không phải agencyId='1') -> KHÔNG thấy HỆ THỐNG
const otherAgencyUser = {
  id: 'u3',
  username: 'sqhkt',
  fullName: 'Chuyên Viên SQHKT',
  email: 'sqhkt@example.com',
  password: '',
  userType: 'agency' as const,
  roleId: 'Chuyên viên',
  agencyId: '2',
};

const investorUser = {
  id: 'u4',
  username: 'cdt01',
  fullName: 'Chủ Đầu Tư',
  email: 'cdt@example.com',
  password: '',
  userType: 'investor' as const,
  roleId: 'Chủ đầu tư',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderSidebar(
  user = adminUser,
  activeTab = 'dashboard-app',
  onNavigate = vi.fn(),
  onLogout = vi.fn()
) {
  return render(
    <Sidebar
      activeTab={activeTab}
      onNavigate={onNavigate}
      currentUser={user as any}
      onLogout={onLogout}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – render cơ bản', () => {
  it('hiển thị tên hệ thống "NOXH SXD"', () => {
    renderSidebar();
    expect(screen.getByText(/NOXH SXD/i)).toBeInTheDocument();
  });

  it('hiển thị "TP. Hồ Chí Minh"', () => {
    renderSidebar();
    expect(screen.getByText(/TP\. Hồ Chí Minh/i)).toBeInTheDocument();
  });

  it('hiển thị nhóm menu ĐIỀU HÀNH', () => {
    renderSidebar();
    expect(screen.getByText(/ĐIỀU HÀNH/i)).toBeInTheDocument();
  });

  it('hiển thị nhóm menu QUẢN LÝ TIẾN ĐỘ', () => {
    renderSidebar();
    expect(screen.getByText(/QUẢN LÝ TIẾN ĐỘ/i)).toBeInTheDocument();
  });

  it('hiển thị nhóm menu QUẢN LÝ', () => {
    renderSidebar();
    expect(screen.getByText(/^QUẢN LÝ$/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – menu items ĐIỀU HÀNH', () => {
  it('hiển thị "Dashboard App"', () => {
    renderSidebar();
    expect(screen.getByText(/Dashboard App/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – menu items QUẢN LÝ TIẾN ĐỘ', () => {
  it('hiển thị "Sơ đồ Gantt dự án NOXH"', () => {
    renderSidebar();
    expect(screen.getByText(/Sơ đồ Gantt dự án NOXH/i)).toBeInTheDocument();
  });

  it('hiển thị "Cập nhật kế hoạch dự án"', () => {
    renderSidebar();
    expect(screen.getByText(/Cập nhật kế hoạch dự án/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – menu items QUẢN LÝ', () => {
  it('hiển thị "Danh sách dự án"', () => {
    renderSidebar();
    expect(screen.getByText(/Danh sách dự án/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – HỆ THỐNG (Admin và agencyId=1)', () => {
  it('Admin thấy nhóm HỆ THỐNG', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/HỆ THỐNG/i)).toBeInTheDocument();
  });

  it('Admin thấy "Cấu hình quy trình"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/Cấu hình quy trình/i)).toBeInTheDocument();
  });

  it('Admin thấy "Quản lý tài khoản"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/Quản lý tài khoản/i)).toBeInTheDocument();
  });

  it('Admin thấy "CĐT & Cơ quan xử lý"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/CĐT & Cơ quan xử lý/i)).toBeInTheDocument();
  });

  it('Admin thấy "Danh mục dự án"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/Danh mục dự án/i)).toBeInTheDocument();
  });

  it('Admin thấy "Danh mục trạng thái"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/Danh mục trạng thái/i)).toBeInTheDocument();
  });

  it('Admin thấy "Cấu hình giai đoạn dự án"', () => {
    renderSidebar(adminUser);
    expect(screen.getByText(/Cấu hình giai đoạn dự án/i)).toBeInTheDocument();
  });

  it('Lãnh đạo SXD (agencyId=1, không phải Admin) VẪN thấy nhóm HỆ THỐNG', () => {
    renderSidebar(sxdLeaderUser);
    expect(screen.getByText(/HỆ THỐNG/i)).toBeInTheDocument();
  });

  it('Lãnh đạo SXD (agencyId=1) VẪN thấy "Quản lý tài khoản"', () => {
    renderSidebar(sxdLeaderUser);
    expect(screen.getByText(/Quản lý tài khoản/i)).toBeInTheDocument();
  });

  it('Chuyên viên agency khác (agencyId≠1) KHÔNG thấy nhóm HỆ THỐNG', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.queryByText(/HỆ THỐNG/i)).not.toBeInTheDocument();
  });

  it('Chuyên viên agency khác (agencyId≠1) KHÔNG thấy "Quản lý tài khoản"', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.queryByText(/Quản lý tài khoản/i)).not.toBeInTheDocument();
  });

  it('Chuyên viên agency khác (agencyId≠1) KHÔNG thấy "Cấu hình quy trình"', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.queryByText(/Cấu hình quy trình/i)).not.toBeInTheDocument();
  });

  it('Investor KHÔNG thấy nhóm HỆ THỐNG', () => {
    renderSidebar(investorUser);
    expect(screen.queryByText(/HỆ THỐNG/i)).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – active tab highlighting', () => {
  it('tab đang active hiển thị đúng', () => {
    renderSidebar(adminUser, 'dashboard-app');
    const btn = screen.getByRole('button', { name: /Dashboard App/i });
    expect(btn).toBeInTheDocument();
  });

  it('tab active có class bg-blue', () => {
    renderSidebar(adminUser, 'dashboard-app');
    const btn = screen.getByRole('button', { name: /Dashboard App/i });
    expect(btn.className).toContain('bg-blue');
  });

  it('tab không active không có class bg-blue-600', () => {
    renderSidebar(adminUser, 'dashboard-app');
    const btn = screen.getByRole('button', { name: /Danh sách dự án/i });
    expect(btn.className).not.toContain('bg-blue-600');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – navigation callbacks', () => {
  it('click "Dashboard App" gọi onNavigate với "dashboard-app"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'projects', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Dashboard App/i }));
    expect(onNavigate).toHaveBeenCalledWith('dashboard-app');
  });

  it('click "Danh sách dự án" gọi onNavigate với "projects"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'dashboard-app', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Danh sách dự án/i }));
    expect(onNavigate).toHaveBeenCalledWith('projects');
  });

  it('click "Sơ đồ Gantt dự án NOXH" gọi onNavigate với "gantt-dashboard-noxh"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'dashboard-app', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Sơ đồ Gantt dự án NOXH/i }));
    expect(onNavigate).toHaveBeenCalledWith('gantt-dashboard-noxh');
  });

  it('click "Quản lý tài khoản" (Admin) gọi onNavigate với "user-management"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'dashboard-app', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Quản lý tài khoản/i }));
    expect(onNavigate).toHaveBeenCalledWith('user-management');
  });

  it('click "Cập nhật kế hoạch dự án" gọi onNavigate với "annual-update"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'dashboard-app', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật kế hoạch dự án/i }));
    expect(onNavigate).toHaveBeenCalledWith('annual-update');
  });

  it('click "CĐT & Cơ quan xử lý" gọi onNavigate với "investor-agency-management"', () => {
    const onNavigate = vi.fn();
    renderSidebar(adminUser, 'dashboard-app', onNavigate);
    fireEvent.click(screen.getByRole('button', { name: /CĐT & Cơ quan xử lý/i }));
    expect(onNavigate).toHaveBeenCalledWith('investor-agency-management');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Sidebar – chuyên viên agency khác chỉ thấy menu được phép', () => {
  it('vẫn thấy ĐIỀU HÀNH', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.getByText(/ĐIỀU HÀNH/i)).toBeInTheDocument();
  });

  it('vẫn thấy QUẢN LÝ TIẾN ĐỘ', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.getByText(/QUẢN LÝ TIẾN ĐỘ/i)).toBeInTheDocument();
  });

  it('vẫn thấy QUẢN LÝ', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.getByText(/^QUẢN LÝ$/i)).toBeInTheDocument();
  });

  it('vẫn thấy "Danh sách dự án"', () => {
    renderSidebar(otherAgencyUser);
    expect(screen.getByText(/Danh sách dự án/i)).toBeInTheDocument();
  });
});
