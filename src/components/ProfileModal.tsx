import React, { useState } from 'react';
import { 
  X, User, Mail, Phone, Lock, Shield, Building, 
  CheckCircle2, AlertTriangle, Building2, Eye, EyeOff 
} from 'lucide-react';
import { UserAccount } from '../types';
import { apiFetch } from '../utils/apiFetch';

interface ProfileModalProps {
  currentUser: UserAccount;
  users: UserAccount[];
  agencies: any[];
  onUpdateCurrentUser: (updatedUser: UserAccount) => void;
  onUpdateAllUsers: (newList: UserAccount[]) => Promise<void>;
  onClose: () => void;
  onLogout: () => void;
}

export default function ProfileModal({
  currentUser,
  users,
  agencies,
  onUpdateCurrentUser,
  onUpdateAllUsers,
  onClose,
  onLogout
}: ProfileModalProps) {
  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [email, setEmail] = useState(currentUser.email || '');
  
  // Password state
  const mustChange = !!currentUser.mustChangePassword;
  const [showPasswordChange, setShowPasswordChange] = useState(mustChange);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPlainPassword, setShowPlainPassword] = useState(false);

  // Status state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form validation
  const validateForm = () => {
    if (!fullName.trim()) {
      setErrorMsg('Vui lòng nhập Họ và tên.');
      return false;
    }
    if (!email.trim()) {
      setErrorMsg('Vui lòng nhập địa chỉ Email.');
      return false;
    }
    // Simple email pattern check
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setErrorMsg('Địa chỉ Email không đúng định dạng.');
      return false;
    }
    if (phone.trim() && !/^\d{10,12}$/.test(phone.trim())) {
      setErrorMsg('Số điện thoại phải chứa từ 10 đến 12 chữ số.');
      return false;
    }

    // Password validation if the user wants to change password
    // (Việc xác minh mật khẩu cũ có đúng hay không do server đảm nhiệm qua
    // /api/profile/change-password — client không có mật khẩu hash để tự so sánh.)
    if (showPasswordChange) {
      if (!oldPassword) {
        setErrorMsg('Vui lòng nhập mật khẩu cũ.');
        return false;
      }

      if (!newPassword) {
        setErrorMsg('Vui lòng nhập mật khẩu mới.');
        return false;
      }
      if (newPassword.length < 6) {
        setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
        return false;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('Xác nhận mật khẩu mới không khớp.');
        return false;
      }
    }

    // Email unique check across other users
    const emailExists = users.some(u => u.email && u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.id !== currentUser.id);
    if (emailExists) {
      setErrorMsg('Địa chỉ Email đã được sử dụng bởi một tài khoản khác trong hệ thống.');
      return false;
    }

    // Phone unique check across other users
    if (phone.trim()) {
      const phoneExists = users.some(u => u.phone && u.phone.trim() === phone.trim() && u.id !== currentUser.id);
      if (phoneExists) {
        setErrorMsg('Số điện thoại đã tồn tại trong hệ thống.');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const isPasswordChanged = showPasswordChange && !!newPassword;

      // Đổi mật khẩu qua endpoint chuyên biệt: server xác minh mật khẩu cũ và
      // áp policy mật khẩu, vì client không có (và không nên có) hash mật khẩu
      // hiện tại để tự so sánh.
      if (isPasswordChanged) {
        const res = await apiFetch('/api/profile/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          setErrorMsg(errBody.error || 'Đổi mật khẩu thất bại. Vui lòng thử lại.');
          setIsSubmitting(false);
          return;
        }
      }

      // Lưu hồ sơ của chính mình qua /api/users/me: server chỉ nhận họ tên, email, SĐT, avatar
      const profileRes = await apiFetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => ({}));
        setErrorMsg(errBody.error || 'Lưu thông tin cá nhân thất bại. Vui lòng thử lại.');
        setIsSubmitting(false);
        return;
      }

      const updatedUser: UserAccount = {
        ...currentUser,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      };

      // Cập nhật danh sách cục bộ (không ghi server)
      await onUpdateAllUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));

      if (isPasswordChanged) {
        setSuccessMsg('Đổi mật khẩu thành công! Đang chuyển hướng đăng nhập lại...');
        // Clear password fields on success
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordChange(false);
        // Force logout after 1.5 seconds
        setTimeout(() => {
          onLogout();
        }, 1500);
      } else {
        // Update local state in App.tsx
        onUpdateCurrentUser(updatedUser);
        setSuccessMsg('Đã cập nhật thông tin cá nhân thành công!');

        // Auto dismiss success
        setTimeout(() => {
          setSuccessMsg(null);
        }, 3000);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Có lỗi xảy ra khi lưu thay đổi. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get Unit display name
  const getUnitDisplay = () => {
    if (currentUser.userType === 'agency') {
      const agencyName = agencies.find(a => a.id === currentUser.agencyId)?.name || 'Cơ quan nhà nước';
      return currentUser.department ? `${agencyName} (${currentUser.department})` : agencyName;
    } else {
      return currentUser.investorId || 'Chưa xác định';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-250">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <User size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Thông tin cá nhân</h3>
              <p className="text-xs text-slate-400">Xem và chỉnh sửa hồ sơ tài khoản của bạn</p>
            </div>
          </div>
          {!mustChange && (
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
            title="Đóng"
          >
            <X size={20} />
          </button>
          )}
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {currentUser.mustChangePassword && (
            <div className="flex items-start gap-2.5 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl animate-in fade-in slide-in-from-top-1">
              <AlertTriangle className="shrink-0 text-amber-600 mt-0.5" size={18} />
              <div>
                <div className="text-sm font-bold">Yêu cầu đổi mật khẩu mới</div>
                <div className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Tài khoản của bạn vừa được cấp lại mật khẩu tạm thời. Để đảm bảo an toàn thông tin, vui lòng đổi sang mật khẩu mới trước khi tiếp tục.
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl animate-in fade-in slide-in-from-top-1">
              <AlertTriangle className="shrink-0 text-rose-600 mt-0.5" size={18} />
              <div className="text-sm font-semibold">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 p-4 bg-emerald-50 border border-emerald-100 text-emerald-850 rounded-2xl animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="shrink-0 text-emerald-600 mt-0.5" size={18} />
              <div className="text-sm font-semibold text-emerald-800">{successMsg}</div>
            </div>
          )}

          {/* Editable General Fields */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Hồ sơ cá nhân</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nhập họ và tên..."
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Nhập email..."
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Số điện thoại</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Nhập số điện thoại..."
                    className="w-full pl-11 pr-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Authorization Config (Read-only) */}
          <div className="space-y-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl relative">
            <div className="absolute right-4 top-4 text-slate-350" title="Thông tin hiển thị, liên hệ quản trị nếu cần đổi">
              <Lock size={15} />
            </div>
            
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Thông tin hệ thống</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
              <div className="space-y-1">
                <span className="text-slate-400">Tên đăng nhập (Username)</span>
                <p className="text-sm font-semibold text-slate-650 bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200">
                  {currentUser.username}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400">Vai trò</span>
                <p className="text-sm font-semibold text-slate-650 bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5">
                  <Shield size={14} className="text-blue-500" />
                  {currentUser.roleId}
                </p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <span className="text-slate-400">Đơn vị công tác</span>
                <p className="text-sm font-semibold text-slate-650 bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center gap-1.5">
                  {currentUser.userType === 'agency' ? (
                    <Building2 size={14} className="text-emerald-500" />
                  ) : (
                    <Building size={14} className="text-orange-500" />
                  )}
                  {getUnitDisplay()}
                </p>
              </div>
            </div>
          </div>

          {/* Collapsible / Expandable Password Change Area */}
          <div className="border border-slate-200 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-blue-500" />
                <span className="text-sm font-bold text-slate-705">Đổi mật khẩu bảo mật</span>
              </div>
              {!mustChange && (
              <button 
                type="button"
                onClick={() => {
                  setShowPasswordChange(!showPasswordChange);
                  if (showPasswordChange) {
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-all cursor-pointer"
              >
                {showPasswordChange ? 'Hủy đổi mật khẩu' : 'Yêu cầu đổi mật khẩu'}
              </button>
              )}
            </div>

            {showPasswordChange && (
              <div className="space-y-4 pt-2.5 border-t border-slate-100 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-705 flex items-center gap-1">
                    Mật khẩu cũ <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPlainPassword ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Nhập mật khẩu hiện tại (mật khẩu cũ)..."
                      className="w-full px-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-705">Mật khẩu mới</label>
                    <div className="relative">
                      <input
                        type={showPlainPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)..."
                        className="w-full px-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPlainPassword(!showPlainPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                      >
                        {showPlainPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-705">Xác nhận mật khẩu mới</label>
                    <input
                      type={showPlainPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Xác nhận mật khẩu mới..."
                      className="w-full px-4 py-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

        </form>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-3xl">
          {/* Đang dùng mật khẩu tạm: không cho đóng hộp thoại, chỉ đổi mật khẩu hoặc đăng xuất */}
          <button
            type="button"
            onClick={mustChange ? onLogout : onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all cursor-pointer"
            disabled={isSubmitting}
          >
            {mustChange ? 'Đăng xuất' : 'Đóng'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-200 cursor-pointer flex items-center gap-1.5"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin"></span>
                Đang lưu...
              </>
            ) : (
              'Lưu thay đổi'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
