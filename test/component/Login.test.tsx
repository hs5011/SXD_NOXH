// @vitest-environment jsdom
/**
 * Component Tests: Login
 *
 * Kiểm tra:
 *   - Form render đúng inputs
 *   - Đăng nhập sai → hiện thông báo lỗi
 *   - Đăng nhập đúng → gọi onLogin với user object
 *   - Không tự gọi onLogin khi chưa submit
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Login from '../../src/components/Login';
import { hashPassword } from '../../src/lib/crypto';

// ─── Server /api/login giả (Login luôn xác thực qua server) ─────────────────
const SERVER_USERS = [
  { id: 'u1', username: 'admin', password: hashPassword('123456'), roleId: 'Admin', userType: 'agency' },
  { id: 'u2', username: 'sxd', password: hashPassword('123456'), roleId: 'Lãnh đạo', userType: 'agency' },
];

beforeEach(() => {
  global.fetch = vi.fn(async (_url: any, init?: any) => {
    const { username = '', password = '' } = JSON.parse(init?.body || '{}');
    const found = SERVER_USERS.find(u => u.username === String(username).trim().toLowerCase() && u.password === hashPassword(String(password).trim()));
    if (!found) return { ok: false, status: 401, json: async () => ({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }) } as any;
    const { password: _p, ...user } = found;
    return { ok: true, status: 200, json: async () => ({ token: 'test-token', user }) } as any;
  }) as any;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderLogin(onLogin = vi.fn()) {
  render(<Login onLogin={onLogin} />);
  return {
    usernameInput: screen.getByLabelText(/Tên đăng nhập/i),
    passwordInput: screen.getByLabelText(/Mật khẩu/i),
    submitButton: screen.getByRole('button', { name: /Đăng nhập/i }),
    onLogin,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('Login – render', () => {
  it('hiển thị tiêu đề "Điều hành Dự án NOXH"', () => {
    renderLogin();
    expect(screen.getByText(/Điều hành Dự án NOXH/i)).toBeInTheDocument();
  });

  it('hiển thị input tên đăng nhập và mật khẩu', () => {
    const { usernameInput, passwordInput } = renderLogin();
    expect(usernameInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
  });

  it('hiển thị nút Đăng nhập', () => {
    const { submitButton } = renderLogin();
    expect(submitButton).toBeInTheDocument();
  });

  it('không hiển thị lỗi ban đầu', () => {
    renderLogin();
    expect(screen.queryByText(/không đúng/i)).not.toBeInTheDocument();
  });

  // Giai đoạn thử nghiệm: còn hiển thị (SHOW_TEST_ACCOUNTS trong Login.tsx). Khi chạy chính thức tắt cờ
  // đó và đổi test này về "không hiển thị".
  it('hiển thị khối tài khoản thử nghiệm', () => {
    renderLogin();
    expect(screen.getByText('Tài khoản thử nghiệm')).toBeInTheDocument();
    expect(screen.getByText(/User: admin/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Login – sai thông tin', () => {
  it('hiện lỗi khi sai cả username lẫn password', async () => {
    const user = userEvent.setup();
    const { usernameInput, passwordInput, submitButton } = renderLogin();

    await user.type(usernameInput, 'wronguser');
    await user.type(passwordInput, 'wrongpass');
    await user.click(submitButton);

    expect(await screen.findByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeInTheDocument();
  });

  it('hiện lỗi khi đúng username nhưng sai password', async () => {
    const user = userEvent.setup();
    const { usernameInput, passwordInput, submitButton } = renderLogin();

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, 'wrongpass');
    await user.click(submitButton);

    expect(await screen.findByText(/Tên đăng nhập hoặc mật khẩu không đúng/i)).toBeInTheDocument();
  });

  it('KHÔNG gọi onLogin khi sai thông tin', async () => {
    const user = userEvent.setup();
    const { usernameInput, passwordInput, submitButton, onLogin } = renderLogin();

    await user.type(usernameInput, 'hacker');
    await user.type(passwordInput, 'hacked');
    await user.click(submitButton);

    expect(onLogin).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Login – đăng nhập thành công', () => {
  it('gọi onLogin với user object khi admin / 123456', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn();
    const { usernameInput, passwordInput, submitButton } = renderLogin(mockLogin);

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, '123456');
    await user.click(submitButton);

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockLogin.mock.calls[0][0].username).toBe('admin');
  });

  it('user object có đầy đủ thông tin (roleId, userType)', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn();
    const { usernameInput, passwordInput, submitButton } = renderLogin(mockLogin);

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, '123456');
    await user.click(submitButton);

    const loggedInUser = mockLogin.mock.calls[0][0];
    expect(loggedInUser).toHaveProperty('roleId', 'Admin');
    expect(loggedInUser).toHaveProperty('userType', 'agency');
    // Server không bao giờ trả mật khẩu về client
    expect(loggedInUser).not.toHaveProperty('password');
  });

  it('đăng nhập được với tài khoản sxd / 123456', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn();
    const { usernameInput, passwordInput, submitButton } = renderLogin(mockLogin);

    await user.type(usernameInput, 'sxd');
    await user.type(passwordInput, '123456');
    await user.click(submitButton);

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockLogin.mock.calls[0][0].username).toBe('sxd');
  });

  it('không hiển thị lỗi sau khi đăng nhập thành công', async () => {
    const user = userEvent.setup();
    const { usernameInput, passwordInput, submitButton } = renderLogin();

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, '123456');
    await user.click(submitButton);

    expect(screen.queryByText(/không đúng/i)).not.toBeInTheDocument();
  });
});
