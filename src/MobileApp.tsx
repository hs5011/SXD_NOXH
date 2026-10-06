import React, { useState, useMemo, useEffect } from 'react';
import DashboardApp from './components/DashboardApp';
import Login from './components/Login';
import { UserAccount } from './types';
import { Agency } from './components/AgencyManagement';
import { Process } from './components/StepManagementView';
import { LogOut } from 'lucide-react';

import { apiFetch } from './utils/apiFetch';
import { normalizeAgencyName, resolveProjectStepAgency } from './lib/stepAgency';

// Ban rut gon cua App.tsx - chi chua Login + DashboardApp, dung cho ban build
// mobile (Capacitor). Giu nguyen logic phan quyen xem du an (visibleProjects)
// giong het App.tsx de tranh lech nghiep vu giua web va app.

const getDefaultMilestoneName = (parentName: string, parentShortName?: string): string | undefined => {
  const name = (parentShortName || parentName || '').toLowerCase();
  if (name.includes('chủ trương') || name.includes('chutruong')) return 'Chấp thuận chủ trương đầu tư';
  if (name.includes('1/500') || name.includes('qh1500') || name.includes('quy hoạch')) return 'Phê duyệt quy hoạch 1/500';
  if (name.includes('giao đất') || name.includes('giaodat') || name.includes('thuê đất')) return 'Quyết định giao đất / thuê đất';
  if (name.includes('hạ tầng') || name.includes('đấu nối') || name.includes('htkt') || name.includes('đtm') || name.includes('báo cáo đtm')) return 'Phê duyệt báo cáo ĐTM / Thẩm định HTKT';
  if (name.includes('khả thi') || name.includes('nckt') || name.includes('bcnckt') || name.includes('nghiên cứu khả thi')) return 'Thẩm định báo cáo nghiên cứu khả thi';
  if (name.includes('phòng cháy') || name.includes('pccc') || name.includes('chữa cháy') || name.includes('hỏa hoạn')) return 'Nghiệm thu / Thẩm duyệt PCCC';
  if (name.includes('giấy phép') || name.includes('gpxd') || name.includes('xây dựng')) return 'Cấp Giấy phép xây dựng';
  return undefined;
};

const enrichProcesses = (rawProcesses: any[]): Process[] => {
  if (!Array.isArray(rawProcesses)) return [];
  return rawProcesses.map((proc: any) => {
    const parentSteps = (proc.parentSteps || []).map((parent: any) => {
      const name = (parent.shortName || parent.name || '').toLowerCase();
      const isM = name.includes('chủ trương') ||
                  name.includes('1/500') ||
                  name.includes('giao đất') ||
                  name.includes('báo cáo') ||
                  name.includes('nghiên cứu khả thi') ||
                  name.includes('hạ tầng') ||
                  name.includes('pccc') ||
                  name.includes('xây dựng') ||
                  name.includes('gpxd');
      const finalIsMilestone = parent.isMilestone !== undefined ? parent.isMilestone : isM;
      const defaultMName = finalIsMilestone ? getDefaultMilestoneName(parent.name, parent.shortName) : undefined;
      return { ...parent, isMilestone: finalIsMilestone, milestoneName: parent.milestoneName || defaultMName };
    });
    return { ...proc, parentSteps };
  });
};

