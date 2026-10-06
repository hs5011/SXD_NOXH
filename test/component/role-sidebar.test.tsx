// @vitest-environment jsdom
/**
 * Test Phân quyền – Sidebar menu hiển thị theo role
 *
 * Lưu ý: KHÔNG mock lucide-react (mock Proxy gây deadlock khi fork mới trong pool:forks).
 * lucide-react được import thật – icon render thành SVG, không ảnh hưởng test text.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../src/data/appData', () => ({
  INITIAL_PROCESSES: [],
  INITIAL_PROJECTS: [],
  INITIAL_USERS: [],
}));

import Sidebar from '../../src/components/Sidebar';

// ─── Users fixture ────────────────────────────────────────────────────────────

const USERS: Record<string, any> = {
  admin:  { id: 'u1', username: 'admin',  fullName: 'Admin',     roleId: 'Admin',     userType: 'agency',   agencyId: '1', email: '', phone: '' },
  sxd:    { id: 'u2', username: 'sxd',    fullName: 'LĐ SXD',   roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '1', email: '', phone: '' },
  sqhkt:  { id: 'u3', username: 'sqhkt',  fullName: 'LĐ SQHKT', roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '2', email: '', phone: '' },
  pccc:   { id: 'u4', username: 'pccc',   fullName: 'LĐ PCCC',  roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '9', email: '', phone: '' },
  cdt_a:  { id: 'u5', username: 'cdt_a',  fullName: 'CĐT Alpha', roleId: 'Lãnh đạo', userType: 'investor', investorId: 'CDT_ALPHA', email: '', phone: '' },
};

const baseProps = {
  activeTab: 'dashboard-app',
  onNavigate: vi.fn(),
  onLogout: vi.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sidebar – Admin thấy toàn bộ menu kể cả HỆ THỐNG', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1.1 – Admin thấy nhóm HỆ THỐNG', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.admin} />);
    expect(screen.getByText('HỆ THỐNG')).toBeInTheDocument();
  });

  it('1.2 – Admin thấy "Quản lý tài khoản"', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.admin} />);
    expect(screen.getByText('Quản lý tài khoản')).toBeInTheDocument();
  });

  it('1.3 – Admin thấy "Cấu hình quy trình"', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.admin} />);
    expect(screen.getByText('Cấu hình quy trình')).toBeInTheDocument();
  });

  it('1.4 – Admin thấy menu điều hành cơ bản', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.admin} />);
    expect(screen.getByText('Dashboard App')).toBeInTheDocument();
    expect(screen.getByText('Danh sách dự án')).toBeInTheDocument();
    expect(screen.getByText('Sơ đồ Gantt dự án NOXH')).toBeInTheDocument();
  });

  it('1.5 – Click menu gọi onNavigate đúng id', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.admin} />);
    fireEvent.click(screen.getByText('Danh sách dự án'));
    expect(baseProps.onNavigate).toHaveBeenCalledWith('projects');
  });
});

describe('Sidebar – agencyId=1 (Sở Xây dựng) vẫn thấy nhóm HỆ THỐNG như Admin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Lãnh đạo SXD (agencyId=1, không phải Admin) thấy nhóm HỆ THỐNG', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.sxd} />);
    expect(screen.getByText('HỆ THỐNG')).toBeInTheDocument();
  });

  it('Lãnh đạo SXD (agencyId=1) thấy "Quản lý tài khoản"', () => {
    render(<Sidebar {...baseProps} currentUser={USERS.sxd} />);
    expect(screen.getByText('Quản lý tài khoản')).toBeInTheDocument();
  });
});

describe('Sidebar – Non-Admin, agency khác agencyId=1 KHÔNG thấy nhóm HỆ THỐNG', () => {
  beforeEach(() => vi.clearAllMocks());

  const cases = [
    { label: 'Sở QHKT (agencyId=2)',        key: 'sqhkt' },
    { label: 'Công an PCCC (agencyId=9)',   key: 'pccc'  },
    { label: 'Chủ đầu tư Alpha',            key: 'cdt_a' },
  ];

  for (const { label, key } of cases) {
    it(`2.1 – ${label}: KHÔNG thấy nhóm HỆ THỐNG`, () => {
      render(<Sidebar {...baseProps} currentUser={USERS[key]} />);
      expect(screen.queryByText('HỆ THỐNG')).not.toBeInTheDocument();
    });

    it(`2.2 – ${label}: KHÔNG thấy "Quản lý tài khoản"`, () => {
      render(<Sidebar {...baseProps} currentUser={USERS[key]} />);
      expect(screen.queryByText('Quản lý tài khoản')).not.toBeInTheDocument();
    });

    // Chủ đầu tư không có Dashboard App / Gantt / Cập nhật kế hoạch (src/components/Sidebar.tsx
    // restrictedForInvestor); cơ quan nhà nước vẫn có Dashboard App
    it(`2.3 – ${label}: thấy Danh sách dự án; Dashboard App chỉ khi không phải chủ đầu tư`, () => {
      render(<Sidebar {...baseProps} currentUser={USERS[key]} />);
      expect(screen.getByText('Danh sách dự án')).toBeInTheDocument();
      if (USERS[key].userType === 'investor') {
        expect(screen.queryByText('Dashboard App')).not.toBeInTheDocument();
        expect(screen.queryByText('Sơ đồ Gantt dự án NOXH')).not.toBeInTheDocument();
      } else {
        expect(screen.getByText('Dashboard App')).toBeInTheDocument();
      }
    });
  }
});
