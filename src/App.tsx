import React, { useState, useEffect, useMemo } from 'react';
import Sidebar, { getAllowedMenuTabs } from './components/Sidebar';
import DashboardView from './components/Dashboard';
import DashboardApp from './components/DashboardApp';
import DashboardTPHCM from './components/DashboardTPHCM';
import TPHCMProjectList from './components/TPHCMProjectList';
import ProjectList from './components/ProjectList';
import CreateProject from './components/CreateProject';
import ProjectDetail from './components/ProjectDetail';
import ProcessGanttView from './components/ProcessGanttView';
import GanttDashboardNOXH from './components/GanttDashboardNOXH';
import UpdateProgress from './components/UpdateProgress';
import UpdatePlanModal from './components/UpdatePlanModal';
import HousingUpdateView from './components/HousingUpdateView';
import ListManagement from './components/ListManagement';
import AgencyManagement, { Agency } from './components/AgencyManagement';
import CategoryTabsManagement from './components/CategoryTabsManagement';
import StatusTabsManagement from './components/StatusTabsManagement';
import InvestorAgencyTabsManagement from './components/InvestorAgencyTabsManagement';
import AnnualProgressUpdate from './components/AnnualProgressUpdate';
import UserManagement from './components/UserManagement';
import ProfileModal from './components/ProfileModal';
import StepManagementView, { Process } from './components/StepManagementView';
import ProjectGanttDetail from './components/ProjectGanttDetail';
import ProjectStageManagement from './components/ProjectStageManagement';
import Login from './components/Login';
import { UserAccount } from './types';
import { getDynamicProjectInfo, toDisplayDate } from './lib/projectUtils';
import { Search, User, Menu, Settings, LogOut, RefreshCw, Database, AlertTriangle, CheckCircle2, X, Info, Wifi, WifiOff, Trash2 } from 'lucide-react';

import { apiFetch, uploadProjectFile, describeUploadFailures } from './utils/apiFetch';
import { isProjectInWard } from './lib/wardMatch';
import { normalizeAgencyName, resolveProjectStepAgency } from './lib/stepAgency';
import type { MilestoneProgress } from './lib/stepProgress';

const getDefaultMilestoneName = (parentName: string, parentShortName?: string): string | undefined => {
  const name = (parentShortName || parentName || '').toLowerCase();
  if (name.includes('chủ trương') || name.includes('chutruong')) {
    return 'Chấp thuận chủ trương đầu tư';
  }
  if (name.includes('1/500') || name.includes('qh1500') || name.includes('quy hoạch')) {
    return 'Phê duyệt quy hoạch 1/500';
  }
  if (name.includes('giao đất') || name.includes('giaodat') || name.includes('thuê đất')) {
    return 'Quyết định giao đất / thuê đất';
  }
  if (name.includes('hạ tầng') || name.includes('đấu nối') || name.includes('htkt') || name.includes('đtm') || name.includes('báo cáo đtm')) {
    return 'Phê duyệt báo cáo ĐTM / Thẩm định HTKT';
  }
  if (name.includes('khả thi') || name.includes('nckt') || name.includes('bcnckt') || name.includes('nghiên cứu khả thi')) {
    return 'Thẩm định báo cáo nghiên cứu khả thi';
  }
  if (name.includes('phòng cháy') || name.includes('pccc') || name.includes('chữa cháy') || name.includes('hỏa hoạn')) {
    return 'Nghiệm thu / Thẩm duyệt PCCC';
  }
  if (name.includes('giấy phép') || name.includes('gpxd') || name.includes('xây dựng')) {
    return 'Cấp Giấy phép xây dựng';
  }
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
      return {
        ...parent,
        isMilestone: finalIsMilestone,
        milestoneName: parent.milestoneName || defaultMName
      };
    });
    return {
      ...proc,
      parentSteps
    };
  });
};

const getProjectNumber = (p: any): number => {
  if (!p) return 999;
  if (p.code) {
    const match = p.code.match(/\d+/);
    if (match) {
      return parseInt(match[0], 10);
    }
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
    if (numA !== numB) {
      return numA - numB;
    }
    return (a.code || '').localeCompare(b.code || '');
  });
};

