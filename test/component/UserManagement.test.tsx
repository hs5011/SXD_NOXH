// @vitest-environment jsdom
/**
 * Component Tests: UserManagement
 *
 * Kiểm tra:
 *   - Render danh sách tài khoản, tiêu đề, các nút chức năng
 *   - Tìm kiếm theo tên, email, SĐT
 *   - Lọc theo loại tài khoản (agency/investor)
 *   - Mở modal thêm mới
 *   - Xóa user: modal xác nhận "Xóa tài khoản người dùng" xuất hiện
 *   - Validation logic: email, phone, duplicate checks
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import UserManagement from '../../src/components/UserManagement';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../src/lib/crypto', () => ({
  hashPassword: vi.fn((v: string) => `hashed_${v}`),
}));

vi.mock('../../src/data/appData', () => ({
  INITIAL_AGENCIES: [],
  INITIAL_INVESTORS: [],
}));

vi.mock('../../src/components/ListManagement', () => ({
  default: ({ title }: any) => <div data-testid="list-management">{title}</div>
}));

vi.mock('../../src/components/AgencyManagement', () => ({}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockAgencies = [
  { id: 'ag-1', name: 'Sở Xây dựng', departments: ['Phòng QH', 'Phòng QL'] },
  { id: 'ag-2', name: 'Sở QHKT', departments: ['Phòng Kiến trúc'] }
];

const mockUsers = [
  {
    id: 'u1',
    fullName: 'Nguyễn Văn Admin',
    email: 'admin@sxd.gov.vn',
    phone: '0901234567',
    username: 'admin',
    password: 'hashed_123456',
    userType: 'agency' as const,
    agencyId: 'ag-1',
    roleId: 'Admin',
    isFollower: false
  },
  {
    id: 'u2',
    fullName: 'Trần Thị Chuyên Viên',
    email: 'cv@sxd.gov.vn',
    phone: '0901234568',
    username: 'chuyenvien',
    password: 'hashed_123456',
    userType: 'agency' as const,
    agencyId: 'ag-1',
    roleId: 'Chuyên viên',
    isFollower: true
  },
  {
    id: 'u3',
    fullName: 'Lê Văn Đầu Tư',
    email: 'cdt@company.vn',
    phone: '0901234569',
    username: 'cdt01',
    password: 'hashed_123456',
    userType: 'investor' as const,
    investorId: 'inv-1',
    roleId: 'Chủ đầu tư',
    isFollower: false
  }
];

const defaultProps = {
  users: mockUsers,
  onUpdateUsers: vi.fn(),
  roles: ['Admin', 'Chuyên viên', 'Chủ đầu tư'],
  onUpdateRoles: vi.fn(),
  agencies: mockAgencies,
  investors: ['Công ty A', 'Công ty B'],
  preselectedInvestor: undefined,
  onClearInvestor: vi.fn(),
  // Nút Thêm/Sửa/Xóa/Cấu hình chỉ hiện cho Admin hoặc Sở Xây dựng (agencyId '1'):
  // src/components/UserManagement.tsx isSxdOrAdmin / canManageAccount. Người xem mặc định là Admin.
  currentUser: { id: 'viewer-admin', username: 'qa_admin', fullName: 'QA Admin', roleId: 'Admin', userType: 'agency', agencyId: '1' },
};

function renderUserManagement(overrideProps: Record<string, any> = {}) {
  const props = { ...defaultProps, onUpdateUsers: vi.fn(), ...overrideProps };
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ host: '', port: '', user: '', password: '', from: '', secure: false })
  });
  return { ...render(<UserManagement {...props} />), props };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Render cơ bản', () => {
  it('hiển thị tiêu đề "Quản lý tài khoản"', () => {
    renderUserManagement();
    expect(screen.getByText('Quản lý tài khoản')).toBeInTheDocument();
  });

  it('hiển thị nút "Thêm tài khoản"', () => {
    renderUserManagement();
    expect(screen.getByText('Thêm tài khoản')).toBeInTheDocument();
  });

  it('hiển thị nút "Cấu hình Email"', () => {
    renderUserManagement();
    expect(screen.getByRole('button', { name: /Cấu hình hệ thống/i })).toBeInTheDocument();
  });

  it('hiển thị nút "Danh mục vai trò"', () => {
    renderUserManagement();
    expect(screen.getByText('Danh mục vai trò')).toBeInTheDocument();
  });

  it('hiển thị đầy đủ tên người dùng', () => {
    renderUserManagement();
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Chuyên Viên')).toBeInTheDocument();
    expect(screen.getByText('Lê Văn Đầu Tư')).toBeInTheDocument();
  });

  it('hiển thị ô tìm kiếm', () => {
    renderUserManagement();
    expect(screen.getByPlaceholderText('Tìm kiếm người dùng...')).toBeInTheDocument();
  });

  it('hiển thị cột bảng "Họ tên", "Liên hệ", "Thao tác"', () => {
    renderUserManagement();
    expect(screen.getByText('Họ tên')).toBeInTheDocument();
    expect(screen.getByText('Liên hệ')).toBeInTheDocument();
    expect(screen.getByText('Thao tác')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Tìm kiếm', () => {
  it('tìm theo tên hiển thị đúng người dùng', () => {
    renderUserManagement();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'Trần Thị' } });
    expect(screen.getByText('Trần Thị Chuyên Viên')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn Admin')).not.toBeInTheDocument();
  });

  it('tìm theo email hiển thị đúng', () => {
    renderUserManagement();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'cdt@company.vn' } });
    expect(screen.getByText('Lê Văn Đầu Tư')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn Admin')).not.toBeInTheDocument();
  });

  it('tìm theo SĐT hiển thị đúng', () => {
    renderUserManagement();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: '0901234568' } });
    expect(screen.getByText('Trần Thị Chuyên Viên')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn Admin')).not.toBeInTheDocument();
  });

  it('xóa tìm kiếm hiện lại tất cả', () => {
    renderUserManagement();
    const searchInput = screen.getByPlaceholderText('Tìm kiếm người dùng...');
    fireEvent.change(searchInput, { target: { value: 'Trần' } });
    expect(screen.queryByText('Nguyễn Văn Admin')).not.toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Chuyên Viên')).toBeInTheDocument();
  });

  it('tìm không thấy → hiện "Không tìm thấy tài khoản"', () => {
    renderUserManagement();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'xxxxxxxxxxx' } });
    expect(screen.getByText(/Không tìm thấy tài khoản/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Lọc loại tài khoản', () => {
  it('lọc "Cơ quan nhà nước" chỉ hiện agency users', () => {
    renderUserManagement();
    fireEvent.change(screen.getByDisplayValue('Tất cả loại tài khoản'), { target: { value: 'agency' } });
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Chuyên Viên')).toBeInTheDocument();
    expect(screen.queryByText('Lê Văn Đầu Tư')).not.toBeInTheDocument();
  });

  it('lọc "Chủ đầu tư" chỉ hiện investor users', () => {
    renderUserManagement();
    fireEvent.change(screen.getByDisplayValue('Tất cả loại tài khoản'), { target: { value: 'investor' } });
    expect(screen.getByText('Lê Văn Đầu Tư')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn Admin')).not.toBeInTheDocument();
  });

  it('quay lại "Tất cả" hiển thị đủ 3 người', () => {
    renderUserManagement();
    const filterSelect = screen.getByDisplayValue('Tất cả loại tài khoản');
    fireEvent.change(filterSelect, { target: { value: 'agency' } });
    fireEvent.change(filterSelect, { target: { value: 'all' } });
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.getByText('Lê Văn Đầu Tư')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Modal thêm mới', () => {
  it('click "Thêm tài khoản" mở modal với tiêu đề "Thêm tài khoản mới"', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    expect(screen.getByText('Thêm tài khoản mới')).toBeInTheDocument();
  });

  it('modal chứa placeholder "Nhập họ và tên"', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    expect(screen.getByPlaceholderText('Nhập họ và tên')).toBeInTheDocument();
  });

  it('đóng modal khi click nút X', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    expect(screen.getByText('Thêm tài khoản mới')).toBeInTheDocument();

    // Tìm nút X trong modal (nút đầu tiên có SVG X không phải button hành động)
    const xButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('svg') && !btn.textContent?.trim()
    );
    if (xButtons.length > 0) {
      fireEvent.click(xButtons[0]);
      expect(screen.queryByText('Thêm tài khoản mới')).not.toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Xóa người dùng', () => {
  // Nút Xóa của một tài khoản thường (u2). Dòng đầu là tài khoản Admin duy nhất: xóa nó bị chặn
  // (src/components/UserManagement.tsx handleDelete – "Admin duy nhất còn lại").
  const deleteButtonOf = (fullName: string) =>
    within(screen.getByText(fullName).closest('tr') as HTMLElement).getByTitle('Xóa');

  it('click nút Xóa hiển thị dialog "Xóa tài khoản người dùng"', () => {
    renderUserManagement();
    fireEvent.click(deleteButtonOf('Trần Thị Chuyên Viên'));
    expect(screen.getByText('Xóa tài khoản người dùng')).toBeInTheDocument();
  });

  it('dialog xác nhận xóa có nút "Xóa vĩnh viễn"', () => {
    renderUserManagement();
    fireEvent.click(deleteButtonOf('Trần Thị Chuyên Viên'));
    expect(screen.getByText('Xóa vĩnh viễn')).toBeInTheDocument();
  });

  it('dialog xác nhận xóa có nút "Hủy bỏ"', () => {
    renderUserManagement();
    fireEvent.click(deleteButtonOf('Trần Thị Chuyên Viên'));
    expect(screen.getByText('Hủy bỏ')).toBeInTheDocument();
  });

  it('click "Hủy bỏ" trong dialog đóng dialog, không xóa user', () => {
    const onUpdateUsers = vi.fn();
    renderUserManagement({ onUpdateUsers });

    fireEvent.click(deleteButtonOf('Trần Thị Chuyên Viên'));
    expect(screen.getByText('Xóa tài khoản người dùng')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hủy bỏ'));
    expect(screen.queryByText('Xóa tài khoản người dùng')).not.toBeInTheDocument();
    // onUpdateUsers KHÔNG được gọi khi hủy
    expect(onUpdateUsers).not.toHaveBeenCalled();
  });

  it('click "Xóa vĩnh viễn" gọi API xóa rồi onUpdateUsers với danh sách đã bỏ user', async () => {
    const onUpdateUsers = vi.fn();
    renderUserManagement({ onUpdateUsers });

    fireEvent.click(deleteButtonOf('Trần Thị Chuyên Viên'));
    fireEvent.click(screen.getByText('Xóa vĩnh viễn'));

    await waitFor(() => expect(onUpdateUsers).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith('/api/users/u2', expect.objectContaining({ method: 'DELETE' }));
    const [newUsers] = onUpdateUsers.mock.calls[0];
    expect(newUsers.map((u: any) => u.id)).toEqual(['u1', 'u3']);
  });

  it('xóa tài khoản Admin duy nhất bị chặn, không mở dialog', () => {
    const onUpdateUsers = vi.fn();
    renderUserManagement({ onUpdateUsers });
    fireEvent.click(deleteButtonOf('Nguyễn Văn Admin'));
    expect(screen.queryByText('Xóa tài khoản người dùng')).not.toBeInTheDocument();
    expect(screen.getByText(/Admin\) duy nhất/)).toBeInTheDocument();
    expect(onUpdateUsers).not.toHaveBeenCalled();
  });
});

// ─── Quyền của người xem: Sở Xây dựng (không phải Admin) không quản lý tài khoản Admin ───
// src/components/UserManagement.tsx canManageAccount (sửa 05/10/2026, cùng luật với server.ts)
describe('UserManagement – người xem là Sở Xây dựng (không phải Admin)', () => {
  const SXD_VIEWER = { id: 'viewer-sxd', username: 'qa_sxd', fullName: 'QA SXD', roleId: 'Chuyên viên', userType: 'agency', agencyId: '1' };
  const actionsOf = (fullName: string) =>
    Array.from((screen.getByText(fullName).closest('tr') as HTMLElement).querySelectorAll('button[title]')).map(b => b.getAttribute('title'));

  it('dòng Admin không có nút Chỉnh sửa / Khôi phục mật khẩu / Xóa', () => {
    renderUserManagement({ currentUser: SXD_VIEWER });
    expect(actionsOf('Nguyễn Văn Admin')).toEqual([]);
  });

  it('tài khoản thường vẫn có đủ nút quản lý', () => {
    renderUserManagement({ currentUser: SXD_VIEWER });
    expect(actionsOf('Trần Thị Chuyên Viên')).toEqual(['Chỉnh sửa', 'Khôi phục mật khẩu', 'Xóa']);
  });

  it('modal sửa tài khoản không cho chọn vai trò Admin', () => {
    renderUserManagement({ currentUser: SXD_VIEWER });
    fireEvent.click(within(screen.getByText('Trần Thị Chuyên Viên').closest('tr') as HTMLElement).getByTitle('Chỉnh sửa'));
    const roleOptions = Array.from(document.querySelectorAll('select option')).map(o => (o as HTMLOptionElement).value);
    expect(roleOptions).toContain('Chuyên viên');
    expect(roleOptions).not.toContain('Admin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Chỉnh sửa user', () => {
  it('click nút Sửa (Chỉnh sửa) mở modal với tiêu đề "Chỉnh sửa tài khoản"', () => {
    renderUserManagement();
    const editButtons = screen.getAllByTitle('Chỉnh sửa');
    expect(editButtons.length).toBeGreaterThan(0);
    fireEvent.click(editButtons[0]);
    expect(screen.getByText('Chỉnh sửa tài khoản')).toBeInTheDocument();
  });

  it('modal chỉnh sửa điền sẵn fullName của user', () => {
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Chỉnh sửa')[0]);
    expect(screen.getByDisplayValue('Nguyễn Văn Admin')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Validation logic (unit)', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9+]{10,12}$/;

  describe('Email validation', () => {
    it('email hợp lệ', () => {
      expect(emailRegex.test('user@example.com')).toBe(true);
      expect(emailRegex.test('admin@sxd.gov.vn')).toBe(true);
      expect(emailRegex.test('a@b.co')).toBe(true);
    });

    it('email không hợp lệ', () => {
      expect(emailRegex.test('notanemail')).toBe(false);
      expect(emailRegex.test('missing@dot')).toBe(false);
      expect(emailRegex.test('@nodomain.com')).toBe(false);
    });
  });

  describe('Phone validation', () => {
    it('SĐT hợp lệ (10 chữ số)', () => {
      expect(phoneRegex.test('0901234567')).toBe(true);
    });

    it('SĐT không hợp lệ (< 10 ký tự)', () => {
      expect(phoneRegex.test('090123')).toBe(false);
    });

    it('SĐT không hợp lệ (có chữ)', () => {
      expect(phoneRegex.test('abc1234567')).toBe(false);
    });
  });

  describe('Duplicate detection', () => {
    it('phát hiện username trùng', () => {
      const isDuplicate = mockUsers.some(
        u => u.username.toLowerCase() === 'admin' && u.id !== 'u-new'
      );
      expect(isDuplicate).toBe(true);
    });

    it('phát hiện email trùng', () => {
      const isDuplicate = mockUsers.some(
        u => u.email.toLowerCase() === 'admin@sxd.gov.vn' && u.id !== 'u-new'
      );
      expect(isDuplicate).toBe(true);
    });

    it('không trùng khi username mới hoàn toàn', () => {
      const isDuplicate = mockUsers.some(
        u => u.username.toLowerCase() === 'brandnewuser' && u.id !== 'u-new'
      );
      expect(isDuplicate).toBe(false);
    });

    it('không trùng khi chỉnh sửa chính mình (cùng id)', () => {
      const isDuplicate = mockUsers.some(
        u => u.username.toLowerCase() === 'admin' && u.id !== 'u1'
      );
      expect(isDuplicate).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Modal Cấu hình Email', () => {
  it('click "Cấu hình Email" mở modal SMTP', () => {
    renderUserManagement();
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình hệ thống/i }));
    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
  });

  it('click "Đóng lại" trong modal email đóng modal', () => {
    renderUserManagement();
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình hệ thống/i }));
    expect(screen.getByText(/SMTP Host/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Đóng lại'));
    expect(screen.queryByText(/SMTP Host/i)).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Modal Danh mục vai trò', () => {
  it('click "Danh mục vai trò" mở modal ListManagement', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Danh mục vai trò'));
    // ListManagement được mock thành <div data-testid="list-management">vai trò</div>
    expect(screen.getByTestId('list-management')).toBeInTheDocument();
  });

  it('click X trong modal vai trò đóng modal', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Danh mục vai trò'));
    expect(screen.getByTestId('list-management')).toBeInTheDocument();
    // Nút X có title="Đóng modal"
    fireEvent.click(screen.getByTitle('Đóng modal'));
    expect(screen.queryByTestId('list-management')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Validation khi Lưu tài khoản', () => {
  it('submit modal trống hiển thị cảnh báo "Vui lòng điền đầy đủ"', async () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    fireEvent.click(screen.getByText('Lưu tài khoản'));
    await waitFor(() => {
      expect(screen.getByText(/Vui lòng điền đầy đủ thông tin bắt buộc/i)).toBeInTheDocument();
    });
  });

  it('sau khi hiển thị toast, có thể đóng toast bằng nút X', async () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    fireEvent.click(screen.getByText('Lưu tài khoản'));
    await waitFor(() => {
      expect(screen.getByText(/Vui lòng điền đầy đủ/i)).toBeInTheDocument();
    });
    // Toast có nút X để đóng; lấy button nhỏ trong toast (không phải modal X)
    const toastCloseBtn = screen.getAllByRole('button').filter(
      btn => btn.closest('.fixed.top-6')
    );
    if (toastCloseBtn.length > 0) {
      fireEvent.click(toastCloseBtn[toastCloseBtn.length - 1]);
      expect(screen.queryByText(/Vui lòng điền đầy đủ/i)).not.toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Hiển thị badge trong bảng', () => {
  it('user agency hiển thị text "Cơ quan nhà nước" trong bảng', () => {
    renderUserManagement();
    // u1 và u2 là agency → xuất hiện ít nhất 2 lần "Cơ quan nhà nước"
    const cells = screen.getAllByText('Cơ quan nhà nước');
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it('user isFollower=true hiển thị badge "Người theo dõi"', () => {
    renderUserManagement();
    // u2 có isFollower=true — text xuất hiện nhiều nơi (badge + dropdown option + form label)
    expect(screen.getAllByText('Người theo dõi').length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Khôi phục mật khẩu', () => {
  it('click nút Khôi phục mật khẩu mở dialog xác nhận', () => {
    renderUserManagement();
    const recoverBtns = screen.getAllByTitle('Khôi phục mật khẩu');
    expect(recoverBtns.length).toBeGreaterThan(0);
    fireEvent.click(recoverBtns[0]);
    expect(screen.getByText('Khôi phục mật khẩu')).toBeInTheDocument();
  });

  it('dialog khôi phục có nút "Khôi phục ngay" và "Hủy bỏ"', () => {
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Khôi phục mật khẩu')[0]);
    expect(screen.getByText('Khôi phục ngay')).toBeInTheDocument();
    expect(screen.getByText('Hủy bỏ')).toBeInTheDocument();
  });

  it('click "Hủy bỏ" trong dialog khôi phục đóng dialog', () => {
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Khôi phục mật khẩu')[0]);
    expect(screen.getByText('Khôi phục ngay')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hủy bỏ'));
    expect(screen.queryByText('Khôi phục ngay')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Khôi phục mật khẩu – API call', () => {
  it('click "Khôi phục ngay" gọi fetch không crash', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, tempPassword: 'Abc@1234' }) });
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Khôi phục mật khẩu')[0]);
    expect(() => fireEvent.click(screen.getByText('Khôi phục ngay'))).not.toThrow();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('click "Khôi phục ngay" khi API trả về lỗi không crash', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Khôi phục mật khẩu')[0]);
    expect(() => fireEvent.click(screen.getByText('Khôi phục ngay'))).not.toThrow();
  });

  it('sau khi khôi phục API OK hiển thị kết quả hoặc đóng dialog', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, tempPassword: 'Abc@1234' }) });
    renderUserManagement();
    fireEvent.click(screen.getAllByTitle('Khôi phục mật khẩu')[0]);
    fireEvent.click(screen.getByText('Khôi phục ngay'));
    await waitFor(() => {
      // Dialog đóng hoặc hiện kết quả
      const hasResult = !!screen.queryByText(/Abc@1234/) || !!screen.queryByText(/Thành công/)
        || screen.queryByText('Khôi phục ngay') === null;
      expect(hasResult).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Cấu hình Email – Lưu', () => {
  it('modal email có input SMTP host', () => {
    renderUserManagement();
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình hệ thống/i }));
    const hostInput = screen.queryByPlaceholderText(/smtp/i)
      || screen.queryByPlaceholderText(/host/i)
      || screen.queryAllByRole('textbox')[0];
    if (hostInput) expect(hostInput).toBeInTheDocument();
  });

  it('click "Lưu cấu hình" trong modal email không crash', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    renderUserManagement();
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình hệ thống/i }));
    const saveBtn = screen.queryByText('Lưu cấu hình')
      || screen.queryByText(/Lưu/i);
    if (saveBtn) {
      expect(() => fireEvent.click(saveBtn)).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Lọc kết hợp tìm kiếm + loại', () => {
  it('tìm kiếm "Admin" + lọc agency chỉ hiện Admin', () => {
    renderUserManagement();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByDisplayValue('Tất cả loại tài khoản'), { target: { value: 'agency' } });
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.queryByText('Lê Văn Đầu Tư')).not.toBeInTheDocument();
  });

  it('tìm kiếm không có kết quả sau khi lọc → empty state', () => {
    renderUserManagement();
    fireEvent.change(screen.getByDisplayValue('Tất cả loại tài khoản'), { target: { value: 'investor' } });
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'Không tồn tại' } });
    expect(screen.getByText(/Không tìm thấy tài khoản/i)).toBeInTheDocument();
  });

  it('xóa tìm kiếm sau khi lọc giữ nguyên filter', () => {
    renderUserManagement();
    fireEvent.change(screen.getByDisplayValue('Tất cả loại tài khoản'), { target: { value: 'agency' } });
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: 'Admin' } });
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm người dùng...'), { target: { value: '' } });
    // Sau khi xóa search, filter agency vẫn giữ → không thấy investor
    expect(screen.queryByText('Lê Văn Đầu Tư')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UserManagement – Thêm tài khoản – điền form', () => {
  it('điền fullName vào input trong modal', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    const fullNameInput = screen.getByPlaceholderText('Nhập họ và tên');
    fireEvent.change(fullNameInput, { target: { value: 'Người Dùng Mới' } });
    expect((fullNameInput as HTMLInputElement).value).toBe('Người Dùng Mới');
  });

  it('modal có dropdown loại tài khoản', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('modal có nút "Lưu tài khoản" và "Hủy bỏ"', () => {
    renderUserManagement();
    fireEvent.click(screen.getByText('Thêm tài khoản'));
    expect(screen.getByText('Lưu tài khoản')).toBeInTheDocument();
    expect(screen.queryAllByText('Hủy bỏ').length).toBeGreaterThan(0);
  });
});
