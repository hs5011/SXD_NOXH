import React, { useState } from 'react';
import { UserAccount } from '../types';
import { Building2, Lock, User } from 'lucide-react';
import { apiFetch } from '../utils/apiFetch';

// Khối "Tài khoản thử nghiệm" dưới form đăng nhập (giai đoạn thử nghiệm).
// KHI CHẠY CHÍNH THỨC: đặt SHOW_TEST_ACCOUNTS = false (hoặc xóa khối này) rồi build lại.
const SHOW_TEST_ACCOUNTS = true;
const TEST_ACCOUNTS = [
  { label: 'Admin', username: 'admin', password: '123456' },
  { label: 'Lãnh đạo SXD', username: 'sxd', password: '123456' },
  { label: 'Lãnh đạo SNNMT', username: 'snnmt', password: '123456' },
  { label: 'Chủ Đầu tư (Công ty TNHH Thương mại – Xây dựng Lê Thành)', username: 'cdt', password: '123456' },
  { label: 'Phường Bình Đông', username: 'phuong_binhdong', password: '123456' },
  { label: 'Lãnh đạo SQHKT', username: 'sqhkt', password: '123456' }
];

interface LoginProps {
  onLogin: (user: UserAccount) => void;
  users?: UserAccount[];
  // Lý do bị đưa về màn hình đăng nhập (vd. phiên hết hạn)
  notice?: string | null;
}

export default function Login({ onLogin, users = [], notice }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('current_user', JSON.stringify(data.user));
        onLogin(data.user);
      } else {
        const data = await response.json();
        setError(data.error || 'Tên đăng nhập hoặc mật khẩu không đúng');
      }
    } catch (err) {
      // No client-side/offline login: authentication is always verified by the server
      console.warn("Login API connection failed:", err);
      setError("Không kết nối được máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Building2 size={32} className="text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          Điều hành Dự án NOXH
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Đăng nhập để truy cập hệ thống
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                Tên đăng nhập
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Mật khẩu
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="Nhập mật khẩu"
                />
              </div>
            </div>

            {notice && !error && (
              <div className="text-amber-800 text-sm font-medium bg-amber-50 p-3 rounded-md border border-amber-200">
                {notice}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm font-medium bg-red-50 p-3 rounded-md border border-red-100">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </div>
          </form>

          {SHOW_TEST_ACCOUNTS && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">
                    Tài khoản thử nghiệm
                  </span>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-600">
                {TEST_ACCOUNTS.map(acc => (
                  <div key={acc.username} className="bg-slate-50 p-3 rounded border border-slate-200">
                    <p className="font-medium text-slate-900">{acc.label}</p>
                    <p>User: {acc.username}</p>
                    <p>Pass: {acc.password}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
