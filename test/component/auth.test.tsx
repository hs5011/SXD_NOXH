// @vitest-environment jsdom
/**
 * Test Auth: AuthContext (login/logout, role) + Login component (xác thực mật khẩu)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import { AuthProvider, useAuth, UserRole } from '../../src/context/AuthContext';
import Login from '../../src/components/Login';
import { hashPassword } from '../../src/lib/crypto';
import type { UserAccount } from '../../src/types';

// ─── Mock appData (tránh load toàn bộ INITIAL_USERS nặng) ────────────────────
vi.mock('../../src/data/appData', () => ({
  INITIAL_USERS: [
    {
      id: 'u1', fullName: 'Quản trị hệ thống', phone: '', email: 'admin@example.com',
      username: 'admin', password: '123456', userType: 'agency', agencyId: '1',
      department: 'Phòng PTĐT', roleId: 'Admin',
    },
    {
      id: 'u2', fullName: 'Lãnh đạo Sở Xây dựng', phone: '', email: 'sxd@example.com',
      username: 'sxd', password: '123456', userType: 'agency', agencyId: '1',
      department: 'Phòng PTĐT', roleId: 'Lãnh đạo',
    },
    {
      id: 'u5', fullName: 'Chuyên viên Sở Xây dựng', phone: '', email: 'sxd_cv@example.com',
      username: 'sxd_cv', password: '123456', userType: 'agency', agencyId: '1',
      department: 'Phòng PTĐT', roleId: 'Chuyên viên',
    },
  ],
  INITIAL_PROJECTS: [],
  INITIAL_PROCESSES: [],
}));

vi.mock('lucide-react', () => ({
  Building2: () => <span data-testid="icon-building" />,
  Lock:      () => <span data-testid="icon-lock" />,
  User:      () => <span data-testid="icon-user" />,
}));

// ─── Dữ liệu dùng chung ───────────────────────────────────────────────────────

const MOCK_USERS: UserAccount[] = [
  {
    id: 'u1', fullName: 'Quản trị hệ thống', phone: '', email: 'admin@example.com',
    username: 'admin', password: '123456', userType: 'agency',
    agencyId: '1', department: 'Phòng PTĐT', roleId: 'Admin',
  },
  {
    id: 'u2', fullName: 'Lãnh đạo SXD', phone: '', email: 'sxd@example.com',
    username: 'sxd', password: '123456', userType: 'agency',
    agencyId: '1', department: 'Phòng PTĐT', roleId: 'Lãnh đạo',
  },
  {
    id: 'u5', fullName: 'Chuyên viên SXD', phone: '', email: 'sxd_cv@example.com',
    username: 'sxd_cv', password: '123456', userType: 'agency',
    agencyId: '1', department: 'Phòng PTĐT', roleId: 'Chuyên viên',
  },
  {
    id: 'u4', fullName: 'Chủ đầu tư', phone: '', email: 'cdt@example.com',
    username: 'cdt', password: '123456', userType: 'investor',
    investorId: 'Công ty Lê Thành', roleId: 'Lãnh đạo',
  },
];

const HASHED_123456 = hashPassword('123456');

// ─── Giả lập /api/login phía server ──────────────────────────────────────────
// Login không còn đăng nhập offline trên client: mọi xác thực đều do server làm.
// Server giả: so khớp username (không phân biệt hoa thường, đã trim) và hash mật khẩu,
// trả về user KHÔNG kèm password giống server thật.
function makeLoginServer(users: UserAccount[]) {
  return vi.fn(async (_url: any, init?: any) => {
    const { username = '', password = '' } = JSON.parse(init?.body || '{}');
    const found = users.find(u => {
      if ((u.username || '').toLowerCase() !== String(username).trim().toLowerCase()) return false;
      const stored = u.password || '';
      const storedHash = /^[0-9a-f]{64}$/i.test(stored) ? stored : hashPassword(stored);
      return storedHash === hashPassword(String(password).trim());
    });
    if (!found) {
      return { ok: false, status: 401, json: async () => ({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }) } as any;
    }
    const { password: _p, ...clean } = found;
    return { ok: true, status: 200, json: async () => ({ token: 'test-token', user: clean }) } as any;
  });
}

// ─── Helper: Consumer component để test AuthContext ───────────────────────────
function AuthConsumer() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="username">{user?.username ?? 'null'}</div>
      <div data-testid="role">{user?.role ?? 'null'}</div>
      <button onClick={() => login('admin', 'admin')}>Login Admin</button>
      <button onClick={() => login('leader1', 'leader')}>Login Leader</button>
      <button onClick={() => login('cv1', 'specialist')}>Login Specialist</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function RoleGuard({ allowedRole, children }: { allowedRole: UserRole; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== allowedRole) return <div data-testid="access-denied">Không có quyền truy cập</div>;
  return <div data-testid="access-granted">{children}</div>;
}

// =============================================================================
// PHẦN 1 – AuthContext: login / logout / role
// =============================================================================
describe('AuthContext – Quản lý trạng thái đăng nhập', () => {

  // ── 1A. Khởi tạo Provider ──────────────────────────────────────────────────
  describe('1A – Khởi tạo', () => {
    it('1A.1 – AuthProvider render children bình thường', () => {
      render(
        <AuthProvider>
          <p>Hello Auth</p>
        </AuthProvider>
      );
      expect(screen.getByText('Hello Auth')).toBeInTheDocument();
    });

    it('1A.2 – Trạng thái ban đầu: user là null', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      expect(screen.getByTestId('username').textContent).toBe('null');
      expect(screen.getByTestId('role').textContent).toBe('null');
    });

    it('1A.3 – useAuth() ném lỗi khi dùng ngoài AuthProvider', () => {
      const originalConsoleError = console.error;
      console.error = vi.fn(); // tắt output lỗi của React
      expect(() => render(<AuthConsumer />)).toThrow('useAuth must be used within AuthProvider');
      console.error = originalConsoleError;
    });
  });

  // ── 1B. login() ───────────────────────────────────────────────────────────
  describe('1B – login()', () => {
    it('1B.1 – login("admin", "admin") → user.username = "admin"', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('username').textContent).toBe('admin');
    });

    it('1B.2 – login("admin", "admin") → user.role = "admin"', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('role').textContent).toBe('admin');
    });

    it('1B.3 – login với role "leader" hoạt động đúng', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.getByTestId('role').textContent).toBe('leader');
      expect(screen.getByTestId('username').textContent).toBe('leader1');
    });

    it('1B.4 – login với role "specialist" hoạt động đúng', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Specialist'));
      expect(screen.getByTestId('role').textContent).toBe('specialist');
      expect(screen.getByTestId('username').textContent).toBe('cv1');
    });

    it('1B.5 – Đăng nhập lần 2 ghi đè lần 1 (last login wins)', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('role').textContent).toBe('admin');
      fireEvent.click(screen.getByText('Login Specialist'));
      expect(screen.getByTestId('role').textContent).toBe('specialist');
      expect(screen.getByTestId('username').textContent).toBe('cv1');
    });

    it('1B.6 – Sau login, user không còn null', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      expect(screen.getByTestId('username').textContent).toBe('null');
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.getByTestId('username').textContent).not.toBe('null');
    });
  });

  // ── 1C. logout() ──────────────────────────────────────────────────────────
  describe('1C – logout()', () => {
    it('1C.1 – logout() sau login → user trở về null', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('username').textContent).toBe('admin');
      fireEvent.click(screen.getByText('Logout'));
      expect(screen.getByTestId('username').textContent).toBe('null');
      expect(screen.getByTestId('role').textContent).toBe('null');
    });

    it('1C.2 – logout() khi chưa login không crash', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      expect(() => fireEvent.click(screen.getByText('Logout'))).not.toThrow();
      expect(screen.getByTestId('username').textContent).toBe('null');
    });

    it('1C.3 – Có thể login lại sau khi logout', () => {
      render(<AuthProvider><AuthConsumer /></AuthProvider>);
      fireEvent.click(screen.getByText('Login Admin'));
      fireEvent.click(screen.getByText('Logout'));
      expect(screen.getByTestId('username').textContent).toBe('null');
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.getByTestId('username').textContent).toBe('leader1');
      expect(screen.getByTestId('role').textContent).toBe('leader');
    });
  });

  // ── 1D. Role-based access control ─────────────────────────────────────────
  describe('1D – Kiểm soát truy cập theo role (RBAC)', () => {
    it('1D.1 – Chưa đăng nhập → bị từ chối truy cập trang admin', () => {
      render(
        <AuthProvider>
          <RoleGuard allowedRole="admin">
            <span>Bảng điều khiển Admin</span>
          </RoleGuard>
        </AuthProvider>
      );
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.queryByText('Bảng điều khiển Admin')).not.toBeInTheDocument();
    });

    it('1D.2 – Admin đăng nhập → được truy cập trang admin', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="admin">
            <span>Bảng điều khiển Admin</span>
          </RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('access-granted')).toBeInTheDocument();
      expect(screen.getByText('Bảng điều khiển Admin')).toBeInTheDocument();
    });

    it('1D.3 – Leader đăng nhập → bị từ chối trang chỉ dành cho admin', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="admin">
            <span>Bảng điều khiển Admin</span>
          </RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.queryByText('Bảng điều khiển Admin')).not.toBeInTheDocument();
    });

    it('1D.4 – Specialist đăng nhập → bị từ chối trang chỉ dành cho admin', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="admin">
            <span>Chỉ admin</span>
          </RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Specialist'));
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
    });

    it('1D.5 – Leader đăng nhập → được truy cập trang dành cho leader', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="leader">
            <span>Trang Lãnh đạo</span>
          </RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.getByTestId('access-granted')).toBeInTheDocument();
    });

    it('1D.6 – Sau logout → quyền truy cập bị thu hồi', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="admin">
            <span>Nội dung Admin</span>
          </RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Admin'));
      expect(screen.getByTestId('access-granted')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Logout'));
      expect(screen.getByTestId('access-denied')).toBeInTheDocument();
      expect(screen.queryByText('Nội dung Admin')).not.toBeInTheDocument();
    });

    it('1D.7 – Nhiều RoleGuard cùng lúc: chỉ guard đúng role mới mở', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
          <RoleGuard allowedRole="admin"><span>Admin Panel</span></RoleGuard>
          <RoleGuard allowedRole="leader"><span>Leader Panel</span></RoleGuard>
          <RoleGuard allowedRole="specialist"><span>Specialist Panel</span></RoleGuard>
        </AuthProvider>
      );
      fireEvent.click(screen.getByText('Login Leader'));
      expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
      expect(screen.getByText('Leader Panel')).toBeInTheDocument();
      expect(screen.queryByText('Specialist Panel')).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// PHẦN 2 – Login component: xác thực username + password
// =============================================================================
describe('Login component – Xác thực tài khoản', () => {
  const onLogin = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = makeLoginServer(MOCK_USERS) as any;
  });

  // ── 2A. Giao diện ─────────────────────────────────────────────────────────
  describe('2A – Giao diện form', () => {
    it('2A.1 – Hiển thị tiêu đề "Điều hành Dự án NOXH"', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.getByText('Điều hành Dự án NOXH')).toBeInTheDocument();
    });

    it('2A.2 – Có input username và password', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.getByPlaceholderText('Nhập tên đăng nhập')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Nhập mật khẩu')).toBeInTheDocument();
    });

    it('2A.3 – Input password có type="password"', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.getByPlaceholderText('Nhập mật khẩu')).toHaveAttribute('type', 'password');
    });

    it('2A.4 – Có nút Đăng nhập', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument();
    });

    // Giai đoạn thử nghiệm: khối còn hiển thị (SHOW_TEST_ACCOUNTS trong Login.tsx)
    it('2A.5 – Hiển thị khối tài khoản thử nghiệm trên màn hình đăng nhập', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.getByText('Tài khoản thử nghiệm')).toBeInTheDocument();
    });

    it('2A.6 – Ban đầu không hiển thị thông báo lỗi', () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      expect(screen.queryByText(/không đúng/i)).not.toBeInTheDocument();
    });
  });

  // ── 2B. Đăng nhập thành công ───────────────────────────────────────────────
  describe('2B – Đăng nhập thành công', () => {
    function submitLogin(username: string, password: string) {
      fireEvent.change(screen.getByPlaceholderText('Nhập tên đăng nhập'), { target: { value: username } });
      fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu'),      { target: { value: password } });
      fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
    }

    it('2B.1 – admin / 123456 → onLogin được gọi', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    });

    it('2B.2 – onLogin nhận đúng UserAccount của admin', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        id: 'u1',
        username: 'admin',
        roleId: 'Admin',
        userType: 'agency',
      })));
    });

    it('2B.3 – sxd / 123456 → onLogin với roleId "Lãnh đạo"', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('sxd', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        username: 'sxd',
        roleId: 'Lãnh đạo',
      })));
    });

    it('2B.4 – sxd_cv / 123456 → onLogin với roleId "Chuyên viên"', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('sxd_cv', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        username: 'sxd_cv',
        roleId: 'Chuyên viên',
      })));
    });

    it('2B.5 – Username không phân biệt hoa thường (ADMIN = admin)', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('ADMIN', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin' })));
    });

    it('2B.6 – Username có khoảng trắng thừa vẫn đăng nhập được (trim)', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('  admin  ', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    });

    it('2B.7 – Mật khẩu đã hash (64-char hex) vẫn so sánh đúng', async () => {
      const hashedUser: UserAccount = {
        ...MOCK_USERS[0],
        id: 'u-hashed',
        username: 'hashed_user',
        password: HASHED_123456,
      };
      global.fetch = makeLoginServer([hashedUser]) as any;
      render(<Login onLogin={onLogin} users={[hashedUser]} />);
      fireEvent.change(screen.getByPlaceholderText('Nhập tên đăng nhập'), { target: { value: 'hashed_user' } });
      fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu'),      { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
      await waitFor(() => {
        expect(onLogin).toHaveBeenCalledTimes(1);
        expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'hashed_user' }));
      });
    });

    it('2B.8 – Đăng nhập thành công không hiển thị lỗi', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(/không đúng/i)).not.toBeInTheDocument();
    });

    it('2B.9 – cdt (investor) đăng nhập thành công với userType "investor"', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      fireEvent.change(screen.getByPlaceholderText('Nhập tên đăng nhập'), { target: { value: 'cdt' } });
      fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu'),      { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
      await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
        userType: 'investor',
        username: 'cdt',
      })));
    });

    it('2B.10 – Mất kết nối server → KHÔNG đăng nhập offline bằng dữ liệu trên client', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any;
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      fireEvent.change(screen.getByPlaceholderText('Nhập tên đăng nhập'), { target: { value: 'admin' } });
      fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu'),      { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
      await waitFor(() => expect(screen.getByText(/Không kết nối được máy chủ/i)).toBeInTheDocument());
      expect(onLogin).not.toHaveBeenCalled();
    });
  });

  // ── 2C. Đăng nhập thất bại ────────────────────────────────────────────────
  describe('2C – Đăng nhập thất bại', () => {
    function submitLogin(username: string, password: string) {
      fireEvent.change(screen.getByPlaceholderText('Nhập tên đăng nhập'), { target: { value: username } });
      fireEvent.change(screen.getByPlaceholderText('Nhập mật khẩu'),      { target: { value: password } });
      fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/i }));
    }

    it('2C.1 – Sai mật khẩu → onLogin không được gọi', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', 'wrong_password');
      await waitFor(() => expect(screen.queryByText(/không đúng/i)).toBeInTheDocument());
      expect(onLogin).not.toHaveBeenCalled();
    });

    it('2C.2 – Sai mật khẩu → hiển thị thông báo lỗi', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', 'wrong_password');
      await waitFor(() => expect(screen.getByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeInTheDocument());
    });

    it('2C.3 – Username không tồn tại → thông báo lỗi', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('khong_ton_tai', '123456');
      await waitFor(() => expect(screen.getByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeInTheDocument());
      expect(onLogin).not.toHaveBeenCalled();
    });

    it('2C.4 – Mật khẩu rỗng → không tìm thấy user', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', '');
      // Wait for loading to complete, then verify onLogin not called
      await waitFor(() => expect(screen.getByRole('button', { name: /Đăng nhập/i })).not.toBeDisabled(), { timeout: 2000 });
      expect(onLogin).not.toHaveBeenCalled();
    });

    it('2C.5 – Lỗi cũ bị xóa khi đăng nhập thành công sau đó', async () => {
      render(<Login onLogin={onLogin} users={MOCK_USERS} />);
      submitLogin('admin', 'wrong');
      await waitFor(() => expect(screen.queryByText(/không đúng/i)).toBeInTheDocument());
      submitLogin('admin', '123456');
      await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    });

    it('2C.6 – Users prop rỗng và không có INITIAL_USERS match → lỗi', async () => {
      render(<Login onLogin={onLogin} users={[]} />);
      submitLogin('nobody', 'abc');
      await waitFor(() => expect(screen.queryByText(/không đúng/i)).toBeInTheDocument());
      expect(onLogin).not.toHaveBeenCalled();
    });
  });

  // ── 2D. Xác thực mật khẩu (hashPassword) ─────────────────────────────────
  describe('2D – Logic hashPassword (unit)', () => {
    it('2D.1 – hashPassword("123456") trả về chuỗi 64 ký tự hex', () => {
      const h = hashPassword('123456');
      expect(h).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
    });

    it('2D.2 – Cùng input → cùng output (deterministic)', () => {
      expect(hashPassword('abc')).toBe(hashPassword('abc'));
    });

    it('2D.3 – Khác input → khác output', () => {
      expect(hashPassword('123456')).not.toBe(hashPassword('654321'));
    });

    it('2D.4 – hashPassword("") trả về chuỗi rỗng', () => {
      expect(hashPassword('')).toBe('');
    });

    it('2D.5 – Hash của "123456" khớp giá trị SHA-256 chuẩn', () => {
      // SHA-256("123456") = 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
      const expected = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
      expect(hashPassword('123456')).toBe(expected);
    });

    it('2D.6 – Mật khẩu Unicode được hash không crash', () => {
      expect(() => hashPassword('mật_khẩu_tiếng_việt')).not.toThrow();
      expect(hashPassword('mật_khẩu_tiếng_việt')).toHaveLength(64);
    });

    it('2D.7 – Mật khẩu dài vẫn trả về 64 ký tự', () => {
      const longPass = 'a'.repeat(1000);
      expect(hashPassword(longPass)).toHaveLength(64);
    });
  });
});