const getProjectNumber = (p: any): number => {
  if (!p) return 999;
  if (p.code) {
    const match = p.code.match(/\d+/);
    if (match) return parseInt(match[0], 10);
  }
  if (p.id) {
    const parsed = parseInt(p.id, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 999;
};

const sortProjectsNaturally = (projectsList: any[]): any[] => {
  if (!Array.isArray(projectsList)) return [];
  return [...projectsList].sort((a, b) => {
    const numA = getProjectNumber(a);
    const numB = getProjectNumber(b);
    if (numA !== numB) return numA - numB;
    return (a.code || '').localeCompare(b.code || '');
  });
};

export default function MobileApp() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  // Every list starts EMPTY and is filled from the database (/api/data, or its local cache while
  // offline). No built-in sample data, so statistics never show demo projects or catalogs.
  const [users] = useState<UserAccount[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any[]>([]);
  const [projectStages, setProjectStages] = useState<any[]>([]);
  const [processingAgencies, setProcessingAgencies] = useState<Agency[]>([]);
  const [locations, setLocations] = useState<{ ward: string; oldArea: string }[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [actualProgress, setActualProgress] = useState<Record<string, any>>({});

  const projectStageNames = useMemo(() => {
    return [...projectStages].map((stage: any, idx: number) => {
      if (typeof stage === 'string') return stage;
      return stage.name || '';
    });
  }, [projectStages]);

  // Helper: dong bo cac thay doi tien do offline khi co mang tro lai
  const syncUnsyncedProgress = async () => {
    if (!localStorage.getItem('auth_token')) return;
    const saved = localStorage.getItem('unsynced_actual_progress');
    if (!saved) return;
    let queue: Record<string, any> = {};
    try {
      queue = JSON.parse(saved);
    } catch {
      return;
    }
    const projectIds = Object.keys(queue);
    if (projectIds.length === 0) return;

    const remaining = { ...queue };
    for (const projectId of projectIds) {
      try {
        const res = await apiFetch(`/api/actual-progress/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queue[projectId]),
        });
        if (res.ok) {
          delete remaining[projectId];
          localStorage.setItem('unsynced_actual_progress', JSON.stringify(remaining));
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  };

  useEffect(() => {
    syncUnsyncedProgress();
    window.addEventListener('online', syncUnsyncedProgress);
    const interval = setInterval(syncUnsyncedProgress, 15000);
    return () => {
      window.removeEventListener('online', syncUnsyncedProgress);
      clearInterval(interval);
    };
  }, []);

  const applySystemData = (d: any) => {
    if (d.projects) setProjects(sortProjectsNaturally(d.projects));
    if (d.investors) setInvestors(d.investors);
    if (d.projectStages) setProjectStages(d.projectStages);
    if (d.processingAgencies) setProcessingAgencies(d.processingAgencies);
    if (d.locations) setLocations(d.locations);
    if (d.processes) setProcesses(enrichProcesses(d.processes));
    if (d.actualProgress) setActualProgress(d.actualProgress);
  };

  const loadSystemData = async () => {
    try {
      const cached = localStorage.getItem('cached_system_data');
      if (cached) applySystemData(JSON.parse(cached));
    } catch (e) {
      console.warn('Failed to retrieve system state from local cache', e);
    }

    if (!localStorage.getItem('auth_token')) return;

    try {
      const response = await apiFetch('/api/data');
      if (response.ok) {
        const d = await response.json();
        applySystemData(d);
        localStorage.setItem('cached_system_data', JSON.stringify(d));
      }
    } catch (err) {
      console.error('Failed to load PostgreSQL data, relying on local cached state', err);
    }
  };

  useEffect(() => {
    loadSystemData();
  }, []);

  // Logic phan quyen xem du an - GIONG HET App.tsx, khong duoc lech nghiep vu
  const visibleProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.roleId === 'Admin') return projects;

    return projects.filter(p => {
      const stepAgency = resolveProjectStepAgency(p, processes);

      if (currentUser.roleId === 'Admin' || (currentUser.userType === 'agency' && currentUser.agencyId === '1')) {
        return true;
      }

      if (currentUser.userType === 'agency') {
        const agency = processingAgencies.find(a => a.id === currentUser.agencyId);
        const userAgencyName = normalizeAgencyName(agency?.name);

        if (currentUser.agencyId === '6') {
          const projectLocation = p.location || '';
          const userDepartment = (currentUser as any).department || '';

          const cleanProjectLoc = projectLocation.toLowerCase().replace(/đường|quận|huyện|phường|xã|thành phố|tp\.hcm|tp/g, '').trim();
          const cleanDept = userDepartment.toLowerCase().replace(/ubnd|phường|xã/g, '').trim();

          const isRelatedLocation = cleanDept && (
            projectLocation.toLowerCase().includes(cleanDept) ||
            cleanProjectLoc.includes(cleanDept)
          );

          const isRelatedStep = stepAgency === 'UBND cấp xã, phường' || stepAgency === 'Sở Quy hoạch Kiến trúc';
          return isRelatedLocation && isRelatedStep;
        }

        return stepAgency === userAgencyName;
      }

      if (currentUser.userType === 'investor') {
        return p.investor === (currentUser as any).investorId;
      }

      return false;
    });
  }, [projects, currentUser, processingAgencies, processes]);

  const visibleAgencies = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.roleId === 'Admin') return processingAgencies;
    if (currentUser.userType === 'agency' && currentUser.agencyId === '1') return processingAgencies;
    if (currentUser.userType === 'agency') return processingAgencies.filter(a => a.id === currentUser.agencyId);
    return processingAgencies;
  }, [processingAgencies, currentUser]);

  const handleUpdateActualProgress = async (projectId: string, updatedMap: any) => {
    setActualProgress(prev => ({ ...prev, [projectId]: updatedMap }));

    const saved = localStorage.getItem('unsynced_actual_progress');
    let queue: Record<string, any> = {};
    try {
      queue = saved ? JSON.parse(saved) : {};
    } catch {}
    queue[projectId] = updatedMap;
    localStorage.setItem('unsynced_actual_progress', JSON.stringify(queue));

    try {
      const res = await apiFetch(`/api/actual-progress/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMap),
      });
      if (res.ok) {
        const remaining = { ...queue };
        delete remaining[projectId];
        localStorage.setItem('unsynced_actual_progress', JSON.stringify(remaining));
      }
    } catch (err) {
      console.error('Cap nhat tien do that bai (mat mang hoac server loi). Da luu offline, se dong bo khi co mang lai.', err);
    }
  };

  const handleLogin = (user: UserAccount) => {
    localStorage.removeItem('cached_system_data');
    setCurrentUser(user);
    loadSystemData();
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('cached_system_data');
    setCurrentUser(null);
  };

  // Token hết hạn (apiFetch phát auth:expired) → quay về màn hình đăng nhập kèm lý do
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  useEffect(() => {
    const onAuthExpired = (e: Event) => {
      setAuthNotice((e as CustomEvent).detail?.message || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      handleLogout();
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

  if (!currentUser) {
    return <Login onLogin={handleLogin} users={users} notice={authNotice} />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div>
          <p className="text-sm font-bold text-slate-800">{currentUser.fullName}</p>
          <p className="text-[10px] text-slate-400 font-medium">{currentUser.roleId}</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-colors"
          title="Đăng xuất"
        >
          <LogOut size={20} />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <DashboardApp
          projects={visibleProjects}
          processingAgencies={visibleAgencies}
          processes={processes}
          investors={investors}
          projectStages={projectStageNames}
          locations={locations}
          currentUser={currentUser}
          actualProgress={actualProgress}
          onUpdateActualProgress={handleUpdateActualProgress}
        />
      </main>
    </div>
  );
}
