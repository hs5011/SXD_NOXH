import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, Building2, GitBranch, FileText, 
  BarChart3, Settings, LogOut, Search, Bell, Menu, Clock, Layers, User, ShieldCheck, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { UserAccount } from '../types';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  currentUser: UserAccount;
  onLogout: () => void;
}

const menuItems = [
  { group: 'ĐIỀU HÀNH', items: [
    //{ id: 'dashboard', name: 'Tổng quan', icon: LayoutDashboard },
    { id: 'dashboard-app', name: 'Dashboard App', icon: LayoutDashboard },
  ]},
  { group: 'QUẢN LÝ TIẾN ĐỘ DA HIỆN TẠI', items: [
    { id: 'gantt-dashboard-noxh', name: 'Sơ đồ Gantt dự án NOXH', icon: BarChart3 },
    { id: 'annual-update', name: 'Cập nhật kế hoạch dự án', icon: Clock },
  ]},
  { group: 'QUẢN LÝ', items: [
    { id: 'projects', name: 'Danh sách dự án', icon: Building2 },
    //{ id: 'process-gantt', name: 'Sơ đồ Gantt quy trình', icon: GitBranch },
  ]},
  { group: 'HỆ THỐNG', items: [
    { id: 'step-management', name: 'Cấu hình quy trình', icon: Layers },
    { id: 'project-stage-management', name: 'Cấu hình giai đoạn dự án', icon: Settings },
    { id: 'investor-agency-management', name: 'CĐT & Cơ quan xử lý', icon: Building2 },
    { id: 'category-tabs-management', name: 'Danh mục dự án', icon: Building2 },
    { id: 'status-tabs-management', name: 'Danh mục trạng thái', icon: Settings },    
    { id: 'user-management', name: 'Quản lý tài khoản', icon: User },
  ]}
];

// Menu groups visible to a user (same rules for the sidebar and for URL routing in App)
function getVisibleMenuGroups(currentUser: UserAccount | null | undefined) {
  if (!currentUser) return [];
  const isInvestor = currentUser?.userType === 'investor' || currentUser?.roleId === 'Chủ đầu tư' || currentUser?.roleId === 'CĐT';
  const isSXDOrAdmin = currentUser?.roleId === 'Admin' || 
                        currentUser?.roleId?.toLowerCase() === 'admin' || 
                        currentUser?.username?.toLowerCase() === 'admin' || 
                        currentUser?.agencyId === '1' ||
                        (currentUser?.userType === 'agency' && currentUser?.agencyId === '1');

  const filterItemsByRole = (group: any) => {
    let items = group.items;
    if (currentUser.roleId !== 'Admin') {
      items = items.filter((item: any) => item.id !== 'dashboard-tphcm');
    }
    if (isInvestor) {
      const restrictedForInvestor = ['dashboard-app', 'dashboard', 'gantt-dashboard-noxh', 'annual-update'];
      items = items.filter((item: any) => !restrictedForInvestor.includes(item.id));
    }
    if (!isSXDOrAdmin) {
      items = items.filter((item: any) => item.id !== 'annual-update');
    }
    return items;
  };

  return menuItems.map(group => ({
    ...group,
    items: filterItemsByRole(group)
  })).filter(group => {
    if (group.items.length === 0) return false;
    if (group.group === 'HỆ THỐNG') {
      if (currentUser.roleId === 'Admin' || (currentUser.userType === 'agency' && currentUser.agencyId === '1')) return true;
      return false;
    }
    return true;
  });
}

// Screen ids this user may open from the menu (used to validate a screen taken from the URL)
export function getAllowedMenuTabs(currentUser: UserAccount | null | undefined): string[] {
  return getVisibleMenuGroups(currentUser).flatMap(group => group.items.map((item: any) => item.id));
}

export default function Sidebar({ activeTab, onNavigate, currentUser, onLogout }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredMenuItems = getVisibleMenuGroups(currentUser);

  return (
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 288 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-screen bg-slate-900 text-slate-300 flex flex-col shrink-0"
    >
      <div className="p-6 flex items-center justify-between border-b border-slate-800">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'hidden' : 'flex'}`}>
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">
            H
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">NOXH SXD</h1>
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">TP. Hồ Chí Minh</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-500 hover:text-white"
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {filteredMenuItems.map((group) => (
          <div key={group.group}>
            {!isCollapsed && (
              <h3 className="text-sm font-bold text-slate-600 mb-2 px-2 uppercase tracking-widest">
                {group.group}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={isCollapsed ? item.name : ''}
                  className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-lg transition-all duration-200 group ${
                    activeTab === item.id 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={18} className={activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'} />
                    {!isCollapsed && <span className="text-base font-medium">{item.name}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

    </motion.div>
  );
}