// URL hash ↔ screen. Menu screens use their id (#projects); screens that need a selected project
// get a sub-path under their parent screen, and fall back to that parent after a reload.
const CONTEXT_TAB_HASH: Record<string, string> = {
  'housing-update': 'projects/cap-nhat',
  'gantt-project-detail': 'gantt-dashboard-noxh/chi-tiet'
};
const tabToHash = (tab: string) => `#${CONTEXT_TAB_HASH[tab] || tab}`;
const hashToTab = (hash: string): string => {
  let h = '';
  try { h = decodeURIComponent(String(hash || '').replace(/^#\/?/, '')); } catch { h = ''; }
  const contextTab = Object.keys(CONTEXT_TAB_HASH).find(t => CONTEXT_TAB_HASH[t] === h);
  return contextTab || h;
};
const contextParentTab = (tab: string) => (CONTEXT_TAB_HASH[tab] || '').split('/')[0];

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const savedUser = localStorage.getItem('current_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        // After F5 stay on the screen in the URL, if this user may open it from the menu
        const fromUrl = hashToTab(window.location.hash);
        const allowed = getAllowedMenuTabs(u);
        if (allowed.includes(fromUrl)) return fromUrl;
        if (CONTEXT_TAB_HASH[fromUrl] && allowed.includes(contextParentTab(fromUrl))) return contextParentTab(fromUrl);
        if (u && (u.userType === 'investor' || u.roleId === 'Chủ đầu tư' || u.roleId === 'CĐT')) {
          return 'projects';
        }
      }
    } catch {}
    return 'dashboard-app';
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Mở sẵn hộp thoại đổi mật khẩu nếu phiên đã lưu vẫn đang dùng mật khẩu tạm (kể cả sau khi F5)
  const [showProfileModal, setShowProfileModal] = useState(() => !!currentUser?.mustChangePassword);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedGanttProject, setSelectedGanttProject] = useState<any>(null);
  const [projectToUpdate, setProjectToUpdate] = useState<any>(null);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  const [projectToUpdatePlan, setProjectToUpdatePlan] = useState<any>(null);
  const [housingUpdateProject, setHousingUpdateProject] = useState<any>(null);

  // Keep the URL hash on the current screen: each navigation adds a browser-history entry,
  // so Back/Forward move between screens instead of leaving the application
  React.useEffect(() => {
    if (!currentUser) return;
    const routable = getAllowedMenuTabs(currentUser).includes(activeTab) || !!CONTEXT_TAB_HASH[activeTab];
    if (!routable) return;
    const target = tabToHash(activeTab);
    if (window.location.hash !== target) window.location.hash = target;
  }, [activeTab, currentUser]);

  const activeTabRef = React.useRef(activeTab);
  activeTabRef.current = activeTab;

  // Back/Forward (or an edited URL): open the screen named in the hash if this user may see it.
  // A screen that needs a selected project falls back to its parent when none is selected.
  React.useEffect(() => {
    if (!currentUser) return;
    const onHashChange = () => {
      let tab = hashToTab(window.location.hash);
      if ((tab === 'housing-update' && !housingUpdateProject) || (tab === 'gantt-project-detail' && !selectedGanttProject)) {
        tab = contextParentTab(tab);
      }
      if (!getAllowedMenuTabs(currentUser).includes(tab) && !CONTEXT_TAB_HASH[tab]) {
        // Not a screen for this user: put the URL back on the screen that stays open
        window.history.replaceState(null, '', tabToHash(activeTabRef.current));
        return;
      }
      setActiveTab(prev => (prev === tab ? prev : tab));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentUser, housingUpdateProject, selectedGanttProject]);
  const [initialStepId, setInitialStepId] = useState<string | undefined>(undefined);
  const [initialSubStepId, setInitialSubStepId] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectFilter, setProjectFilter] = useState<any>(null);
  // Every list starts EMPTY and is filled from the database (/api/data, or its local cache while
  // offline). No built-in sample data, so statistics never show demo projects or catalogs.
  const [projects, setProjects] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any[]>([]);
  const [projectGroups, setProjectGroups] = useState<any[]>([]);
  const [projectCategories, setProjectCategories] = useState<any[]>([]);
  const [buildingGrades, setBuildingGrades] = useState<any[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<any[]>([]);
  const [projectStages, setProjectStages] = useState<any[]>([]);
  
  const sortedProjectStages = useMemo(() => {
    return [...projectStages].map((stage, idx) => {
      if (typeof stage === 'string') {
        return { name: stage, milestones: [], sortOrder: idx + 1 };
      }
      const s = stage as any;
      return {
        ...s,
        sortOrder: s.sortOrder !== undefined ? Number(s.sortOrder) : idx + 1
      };
    }).sort((a, b) => {
      const orderA = a.sortOrder !== undefined ? a.sortOrder : 999;
      const orderB = b.sortOrder !== undefined ? b.sortOrder : 999;
      return orderA - orderB;
    });
  }, [projectStages]);

  const projectStageNames = useMemo(() => {
    return sortedProjectStages.map(stage => {
      if (typeof stage === 'string') return stage;
      return stage.name || '';
    });
  }, [sortedProjectStages]);
  const [processingAgencies, setProcessingAgencies] = useState<Agency[]>([]);
  const [fundingSources, setFundingSources] = useState<any[]>([]);
  const [stepStatuses, setStepStatuses] = useState<any[]>([]);
  const [locations, setLocations] = useState<{ ward: string, oldArea: string }[]>([]);
  const [reportDate, setReportDate] = useState('31/12/2026');
  const [processes, setProcesses] = useState<Process[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const followers = useMemo(() => {
    return users.filter(u => u.isFollower).map(u => u.fullName || u.username || '').filter(Boolean);
  }, [users]);
  const [roles, setRoles] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [preselectedInvestor, setPreselectedInvestor] = useState<string | undefined>(undefined);
  const [tphcmListTitle, setTphcmListTitle] = useState('');
  const [tphcmListProjects, setTphcmListProjects] = useState<any[]>([]);
  const [ganttBackTab, setGanttBackTab] = useState('gantt-dashboard-noxh');
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [isReconnectingDb, setIsReconnectingDb] = useState(false);
  const [showDbDiagnostics, setShowDbDiagnostics] = useState(false);
  const [actualProgress, setActualProgress] = useState<Record<string, any>>({});
  // Milestone view per project, computed by the server from the step progress (src/lib/stepProgress)
  const [milestoneProgress, setMilestoneProgress] = useState<Record<string, Record<string, MilestoneProgress>>>({});
  const [unsyncedProgress, setUnsyncedProgress] = useState<Record<string, any>>(() => {
    try {
      const saved = localStorage.getItem('unsynced_actual_progress');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Failed to parse unsynced actual progress queue', e);
      return {};
    }
  });
  const [unsyncedActionsCount, setUnsyncedActionsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('unsynced_offline_actions');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = React.useRef(false);

  const [showSyncDiagnostics, setShowSyncDiagnostics] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<string | null>(null);
  const [rejectedActions, setRejectedActions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('rejected_offline_actions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [appToast, setAppToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
  const showAppToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setAppToast({ message, type });
    setTimeout(() => {
      setAppToast(prev => prev && prev.message === message ? null : prev);
    }, 4500);
  };

  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);

  // Helper to persist the current PostgreSQL state to LocalStorage
  const saveToLocalCache = (key: string, data: any) => {
    try {
      const cached = localStorage.getItem('cached_system_data');
      const parsed = cached ? JSON.parse(cached) : {};
      parsed[key] = data;
      localStorage.setItem('cached_system_data', JSON.stringify(parsed));
    } catch (e) {
      console.error("Failed to save to local cache for key: " + key, e);
    }
  };

  // Helper to append a general mutative API request to the offline queue if needed
  const executeMutativeApi = async (url: string, method: string, body?: any) => {
    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) {
        return { success: true, response: await res.json() };
      } else {
        // Chỉ đưa vào hàng đợi khi server trả mã ngoại tuyến 502/503/504
        if ([502, 503, 504].includes(res.status)) {
          console.warn(`PostgreSQL server trả về trạng thái ngoại tuyến ${res.status} cho ${method} ${url}. Đưa vào hàng đợi offline.`);
          queueOfflineAction({ url, method, body });
          return { success: false, queued: true };
        }

        // Với 401, 403, 404, 409, 422, 500: ném lỗi kèm nội dung server trả về
        let errorMsg = `Lỗi máy chủ (${res.status})`;
        try {
          const data = await res.json();
          if (data && data.error) errorMsg = data.error;
        } catch (_) {}
        const error: any = new Error(errorMsg);
        error.status = res.status;
        throw error;
      }
    } catch (err: any) {
      // Chỉ đưa vào hàng đợi khi THẬT SỰ mất mạng: fetch ném lỗi mạng
      const isNetworkError = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        (err instanceof TypeError && (
          err.message.toLowerCase().includes('failed to fetch') ||
          err.message.toLowerCase().includes('network') ||
          err.message.toLowerCase().includes('load failed')
        )) ||
        err?.name === 'NetworkError';

      if (isNetworkError) {
        console.error(`Mất kết nối mạng khi thực hiện ${method} ${url}, đưa vào hàng đợi offline:`, err);
        queueOfflineAction({ url, method, body });
        return { success: false, queued: true };
      }

      // Ngược lại, ném lỗi để hàm gọi phục hồi state
      throw err;
    }
  };

  const queueOfflineAction = (action: { url: string; method: string; body?: any }) => {
    try {
      const saved = localStorage.getItem('unsynced_offline_actions');
      const queue = saved ? JSON.parse(saved) : [];
      queue.push(action);
      localStorage.setItem('unsynced_offline_actions', JSON.stringify(queue));
      setUnsyncedActionsCount(queue.length);
    } catch (err) {
      console.error('Failed to queue offline action', err);
    }
  };

  const applySystemData = (d: any) => {
    if (d.projects) setProjects(sortProjectsNaturally(d.projects));
    if (d.investors) setInvestors(d.investors);
    if (d.projectGroups) setProjectGroups(d.projectGroups);
    if (d.projectCategories) setProjectCategories(d.projectCategories);
    if (d.buildingGrades) setBuildingGrades(d.buildingGrades);
    if (d.projectStatuses) setProjectStatuses(d.projectStatuses);
    if (d.projectStages) setProjectStages(d.projectStages);
    if (d.processingAgencies) setProcessingAgencies(d.processingAgencies);
    if (d.fundingSources) setFundingSources(d.fundingSources);
    if (d.stepStatuses) setStepStatuses(d.stepStatuses);
    if (d.locations) setLocations(d.locations);
    if (d.processes) {
      setProcesses(enrichProcesses(d.processes));
    }
    if (d.users) setUsers(d.users);
    if (d.roles) setRoles(d.roles);
    if (d.actualProgress) {
      let pending: Record<string, any> = {};
      try { pending = JSON.parse(localStorage.getItem('unsynced_actual_progress') || '{}') || {}; } catch (_) {}
      setActualProgress({ ...d.actualProgress, ...pending });
    }
    if (d.milestoneProgress) setMilestoneProgress(d.milestoneProgress);
  };

  // A progress write (step or milestone) returns the project, its milestone view and the milestone values
  // in the former shape, all recomputed by the server: they replace what the screens hold
  const applyProgressResult = (r: any) => {
    const p = r?.project;
    if (!p?.id) return;
    setProjects(prev => {
      const next = sortProjectsNaturally(prev.map(x => x.id === p.id ? { ...p, files: x.files } : x));
      saveToLocalCache('projects', next);
      return next;
    });
    setHousingUpdateProject((cur: any) => cur && cur.id === p.id ? { ...p, files: cur.files } : cur);
    setSelectedGanttProject((cur: any) => cur && cur.id === p.id ? { ...p, files: cur.files } : cur);
    setSelectedProject((cur: any) => cur && cur.id === p.id ? { ...p, files: cur.files } : cur);
    if (r.milestones) setMilestoneProgress(prev => ({ ...prev, [p.id]: r.milestones }));
    if (r.actualProgress) {
      setActualProgress(prev => {
        const next = { ...prev, [p.id]: r.actualProgress };
        saveToLocalCache('actualProgress', next);
        return next;
      });
    }
  };

  // ① Danh sách dự án → Cập nhật: one step, one side. Resolves with the recomputed project (null when
  // queued offline); throws with the server's message when refused.
  const submitStepProgressForView = async (projectId: string, payload: any): Promise<any> => {
    const r = await executeMutativeApi(`/api/projects/${projectId}/progress/step`, 'POST', payload);
    if (r?.success) {
      applyProgressResult(r.response);
      showAppToast('Đã lưu cập nhật tiến độ.', 'success');
      return r.response.project;
    }
    if (r?.queued) showAppToast('Mất kết nối máy chủ: cập nhật sẽ được gửi khi có mạng trở lại.', 'warning');
    return null;
  };

  // ② Sơ đồ Gantt → chi tiết → "+ nhập TT": dates of a milestone, written onto its steps by the server
  const submitMilestoneProgress = async (projectId: string, changes: any[]): Promise<boolean> => {
    const r = await executeMutativeApi(`/api/projects/${projectId}/progress/milestone`, 'POST', { changes });
    if (r?.success) { applyProgressResult(r.response); return true; }
    if (r?.queued) showAppToast('Mất kết nối máy chủ: cập nhật sẽ được gửi khi có mạng trở lại.', 'warning');
    return false;
  };

  const syncUnsyncedData = async () => {
    if (!localStorage.getItem('auth_token')) {
      setSyncError("Lỗi xác thực (Chưa đăng nhập) - Hệ thống phát hiện bạn chưa đăng nhập hoặc đã bị đăng xuất khỏi tài khoản. Vui lòng đăng nhập lại để đồng bộ các thay đổi cục bộ!");
      setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
      return;
    }
    if (isSyncingRef.current) return;
    
    const savedProgress = localStorage.getItem('unsynced_actual_progress');
    const savedActions = localStorage.getItem('unsynced_offline_actions');
    
    let progressQueue: Record<string, any> = {};
    if (savedProgress) {
      try {
        progressQueue = JSON.parse(savedProgress);
      } catch (e) {}
    }
    
    let actionsQueue: any[] = [];
    if (savedActions) {
      try {
        actionsQueue = JSON.parse(savedActions);
      } catch (e) {}
    }
    
    const progressKeys = Object.keys(progressQueue);
    const hasProgress = progressKeys.length > 0;
    const hasActions = actionsQueue.length > 0;
    
    if (!hasProgress && !hasActions) return;
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    let successCount = 0;
    let errorOccurred = false;
    
    // 1. Sync offline actual progress updates
    if (hasProgress) {
      const remainingProgress = { ...progressQueue };
      for (const projectId of progressKeys) {
        try {
          const res = await apiFetch(`/api/actual-progress/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(progressQueue[projectId])
          });
          if (res.ok) {
            delete remainingProgress[projectId];
            localStorage.setItem('unsynced_actual_progress', JSON.stringify(remainingProgress));
            setUnsyncedProgress(remainingProgress);
            successCount++;
          } else {
            console.warn(`Unsuccessful status ${res.status} when syncing project ${projectId}.`);
            let errorMsg = `Đồng bộ tiến độ dự án [${projectId}] thất bại (${res.status})`;
            try {
              const errData = await res.json();
              if (errData && errData.error) {
                errorMsg = errData.error;
              }
            } catch (_) {}

            if (res.status === 401) {
              setSyncError("Lỗi xác thực (401: Unauthorized) - Phiên làm việc đã hết hạn. Hãy đăng nhập lại để đồng bộ!");
              setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
              break;
            } else if (res.status >= 400 && res.status < 500) {
              // Bỏ action 4xx ra danh sách rejectedActions và tiếp tục
              delete remainingProgress[projectId];
              localStorage.setItem('unsynced_actual_progress', JSON.stringify(remainingProgress));
              setUnsyncedProgress(remainingProgress);

              const rej = {
                type: 'Tiến độ thực tế',
                target: projectId,
                status: res.status,
                error: errorMsg,
                time: new Date().toLocaleTimeString('vi-VN')
              };
              setRejectedActions(prev => {
                const next = [rej, ...prev];
                try { localStorage.setItem('rejected_offline_actions', JSON.stringify(next)); } catch (_) {}
                return next;
              });
              continue;
            } else {
              errorOccurred = true;
              setSyncError(errorMsg);
              setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
              break;
            }
          }
        } catch (err: any) {
          errorOccurred = true;
          console.error(`Sync actual progress failed for project ${projectId}:`, err);
          setSyncError(`Không thể kết nối đến máy chủ. Lỗi mạng (Có thể máy chủ ngoại tuyến hoặc mất kết nối): ${err?.message || err || 'Network Error'}`);
          setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
          break; // Stop if connection issue
        }
      }
    }
    
    // 2. Sync general actions (projects creations, edits, metadata updates)
    if (hasActions && !errorOccurred) {
      const remainingActions = [...actionsQueue];
      for (const action of actionsQueue) {
        try {
          const res = await apiFetch(action.url, {
            method: action.method,
            headers: { 'Content-Type': 'application/json' },
            body: action.body ? JSON.stringify(action.body) : undefined
          });
          if (res.ok) {
            remainingActions.shift();
            localStorage.setItem('unsynced_offline_actions', JSON.stringify(remainingActions));
            setUnsyncedActionsCount(remainingActions.length);
            successCount++;
          } else {
            console.warn(`Unsuccessful status ${res.status} when syncing offline action ${action.method} ${action.url}`);
            let errorMsg = `Tác vụ [${action.method} ${action.url}] thất bại (${res.status})`;
            try {
              const errData = await res.json();
              if (errData && errData.error) {
                errorMsg = errData.error;
              }
            } catch (_) {}

            if (res.status === 401) {
              setSyncError("Lỗi xác thực (401: Unauthorized) - Phiên làm việc đã hết hạn. Hãy đăng nhập lại để đồng bộ!");
              setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
              break;
            } else if (res.status >= 400 && res.status < 500) {
              // Bỏ action 4xx ra danh sách rejectedActions và tiếp tục các action sau
              remainingActions.shift();
              localStorage.setItem('unsynced_offline_actions', JSON.stringify(remainingActions));
              setUnsyncedActionsCount(remainingActions.length);

              const rej = {
                type: `${action.method} ${action.url}`,
                target: action.url,
                status: res.status,
                error: errorMsg,
                time: new Date().toLocaleTimeString('vi-VN')
              };
              setRejectedActions(prev => {
                const next = [rej, ...prev];
                try { localStorage.setItem('rejected_offline_actions', JSON.stringify(next)); } catch (_) {}
                return next;
              });
              continue;
            } else {
              errorOccurred = true;
              setSyncError(errorMsg);
              setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
              break;
            }
          }
        } catch (err: any) {
          errorOccurred = true;
          console.error(`Sync general action failed for ${action.method} ${action.url}:`, err);
          setSyncError(`Không thể kết nối đến máy chủ để gửi hành động. Lỗi kết nối: ${err?.message || err || 'Network Error'}`);
          setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
          break; // Stop if connection issue
        }
      }
    }
    
    if (successCount > 0) {
      // Reload and update system data after successful sync
      await loadSystemData();
    }
    
    // Check final remaining pending count
    const finalProgress = localStorage.getItem('unsynced_actual_progress');
    const finalActions = localStorage.getItem('unsynced_offline_actions');
    let finalProgressCount = 0;
    try {
      finalProgressCount = finalProgress ? Object.keys(JSON.parse(finalProgress)).length : 0;
    } catch (_) {}
    let finalActionsCount = 0;
    try {
      finalActionsCount = finalActions ? JSON.parse(finalActions).length : 0;
    } catch (_) {}
    
    if (finalProgressCount === 0 && finalActionsCount === 0) {
      setSyncError(null);
    }
    setLastSyncAttempt(new Date().toLocaleTimeString('vi-VN'));
    
    isSyncingRef.current = false;
    setIsSyncing(false);
  };

  React.useEffect(() => {
    syncUnsyncedData();
    window.addEventListener('online', syncUnsyncedData);
    const interval = setInterval(syncUnsyncedData, 15000);
    return () => {
      window.removeEventListener('online', syncUnsyncedData);
      clearInterval(interval);
    };
  }, []);

  const loadSystemData = async () => {
    // 1. Instantly load from local storage cache for ultra-responsive & fully offline startup
    try {
      const cached = localStorage.getItem('cached_system_data');
      if (cached) {
        const d = JSON.parse(cached);
        applySystemData(d);
        if (d.projects) {
          if (selectedProject) {
            const freshSelected = d.projects.find((p: any) => p.id === selectedProject.id);
            if (freshSelected) {
              setSelectedProject(freshSelected);
            }
          }
          if (selectedGanttProject) {
            const freshGanttSelected = d.projects.find((p: any) => p.id === selectedGanttProject.id);
            if (freshGanttSelected) {
              setSelectedGanttProject(freshGanttSelected);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to retrieve system state from local cache", e);
    }

    // 2. Fetch fresh synchronized dataset from PostgreSQL
    if (!localStorage.getItem('auth_token')) {
      return;
    }

    try {
      const response = await apiFetch('/api/data');
      if (response.ok) {
        const d = await response.json();
        applySystemData(d);
        if (d.projects) {
          if (selectedProject) {
            const freshSelected = d.projects.find((p: any) => p.id === selectedProject.id);
            if (freshSelected) {
              setSelectedProject(freshSelected);
            }
          }
          if (selectedGanttProject) {
            const freshGanttSelected = d.projects.find((p: any) => p.id === selectedGanttProject.id);
            if (freshGanttSelected) {
              setSelectedGanttProject(freshGanttSelected);
            }
          }
        }
        // Persist the entire synchronized database payload back to local cache
        localStorage.setItem('cached_system_data', JSON.stringify(d));
      } else {
        console.warn("PostgreSQL responded with non-ok status, continuing with local cached data");
      }
    } catch (err) {
      console.error("Failed to load PostgreSQL data, relying on local cached state", err);
    }
  };

  // Load database status
  const fetchDbStatus = async (retry = false) => {
    if (retry) {
      setIsReconnectingDb(true);
    }
    try {
      const res = await apiFetch(`/api/db-status${retry ? '?retry=true' : ''}`);
      if (res.ok) {
        const status = await res.json();
        setDbStatus(status);
        if (retry && status.connected) {
          // Re-load data if successfully connected now!
          await loadSystemData();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (retry) {
        setIsReconnectingDb(false);
      }
    }
  };

  // Initial load effect to get all synchronized PostgreSQL data
  React.useEffect(() => {
    loadSystemData();
    fetchDbStatus();
  }, []);

  // Toast text that matches what the user did on a catalog (add / delete / rename)
  const catalogSavedMessage = (label: string, prevList: any[], nextList: any[]) =>
    nextList.length < prevList.length ? `Đã xóa khỏi danh mục ${label}.`
      : nextList.length > prevList.length ? `Đã thêm vào danh mục ${label}.`
      : `Đã lưu danh mục ${label}.`;

  // A rename keeps the list length and changes one position; it goes through the rename API so
  // projects using the old value are updated too. Returns how many values were renamed.
  const renameCatalogValues = async (key: string, prevList: string[], nextList: string[]) => {
    const renames = nextList.length === prevList.length
      ? prevList.map((oldName, i) => ({ oldName, newName: nextList[i] })).filter(r => r.oldName !== r.newName)
      : [];
    for (const r of renames) {
      await executeMutativeApi(`/api/metadata/${key}/rename`, 'POST', r);
    }
    return renames.length;
  };

  const handleUpdateInvestors = async (newList: any[]) => {
    const prev = [...investors];
    setInvestors(newList);
    saveToLocalCache('investors', newList);
    try {
      // A rename (same position, different text) goes through the rename API so projects and
      // investor accounts that reference the old name are updated in the same transaction
      const renames = newList.length === prev.length
        ? prev.map((oldName, i) => ({ oldName, newName: newList[i] })).filter(r => r.oldName !== r.newName)
        : [];
      for (const r of renames) {
        await executeMutativeApi('/api/metadata/investors/rename', 'POST', r);
      }
      await executeMutativeApi('/api/metadata/investors', 'PUT', newList);
      if (renames.length > 0) await loadSystemData();
      showAppToast(catalogSavedMessage('chủ đầu tư', prev, newList), 'success');
    } catch (err: any) {
      setInvestors(prev);
      saveToLocalCache('investors', prev);
      showAppToast(err.message || 'Cập nhật danh sách chủ đầu tư thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateBuildingGrades = async (newList: any[]) => {
    const prev = [...buildingGrades];
    setBuildingGrades(newList);
    saveToLocalCache('buildingGrades', newList);
    try {
      const renamed = await renameCatalogValues('buildingGrades', prev, newList);
      await executeMutativeApi('/api/metadata/buildingGrades', 'PUT', newList);
      if (renamed > 0) await loadSystemData();
      showAppToast(catalogSavedMessage('cấp công trình', prev, newList), 'success');
    } catch (err: any) {
      setBuildingGrades(prev);
      saveToLocalCache('buildingGrades', prev);
      showAppToast(err.message || 'Cập nhật cấp công trình thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateProjectCategories = async (newList: any[]) => {
    const prev = [...projectCategories];
    setProjectCategories(newList);
    saveToLocalCache('projectCategories', newList);
    try {
      const renamed = await renameCatalogValues('projectCategories', prev, newList);
      await executeMutativeApi('/api/metadata/projectCategories', 'PUT', newList);
      if (renamed > 0) await loadSystemData();
      showAppToast(catalogSavedMessage('loại hình dự án', prev, newList), 'success');
    } catch (err: any) {
      setProjectCategories(prev);
      saveToLocalCache('projectCategories', prev);
      showAppToast(err.message || 'Cập nhật loại hình dự án thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateProjectGroups = async (newList: any[]) => {
    const prev = [...projectGroups];
    setProjectGroups(newList);
    saveToLocalCache('projectGroups', newList);
    try {
      const renamed = await renameCatalogValues('projectGroups', prev, newList);
      await executeMutativeApi('/api/metadata/projectGroups', 'PUT', newList);
      if (renamed > 0) await loadSystemData();
      showAppToast(catalogSavedMessage('nhóm dự án', prev, newList), 'success');
    } catch (err: any) {
      setProjectGroups(prev);
      saveToLocalCache('projectGroups', prev);
      showAppToast(err.message || 'Cập nhật nhóm dự án thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateProjectStatuses = async (newList: any[]) => {
    const prev = [...projectStatuses];
    setProjectStatuses(newList);
    saveToLocalCache('projectStatuses', newList);
    try {
      await executeMutativeApi('/api/metadata/projectStatuses', 'PUT', newList);
      showAppToast('Đã lưu trạng thái dự án thành công!', 'success');
    } catch (err: any) {
      setProjectStatuses(prev);
      saveToLocalCache('projectStatuses', prev);
      showAppToast(err.message || 'Cập nhật trạng thái dự án thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateProjectStages = async (newList: any[]) => {
    const prev = [...projectStages];
    setProjectStages(newList);
    saveToLocalCache('projectStages', newList);
    try {
      // One name replaced by another with the list size unchanged = a rename: it goes through the rename
      // API so the procedures and projects that store the stage name follow it
      const stageName = (s: any) => String((typeof s === 'string' ? s : s?.name) ?? '').trim();
      const prevNames = prev.map(stageName);
      const nextNames = newList.map(stageName);
      const gone = prevNames.filter(n => !nextNames.includes(n));
      const added = nextNames.filter(n => !prevNames.includes(n));
      const renamed = prevNames.length === nextNames.length && gone.length === 1 && added.length === 1;
      if (renamed) {
        await executeMutativeApi('/api/metadata/projectStages/rename', 'POST', { oldName: gone[0], newName: added[0] });
      }
      await executeMutativeApi('/api/metadata/projectStages', 'PUT', newList);
      if (renamed) await loadSystemData();
      showAppToast('Đã lưu giai đoạn dự án thành công!', 'success');
    } catch (err: any) {
      setProjectStages(prev);
      saveToLocalCache('projectStages', prev);
      showAppToast(err.message || 'Cập nhật giai đoạn dự án thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateProcessingAgencies = async (newList: any[]) => {
    const prev = [...processingAgencies];
    setProcessingAgencies(newList);
    saveToLocalCache('processingAgencies', newList);
    try {
      // Renamed agencies (same id, new name) go through the rename API: process steps and projects
      // store the agency NAME, and would otherwise lose their link to the agency's users
      const renames = newList
        .map((a: any) => {
          const old = prev.find((p: any) => p.id === a.id);
          return old && old.name !== a.name ? { oldName: old.name, newName: a.name, agencyId: a.id } : null;
        })
        .filter(Boolean);
      for (const r of renames) {
        await executeMutativeApi('/api/metadata/agencies/rename', 'POST', r);
      }
      await executeMutativeApi('/api/metadata/processingAgencies', 'PUT', newList);
      if (renames.length > 0) await loadSystemData();
      showAppToast('Đã lưu cơ quan xử lý thành công!', 'success');
    } catch (err: any) {
      setProcessingAgencies(prev);
      saveToLocalCache('processingAgencies', prev);
      showAppToast(err.message || 'Cập nhật cơ quan xử lý thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateActualProgress = async (projectId: string, updatedMap: any) => {
    const previousMap = actualProgress[projectId];
    // 1. Optimistically update React State
    setActualProgress(prev => {
      const next = {
        ...prev,
        [projectId]: updatedMap
      };
      saveToLocalCache('actualProgress', next);
      return next;
    });

    // 3. Mark as unsynced in queue (so background sync picks it up if needed)
    setUnsyncedProgress(prev => {
      const updated = { ...prev, [projectId]: updatedMap };
      localStorage.setItem('unsynced_actual_progress', JSON.stringify(updated));
      return updated;
    });

    // 4. Try updating in PostgreSQL
    try {
      const res = await apiFetch(`/api/actual-progress/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMap)
      });
      if (res.ok) {
        // Success! Remove from the local unsynced queue
        setUnsyncedProgress(prev => {
          const updated = { ...prev };
          delete updated[projectId];
          localStorage.setItem('unsynced_actual_progress', JSON.stringify(updated));
          return updated;
        });
      } else if (res.status >= 400 && res.status < 500) {
        // Rejected by the server (no permission, invalid data…): undo the optimistic change and drop it
        // from the offline queue, otherwise it would look saved and be retried forever
        const errData = await res.json().catch(() => ({}));
        setActualProgress(prev => {
          const next = { ...prev };
          if (previousMap === undefined) delete next[projectId]; else next[projectId] = previousMap;
          saveToLocalCache('actualProgress', next);
          return next;
        });
        setUnsyncedProgress(prev => {
          const updated = { ...prev };
          delete updated[projectId];
          localStorage.setItem('unsynced_actual_progress', JSON.stringify(updated));
          return updated;
        });
        showAppToast(errData.error || 'Không lưu được tiến độ thực tế.', 'error');
      } else {
        console.warn(`PostgreSQL returned non-ok status: ${res.status}. Stored progress locally for offline fallback.`);
      }
    } catch (err) {
      console.error(`PostgreSQL database actual progress write failed (network or server down). Saved locally. Wait for reconnection.`, err);
    }
  };

  const handleResetActualProgressByDB = async () => {
    if (currentUser?.roleId !== 'Admin') {
      showAppToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền đặt lại dữ liệu tiến độ thực tế.', 'warning');
      return;
    }
    try {
      const res = await apiFetch('/api/actual-progress/reset', { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        showAppToast(errorData.error || 'Có lỗi xảy ra khi đặt lại tiến độ.', 'error');
        return;
      }
      setActualProgress({});
      // Clean only actual_progress cached keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('actual_progress_') || key === 'unsynced_actual_progress')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      window.location.reload();
    } catch (e) {
      console.error(e);
      showAppToast('Có lỗi kết nối máy chủ khi thực hiện thao tác.', 'error');
    }
  };

  const handleUpdateFundingSources = async (newList: any[]) => {
    const prev = [...fundingSources];
    setFundingSources(newList);
    saveToLocalCache('fundingSources', newList);
    try {
      const renamed = await renameCatalogValues('fundingSources', prev, newList);
      await executeMutativeApi('/api/metadata/fundingSources', 'PUT', newList);
      if (renamed > 0) await loadSystemData();
      showAppToast(catalogSavedMessage('nguồn vốn', prev, newList), 'success');
    } catch (err: any) {
      setFundingSources(prev);
      saveToLocalCache('fundingSources', prev);
      showAppToast(err.message || 'Cập nhật nguồn vốn thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateStepStatuses = async (newList: any[]) => {
    const prev = [...stepStatuses];
    setStepStatuses(newList);
    saveToLocalCache('stepStatuses', newList);
    try {
      await executeMutativeApi('/api/metadata/stepStatuses', 'PUT', newList);
      showAppToast('Đã lưu trạng thái bước thành công!', 'success');
    } catch (err: any) {
      setStepStatuses(prev);
      saveToLocalCache('stepStatuses', prev);
      showAppToast(err.message || 'Cập nhật trạng thái bước thất bại!', 'error');
      throw err;
    }
  };

  const handleUpdateLocations = async (newList: any[]) => {
    const prev = [...locations];
    setLocations(newList);
    saveToLocalCache('locations', newList);
    try {
      await executeMutativeApi('/api/metadata/locations', 'PUT', newList);
      showAppToast('Đã lưu địa bàn thành công!', 'success');
    } catch (err: any) {
      setLocations(prev);
      saveToLocalCache('locations', prev);
      showAppToast(err.message || 'Cập nhật địa bàn thất bại!', 'error');
      throw err;
    }
  };

  // Latest list, so functional updates chain correctly and a refused save can be rolled back
  const processesRef = React.useRef(processes);
  processesRef.current = processes;
  const handleUpdateProcesses = async (value: any[] | ((prev: any[]) => any[])) => {
    const prev = processesRef.current;
    const next = typeof value === 'function' ? value(prev) : value;
    processesRef.current = next;
    setProcesses(next);
    saveToLocalCache('processes', next);
    try {
      await executeMutativeApi('/api/metadata/processes', 'PUT', next);
    } catch (err: any) {
      // e.g. the server refuses to delete a process that projects still use
      processesRef.current = prev;
      setProcesses(prev);
      saveToLocalCache('processes', prev);
      showAppToast(err.message || 'Cập nhật quy trình thất bại!', 'error');
    }
  };

  const handleUpdateRoles = async (newList: any[]) => {
    const prev = [...roles];
    setRoles(newList);
    saveToLocalCache('roles', newList);
    try {
      await executeMutativeApi('/api/metadata/roles', 'PUT', newList);
      showAppToast('Đã lưu vai trò thành công!', 'success');
    } catch (err: any) {
      setRoles(prev);
      saveToLocalCache('roles', prev);
      showAppToast(err.message || 'Cập nhật vai trò thất bại!', 'error');
      throw err;
    }
  };

  // Local state only: user changes are persisted by callers through /api/users (per-user CRUD
  // with server-side authorization). Passwords are never kept in state or the local cache.
  const handleUpdateUsers = async (newList: any[]) => {
    const sanitized = newList.map(({ password, ...u }: any) => u);
    setUsers(sanitized);
    saveToLocalCache('users', sanitized);
  };

  const getActiveAgencyForProject = (project: any): string => {
    if (!project) return 'Chưa xác định';
    // Same source as every screen: server progress (+ unsynced local edits), never demo data
    const actualData: any = actualProgress?.[project.id] || {};
    const info = getDynamicProjectInfo(project, actualData);
    return info.activeAgency || project.currentAgency || 'Sở Xây dựng';
  };

  // Same rule as the server's canEditProject: everyone works on the projects shown to them, except a
  // ward, which follows every project of its ward but updates only those at a ward / SQHKT step
  const WARD_WORK_AGENCIES = ['UBND cấp xã, phường', 'Sở Quy hoạch Kiến trúc'];
  const canEditProjectInScope = (p: any): boolean => {
    if (!p || !currentUser) return false;
    if (isSXDOrAdminUser(currentUser)) return true;
    if (currentUser.userType === 'agency' && currentUser.agencyId === '6') {
      // Current step decides; the active phase only when the step is unknown (same rule as server.ts)
      const stepAgency = resolveProjectStepAgency(p, processes);
      const activeAgency = stepAgency ? '' : normalizeAgencyName(getActiveAgencyForProject(p));
      return WARD_WORK_AGENCIES.includes(stepAgency) || WARD_WORK_AGENCIES.includes(activeAgency);
    }
    return true;
  };

  const visibleProjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.roleId === 'Admin') return projects;
    
    // Determine user's identity name
    let userAgencyName = '';
    if (currentUser.userType === 'agency') {
      const agency = processingAgencies.find(a => a.id === currentUser.agencyId);
      userAgencyName = agency?.name || '';
    } else if (currentUser.userType === 'investor') {
      userAgencyName = 'Chủ đầu tư';
    }

    return projects.filter(p => {
      // Same resolution as the server (step id inside the project's own process; names repeat)
      // The active phase (milestones / Gantt TT) counts only when the step cannot be resolved
      const stepAgency = resolveProjectStepAgency(p, processes);
      const activeAgency = stepAgency ? '' : normalizeAgencyName(getActiveAgencyForProject(p));

      // Admin hoặc Sở Xây dựng (ID '1') xem được tất cả dự án
      if (currentUser.roleId === 'Admin' || (currentUser.userType === 'agency' && currentUser.agencyId === '1')) {
        return true;
      }

      // Đối với các cơ quan NN khác, chỉ thấy dự án đang ở bước hoặc tiến độ thuộc cơ quan mình
      if (currentUser.userType === 'agency') {
        const agency = processingAgencies.find(a => a.id === currentUser.agencyId);
        const userAgencyName = normalizeAgencyName(agency?.name);
        
        // UBND cấp xã, phường (agencyId '6') theo dõi mọi dự án trong địa bàn của mình, ở mọi giai đoạn
        // (exact ward match, shared with the server; an account without a ward sees no projects).
        // Whether it may update a project is decided separately by canEditProjectInScope.
        if (currentUser.agencyId === '6') {
          return isProjectInWard(p.location || '', currentUser.department || '');
        }

        let isMatch = stepAgency === userAgencyName || activeAgency === userAgencyName;

        if (!isMatch && (userAgencyName || currentUser.agencyId)) {
          const uLower = userAgencyName.toLowerCase();
          const sAgency = (stepAgency || '').toLowerCase();
          const aAgency = (activeAgency || '').toLowerCase();
          const curAgency = stepAgency ? '' : (p.currentAgency || '').toLowerCase();

          if (uLower.includes('quy hoạch') || uLower.includes('kiến trúc') || currentUser.agencyId === '2') {
            isMatch = sAgency.includes('quy hoạch') || sAgency.includes('kiến trúc') ||
                      aAgency.includes('quy hoạch') || aAgency.includes('kiến trúc') ||
                      curAgency.includes('quy hoạch') || curAgency.includes('kiến trúc');
          } else if (uLower.includes('tài nguyên') || uLower.includes('môi trường') || uLower.includes('nnmt') || currentUser.agencyId === '3') {
            isMatch = sAgency.includes('tài nguyên') || sAgency.includes('môi trường') ||
                      aAgency.includes('tài nguyên') || aAgency.includes('môi trường') ||
                      curAgency.includes('tài nguyên') || curAgency.includes('môi trường');
          } else if (uLower.includes('tài chính') || currentUser.agencyId === '5') {
            isMatch = sAgency.includes('tài chính') || aAgency.includes('tài chính') || curAgency.includes('tài chính');
          }
        }

        return isMatch;
      }
      
      // Đối với Chủ đầu tư, thấy dự án của mình
      if (currentUser.userType === 'investor') {
        return p.investor === currentUser.investorId;
      }
      
      return false;
    });
  }, [projects, currentUser, processingAgencies, processes, actualProgress]);

  const visibleAgencies = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.roleId === 'Admin') return processingAgencies;
    if (currentUser.userType === 'agency' && currentUser.agencyId === '1') return processingAgencies; // Sở Xây dựng
    
    if (currentUser.userType === 'agency') {
      return processingAgencies.filter(a => a.id === currentUser.agencyId);
    }
    
    if (currentUser.userType === 'investor') {
      return processingAgencies;
    }
    
    return processingAgencies;
  }, [processingAgencies, currentUser]);

  const handleCreateSuccess = async (newProject?: any, rawFiles?: { id: string; file: File }[]) => {
    if (newProject) {
      const prevProjects = [...projects];
      try {
        if (projectToEdit) {
          setProjects(prev => {
            const next = prev.map(p => p.id === newProject.id ? newProject : p);
            const sorted = sortProjectsNaturally(next);
            saveToLocalCache('projects', sorted);
            return sorted;
          });
          if (selectedProject && selectedProject.id === newProject.id) {
            setSelectedProject(newProject);
          }
          if (selectedGanttProject && selectedGanttProject.id === newProject.id) {
            setSelectedGanttProject(newProject);
          }
          await executeMutativeApi(`/api/projects/${newProject.id}`, 'PUT', newProject);

          if (rawFiles && rawFiles.length > 0) {
            const failures: { name: string; error: string }[] = [];
            for (const fObj of rawFiles) {
              const r = await uploadProjectFile(newProject.id, fObj.file);
              if (!r.ok) failures.push({ name: fObj.file.name, error: r.error });
            }
            if (failures.length > 0) showAppToast(describeUploadFailures(failures), 'warning');
          }
        } else {
          const tempId = 'local_' + Date.now();
          const offlineProject = { ...newProject, id: tempId };
          setProjects(prev => {
            const next = [...prev, offlineProject];
            const sorted = sortProjectsNaturally(next);
            saveToLocalCache('projects', sorted);
            return sorted;
          });

          const result = await executeMutativeApi('/api/projects', 'POST', newProject);
          if (result.success && result.response) {
            const saved = result.response;
            setProjects(prev => {
              const next = prev.map(p => p.id === tempId ? saved : p);
              const sorted = sortProjectsNaturally(next);
              saveToLocalCache('projects', sorted);
              return sorted;
            });

            if (rawFiles && rawFiles.length > 0) {
              const failures: { name: string; error: string }[] = [];
              for (const fObj of rawFiles) {
                const r = await uploadProjectFile(saved.id, fObj.file);
                if (!r.ok) failures.push({ name: fObj.file.name, error: r.error });
              }
              if (failures.length > 0) showAppToast(describeUploadFailures(failures), 'warning');
            }
          }
        }
        
        // Reload fresh synchronized dataset with loaded files/attachments
        await loadSystemData();
        setShowCreateModal(false);
        setProjectToEdit(null);
        setProjectFilter(null);
        setActiveTab('projects');
        setRefreshKey(prev => prev + 1);
      } catch (err: any) {
        setProjects(prevProjects);
        saveToLocalCache('projects', prevProjects);
        showAppToast(err.message || 'Lưu dự án thất bại. Dữ liệu đã được phục hồi!', 'error');
      }
    }
  };

  const handleUpdateSuccess = async (rawUpdatedProject: any) => {
    const oldProject = projects.find(p => p.id === rawUpdatedProject.id);
    // Plans are not converted here between steps and milestones: the server does it with the milestone
    // links of the process (src/lib/stepProgress) and the data is reloaded after the save
    const updatedProject = { ...rawUpdatedProject };

    const prevProjects = [...projects];
    setProjects(prev => {
      const next = prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      const sorted = sortProjectsNaturally(next);
      saveToLocalCache('projects', sorted);
      return sorted;
    });
    setHousingUpdateProject(updatedProject);
    if (selectedProject && selectedProject.id === updatedProject.id) {
      setSelectedProject(updatedProject);
    }
    if (selectedGanttProject && selectedGanttProject.id === updatedProject.id) {
      setSelectedGanttProject(updatedProject);
    }

    try {
      // Exclude 'files' field from PUT body so that we don't clear newly uploaded attachments
      const { files, ...updateBody } = updatedProject;
      await executeMutativeApi(`/api/projects/${updatedProject.id}`, 'PUT', updateBody);
    } catch (err: any) {
      setProjects(prevProjects);
      saveToLocalCache('projects', prevProjects);
      showAppToast(err.message || 'Cập nhật kế hoạch dự án thất bại!', 'error');
      return false;
    }
    
    // Compare and log change history
    if (oldProject) {
      const fieldMapping: Record<string, string> = {
        chutruong_cdt_date: 'Chủ trương đầu tư - HXL CĐT',
        chutruong_nn_date: 'Chủ trương đầu tư - HXL Cơ quan NN',
        qh1500_cdt_date: 'QH 1/500 - HXL CĐT',
        qh1500_nn_date: 'QH 1/500 - HXL Cơ quan NN',
        qdgiaodat_cdt_date: 'QĐ giao đất - HXL CĐT',
        qdgiaodat_nn_date: 'QĐ giao đất - HXL Cơ quan NN',
        htkt_dtm_cdt_date: 'Đấu nối HTKT/ĐTM - HXL CĐT',
        htkt_dtm_nn_date: 'Đấu nối HTKT/ĐTM - HXL Cơ quan NN',
        baocaonckt_cdt_date: 'BC NCKT - HXL CĐT',
        baocaonckt_nn_date: 'BC NCKT - HXL Cơ quan NN',
        pccc_cdt_date: 'Thẩm duyệt PCCC - HXL CĐT',
        pccc_nn_date: 'Thẩm duyệt PCCC - HXL Cơ quan NN',
        gpxaydung_cdt_date: 'GPXD - HXL CĐT',
        gpxaydung_nn_date: 'GPXD - HXL Cơ quan NN',
        completion_date: 'Ngày hoàn thành dự kiến'
      };

      const changes: string[] = [];
      // History shows dates as dd/mm/yyyy whatever format they are stored in
      const displayDate = (v: string) => toDisplayDate(v) || 'Trống';

      // Check root plan dates
      Object.entries(fieldMapping).forEach(([key, label]) => {
        const oldVal = oldProject[key] || '';
        const newVal = updatedProject[key] || '';
        if (displayDate(oldVal) !== displayDate(newVal)) {
          changes.push(`Thay đổi "${label}" từ "${displayDate(oldVal)}" thành "${displayDate(newVal)}"`);
        }
      });

      // Check milestones dates
      const oldMilestones = oldProject.milestones || {};
      const newMilestones = updatedProject.milestones || {};
      const allStepIds = Array.from(new Set([
        ...Object.keys(oldMilestones),
        ...Object.keys(newMilestones)
      ]));

      allStepIds.forEach(stepId => {
        const oldMilestone = oldMilestones[stepId] || {};
        const newMilestone = newMilestones[stepId] || {};

        // Milestones are keyed by child step id OR parent (thủ tục) id: look both up for the name
        let stepName = stepId;
        const foundStep = processes
          .flatMap(p => p.parentSteps || [])
          .flatMap((ps: any) => [ps, ...(ps.childSteps || [])])
          .find((s: any) => s.id === stepId);
        if (foundStep) {
          stepName = foundStep.name;
        }

        const oldInv = oldMilestone.investor || '';
        const newInv = newMilestone.investor || '';
        if (displayDate(oldInv) !== displayDate(newInv)) {
          changes.push(`Thay đổi "Kế hoạch CĐT - ${stepName}" từ "${displayDate(oldInv)}" thành "${displayDate(newInv)}"`);
        }

        const oldAgency = oldMilestone.agency || '';
        const newAgency = newMilestone.agency || '';
        if (displayDate(oldAgency) !== displayDate(newAgency)) {
          changes.push(`Thay đổi "Kế hoạch Cơ quan NN - ${stepName}" từ "${displayDate(oldAgency)}" thành "${displayDate(newAgency)}"`);
        }
      });

      if (changes.length > 0) {
        try {
          const userDisplayName = currentUser?.fullName || 'Người dùng hệ thống';
          const changeDesc = `Cập nhật kế hoạch thực hiện:\n- ${changes.join('\n- ')}`;
          await apiFetch(`/api/projects/${updatedProject.id}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userName: userDisplayName,
              actionType: 'update_status',
              description: changeDesc,
              oldStatus: oldProject.status || updatedProject.status,
              newStatus: updatedProject.status
            })
          });
        } catch (err) {
          console.error("Error creating plan history log:", err);
        }
      }
    }
    
    setProjectToUpdate(null);
    setRefreshKey(prev => prev + 1);
    // Step / milestone plans and the current step are recomputed on the server
    await loadSystemData();
    // true = saved on the server (or queued while offline); false = rejected and rolled back
    return true;
  };

  const handleEditProject = (project: any) => {
    setProjectToEdit(project);
    setShowCreateModal(true);
  };

  const handleDeleteProject = (project: any) => {
    setProjectToDelete(project);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const project = projectToDelete;
    setProjectToDelete(null);

    const prevProjects = [...projects];
    setProjects(prev => {
      const next = prev.filter(p => p.id !== project.id);
      const sorted = sortProjectsNaturally(next);
      saveToLocalCache('projects', sorted);
      return sorted;
    });

    try {
      await executeMutativeApi(`/api/projects/${project.id}`, 'DELETE');
      showAppToast(`Đã xóa dự án "${project.name}" thành công!`, 'success');
      setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      setProjects(prevProjects);
      saveToLocalCache('projects', prevProjects);
      showAppToast(err.message || 'Xóa dự án thất bại!', 'error');
    }
  };


  const handleNavigateToProjects = (filter?: any) => {
    if (filter?.view === 'all-progress') {
      setActiveTab('process-gantt');
      return;
    }
    setProjectFilter(filter || null);
    setActiveTab('projects');
  };

  const handleNavigateToHousingUpdate = (project: any, stepId?: string, subStepId?: string) => {
    setHousingUpdateProject(project);
    setInitialStepId(stepId);
    setInitialSubStepId(subStepId);
    setActiveTab('housing-update');
  };

  const isSXDOrAdminUser = (user: UserAccount | null) => {
    if (!user) return false;
    return user.roleId === 'Admin' || 
           user.roleId?.toLowerCase() === 'admin' || 
           user.username?.toLowerCase() === 'admin' || 
           user.agencyId === '1' ||
           (user.userType === 'agency' && user.agencyId === '1');
  };

  useEffect(() => {
    if (currentUser) {
      const isInvestor = currentUser.userType === 'investor' || currentUser.roleId === 'Chủ đầu tư' || currentUser.roleId === 'CĐT';
      if (isInvestor) {
        const restrictedTabs = ['dashboard', 'dashboard-app', 'dashboard-tphcm-list', 'gantt-dashboard-noxh', 'annual-update', 'process-gantt'];
        if (restrictedTabs.includes(activeTab)) {
          setActiveTab('projects');
        }
      } else if (activeTab === 'annual-update' && !isSXDOrAdminUser(currentUser)) {
        setActiveTab('dashboard-app');
      }
    }
  }, [currentUser, activeTab]);

  const handleNavigate = (tab: string) => {
    const isInvestor = currentUser?.userType === 'investor' || currentUser?.roleId === 'Chủ đầu tư' || currentUser?.roleId === 'CĐT';
    if (isInvestor) {
      const restrictedTabs = ['dashboard', 'dashboard-app', 'dashboard-tphcm-list', 'gantt-dashboard-noxh', 'annual-update', 'process-gantt'];
      if (restrictedTabs.includes(tab)) {
        setActiveTab('projects');
        return;
      }
    }
    if (tab === 'annual-update' && !isSXDOrAdminUser(currentUser)) {
      return;
    }
    setActiveTab(tab);
    if (tab !== 'projects') {
      setProjectFilter(null);
    }
    if (tab !== 'user-management') {
      setPreselectedInvestor(undefined);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('cached_system_data');
    localStorage.removeItem('unsynced_actual_progress');
    localStorage.removeItem('unsynced_offline_actions');
    setUnsyncedProgress({});
    setUnsyncedActionsCount(0);

    // Clear individual localstorages for actual details
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('actual_progress_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }

    setCurrentUser(null);
    setActiveTab('dashboard-app');
    setShowProfileModal(false);
  };

  // apiFetch phát sự kiện này khi server báo token hết hạn/không hợp lệ → đăng xuất và báo lý do ở màn hình đăng nhập
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const handleLogoutRef = React.useRef(handleLogout);
  handleLogoutRef.current = handleLogout;
  React.useEffect(() => {
    const onAuthExpired = (e: Event) => {
      const msg = (e as CustomEvent).detail?.message || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
      setAuthNotice(msg);
      handleLogoutRef.current();
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

  const handleLogin = (user: UserAccount) => {
    setAuthNotice(null);
    // Clear any guest session modifications to protect PostgreSQL from mock push
    localStorage.removeItem('cached_system_data');
    localStorage.removeItem('unsynced_actual_progress');
    localStorage.removeItem('unsynced_offline_actions');
    setUnsyncedProgress({});
    setUnsyncedActionsCount(0);

    // Clear individual localstorages so dynamic retrieval comes strictly from PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('actual_progress_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }

    setCurrentUser(user);
    if (user.mustChangePassword) {
      setShowProfileModal(true);
    }
    const isInvestor = user.userType === 'investor' || user.roleId === 'Chủ đầu tư' || user.roleId === 'CĐT';
    if (isInvestor) {
      setActiveTab('projects');
    } else {
      setActiveTab('dashboard-app');
    }
    loadSystemData();
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} users={users} notice={authNotice} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      <div className={`fixed inset-0 bg-slate-900/50 z-40 lg:hidden transition-opacity ${activeTab === 'sidebar-open' ? 'opacity-100 visible' : 'opacity-0 invisible'}`} onClick={() => setActiveTab('dashboard')} />
      
      <div className={`fixed lg:static inset-y-0 left-0 z-50 transform lg:transform-none transition-transform duration-300 ${activeTab === 'sidebar-open' ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar 
          activeTab={activeTab === 'sidebar-open' ? 'dashboard' : activeTab} 
          onNavigate={handleNavigate} 
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </div>
      
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab('sidebar-open')}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="relative group hidden sm:block">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Tìm kiếm nhanh..." 
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNavigateToProjects({ searchTerm: globalSearch });
                  }
                }}
                className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Offline Sync Status Badge */}
            {currentUser?.roleId === 'Admin' && (() => {
              const pendingCount = Object.keys(unsyncedProgress).length + unsyncedActionsCount;
              if (pendingCount > 0) {
                return (
                  <button 
                    onClick={() => {
                      setShowSyncDiagnostics(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse hover:bg-amber-100 cursor-pointer active:scale-95 transition-all"
                    title={`Có ${pendingCount} tiến độ thay đổi chưa đồng bộ. Click để xem chi tiết & đồng bộ ngay!`}
                  >
                    <WifiOff size={12} className="text-amber-600 animate-bounce" />
                    <span>Lưu tạm máy ({pendingCount})</span>
                  </button>
                );
              } else if (isSyncing) {
                return (
                  <div 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                    title="Đang đồng bộ dữ liệu lên cơ sở dữ liệu cloud..."
                  >
                    <RefreshCw size={12} className="text-blue-500 animate-spin" />
                    <span>Đang đồng bộ...</span>
                  </div>
                );
              } else {
                return (
                  <div 
                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50/70 text-emerald-700 border border-emerald-100"
                    title="Mọi tiến độ thực tế đã được đồng bộ an toàn lên Cloud Database."
                  >
                    <Wifi size={12} className="text-emerald-500" />
                    <span>Đã đồng bộ</span>
                  </div>
                );
              }
            })()}

            {currentUser?.roleId === 'Admin' && dbStatus && (
              <>
                <button 
                  onClick={() => setShowDbDiagnostics(true)}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    dbStatus.connected 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer" 
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 cursor-pointer animate-pulse"
                  }`} 
                  title={dbStatus.connected ? "Thành công kết nối PostgreSQL! Click để xem chi tiết." : `${dbStatus.errorMessage}. Click để chẩn đoán & sửa lỗi!`}
                >
                  {isReconnectingDb ? (
                    <RefreshCw size={12} className="animate-spin text-amber-500" />
                  ) : (
                    <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  )}
                  <span>
                    {isReconnectingDb 
                      ? "Đang thử kết nối..." 
                      : dbStatus.connected 
                        ? "Đã kết nối PostgreSQL" 
                        : "Lỗi kết nối DB (Click để xem)"}
                  </span>
                  {!dbStatus.connected && !isReconnectingDb && (
                    <RefreshCw size={11} className="ml-0.5 text-amber-500 animate-pulse" />
                  )}
                </button>

                {showDbDiagnostics && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Database size={18} className="text-blue-600 animate-pulse" />
                          <h3 className="font-bold text-slate-800 text-sm">Chẩn đoán kết nối Cơ sở dữ liệu</h3>
                        </div>
                        <button 
                          onClick={() => setShowDbDiagnostics(false)}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-4 text-xs text-left">
                        {/* Connection status big badge */}
                        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                          dbStatus.connected 
                            ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" 
                            : "bg-red-50/50 border-red-200 text-red-800"
                        }`}>
                          {dbStatus.connected ? (
                            <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                          ) : (
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                          )}
                          <div className="space-y-1">
                            <p className="font-bold text-sm">
                              {dbStatus.connected ? "Đã kết nối PostgreSQL thành công!" : "Chưa kết nối được với PostgreSQL"}
                            </p>
                            <p className="text-[11px] opacity-95 leading-relaxed">
                              {dbStatus.connected 
                                ? "Chúc mừng! Hệ thống đang hoạt động và đồng bộ trực tiếp với Cơ sở dữ liệu Supabase của bạn." 
                                : "Hệ thống hiện đang chạy bằng chế độ dự phòng. Các thay đổi tiến độ thực tế sẽ được tự động lưu trữ cục bộ (Offline Fallback) và tự động đồng bộ ngay khi kết nối PostgreSQL/mạng ổn định trở lại."}
                            </p>
                          </div>
                        </div>

                        {/* Diagnostic Key Info */}
                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-700">Giá trị cấu hình hiện tại:</p>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 font-mono">
                            <div>
                              <span className="text-slate-400 block text-[9.5px] uppercase font-bold tracking-wider mb-0.5">Biến môi trường DATABASE_URL gốc:</span>
                              <span className="text-slate-700 break-all bg-white px-2 py-1.5 rounded border border-slate-100 block text-[10.5px]">
                                {dbStatus.rawUrlMasked || "Chưa thiết lập (undefined)"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9.5px] uppercase font-bold tracking-wider mb-0.5">URL sau khi hệ thống xử lý (Sanitized):</span>
                              <span className="text-slate-800 break-all bg-white px-2 py-1.5 rounded border border-slate-100 block font-semibold text-[10.5px]">
                                {dbStatus.sanitizedUrlMasked || "Không có (undefined)"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Detailed error if not connected */}
                        {!dbStatus.connected && dbStatus.errorMessage && (
                          <div className="space-y-1.5">
                            <p className="font-bold text-red-500">Thông báo lỗi chi tiết:</p>
                            <div className="bg-slate-50 border border-red-100 text-red-600 font-mono p-3 rounded-xl break-all whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed text-[10.5px]">
                              {dbStatus.errorMessage}
                            </div>
                          </div>
                        )}

                        {/* Solutions Guide */}
                        {!dbStatus.connected && (
                          <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-600 bg-amber-50/40 border border-amber-150 p-4 rounded-xl">
                            <p className="font-bold text-amber-850 flex items-center gap-1.5">
                              <Info size={14} className="text-amber-600" />
                              Cách khắc phục lỗi kết nối Supabase:
                            </p>
                            <ul className="list-disc pl-4 space-y-1.5 text-slate-700">
                              <li>
                                Kiểm tra xem bạn đã thêm biến tên là <code className="bg-amber-100/50 px-1 rounded font-mono font-semibold text-amber-800">DATABASE_URL</code> trong mục <strong>Settings (Biểu tượng răng cưa góc trái màn hình) → Secrets</strong> chưa.
                              </li>
                              <li>
                                <strong>QUAN TRỌNG:</strong> Khi dán vào Secrets, hãy dán nguyên vẹn liên kết (bắt đầu bằng <code className="bg-amber-100/50 px-1 rounded font-mono text-amber-800">postgresql://...</code>), <strong>KHÔNG</strong> dán kèm chữ <code className="bg-amber-100/50 px-1 rounded font-mono text-amber-800">DATABASE_URL=</code> hay dấu ngoặc kép <code className="bg-amber-100/50 px-1 rounded font-mono text-amber-800">"</code> vào ô giá trị (Value).
                              </li>
                              <li>
                                Với <strong>Supabase Pooler</strong> (cổng 6543 của bạn), hãy kiểm tra mật khẩu. Bạn có thể nhấn nút <strong>Reset database password</strong> trong Supabase Dashboard để đặt lại mật khẩu của mình, đặt mật khẩu không chứa ký tự quá đặc biệt và cập nhật lại Secrets.
                              </li>
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">Lớp chẩn đoán tự động hoạt động</span>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => setShowDbDiagnostics(false)}
                            className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 font-medium transition-colors cursor-pointer text-xs"
                          >
                            Đóng
                          </button>
                          <button 
                            type="button"
                            disabled={isReconnectingDb}
                            onClick={async () => {
                              await fetchDbStatus(true);
                            }}
                            className="px-3.5 py-1.5 bg-blue-650 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors cursor-pointer text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isReconnectingDb ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            <span>Kiểm tra lại kết nối</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {showSyncDiagnostics && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2">
                          <WifiOff size={18} className="text-amber-600 animate-bounce" />
                          <h3 className="font-bold text-slate-800 text-sm">Chẩn đoán đồng bộ dữ liệu Lưu tạm máy</h3>
                        </div>
                        <button 
                          onClick={() => setShowSyncDiagnostics(false)}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      
                      <div className="p-6 space-y-4 text-xs text-left">
                        {/* Status big badge */}
                        {(() => {
                          const pendingProgressCount = Object.keys(unsyncedProgress).length;
                          const pendingActionsCount = unsyncedActionsCount;
                          const totalPendingCount = pendingProgressCount + pendingActionsCount;
                          return (
                            <>
                              <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                                totalPendingCount > 0 
                                  ? "bg-amber-50/50 border-amber-200 text-amber-800" 
                                  : "bg-emerald-50/50 border-emerald-200 text-emerald-800"
                              }`}>
                                {totalPendingCount === 0 ? (
                                  <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                ) : (
                                  <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                                )}
                                <div className="space-y-1">
                                  <p className="font-bold text-sm">
                                    {totalPendingCount > 0 
                                      ? `Hiện tại có ${totalPendingCount} thay đổi chưa được đồng bộ` 
                                      : "Đồng bộ hoàn tất!"}
                                  </p>
                                  <p className="text-[11px] opacity-95 leading-relaxed">
                                    {totalPendingCount > 0 
                                      ? "Các hành động hoặc tiến độ thay đổi này đang được lưu trữ tạm thời trong trình duyệt của bạn (LocalStorage) để đảm bảo không mất dữ liệu." 
                                      : "Tất cả dữ liệu thay đổi tiến độ và lệnh sửa đổi đã được cập nhật thành công lên server lưu trữ đám mây Cloud PostgreSQL."}
                                  </p>
                                </div>
                              </div>

                              {/* Queue list details */}
                              {totalPendingCount > 0 && (
                                <div className="space-y-1.5">
                                  <p className="font-bold text-slate-700">Chi tiết hàng chờ đồng bộ:</p>
                                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                    {pendingProgressCount > 0 && (
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-600 font-medium">✏️ Tiến độ thực thực tế cần cập nhật:</span>
                                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">{pendingProgressCount} dự án</span>
                                      </div>
                                    )}
                                    {pendingActionsCount > 0 && (
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-600 font-medium">📋 Lệnh sửa đổi/tác vụ ngoại tuyến:</span>
                                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">{pendingActionsCount} tác vụ</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Diagnostics connection configuration info */}
                              <div className="space-y-1.5">
                                <p className="font-bold text-slate-700">Thông tin trạng thái phiên:</p>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 font-mono">
                                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Thời gian thực hiện đồng bộ gần nhất:</span>
                                      <span className="text-slate-700 bg-white px-2 py-1.5 rounded border border-slate-100 block text-[10px] font-semibold text-center">
                                        {lastSyncAttempt || "Chưa có lượt đồng bộ nào"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider mb-0.5">Khóa bảo mật (Auth Token):</span>
                                      <span className={`px-2 py-1.5 rounded block text-[10px] break-all font-semibold ${
                                        localStorage.getItem('auth_token') 
                                          ? "bg-emerald-50 text-emerald-850 border-emerald-200 border text-center" 
                                          : "bg-red-50 text-red-800 border-red-200 border text-center animate-pulse"
                                      }`}>
                                        {localStorage.getItem('auth_token') ? "Đang thiết lập (OK)" : "Không tồn tại (Vui lòng đăng nhập)"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Detailed connection checks and diagnostics */}
                              <div className="space-y-2">
                                <p className="font-bold text-slate-700">Kết quả chẩn đoán tự động:</p>
                                <div className="space-y-2">
                                  {/* 1. Browser Network State */}
                                  {typeof window !== 'undefined' && !navigator.onLine ? (
                                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-start gap-2.5">
                                      <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Trình duyệt Ngoại tuyến (No Internet)</p>
                                        <p className="text-[10px] text-red-700/90 leading-relaxed">Không có tín hiệu mạng Internet. Trình duyệt đang chạy ở chế độ offline. Vui lòng kết nối Wifi hoặc dây cáp.</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-emerald-50/55 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-2.5">
                                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Mạng Internet: Hoạt động bình thường</p>
                                        <p className="text-[10px] text-emerald-700/90 leading-relaxed">Tín hiệu mạng từ trình duyệt của bạn đến mạng toàn cầu (Internet) đã sẵn sàng.</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* 2. Database connection state on backend */}
                                  {dbStatus && !dbStatus.connected ? (
                                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2.5 animate-pulse">
                                      <Database size={15} className="text-rose-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Mất kết nối Cơ sở dữ liệu (PostgreSQL Disconnected)</p>
                                        <p className="text-[10px] text-rose-700/90 leading-relaxed">Server trung gian hoạt động tốt nhưng không thể ghi dữ liệu xuống database PostgreSQL. Do đó hệ thống chặn hoàn đồng bộ trực tiếp để tránh mất dữ liệu của bạn.</p>
                                        {dbStatus.errorMessage && (
                                          <div className="bg-red-100/65 p-1.5 rounded font-mono text-[9px] text-red-900 break-all max-h-16 overflow-y-auto mt-1 leading-normal">
                                            Lỗi chi tiết: {dbStatus.errorMessage}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-emerald-50/55 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-2.5">
                                      <Database size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Cơ sở dữ liệu PostgreSQL: Hoạt động tốt</p>
                                        <p className="text-[10px] text-emerald-700/90 leading-relaxed">Cổng lưu trữ đám mây Supabase đã kết nối và kiểm tra ổn định.</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* 3. Authentication Security Status */}
                                  {typeof window !== 'undefined' && !localStorage.getItem('auth_token') ? (
                                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-start gap-2.5">
                                      <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Hết hạn phiên đăng nhập (Token Missing/Expired)</p>
                                        <p className="text-[10px] text-amber-700/90 leading-relaxed">Không tìm thấy khoá bảo mật của tài khoản. Bạn phải đăng nhập thì hệ thống mới xác định quyền lưu dữ liệu của bạn.</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-emerald-50/55 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-2.5">
                                      <Wifi size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-[11px]">Quyền bảo mật: Được xác thực thành công</p>
                                        <p className="text-[10px] text-emerald-700/90 leading-relaxed">Khoá thông hành bảo mật tài khoản cá nhân đang hợp lệ ({currentUser?.fullName || "Người dùng"}).</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Rejected actions list */}
                              {rejectedActions.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <p className="font-bold text-rose-600 flex items-center gap-1">
                                      <AlertTriangle size={14} className="text-rose-500" />
                                      Tác vụ bị máy chủ từ chối ({rejectedActions.length}):
                                    </p>
                                    <button 
                                      onClick={() => {
                                        setRejectedActions([]);
                                        localStorage.removeItem('rejected_offline_actions');
                                      }}
                                      className="text-[10px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                                    >
                                      Xóa danh sách
                                    </button>
                                  </div>
                                  <div className="bg-rose-50/70 border border-rose-200 text-rose-800 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 text-[11px]">
                                    {rejectedActions.map((rej, idx) => (
                                      <div key={idx} className="pb-1.5 border-b border-rose-100 last:border-none last:pb-0">
                                        <div className="flex items-center justify-between font-bold text-[10px]">
                                          <span>{rej.type}</span>
                                          <span className="text-rose-500">{rej.time} (Mã: {rej.status})</span>
                                        </div>
                                        <div className="text-[10px] text-rose-700 mt-0.5">{rej.error}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Detailed error if existing */}
                              {syncError && (
                                <div className="space-y-1.5">
                                  <p className="font-bold text-rose-600 flex items-center gap-1">
                                    <AlertTriangle size={14} className="text-rose-500" />
                                    Báo cáo phản hồi từ lượt đồng bộ cũ:
                                  </p>
                                  <div className="bg-red-50 border border-red-105 text-red-700 font-mono p-3 rounded-xl break-all whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed text-[10px] font-semibold">
                                    {syncError}
                                  </div>
                                </div>
                              )}

                              {/* Solutions Guide */}
                              <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-600 bg-blue-50/40 border border-blue-150 p-4 rounded-xl">
                                <p className="font-bold text-blue-900 flex items-center gap-1.5">
                                  <Info size={14} className="text-blue-600" />
                                  Giải pháp xử lý nhanh khi gặp sự cố đồng bộ:
                                </p>
                                <ul className="list-disc pl-4 space-y-1.5 text-slate-700">
                                  {typeof window !== 'undefined' && !localStorage.getItem('auth_token') && (
                                    <li>
                                      <strong>Khắc phục Quyền bảo mật:</strong> Nhấp nút <strong>Đăng xuất</strong> ở góc trái màn hình, sau đó tiến hành <strong>Đăng nhập lại</strong>. Trình duyệt của bạn sẽ <strong>GIỮ NGUYÊN</strong> {totalPendingCount} thay đổi lưu tạm và tự động đẩy chúng lên ngay khi bạn đăng nhập thành công!
                                    </li>
                                  )}
                                  {dbStatus && !dbStatus.connected && (
                                    <li>
                                      <strong>Khắc phục Cơ sở dữ liệu:</strong> Kiểm tra lại biến <code className="bg-amber-100 text-amber-900 px-1 rounded font-mono font-bold text-[9px]">DATABASE_URL</code> trong mục cài đặt Secrets (Biểu tượng Bánh răng → Secrets) để xem đã cấu hình chính xác chưa.
                                    </li>
                                  )}
                                  <li>
                                    <strong>Đảm bảo chế độ offline an toàn:</strong> Khi máy tính mất mạng hoặc cơ sở dữ liệu lỗi, bạn hoàn toàn có thể yên tâm làm việc, tạo mới, chỉnh sửa thông tin hoặc cập nhật tiến độ. Hệ thống lưu tạm máy sẽ liên tục bảo vệ bản ghi của bạn và đồng bộ trả lại khi nút <strong>Lưu tạm máy</strong> chuyển lại thành <strong>Đã đồng bộ</strong>!
                                  </li>
                                </ul>
                              </div>

                              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between -mx-6 -mb-6 mt-4">
                                <span className="text-[10px] text-slate-400 font-medium font-mono">OFFLINE_SYNC_LAYER_DIAGNOSTICS</span>
                                <div className="flex gap-2">
                                  <button 
                                    type="button"
                                    onClick={() => setShowSyncDiagnostics(false)}
                                    className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 font-medium transition-colors cursor-pointer text-xs"
                                  >
                                    Đóng
                                  </button>
                                  {totalPendingCount > 0 && (
                                    <button 
                                      type="button"
                                      disabled={isSyncing}
                                      onClick={async () => {
                                        await syncUnsyncedData();
                                      }}
                                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors cursor-pointer text-xs flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      {isSyncing ? (
                                        <RefreshCw size={12} className="animate-spin" />
                                      ) : (
                                        <RefreshCw size={12} />
                                      )}
                                      <span>Thử đồng bộ ngay</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* The notification bell was removed: there is no notification feature behind it */}
            <button 
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-3 hover:bg-slate-50 p-1.5 rounded-xl transition-all text-left cursor-pointer group"
              title="Thông tin cá nhân & Đổi mật khẩu"
            >
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{currentUser.fullName}</p>
                <p className="text-[10px] text-slate-400 font-medium">{currentUser.roleId}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 group-hover:bg-blue-50 group-hover:border-blue-200 group-hover:text-blue-600 transition-all">
                <User size={20} />
              </div>
            </button>
            <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-colors group relative"
              title="Đăng xuất"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto ${(activeTab === 'dashboard-app' || activeTab === 'agency-project-stats') ? 'p-0' : 'p-4 sm:p-8'}`}>
          {activeTab === 'dashboard' && (
            <DashboardView 
              projects={visibleProjects}
              onCreateClick={() => setShowCreateModal(true)} 
              onNavigateToProjects={handleNavigateToProjects}
              onProjectClick={(project: any) => {
                setSelectedGanttProject(project);
                setActiveTab('gantt-project-detail');
                setGanttBackTab('dashboard');
              }}
              processingAgencies={processingAgencies}
              projectStages={projectStageNames}
              processes={processes}
              currentUser={currentUser}
              actualProgress={actualProgress}
              onSeeProjects={(title: string, projects: any[]) => {
                setTphcmListTitle(title);
                setTphcmListProjects(projects);
                setActiveTab('dashboard-tphcm-list');
              }}
            />
          )}
          {activeTab === 'dashboard-app' && (
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
              milestoneProgress={milestoneProgress}
              projectStagesRaw={sortedProjectStages}
              onSubmitMilestone={submitMilestoneProgress}
              onOpenProfile={() => setShowProfileModal(true)}
            />
          )}
          {activeTab === 'dashboard-tphcm-list' && (
            <TPHCMProjectList 
              title={tphcmListTitle}
              projects={tphcmListProjects}
              onBack={() => setActiveTab('dashboard')}
              onProjectClick={(project: any) => {
                setSelectedGanttProject(project);
                setActiveTab('gantt-project-detail');
                setGanttBackTab('dashboard-tphcm-list');
              }}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectList 
              key={refreshKey} 
              projects={visibleProjects}
              actualProgress={actualProgress}
              filter={projectFilter}
              onProjectClick={(project: any) => {
                setSelectedGanttProject(project);
                setActiveTab('gantt-project-detail');
                setGanttBackTab('projects');
              }} 
              onEditClick={handleEditProject}
              onDeleteClick={handleDeleteProject}
              onUpdateProgressClick={setProjectToUpdate}
              onUpdatePlanClick={setProjectToUpdatePlan}
              onHousingUpdateClick={handleNavigateToHousingUpdate}
              canEditProject={canEditProjectInScope}
              onCreateClick={() => setShowCreateModal(true)}
              projectStages={projectStageNames}
              processingAgencies={processingAgencies}
              locations={locations}
              investors={investors}
              processes={processes}
              projectGroups={projectGroups}
              fundingSources={fundingSources}
              followers={followers}
              projectCategories={projectCategories}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'gantt-dashboard-noxh' && (
            <GanttDashboardNOXH 
              projects={visibleProjects}
              reportDate={reportDate} 
              projectStatuses={projectStatuses}
              projectStages={projectStageNames}
              projectStagesRaw={sortedProjectStages}
              processes={processes}
              actualProgress={actualProgress}
              milestoneProgress={milestoneProgress}
              onResetActualProgress={handleResetActualProgressByDB}
              currentUser={currentUser}
              onProjectClick={(project) => {
                setSelectedGanttProject(project);
                setActiveTab('gantt-project-detail');
                setGanttBackTab('gantt-dashboard-noxh');
              }}
            />
          )}
          {activeTab === 'gantt-project-detail' && (
            <ProjectGanttDetail
              project={selectedGanttProject}
              onBack={() => setActiveTab(ganttBackTab)}
              currentUser={currentUser}
              milestones={milestoneProgress[selectedGanttProject?.id] || {}}
              projectStages={sortedProjectStages}
              processes={processes}
              processingAgencies={processingAgencies}
              onSubmitMilestone={submitMilestoneProgress}
            />
          )}
          {activeTab === 'process-gantt' && <ProcessGanttView projects={visibleProjects} actualProgress={actualProgress} />}
          {activeTab === 'annual-update' && (
            <AnnualProgressUpdate 
              projects={visibleProjects} 
              reportDate={reportDate} 
              setReportDate={setReportDate} 
              onUpdateProject={handleUpdateSuccess} 
              processes={processes}
              projectStages={sortedProjectStages}
              milestoneProgress={milestoneProgress}
            />
          )}
          {activeTab === 'housing-update' && (
            <HousingUpdateView 
              project={housingUpdateProject}
              readOnly={!canEditProjectInScope(housingUpdateProject)} 
              currentUser={currentUser}
              onBack={() => {
                setActiveTab('projects');
                setInitialStepId(undefined);
                setInitialSubStepId(undefined);
              }}
              onSuccess={handleUpdateSuccess}
              onSubmitStep={submitStepProgressForView}
              processingAgencies={processingAgencies}
              stepStatuses={stepStatuses}
              processes={processes}
              initialStepId={initialStepId}
              initialSubStepId={initialSubStepId}
            />
          )}
          {activeTab === 'investor-agency-management' && (
            <InvestorAgencyTabsManagement 
              investors={investors} 
              setInvestors={handleUpdateInvestors} 
              onAddUser={(investor) => {
                setPreselectedInvestor(investor);
                setActiveTab('user-management');
              }}
              agencies={processingAgencies}
              setAgencies={handleUpdateProcessingAgencies}
            />
          )}
          {activeTab === 'category-tabs-management' && (
            <CategoryTabsManagement 
              projectGroups={projectGroups}
              setProjectGroups={handleUpdateProjectGroups}
              projectCategories={projectCategories}
              setProjectCategories={handleUpdateProjectCategories}
              buildingGrades={buildingGrades}
              setBuildingGrades={handleUpdateBuildingGrades}
              fundingSources={fundingSources}
              setFundingSources={handleUpdateFundingSources}
            />
          )}
          {activeTab === 'status-tabs-management' && (
            <StatusTabsManagement
              projectStatuses={projectStatuses}
              setProjectStatuses={handleUpdateProjectStatuses}
              stepStatuses={stepStatuses}
              setStepStatuses={handleUpdateStepStatuses}
            />
          )}
          {activeTab === 'project-stage-management' && <ProjectStageManagement projectStages={projectStages} setProjectStages={handleUpdateProjectStages} />}
          {activeTab === 'step-management' && <StepManagementView processingAgencies={processingAgencies} processes={processes} setProcesses={handleUpdateProcesses} projectStages={sortedProjectStages} />}
          {activeTab === 'user-management' && (
            <UserManagement 
              users={users} 
              onUpdateUsers={handleUpdateUsers} 
              roles={roles} 
              onUpdateRoles={handleUpdateRoles}
              agencies={processingAgencies}
              investors={investors}
              preselectedInvestor={preselectedInvestor}
              currentUser={currentUser}
              onClearInvestor={() => {
                setPreselectedInvestor(undefined);
                if (preselectedInvestor) {
                  setActiveTab('investor-agency-management');
                }
              }}
            />
          )}
          
          {!['dashboard', 'dashboard-app', 'dashboard-tphcm-list', 'projects', 'gantt-dashboard-noxh', 'gantt-project-detail', 'process-gantt', 'annual-update', 'investor-agency-management', 'category-tabs-management', 'status-tabs-management', 'project-stage-management', 'housing-update', 'step-management', 'user-management', 'sidebar-open'].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <Settings size={32} />
              </div>
              <p className="font-medium italic">Tính năng "{activeTab}" đang được phát triển...</p>
            </div>
          )}
        </main>

        {showCreateModal && (
          <CreateProject 
            project={projectToEdit}
            investors={investors}
            locations={locations}
            projectGroups={projectGroups}
            projectCategories={projectCategories}
            buildingGrades={buildingGrades}
            fundingSources={fundingSources}
            projectStages={sortedProjectStages}
            processingAgencies={processingAgencies}
            processes={processes}
            followers={followers}
            projectStatuses={projectStatuses}
            lockGeneralInfo={!!projectToEdit && !isSXDOrAdminUser(currentUser)}
            onClose={() => {
              setShowCreateModal(false);
              setProjectToEdit(null);
            }} 
            onSuccess={handleCreateSuccess} 
          />
        )}

        {selectedProject && (
          <ProjectDetail 
            project={selectedProject} 
            processes={processes}
            onClose={() => setSelectedProject(null)} 
          />
        )}

        {projectToUpdate && (
          <UpdateProgress
            project={projectToUpdate}
            onClose={() => setProjectToUpdate(null)}
            onSuccess={handleUpdateSuccess}
          />
        )}

        {projectToUpdatePlan && (
          <UpdatePlanModal
            project={projectToUpdatePlan}
            processes={processes}
            onClose={() => setProjectToUpdatePlan(null)}
            onSuccess={handleUpdateSuccess}
            projectStages={sortedProjectStages}
          />
        )}

        {showProfileModal && (
          <ProfileModal 
            currentUser={currentUser}
            users={users}
            agencies={processingAgencies}
            onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
            onUpdateAllUsers={handleUpdateUsers}
            onClose={() => { if (!currentUser?.mustChangePassword) setShowProfileModal(false); }}
            onLogout={handleLogout}
          />
        )}

        {/* App-level Toast Notification */}
        {appToast && (
          <div className="fixed bottom-6 right-6 z-[9999] max-w-md animate-in fade-in slide-in-from-bottom-5 duration-200">
            <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 backdrop-blur-md ${
              appToast.type === 'success' 
                ? 'bg-emerald-900/95 text-emerald-100 border-emerald-700/80 shadow-emerald-950/20'
                : appToast.type === 'error'
                ? 'bg-rose-900/95 text-rose-100 border-rose-700/80 shadow-rose-950/20'
                : appToast.type === 'warning'
                ? 'bg-amber-900/95 text-amber-100 border-amber-700/80 shadow-amber-950/20'
                : 'bg-slate-900/95 text-slate-100 border-slate-700/80 shadow-slate-950/20'
            }`}>
              {appToast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
              {appToast.type === 'error' && <AlertTriangle size={18} className="text-rose-400 shrink-0" />}
              {appToast.type === 'warning' && <AlertTriangle size={18} className="text-amber-400 shrink-0" />}
              {appToast.type === 'info' && <Info size={18} className="text-blue-400 shrink-0" />}
              <span className="text-xs font-semibold leading-relaxed flex-1">{appToast.message}</span>
              <button 
                onClick={() => setAppToast(null)} 
                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Delete Project In-App Confirmation Modal */}
        {projectToDelete && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Trash2 size={24} />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Xóa dự án</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bạn có chắc chắn muốn xóa vĩnh viễn dự án <strong className="text-slate-900">"{projectToDelete.name}"</strong>? Thao tác này không thể hoàn tác.
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-700 font-medium transition-colors cursor-pointer text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteProject}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  <span>Xóa vĩnh viễn</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
