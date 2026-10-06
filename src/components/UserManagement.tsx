import React, { useState } from 'react';
import { 
  UserPlus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  User, 
  Phone, 
  Mail, 
  Building2, 
  Briefcase,
  ShieldCheck,
  Building,
  Settings,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  UploadCloud,
  Lock,
  Power,
  PlayCircle,
  RotateCcw,
  RefreshCw,
  Server,
  Terminal,
  Cpu,
  Activity
} from 'lucide-react';
import { UserAccount } from '../types';
import { Agency } from './AgencyManagement';
import { apiFetch } from '../utils/apiFetch';
import { matchesSearch as textMatches, normalizeSearchText } from '../lib/textSearch';
import { hashPassword, generatePolicyCompliantPassword } from '../lib/crypto';
import ListManagement from './ListManagement';

interface UserManagementProps {
  users: UserAccount[];
  onUpdateUsers: (users: UserAccount[]) => void;
  roles: string[];
  onUpdateRoles: (roles: string[]) => void;
  agencies: Agency[];
  investors: string[];
  preselectedInvestor?: string;
  onClearInvestor?: () => void;
  currentUser?: UserAccount | null;
}

export default function UserManagement({ 
  users, 
  onUpdateUsers, 
  roles, 
  onUpdateRoles,
  agencies, 
  investors, 
  preselectedInvestor, 
  onClearInvestor,
  currentUser
}: UserManagementProps) {
  const effectiveUser = currentUser || (() => {
    try {
      const saved = localStorage.getItem('current_user') || localStorage.getItem('currentUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const isTrueAdmin = Boolean(
    effectiveUser &&
    (effectiveUser.username?.toLowerCase() === 'admin' ||
      (effectiveUser.roleId === 'Admin' && effectiveUser.agencyId !== '1' && effectiveUser.userType !== 'agency'))
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUserType, setFilterUserType] = useState<string>('all');
  const [filterAgencyId, setFilterAgencyId] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [filterInvestorId, setFilterInvestorId] = useState<string>('all');
  const [filterFollower, setFilterFollower] = useState<string>('all');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToast({ type, message });
    const timer = setTimeout(() => {
      setToast(prev => prev && prev.message === message ? null : prev);
    }, 4500);
    return () => clearTimeout(timer);
  };

  const [isSystemConfigOpen, setIsSystemConfigOpen] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'email' | 'upload' | 'password' | 'pm2'>('email');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  // PM2 State
  const [pm2ProcessName, setPm2ProcessName] = useState('noxh-app');
  const [pm2Port, setPm2Port] = useState('3000');
  const [pm2Info, setPm2Info] = useState<{
    running: boolean;
    processName: string;
    status: string;
    pid?: number;
    uptime?: number;
    restarts?: number;
    memory?: number;
    cpu?: number;
    execMode?: string;
    nodeVersion?: string;
    message?: string;
    processes?: any[];
  } | null>(null);
  const [isLoadingPm2, setIsLoadingPm2] = useState(false);
  const [isExecutingPm2Action, setIsExecutingPm2Action] = useState(false);
  const [pm2Logs, setPm2Logs] = useState<string[]>([]);
  const [confirmPm2Modal, setConfirmPm2Modal] = useState<{
    isOpen: boolean;
    action: 'restart' | 'start' | 'reload';
    title: string;
    message: string;
  }>({
    isOpen: false,
    action: 'restart',
    title: '',
    message: ''
  });
  const [emailConfig, setEmailConfig] = useState({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: 'noreply@example.com',
    fromName: 'Hệ thống Quản lý Dự án'
  });
  const [isSavingEmailConfig, setIsSavingEmailConfig] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{
    userName: string;
    email: string;
    tempPassword?: string;
    emailSent: boolean;
    emailError?: string | null;
    isCreation?: boolean;
  } | null>(null);
  const [recoveringUserId, setRecoveringUserId] = useState<string | null>(null);

  const [uploadConfig, setUploadConfig] = useState({
    allowedExtensions: 'JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR',
    maxSizeMb: 20
  });
  const [isSavingUploadConfig, setIsSavingUploadConfig] = useState(false);

  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: 6,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false
  });
  const [isSavingPasswordPolicy, setIsSavingPasswordPolicy] = useState(false);

  const fetchEmailConfig = async () => {
    try {
      const res = await apiFetch('/api/email-config');
      if (res.ok) {
        const data = await res.json();
        setEmailConfig(data);
      }
    } catch (err) {
      console.error("Lỗi tải cấu hình email:", err);
    }
  };

  const fetchUploadConfig = async () => {
    try {
      const res = await apiFetch('/api/upload-config');
      if (res.ok) {
        const data = await res.json();
        setUploadConfig(data);
      }
    } catch (err) {
      console.error("Lỗi tải cấu hình tải lên:", err);
    }
  };

  const addPm2Log = (msg: string) => {
    setPm2Logs(prev => [msg, ...prev].slice(0, 50));
  };

  const fetchPm2Status = async () => {
    setIsLoadingPm2(true);
    try {
      const procName = pm2ProcessName || 'noxh-app';
      const portNum = pm2Port || '3000';
      const res = await apiFetch(`/api/pm2/status?processName=${encodeURIComponent(procName)}&port=${encodeURIComponent(portNum)}`);
      const contentType = res.headers.get('content-type');
      
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setPm2Info(data);
        const timeStr = new Date().toLocaleTimeString('vi-VN');
        if (data.message) {
          addPm2Log(`[${timeStr}] Trạng thái: ${data.message} (Status: ${(data.status || '').toUpperCase()})`);
        }
      } else if (res.ok) {
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] Đang kết nối lại máy chủ PM2...`);
      } else {
        const text = await res.text();
        let errMsg = 'Lỗi kết nối PM2';
        try {
          const json = JSON.parse(text);
          errMsg = json.error || json.message || errMsg;
        } catch {
          errMsg = `Máy chủ đang phản hồi (Mã: ${res.status})`;
        }
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] ${errMsg}`);
      }
    } catch (err: any) {
      console.error("Lỗi lấy trạng thái PM2:", err);
      const msg = err?.message || 'Không thể kết nối';
      if (msg.includes('JSON') || msg.includes('token') || msg.includes('Unexpected')) {
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] Đang chờ máy chủ PM2 phản hồi...`);
      } else {
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] Lỗi kết nối PM2: ${msg}`);
      }
    } finally {
      setIsLoadingPm2(false);
    }
  };

  const executePm2Action = async (action: 'restart' | 'start' | 'reload') => {
    setIsExecutingPm2Action(true);
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const procName = pm2ProcessName || 'noxh-app';
    const portNum = pm2Port || '3000';
    const actionNameMap = {
      restart: `Khởi động lại (pm2 restart ${procName})`,
      start: `Khởi động (pm2 start ${procName})`,
      reload: `Tải lại (pm2 reload ${procName})`
    };
    addPm2Log(`[${timeStr}] Gửi lệnh: ${actionNameMap[action]} (Port: ${portNum})...`);
    try {
      const res = await apiFetch('/api/pm2/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, processName: procName, port: portNum })
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { success: true, message: `Lệnh ${action} đã gửi thành công!` };
      }

      if (res.ok && data.success !== false) {
        showToast(data.message || `Lệnh ${action} tiến trình ${procName} đã gửi thành công!`, 'success');
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] KẾT QUẢ: ${data.stdout || data.message || 'Thành công'}`);
        setTimeout(() => {
          fetchPm2Status();
        }, 2000);
      } else {
        showToast(data.message || data.error || 'Lỗi khi thực thi lệnh PM2.', 'error');
        addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] LỖI: ${data.error || data.stderr || data.message}`);
      }
    } catch (err: any) {
      showToast(`Đã gửi lệnh ${action} thành công! Đang kết nối lại với Server...`, 'info');
      addPm2Log(`[${new Date().toLocaleTimeString('vi-VN')}] THÔNG BÁO: Server đang khởi động lại PM2, đang kết nối lại...`);
      setTimeout(() => {
        fetchPm2Status();
      }, 2500);
    } finally {
      setIsExecutingPm2Action(false);
      setConfirmPm2Modal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const fetchPasswordPolicy = async () => {
    try {
      const res = await apiFetch('/api/password-policy');
      if (res.ok) {
        const data = await res.json();
        setPasswordPolicy(data);
      }
    } catch (err) {
      console.error("Lỗi tải cấu hình chính sách mật khẩu:", err);
    }
  };

  React.useEffect(() => {
    if (isSystemConfigOpen && activeConfigTab === 'pm2') {
      fetchPm2Status();
    }
  }, [isSystemConfigOpen, activeConfigTab]);

  React.useEffect(() => {
    fetchEmailConfig();
    fetchUploadConfig();
    fetchPasswordPolicy();
  }, []);

  const handleSavePasswordPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPasswordPolicy(true);
    try {
      const res = await apiFetch('/api/password-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordPolicy)
      });
      if (res.ok) {
        showToast('Cấu hình chính sách đặt mật khẩu đã được cập nhật thành công!', 'success');
        setIsSystemConfigOpen(false);
        fetchPasswordPolicy();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'Có lỗi khi lưu thông tin cấu hình chính sách mật khẩu.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Không kết nối được tới máy chủ.', 'error');
    } finally {
      setIsSavingPasswordPolicy(false);
    }
  };

  const handleSaveUploadConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingUploadConfig(true);
    try {
      const res = await apiFetch('/api/upload-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadConfig)
      });
      if (res.ok) {
        showToast('Cấu hình tải lên tệp tin đã được cập nhật thành công!', 'success');
        setIsSystemConfigOpen(false);
        fetchUploadConfig();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'Có lỗi khi lưu thông tin cấu hình tải lên.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Không kết nối được tới máy chủ.', 'error');
    } finally {
      setIsSavingUploadConfig(false);
    }
  };

  const handleSaveEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmailConfig(true);
    try {
      const res = await apiFetch('/api/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailConfig)
      });
      if (res.ok) {
        showToast('Cấu hình SMTP Email đã được cập nhật thành công!', 'success');
        setIsSystemConfigOpen(false);
        fetchEmailConfig();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || 'Có lỗi khi lưu thông tin cấu hình.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Không kết nối được tới máy chủ.', 'error');
    } finally {
      setIsSavingEmailConfig(false);
    }
  };

  const handleRecoverPassword = (user: UserAccount) => {
    if (effectiveUser && user.id === effectiveUser.id) {
      showToast('Không thể tự đặt lại mật khẩu cho chính mình tại đây. Vui lòng vào Cài đặt tài khoản để đổi mật khẩu cá nhân.', 'warning');
      return;
    }

    if (!user.email) {
      showToast('Tài khoản này chưa khai báo email, không thể thực hiện khôi phục mật khẩu.', 'error');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Khôi phục mật khẩu',
      message: `Hệ thống sẽ tái thiết lập mật khẩu tạm thời mới và tự động gửi thư định danh đến địa chỉ email: ${user.email} của thành viên "${user.fullName || user.username}".`,
      confirmText: 'Khôi phục ngay',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        setConfirmModal(null);
        setRecoveringUserId(user.id);
        setRecoveryResult(null);
        try {
          const res = await apiFetch(`/api/users/${user.id}/recover-password`, {
            method: 'POST'
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setRecoveryResult({
              userName: user.fullName || user.username,
              email: user.email,
              tempPassword: data.tempPassword,
              emailSent: data.emailSent,
              emailError: data.emailError
            });
            showToast('Đã khôi phục mật khẩu tài khoản thành công!', 'success');
            
            try {
              const uRes = await apiFetch('/api/users');
              if (uRes.ok) {
                const freshUsers = await uRes.json();
                onUpdateUsers(freshUsers);
              }
            } catch (e) {
              console.error("Lỗi đồng bộ danh sách sau khi reset:", e);
            }
          } else {
            showToast(data.error || 'Có lỗi xảy ra khi khôi phục mật khẩu.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Không thể kết nối đến máy chủ.', 'error');
        } finally {
          setRecoveringUserId(null);
        }
      }
    });
  };
  
  // Form state
  const [formData, setFormData] = useState<Partial<UserAccount>>({
    fullName: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    userType: preselectedInvestor ? 'investor' : 'agency',
    agencyId: '',
    department: '',
    investorId: preselectedInvestor || '',
    // No default role: roles[0] is "Admin", so a forgotten choice would create an administrator
    roleId: '',
    isFollower: false
  });

  React.useEffect(() => {
    if (preselectedInvestor) {
      setIsModalOpen(true);
    }
  }, [preselectedInvestor]);

  const handleOpenModal = (user?: UserAccount) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        ...user,
        username: user.username || user.email?.split('@')[0] || '',
        isFollower: !!user.isFollower
      });
    } else {
      setEditingUser(null);
      setFormData({
        fullName: '',
        phone: '',
        email: '',
        username: '',
        password: '',
        userType: preselectedInvestor ? 'investor' : 'agency',
        agencyId: '',
        department: '',
        investorId: preselectedInvestor || '',
        roleId: '',
        isFollower: false
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    if (onClearInvestor) {
      onClearInvestor();
    }
  };

  const handleSave = async () => {
    // 1. Basic required fields check
    if (!formData.fullName || !formData.email || !formData.username) {
      showToast('Vui lòng điền đầy đủ thông tin bắt buộc (Họ tên, Email, Tên đăng nhập)', 'warning');
      return;
    }

    if (!formData.roleId) {
      showToast('Vui lòng chọn vai trò cho tài khoản.', 'warning');
      return;
    }

    // 2. Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast('Email không hợp lệ. Vui lòng kiểm tra lại.', 'warning');
      return;
    }

    // 3. Phone validation (optional but if provided must be valid)
    if (formData.phone) {
      const phoneRegex = /^[0-9+]{10,12}$/;
      if (!phoneRegex.test(formData.phone)) {
        showToast('Số điện thoại không hợp lệ (10-12 chữ số).', 'warning');
        return;
      }
    }

    // 4. Duplicate check (Username, Email, and Phone number)
    if (formData.username) {
      const isDuplicateUsername = users.some(u => u.username && u.username.trim().toLowerCase() === formData.username?.trim().toLowerCase() && u.id !== editingUser?.id);
      if (isDuplicateUsername) {
        showToast('Tên đăng nhập đã tồn tại trong hệ thống.', 'error');
        return;
      }
    }

    if (formData.email) {
      const isDuplicateEmail = users.some(u => u.email && u.email.trim().toLowerCase() === formData.email?.trim().toLowerCase() && u.id !== editingUser?.id);
      if (isDuplicateEmail) {
        showToast('Email đã tồn tại trong hệ thống.', 'error');
        return;
      }
    }

    if (formData.phone) {
      const isDuplicatePhone = users.some(u => u.phone && u.phone.trim() === formData.phone?.trim() && u.id !== editingUser?.id);
      if (isDuplicatePhone) {
        showToast('Số điện thoại đã tồn tại trong hệ thống.', 'error');
        return;
      }
    }

    // 5. Mandatory agency/investor check
    if (formData.userType === 'agency' && !formData.agencyId) {
      showToast('Vui lòng chọn Cơ quan xử lý cho tài khoản này.', 'warning');
      return;
    }
    // A ward account sees only the projects of its ward: without one it would see nothing
    if (formData.userType === 'agency' && formData.agencyId === '6' && !String(formData.department || '').trim()) {
      showToast('Vui lòng chọn phường/xã phụ trách cho tài khoản UBND cấp xã, phường.', 'warning');
      return;
    }
    if (formData.userType === 'investor' && !formData.investorId) {
      showToast('Vui lòng chọn Chủ đầu tư cho tài khoản này.', 'warning');
      return;
    }

    // Persist through the per-user REST API (server enforces who may change what)
    const callUserApi = async (url: string, method: string, body: any) => {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Lưu thông tin người dùng thất bại.');
      }
      return data;
    };

    const refreshUsers = async () => {
      const uRes = await apiFetch('/api/users');
      if (uRes.ok) {
        onUpdateUsers(await uRes.json());
      }
    };

    try {
      const { password: _ignored, ...savedData } = formData;
      if (editingUser) {
        // Password is never changed from this form (use recover-password / change-password)
        const updated = await callUserApi(`/api/users/${editingUser.id}`, 'PUT', savedData);
        onUpdateUsers(users.map(u => u.id === editingUser.id ? { ...u, ...updated } as UserAccount : u));
        await refreshUsers().catch(() => {});
        showToast('Đã lưu thông tin tài khoản thành công!');
        handleCloseModal();
      } else {
        // For a new user, pre-populate with a temporary hashed secure password complying with the policy
        const initialSeed = generatePolicyCompliantPassword(passwordPolicy);

        const created = await callUserApi('/api/users', 'POST', {
          ...savedData,
          id: `u${Date.now()}`,
          password: hashPassword(initialSeed)
        });
        const newUser: UserAccount = created as UserAccount;
        onUpdateUsers([...users, newUser]);
        showToast('Đã thêm mới tài khoản, đang tự động khởi tạo mật khẩu...', 'info');
        handleCloseModal();

        // Trigger automatic recovery/email sending flow for the new user!
        setRecoveringUserId(newUser.id);
        setRecoveryResult(null);

        try {
          const res = await apiFetch(`/api/users/${newUser.id}/recover-password`, {
            method: 'POST'
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setRecoveryResult({
              userName: newUser.fullName || newUser.username,
              email: newUser.email,
              tempPassword: data.tempPassword,
              emailSent: data.emailSent,
              emailError: data.emailError,
              isCreation: true
            });
            showToast('Mật khẩu ngẫu nhiên đã được tạo và gửi thành công!', 'success');

            try {
              await refreshUsers();
            } catch (e) {
              console.error("Lỗi đồng bộ danh sách sau khi reset:", e);
            }
          } else {
            showToast(data.error || 'Có lỗi xảy ra khi tạo mật khẩu ngẫu nhiên.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Không thể kết nối đến máy chủ để cấu hình mật khẩu.', 'error');
        } finally {
          setRecoveringUserId(null);
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi lưu thông tin người dùng. Vui lòng thử lại.', 'error');
    }
  };

  const isSxdOrAdmin = Boolean(
    effectiveUser &&
    (effectiveUser.roleId === 'Admin' ||
     effectiveUser.roleId?.toLowerCase() === 'admin' ||
     (effectiveUser.userType === 'agency' && effectiveUser.agencyId === '1'))
  );

  // Same rule as the server: Sở Xây dựng (non-Admin) manages ordinary accounts, never Admin accounts
  const isAdminAccount = (u: any) => String(u?.roleId || '').toLowerCase() === 'admin';
  const viewerIsAdmin = isAdminAccount(effectiveUser);
  const canManageAccount = (u: any) => isSxdOrAdmin && (viewerIsAdmin || !isAdminAccount(u));

  const handleDelete = (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;

    const isTargetAdmin = userToDelete.roleId === 'Admin' || userToDelete.roleId?.toLowerCase() === 'admin' || userToDelete.username?.toLowerCase() === 'admin';
    if (isTargetAdmin) {
      const adminCount = users.filter(u => u.roleId === 'Admin' || u.roleId?.toLowerCase() === 'admin' || u.username?.toLowerCase() === 'admin').length;
      if (adminCount <= 1) {
        showToast('Không thể xóa tài khoản Quản trị viên (Admin) duy nhất còn lại của hệ thống!', 'error');
        return;
      }
    }

    const displayName = userToDelete ? `"${userToDelete.fullName || userToDelete.username}"` : 'tài khoản này';

    setConfirmModal({
      isOpen: true,
      title: 'Xóa tài khoản người dùng',
      message: `Bạn có chắc chắn muốn xóa tài khoản ${displayName} này? Toàn bộ các phiên làm việc và phiên đăng nhập của người dùng sẽ bị chấm dứt hoàn toàn.`,
      isDangerous: true,
      confirmText: 'Xóa vĩnh viễn',
      cancelText: 'Hủy bỏ',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Xóa tài khoản thất bại');
          }
          await onUpdateUsers(users.filter(u => u.id !== id));
          showToast('Đã xóa tài khoản khỏi hệ thống!', 'success');
        } catch (err: any) {
          showToast(err.message || 'Xóa tài khoản thất bại!', 'error');
        }
      }
    });
  };

  const filteredUsers = users.filter(u => {
    // Null-safe: an account with an empty name/email/phone must not crash the list
    const matchesSearch = textMatches(searchTerm, u.fullName, u.email, u.phone, u.username);
    const matchesUserType = filterUserType === 'all' || u.userType === filterUserType;
    const matchesAgency = filterAgencyId === 'all' || u.agencyId === filterAgencyId;
    const matchesDepartment = !filterDepartment || u.department === filterDepartment;
    const matchesInvestor = filterInvestorId === 'all' || u.investorId === filterInvestorId;
    const matchesFollower = filterFollower === 'all' || 
                            (filterFollower === 'follower' && !!u.isFollower) || 
                            (filterFollower === 'member' && !u.isFollower);
    return matchesSearch && matchesUserType && matchesAgency && matchesDepartment && matchesInvestor && matchesFollower;
  });

  const selectedAgency = agencies.find(a => a.id === formData.agencyId);
  const isSoXayDung = selectedAgency?.name === 'Sở Xây dựng';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Quản lý tài khoản</h2>
          <p className="text-slate-500 text-sm mt-1">Quản lý danh sách người dùng và phân quyền trong hệ thống</p>
        </div>
        {isSxdOrAdmin && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setIsSystemConfigOpen(true); setActiveConfigTab('email'); }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer text-sm"
            >
              <Settings size={18} className="text-slate-500" />
              Cấu hình hệ thống
            </button>
            <button
              onClick={() => setIsRoleModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer text-sm"
            >
              <ShieldCheck size={18} className="text-slate-500" />
              Danh mục vai trò
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all text-sm shadow-md cursor-pointer"
            >
              <UserPlus size={18} />
              Thêm tài khoản
            </button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-4">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm người dùng..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
            value={filterUserType}
            onChange={(e) => setFilterUserType(e.target.value)}
          >
            <option value="all">Tất cả loại tài khoản</option>
            <option value="agency">Cơ quan nhà nước</option>
            <option value="investor">Chủ đầu tư</option>
          </select>
          <select
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
            value={filterFollower}
            onChange={(e) => setFilterFollower(e.target.value)}
          >
            <option value="all">Tất cả (Theo dõi & Thường)</option>
            <option value="follower">Người theo dõi</option>
            <option value="member">Thành viên thông thường</option>
          </select>
          {filterUserType === 'all' || filterUserType === 'agency' ? (
              <select
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                value={filterAgencyId + '|' + (filterDepartment || '')}
                onChange={(e) => {
                  const [agencyId, department] = e.target.value.split('|');
                  setFilterAgencyId(agencyId);
                  setFilterDepartment(department || '');
                }}
              >
                <option value="all|">Tất cả cơ quan/phòng ban</option>
                {agencies.map(a => (
                  <optgroup key={a.id} label={a.name}>
                    <option value={`${a.id}|`}>{a.name}</option>
                    {a.departments.map(d => (
                      <option key={d} value={`${a.id}|${d}`}>{d}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : null}
            {filterUserType === 'all' || filterUserType === 'investor' ? (
              <select
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 cursor-pointer"
                value={filterInvestorId}
                onChange={(e) => setFilterInvestorId(e.target.value)}
              >
                <option value="all">Tất cả chủ đầu tư</option>
                {investors.map(i => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
          ) : null}
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/20">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Họ tên</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Liên hệ</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Loại tài khoản</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Vai trò</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Đơn vị / Phòng ban</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {(user.fullName || user.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900">{user.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-sm">
                      <span className="text-slate-600 flex items-center gap-1"><Mail size={14} /> {user.email}</span>
                      <span className="text-slate-400 flex items-center gap-1"><Phone size={14} /> {user.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                      user.userType === 'agency' 
                        ? 'text-emerald-700' 
                        : 'text-orange-700'
                    }`}>
                      {user.userType === 'agency' ? <ShieldCheck size={16} /> : <Building size={16} />}
                      {user.userType === 'agency' ? 'Cơ quan nhà nước' : 'Chủ đầu tư'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 items-start text-xs font-semibold">
                      <span className="text-sm font-medium text-slate-700">{user.roleId}</span>
                      {user.isFollower && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] uppercase font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          Người theo dõi
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-sm">
                      {user.userType === 'agency' ? (
                        <>
                          <span className="font-medium text-slate-700">{agencies.find(a => a.id === user.agencyId)?.name}</span>
                          <span className="text-slate-400 text-xs">{user.department}</span>
                        </>
                      ) : (
                        <span className="font-medium text-slate-700">{user.investorId}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(canManageAccount(user) || user.id === effectiveUser?.id) && (
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {canManageAccount(user) && (
                        user.id === effectiveUser?.id ? (
                          <span 
                            className="p-2 text-slate-200 cursor-not-allowed inline-flex items-center" 
                            title="Không thể tự đặt lại mật khẩu của chính mình (vui lòng sử dụng tính năng Đổi mật khẩu cá nhân)"
                          >
                            <KeyRound size={18} />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRecoverPassword(user)}
                            disabled={recoveringUserId !== null}
                            className="p-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                            title="Khôi phục mật khẩu"
                          >
                            {recoveringUserId === user.id ? (
                              <Loader2 size={18} className="animate-spin text-amber-600" />
                            ) : (
                              <KeyRound size={18} />
                            )}
                          </button>
                        )
                      )}
                      {canManageAccount(user) && user.id !== effectiveUser?.id && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Xóa"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                    Không tìm thấy tài khoản nào...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingUser ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới'}
                </h2>
                <p className="text-sm text-slate-500">Điền thông tin chi tiết người dùng</p>
              </div>
              <button onClick={(e) => { e.preventDefault(); handleCloseModal(); }} className="p-2 hover:bg-white rounded-full transition-colors">
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <User size={16} className="text-blue-500" /> Họ tên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="Nhập họ và tên"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <User size={16} className="text-blue-500" /> Tên đăng nhập <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="Nhập tên đăng nhập"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Mail size={16} className="text-blue-500" /> Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="example@domain.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Phone size={16} className="text-blue-500" /> Số điện thoại
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="Nhập số điện thoại"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-blue-500" /> Vai trò <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                  >
                    <option value="" disabled>-- Chọn vai trò --</option>
                    {roles
                      // Only an Admin may grant the Admin role (an account that already has it keeps the option)
                      .filter(r => viewerIsAdmin || !isAdminAccount({ roleId: r }) || isAdminAccount({ roleId: formData.roleId }))
                      .map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2 flex flex-col justify-end pb-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-blue-600 border-slate-350 rounded focus:ring-blue-500/20 transition-all cursor-pointer"
                      checked={!!formData.isFollower}
                      onChange={(e) => setFormData({ ...formData, isFollower: e.target.checked })}
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-750 group-hover:text-slate-900 transition-colors">Người theo dõi</span>
                      <p className="text-[11px] text-slate-400 font-medium">Bổ sung vào danh sách nhận theo dõi tiến độ</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700">Loại tài khoản</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="userType"
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      checked={formData.userType === 'agency'}
                      onChange={() => setFormData({ ...formData, userType: 'agency', investorId: '' })}
                    />
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Cơ quan nhà nước</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="userType"
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      checked={formData.userType === 'investor'}
                      onChange={() => setFormData({ ...formData, userType: 'investor', agencyId: '', department: '' })}
                    />
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Chủ đầu tư</span>
                  </label>
                </div>
              </div>

              {formData.userType === 'agency' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Building2 size={16} className="text-blue-500" /> Cơ quan xử lý
                    </label>
                    <select
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      value={formData.agencyId + '|' + (formData.department || '')}
                      onChange={(e) => {
                        const [agencyId, department] = e.target.value.split('|');
                        setFormData({ ...formData, agencyId, department: department || '' });
                      }}
                    >
                      <option value="|">Chọn cơ quan/phòng ban</option>
                      {agencies.map(a => (
                        <optgroup key={a.id} label={a.name}>
                          <option value={`${a.id}|`}>{a.name}</option>
                          {a.departments.map(d => (
                            <option key={d} value={`${a.id}|${d}`}>{d}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Building2 size={16} className="text-blue-500" /> Chủ đầu tư <span className="text-rose-500">*</span>
                    </label>
                    <select
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      value={formData.investorId}
                      onChange={(e) => setFormData({ ...formData, investorId: e.target.value })}
                    >
                      <option value="">Chọn chủ đầu tư</option>
                      {investors.map(i => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                <Save size={18} />
                Lưu tài khoản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cấu hình hệ thống Unified Modal */}
      {isSystemConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-left">
            
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="text-blue-500" /> Cấu hình hệ thống
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Đặt cấu hình tài khoản, tệp tin{isTrueAdmin ? ', mật khẩu và khởi động ứng dụng PM2' : ' và mật khẩu'}</p>
              </div>
              <button 
                onClick={() => setIsSystemConfigOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Config Tabs Bar */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-6 pt-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveConfigTab('email')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeConfigTab === 'email'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                }`}
              >
                <Mail size={16} />
                Cấu hình Email
              </button>
              <button
                type="button"
                onClick={() => setActiveConfigTab('upload')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeConfigTab === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                }`}
              >
                <UploadCloud size={16} />
                Cấu hình tải tệp
              </button>
              <button
                type="button"
                onClick={() => setActiveConfigTab('password')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeConfigTab === 'password'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                }`}
              >
                <Lock size={16} />
                Cấu hình mật khẩu
              </button>
              {isTrueAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('pm2')}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeConfigTab === 'pm2'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <Power size={16} />
                  Khởi động ứng dụng
                </button>
              )}
            </div>

            {/* Active Config Form */}
            {activeConfigTab === 'email' && (
              <form onSubmit={handleSaveEmailConfig}>
                <div className="p-8 space-y-4 max-h-[75vh] overflow-y-auto">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-500">SMTP Host <span className="text-rose-500">*</span></label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. smtp.gmail.com"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={emailConfig.host}
                        onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Port <span className="text-rose-500">*</span></label>
                      <input 
                        type="number" 
                        required
                        placeholder="e.g. 587"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={emailConfig.port}
                        onChange={(e) => setEmailConfig({ ...emailConfig, port: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 py-1">
                    <input 
                      type="checkbox" 
                      id="smtpSecure"
                      className="w-4 h-4 text-blue-600 border-slate-200 rounded focus:ring-blue-500 cursor-pointer"
                      checked={emailConfig.secure}
                      onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })}
                    />
                    <label htmlFor="smtpSecure" className="text-xs font-bold text-slate-600 cursor-pointer">
                      Sử dụng kết nối SSL/TLS an toàn (Bật thông thường cho Port 465)
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Người gửi (From Name) <span className="text-rose-500">*</span></label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Ban Quản Lý Dự Án"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={emailConfig.fromName}
                        onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Email gửi (From Email) <span className="text-rose-500">*</span></label>
                      <input 
                        type="email" 
                        required
                        placeholder="e.g. bqlda@example.com"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={emailConfig.fromEmail}
                        onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Tài khoản xác thực SMTP</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">Tài khoản (SMTP Username)</label>
                        <input 
                          type="text" 
                          placeholder="Thường là địa chỉ email"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={emailConfig.username || ''}
                          onChange={(e) => setEmailConfig({ ...emailConfig, username: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">Mật khẩu SMTP Password</label>
                        <input 
                          type="password" 
                          placeholder="Mật khẩu ứng dụng"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                          value={emailConfig.password || ''}
                          onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 italic">
                      * Gợi ý: Nếu dùng tài khoản Gmail, bạn cần tạo "Mật khẩu ứng dụng" (App Password) trong mục bảo mật tài khoản Google trước khi điền vào đây.
                    </p>
                  </div>
                </div>

                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsSystemConfigOpen(false)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all cursor-pointer border border-slate-200"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEmailConfig}
                    className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {isSavingEmailConfig ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Cập nhật Email
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {activeConfigTab === 'upload' && (
              <form onSubmit={handleSaveUploadConfig}>
                <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">
                      Định dạng tệp cho phép (Mở rộng) <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-mono"
                      value={uploadConfig.allowedExtensions}
                      onChange={(e) => setUploadConfig({ ...uploadConfig, allowedExtensions: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">
                      Viết hoa các định dạng và phân tách bằng dấu phẩy (không chứa khoảng trắng). Ví dụ: <span className="font-mono bg-slate-100 px-1 rounded">PDF,DOCX,XLSX,PNG,ZIP</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">
                      Dung lượng tệp tối đa (MB) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        required
                        min={1}
                        max={500}
                        className="w-full px-4 py-2.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={uploadConfig.maxSizeMb}
                        onChange={(e) => setUploadConfig({ ...uploadConfig, maxSizeMb: Number(e.target.value) })}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        MB
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Nhập dung lượng tối đa cho mỗi tệp tải lên (Giá trị mặc định khuyên dùng là 20 MB).
                    </p>
                  </div>
                </div>

                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsSystemConfigOpen(false)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all cursor-pointer border border-slate-200"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUploadConfig}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-200"
                  >
                    {isSavingUploadConfig ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Cập nhật Tải tệp
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {activeConfigTab === 'password' && (
              <form onSubmit={handleSavePasswordPolicy}>
                <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">
                      Độ dài mật khẩu tối thiểu <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        required
                        min={4}
                        max={32}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-semibold"
                        value={passwordPolicy.minLength}
                        onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: Number(e.target.value) })}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Ký tự
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Khuyên dùng từ 6 đến 8 ký tự để bảo đảm an toàn thông tin hệ thống.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider mb-2">
                      Các yêu cầu ký tự bắt buộc
                    </label>
                    
                    {/* Uppercase */}
                    <label className="flex items-start gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100/50 transition-all cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={passwordPolicy.requireUppercase}
                        onChange={(e) => setPasswordPolicy({ ...passwordPolicy, requireUppercase: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Bắt buộc chứa chữ in hoa (A-Z)</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">Yêu cầu mật khẩu phải có ít nhất 1 ký tự viết hoa</span>
                      </div>
                    </label>

                    {/* Lowercase */}
                    <label className="flex items-start gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100/50 transition-all cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={passwordPolicy.requireLowercase}
                        onChange={(e) => setPasswordPolicy({ ...passwordPolicy, requireLowercase: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Bắt buộc chứa chữ thường (a-z)</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">Yêu cầu mật khẩu phải có ít nhất 1 ký tự viết thường</span>
                      </div>
                    </label>

                    {/* Numbers */}
                    <label className="flex items-start gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100/50 transition-all cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={passwordPolicy.requireNumbers}
                        onChange={(e) => setPasswordPolicy({ ...passwordPolicy, requireNumbers: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Bắt buộc chứa chữ số (0-9)</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">Mật khẩu phải có tối thiểu một chữ số</span>
                      </div>
                    </label>

                    {/* Special Chars */}
                    <label className="flex items-start gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100/50 transition-all cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={passwordPolicy.requireSpecialChars}
                        onChange={(e) => setPasswordPolicy({ ...passwordPolicy, requireSpecialChars: e.target.checked })}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">Bắt buộc chứa ký tự đặc biệt (! @ # $ % & *)</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">Mật khẩu phải chứa ít nhất một ký hiệu ví dụ: ! hoặc @ hoặc # hoặc $ hoặc % hoặc & hoặc *</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsSystemConfigOpen(false)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all cursor-pointer border border-slate-200"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPasswordPolicy}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {isSavingPasswordPolicy ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Cập nhật Mật khẩu
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* PM2 App Startup tab */}
            {isTrueAdmin && activeConfigTab === 'pm2' && (
              <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Intro & Notice */}
                <div className="p-4 bg-blue-50/80 border border-blue-100 rounded-2xl flex items-start gap-3.5 text-left">
                  <Server className="text-blue-600 mt-0.5 shrink-0" size={20} />
                  <div className="text-xs text-blue-900 space-y-1">
                    <p className="font-bold text-sm text-blue-950">Quản lý Khởi động Server PM2 (Production)</p>
                    <p className="leading-relaxed text-blue-800">
                      Cho phép quản trị viên (Admin) tùy chỉnh Process Name và Port để khởi động hoặc khởi động lại server production trực tiếp từ giao diện web.
                    </p>
                  </div>
                </div>

                {/* Process Config Form Textboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tên Process PM2 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={pm2ProcessName}
                      onChange={(e) => setPm2ProcessName(e.target.value)}
                      placeholder="noxh-app"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">Tên tiến trình trong PM2 (mặc định: <code className="bg-slate-200/70 px-1 py-0.5 rounded text-slate-800 font-bold">noxh-app</code>)</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cổng Port (Server Port) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={pm2Port}
                      onChange={(e) => setPm2Port(e.target.value)}
                      placeholder="3000"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">Cổng Port dịch vụ chạy (mặc định: <code className="bg-slate-200/70 px-1 py-0.5 rounded text-slate-800 font-bold">3000</code>)</span>
                  </div>
                </div>

                {/* Status Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="text-slate-600" size={18} />
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Trạng thái Tiến trình ({pm2ProcessName || 'noxh-app'})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLoadingPm2 ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                          <Loader2 size={12} className="animate-spin text-blue-600" /> Đang kiểm tra...
                        </span>
                      ) : pm2Info?.running ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Đang hoạt động (ONLINE)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Đã dừng / Chờ lệnh (STOPPED)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={fetchPm2Status}
                        disabled={isLoadingPm2}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl border border-slate-200 bg-slate-100 transition-all cursor-pointer"
                        title="Tải lại trạng thái PM2"
                      >
                        <RefreshCw size={14} className={isLoadingPm2 ? 'animate-spin text-blue-600' : ''} />
                      </button>
                    </div>
                  </div>

                  {/* Process Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                      <span className="text-slate-400 font-medium block text-[11px]">Process ID (PID)</span>
                      <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">{pm2Info?.pid || '—'}</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                      <span className="text-slate-400 font-medium block text-[11px]">Uptime (Thời gian chạy)</span>
                      <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">
                        {pm2Info?.uptime ? `${Math.floor(pm2Info.uptime / 60)} phút ${pm2Info.uptime % 60}s` : '—'}
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                      <span className="text-slate-400 font-medium block text-[11px]">Sử dụng Bộ nhớ RAM</span>
                      <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">
                        {pm2Info?.memory ? `${pm2Info.memory} MB` : '—'}
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                      <span className="text-slate-400 font-medium block text-[11px]">Số lần Khởi động lại</span>
                      <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">{pm2Info?.restarts ?? '0'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="space-y-2 text-left">
                  <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">
                    Thao tác Khởi động / Khởi động lại PM2
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Restart Button */}
                    <button
                      type="button"
                      disabled={isExecutingPm2Action}
                      onClick={() => setConfirmPm2Modal({
                        isOpen: true,
                        action: 'restart',
                        title: 'Xác nhận Khởi động lại (PM2 Restart)',
                        message: `Hệ thống sẽ thực thi lệnh [PORT=${pm2Port || '3000'} pm2 restart ${pm2ProcessName || 'noxh-app'}]. Process ${pm2ProcessName || 'noxh-app'} trên máy chủ production sẽ tự động khởi động lại trên port ${pm2Port || '3000'}. Bạn có muốn tiếp tục không?`
                      })}
                      className="flex items-center justify-center gap-2.5 py-3.5 px-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50 text-sm"
                    >
                      <RotateCcw size={18} className={isExecutingPm2Action ? 'animate-spin' : ''} />
                      Khởi động lại (pm2 restart)
                    </button>

                    {/* Start Button */}
                    <button
                      type="button"
                      disabled={isExecutingPm2Action}
                      onClick={() => setConfirmPm2Modal({
                        isOpen: true,
                        action: 'start',
                        title: 'Xác nhận Khởi động mới (PM2 Start)',
                        message: `Hệ thống sẽ thực thi lệnh [PORT=${pm2Port || '3000'} pm2 start ${pm2ProcessName || 'noxh-app'}]. Tiến trình service ${pm2ProcessName || 'noxh-app'} sẽ được kích hoạt khởi chạy trên port ${pm2Port || '3000'}. Bạn có muốn tiếp tục không?`
                      })}
                      className="flex items-center justify-center gap-2.5 py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 text-sm"
                    >
                      <PlayCircle size={18} className={isExecutingPm2Action ? 'animate-spin' : ''} />
                      Khởi động mới (pm2 start)
                    </button>
                  </div>
                </div>

                {/* Output Console Log */}
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
                      <Terminal size={14} className="text-slate-600" />
                      Nhật ký thực thi lệnh Terminal (PM2 Console)
                    </label>
                    {pm2Logs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPm2Logs([])}
                        className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        Xóa nhật ký
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-emerald-400 h-36 overflow-y-auto space-y-1 shadow-inner">
                    {pm2Logs.length === 0 ? (
                      <div className="text-slate-500 italic py-1">
                        Chưa có nhật ký lệnh nào. Nhấn "Khởi động lại" hoặc "Khởi động mới" để gửi lệnh tới PM2.
                      </div>
                    ) : (
                      pm2Logs.map((log, idx) => (
                        <div key={idx} className="whitespace-pre-wrap leading-relaxed border-b border-slate-800/40 pb-1">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="px-2 py-1 flex items-center justify-between text-slate-400 text-xs">
                  <span>* Quyền thực hiện: Chỉ dành cho tài khoản Admin / Sở Xây dựng</span>
                  <button
                    type="button"
                    onClick={() => setIsSystemConfigOpen(false)}
                    className="px-5 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border border-slate-200 text-xs"
                  >
                    Đóng lại
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Confirmation Modal for PM2 Actions */}
      {confirmPm2Modal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-100 text-left space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-2xl text-amber-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">{confirmPm2Modal.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Tiến trình máy chủ production (PM2)</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              {confirmPm2Modal.message}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isExecutingPm2Action}
                onClick={() => setConfirmPm2Modal(prev => ({ ...prev, isOpen: false }))}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isExecutingPm2Action}
                onClick={() => executePm2Action(confirmPm2Modal.action)}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                {isExecutingPm2Action ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Đang thực thi...
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    Xác nhận Khởi động
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danh mục vai trò Modal Overlay */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-xl animate-in fade-in zoom-in-95 duration-200 text-left">
            <button 
              onClick={() => setIsRoleModalOpen(false)}
              className="absolute right-6 top-6 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-all cursor-pointer z-10"
              title="Đóng modal"
            >
              <X size={20} />
            </button>
            <ListManagement 
              items={roles} 
              setItems={onUpdateRoles} 
              title="vai trò" 
            />
          </div>
        </div>
      )}

      {/* Kết quả khôi phục mật khẩu / khởi tạo tài khoản Modal */}
      {recoveryResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 p-8 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 animate-bounce">
              <KeyRound size={32} className="text-amber-500" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-900">
              {recoveryResult.isCreation ? 'Khởi tạo tài khoản thành công' : 'Khôi phục mật khẩu thành công'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {recoveryResult.isCreation ? 'Hệ thống đã tạo tài khoản và sinh mật khẩu ngẫu nhiên cho:' : 'Đã cấu hình mật khẩu ngẫu nhiên cho tài khoản:'}
            </p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{recoveryResult.userName} ({recoveryResult.email})</p>

            {recoveryResult.tempPassword ? (
              <div className="my-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl relative group">
                <span className="text-xs text-slate-400 font-bold tracking-wider block mb-1">
                  {recoveryResult.isCreation ? 'MẬT KHẨU TẠM THỜI KHỞI TẠO' : 'MẬT KHẨU TẠM THỜI MỚI'}
                </span>
                <span className="text-3xl font-extrabold text-blue-600 tracking-widest font-mono select-all block py-1">
                  {recoveryResult.tempPassword}
                </span>
                <button 
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryResult.tempPassword || "");
                    showToast('Đã sao chép mật khẩu vào bộ nhớ tạm.', 'info');
                  }}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  title="Sao chép mật khẩu"
                >
                  <Copy size={12} /> Sao chép mật khẩu
                </button>
              </div>
            ) : (
              <div className="my-6 p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-center">
                <span className="text-xs text-emerald-600 font-bold tracking-wider block mb-1">
                  BẢO MẬT THÔNG TIN
                </span>
                <p className="text-xs text-emerald-800 leading-relaxed font-semibold">
                  Mật khẩu mới đã được hệ thống gửi trực tiếp và bảo mật đến hòm thư người dùng ({recoveryResult.email}). Để tuân thủ chính sách bảo mật, mật khẩu không được hiển thị công khai trên giao diện.
                </p>
              </div>
            )}

            {/* Email Dispatch Status */}
            <div className="border border-slate-100 p-4 rounded-2xl text-left bg-slate-50/50 space-y-2">
              <div className="flex items-center gap-2">
                {recoveryResult.emailSent ? (
                  <CheckCircle2 size={16} className="text-emerald-500 flex-none" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500 flex-none" />
                )}
                <span className={`text-xs font-bold ${recoveryResult.emailSent ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {recoveryResult.emailSent ? 'Đã gửi email tự động thành công' : 'Chưa gửi được email tự động'}
                </span>
              </div>
              {recoveryResult.emailSent ? (
                <p className="text-[11px] text-slate-500 leading-relaxed pl-6">
                  {recoveryResult.isCreation 
                    ? `Thông tin đăng nhập này đã được hệ thống robot gửi bằng máy chủ SMTP đến hộp thư của người dùng (${recoveryResult.email}).`
                    : `Mật khẩu này đã được hệ thống robot gửi bằng máy chủ SMTP đến hộp thư của người dùng (${recoveryResult.email}).`
                  }
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 leading-relaxed pl-6">
                  Lý do: <strong>{recoveryResult.emailError}</strong>. <br />
                  <span className="text-amber-700 font-semibold">Vui lòng sao chép lại mật khẩu hiển thị ở trên và gửi thủ công cho người dùng!</span>
                </p>
              )}
            </div>

            <button
              onClick={() => setRecoveryResult(null)}
              className="mt-6 w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
            >
              Hoàn tất & Đóng
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl bg-white border border-slate-100 animate-in slide-in-from-top-4 duration-300">
          <div className="flex-none">
            {toast.type === 'success' && <CheckCircle2 className="text-emerald-500 w-5 h-5" />}
            {toast.type === 'error' && <AlertTriangle className="text-rose-500 w-5 h-5" />}
            {toast.type === 'warning' && <AlertTriangle className="text-amber-500 w-5 h-5" />}
            {toast.type === 'info' && <Settings className="text-blue-500 w-5 h-5" />}
          </div>
          <div className="pr-4 text-sm font-semibold text-slate-800">{toast.message}</div>
          <button 
            type="button"
            onClick={() => setToast(null)}
            className="flex-none p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                {confirmModal.isDangerous ? (
                  <AlertTriangle className="text-rose-500 w-5 h-5" />
                ) : (
                  <KeyRound className="text-amber-500 w-5 h-5" />
                )}
                {confirmModal.title}
              </h3>
              <button 
                onClick={() => setConfirmModal(null)}
                className="p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-lg transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {confirmModal.message}
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 font-semibold text-xs text-slate-700">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                {confirmModal.cancelText || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  confirmModal.isDangerous 
                    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800' 
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {confirmModal.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
