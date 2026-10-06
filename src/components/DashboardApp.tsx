import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, ChevronRight, ChevronLeft, 
  AlertCircle, Clock, FileText, LayoutDashboard, 
  MapPin, User, Users, Search, Menu,
  CheckCircle2, TrendingUp, Filter, Circle,
  FileCheck, ClipboardList, Layers, Calendar, X,
  ArrowLeft, Maximize2, Save, Pin, Check, History,
  Upload, Paperclip, Loader2, Download
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LabelList,
  PieChart,
  Pie,
  Label
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { PROJECT_REGIONS } from '../constants';
import { formatDate, toDisplayDate, toDisplayDateTime, normalizeDatesInText, parseDate, formatLocalDate, getStepAgency, getAgencyWithDepartment } from '../lib/projectUtils';
// Empty plan cell = not planned yet (NOT done); same rule as server via phaseLogic
import { isPlanDatePassed } from '../lib/phaseLogic';
import { MilestoneProgress, activeMilestoneIndex, catalogMilestones, isoToDisplay, legacyPhaseOf, milestoneSideStatus } from '../lib/stepProgress';
import MilestoneGanttBoard from './MilestoneGanttBoard';
import { normalizeAgencyName, resolveProjectStepAgency } from '../lib/stepAgency';
import { matchesSearch as textMatches, normalizeSearchText } from '../lib/textSearch';
import DatePicker, { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";

registerLocale('vi', vi);

const getPlanDateValue = (planStr: string | undefined | null): string => {
  const date = parseDate(planStr);
  if (!date || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateToDdMmYyyy = (dateStr: string): string => toDisplayDate(dateStr);
import { apiFetch, uploadProjectFile, describeUploadFailures, downloadAttachment, isStoredAttachmentId } from '../utils/apiFetch';
import { useUploadConfig, checkUploadFiles, uploadExtensionsLabel, uploadAcceptAttr } from '../lib/uploadRules';

// --- Types ---
interface Agency {
  id: string;
  name: string;
  count: number;
  subtext: string;
  color: string;
  iconColor: string;
}

interface Department {
  id: string;
  name: string;
  projectCount: number;
  delayedCount: number;
}

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  location: string;
  progress: number;
  status: string;
  currentStep: string;
  parentStep?: string;
  childStep?: string;
  stepDeadline?: string;
  currentAgency: string;
  currentDepartment?: string;
  deadline: string;
  stage: string;
  delayDays?: number;
  processId?: string;
  milestones?: Record<string, { investor: string; agency: string }>;
  implementationPlan?: Record<string, { agencyActualDate: string }>;
  isPublicInvestment?: boolean;
  totalArea?: number;
  apartmentCount?: number;
  height?: number;
  startDate?: string;
  endDate?: string;
  chutruong_cdt_date?: string;
  chutruong_nn_date?: string;
  qh1500_cdt_date?: string;
  qh1500_nn_date?: string;
  qdgiaodat_cdt_date?: string;
  qdgiaodat_nn_date?: string;
  pccc_cdt_date?: string;
  pccc_nn_date?: string;
  htkt_dtm_cdt_date?: string;
  htkt_dtm_nn_date?: string;
  baocaonckt_cdt_date?: string;
  baocaonckt_nn_date?: string;
  gpxaydung_cdt_date?: string;
  gpxaydung_nn_date?: string;
  progress_status_2026?: string;
  isKeyProject?: boolean;
  fundingSource?: string;
  projectGroup?: string;
  projectCategory?: string;
}

// --- Mock Data ---
import { Agency as AgencyType } from './AgencyManagement';

import { UserAccount } from '../types';

interface DashboardAppProps {
  projects?: Project[];
  processingAgencies?: AgencyType[];
  // Processes configured in the database (Cấu hình quy trình)
  processes?: any[];
  investors?: any[];
  projectStages?: any[];
  locations?: any[];
  currentUser?: UserAccount | null;
  initialView?: 'overview' | 'agencies' | 'departments' | 'projects' | 'detail' | 'search-results' | 'steps' | 'child-steps';
  actualProgress?: Record<string, any>;
  onUpdateActualProgress?: (projectId: string, updatedMap: any) => void;
  // Milestone view per project (server, src/lib/stepProgress), the stage catalog with its milestones,
  // and the quick progress entry of the project detail Gantt
  milestoneProgress?: Record<string, Record<string, MilestoneProgress>>;
  projectStagesRaw?: any[];
  onSubmitMilestone?: (projectId: string, changes: any[]) => Promise<boolean>;
  // Opens the profile dialog ("Cá nhân" tab of the bottom bar)
  onOpenProfile?: () => void;
}

// Overview "Tổng quan theo CQNN": the three main agencies, everything else grouped
const OTHER_AGENCIES = 'Cơ quan khác';
const overviewAgencyGroup = (pAgency: string): string => {
  if (pAgency.includes('Quy hoạch') || pAgency.includes('Kiến trúc')) return 'Sở Quy hoạch Kiến trúc';
  if (/(^|\s)(xã|phường)/i.test(pAgency) && !pAgency.includes('UBND TP')) return 'UBND cấp xã, phường';
  if (pAgency.includes('Xây dựng') || pAgency === '' || pAgency === 'Chưa xác định' || pAgency.includes('Công an')) return 'Sở Xây dựng';
  return OTHER_AGENCIES;
};

// The screens below (Overview, StepsStats, ProjectDetail…) are declared inside DashboardApp and
// read its state through closures. Used directly as <Overview />, React sees a NEW component type on
// every render and remounts it: inputs lose focus after each keystroke, and ProjectDetail's modal and
// unsaved fields are reset whenever App re-renders (e.g. the 15-second sync). StableView has a fixed
// identity, so the subtree is updated in place; render() is called on each render (fresh closures) and
// any hooks it uses belong to this StableView instance, always in the same order.
function StableView({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}

export default function DashboardApp(props: DashboardAppProps) {
  const initialProjects = props.projects || [];
  const processingAgencies = props.processingAgencies || [];
  const processes = props.processes || [];
  const investors = props.investors || [];
  const projectStages = props.projectStages || [];
  const locations = props.locations || [];
  const currentUser = props.currentUser || null;
  const initialView = props.initialView || 'overview';
  const dbActualProgress = props.actualProgress;
  const onUpdateActualProgressProp = props.onUpdateActualProgress;
  const onOpenProfile = props.onOpenProfile;

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite linear;
          background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
          background-size: 200% 100%;
        }
      `}</style>
      <DashboardContent 
        initialProjects={initialProjects}
        processingAgencies={processingAgencies}
        processes={processes}
        investors={investors}
        projectStages={projectStages}
        locations={locations}
        currentUser={currentUser}
        initialView={initialView}
        actualProgress={dbActualProgress}
        onUpdateActualProgress={onUpdateActualProgressProp}
        milestoneProgress={props.milestoneProgress || {}}
        projectStagesRaw={props.projectStagesRaw || []}
        onSubmitMilestone={props.onSubmitMilestone}
        onOpenProfile={onOpenProfile}
      />
    </>
  );
}

function DashboardContent({ 
  initialProjects = [],
  processingAgencies = [], 
  processes = [],
  investors = [], 
  projectStages = [], 
  locations = [],
  currentUser = null,
  initialView = 'overview',
  actualProgress,
  onUpdateActualProgress,
  milestoneProgress = {},
  projectStagesRaw = [],
  onSubmitMilestone,
  onOpenProfile
}: DashboardAppProps & { initialProjects: Project[] }) {
  const [view, setView] = useState<'overview' | 'agencies' | 'departments' | 'projects' | 'detail' | 'search-results' | 'steps' | 'child-steps'>(initialView);

  // Header names the signed-in account's own organisation; SXD and Admin keep "Sở Xây dựng TP.HCM"
  const dashboardTitle = (() => {
    const u: any = currentUser;
    if (!u || u.roleId === 'Admin' || (u.userType === 'agency' && u.agencyId === '1')) return 'SỞ XÂY DỰNG TP.HCM';
    if (u.userType === 'investor') return u.investorId || 'Chủ đầu tư';
    if (u.agencyId === '6') return u.department ? `UBND ${u.department}` : 'UBND cấp xã, phường';
    return processingAgencies.find((a: any) => a.id === u.agencyId)?.name || 'SỞ XÂY DỰNG TP.HCM';
  })();
  const [selectedAgency, setSelectedAgency] = useState<any | null>(null);
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const [selectedParentStep, setSelectedParentStep] = useState<string | null>(null);
  const [filterParentStep, setFilterParentStep] = useState<string | null>(null);
  const [selectedChildStep, setSelectedChildStep] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [customFilterType, setCustomFilterType] = useState<string | null>(null);
  const [stepSearchTerm, setStepSearchTerm] = useState('');
  const [projects, setProjects] = useState<Project[]>(initialProjects || []);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delayed' | 'ontime'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterAgencyName, setFilterAgencyName] = useState('');
  const [filterInvestor, setFilterInvestor] = useState('');
  const [filterProjectStage, setFilterProjectStage] = useState('');

  const [history, setHistory] = useState<string[]>(['overview']);

  const navigateTo = (newView: typeof view) => {
    setHistory(prev => {
      if (prev[prev.length - 1] === newView) return prev;
      return [...prev, newView];
    });
    setView(newView);
  };

  const goBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // Remove current
      const prevView = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setView(prevView as any);
      
      // Always clear search when going back to non-search views
      if (prevView !== 'search-results') {
        setSearchQuery('');
      }

      // Intelligent reset based on target view (what we are going BACK TO)
      if (prevView === 'overview') {
        setSelectedAgency(null);
        setSelectedDept(null);
        setSelectedParentStep(null);
        setFilterParentStep(null);
        setSelectedChildStep(null);
        setCustomFilterType(null);
        setStatusFilter('all');
        setFilterProjectStage('');
        setFilterAgencyName('');
        setFilterLocation('');
        setFilterInvestor('');
        setSearchQuery('');
        setStepSearchTerm('');
      } else if (prevView === 'steps') {
        setFilterParentStep(null);
        setSelectedChildStep(null);
        setSelectedProject(null);
      } else if (prevView === 'child-steps') {
        setSelectedChildStep(null);
        setSelectedProject(null);
      } else if (prevView === 'projects') {
        setSelectedProject(null);
      } else if (prevView === 'agencies') {
        setSelectedAgency(null);
        setSelectedDept(null);
        setSelectedProject(null);
      } else if (prevView === 'departments') {
        setSelectedDept(null);
        setSelectedProject(null);
        setStatusFilter('all');
      }
    }
  };

  const goToOverview = () => {
    setHistory(['overview']);
    setView('overview');
    setSelectedAgency(null);
    setSelectedDept(null);
    setSelectedParentStep(null);
    setFilterParentStep(null);
    setSelectedChildStep(null);
    setCustomFilterType(null);
    setStatusFilter('all');
    setSearchQuery('');
    setFilterProjectStage('');
    setFilterAgencyName('');
    setFilterLocation('');
    setFilterInvestor('');
    setStepSearchTerm('');
  };

  // Helper to check if a project matches a location filter (District or Ward)
  function isProjectInLocation(projectLocation: string, filterLoc: string) {
    if (!filterLoc) return true;
    if (projectLocation.includes(filterLoc)) return true;
    
    // Check if the ward in projectLocation belongs to the district in filterLoc
    const wardName = projectLocation.split(',')[0].trim();
    const wardInfo = locations.find(l => l.ward === wardName);
    return wardInfo?.oldArea === filterLoc;
  }

  const parseVNDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'X' || dateStr === '--') return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const fullYear = year < 100 ? 2000 + year : year;
    return new Date(fullYear, month, day);
  };

  const today = new Date();

  const getStepDepartment = (project: Project) => {
    if (!project.currentStep) return "";
    const process = processes.find((p: any) => p.id === project.processId) || processes[0];
    if (!process) return "";
    for (const ps of process.parentSteps || []) {
      for (const cs of ps.childSteps || []) {
        if (cs.name === project.currentStep) {
          return cs.department || "";
        }
      }
    }
    return "";
  };

  // Milestones of the catalog (Cấu hình Giai đoạn & Mốc Milestone) and each project's view of them,
  // computed by the server from the step progress (src/lib/stepProgress)
  const allMilestones = useMemo(() => catalogMilestones(projectStagesRaw), [projectStagesRaw]);
  const milestoneListOf = (project: Project): MilestoneProgress[] =>
    allMilestones
      .map(m => milestoneProgress?.[project.id]?.[m.name])
      .filter((m): m is MilestoneProgress => !!m);

  // The KPI cards name two milestones of the catalog: the investment policy approval (chutruong) and the
  // building permit (gpxd). A project already in "THỰC HIỆN ĐẦU TƯ" has passed both.
  const isPhaseCompleted = (project: Project, phaseId: 'chutruong' | 'gpxd') => {
    if (project.stage === 'THỰC HIỆN ĐẦU TƯ') return true;
    const m = milestoneListOf(project).find(x => legacyPhaseOf(x.name)?.id === phaseId);
    return !!m && (!!m.nnActual || m.nnPlan === 'X');
  };

  // Milestone the project is at (the one holding its current step) and whether it is late: same rule as
  // the Gantt (src/lib/stepProgress.milestoneSideStatus)
  const computeProjectActivePhase = (project: Project, _unused?: any) => {
    const list = milestoneListOf(project);
    const activeIdx = activeMilestoneIndex(list, (project as any).currentStepId);
    const active = list[activeIdx];
    // CQNN side only, like "KH của CQNN bị chậm tiến độ" on the Gantt (the investor's lateness shows on its own bar)
    const isDelayed = list.some((m, i) => i <= activeIdx && milestoneSideStatus(m, 'nn', i, activeIdx, today) === 'delayed');
    const planNnStr = active?.nnPlan && active.nnPlan !== 'X' ? isoToDisplay(active.nnPlan) : '';
    const activePhase = { id: active?.name || '', name: active?.name || '', agency: active?.agency || '' };
    return {
      activePhase,
      status: isDelayed ? 'delayed' : 'ontime',
      planNnDate: parseVNDate(planNnStr),
      planNnStr,
      agencyName: active?.agency || 'Chưa xác định'
    };
  };

  // "Quá hạn" with the same rule as the Gantt (milestone view from the server)
  const getProjectStatus = (project: Project) => computeProjectActivePhase(project).status;

  // Who holds the file now. The current step of the configured process (Cấu hình quy trình) decides,
  // like the server's access rules (same account sees and updates the project); a project with no
  // resolvable step (not started, finished, legacy data) falls back to its first unfinished plan phase.
  const getProjectActiveAgency = (project: Project): string => {
    if (!project) return 'Chưa xác định';

    const stepAgency = resolveProjectStepAgency(project, processes);
    if (stepAgency) {
      if (stepAgency === 'Chủ đầu tư') return stepAgency;
      // Catalog name, also for variants such as "Sở Xây dựng (phối hợp)"
      const known = processingAgencies.find(a => normalizeAgencyName(a.name) === stepAgency)
        || processingAgencies.find(a => a.name && stepAgency.startsWith(a.name));
      return known ? known.name : stepAgency;
    }
    
    // Progress comes only from App state (server data + this browser's unsynced edits): no demo/mock data,
    // no per-browser cache, so every user sees the same numbers
    const info = computeProjectActivePhase(project);
    return info.activePhase.agency || project.currentAgency || 'Sở Xây dựng';
  };

  // Stage and procedure (thủ tục) of each project come from its current step (server, src/lib/stepProgress)
  const processedProjects = useMemo(
    () => projects.map(p => ({ ...p, stage: p.stage || 'CHUẨN BỊ ĐẦU TƯ' })),
    [projects]
  );

  // Base filter (without status filter) - used for the main stats cards and charts
  const baseFilteredProjects = useMemo(() => {
    return processedProjects.filter(p => {
      let matches = true;
      if (filterAgencyName) {
        const pAgency = getProjectActiveAgency(p);
        if (filterAgencyName === 'Chủ đầu tư') {
          matches = matches && !!(p.investor && p.investor.trim() !== '' && p.investor !== 'Chưa có chủ đầu tư');
        } else if (filterAgencyName === 'Chưa có chủ đầu tư') {
          matches = matches && p.investor === 'Chưa có chủ đầu tư';
        } else if (filterAgencyName === 'Sở Xây dựng') {
          matches = matches && !!(pAgency.includes('Xây dựng') || pAgency === '' || pAgency === 'Chưa xác định' || pAgency.includes('Công an'));
        } else if (filterAgencyName === 'Sở Quy hoạch Kiến trúc') {
          matches = matches && !!(pAgency.includes('Quy hoạch') || pAgency.includes('Kiến trúc'));
        } else if (filterAgencyName === 'Sở NN & MT' || filterAgencyName === 'Sở NNMT') {
          matches = matches && !!(pAgency.includes('NNMT') || pAgency.includes('Tài nguyên') || pAgency.includes('Môi trường') || pAgency.includes('NN & MT'));
        } else if (filterAgencyName === 'Sở Tài chính') {
          matches = matches && !!pAgency.includes('Tài chính');
        } else if (filterAgencyName === 'UBND cấp xã, phường') {
          matches = matches && !!(pAgency.includes('xã') || pAgency.includes('phường') || pAgency.includes('Phường') || pAgency.includes('Xã') || pAgency === 'UBND cấp xã, phường');
        } else if (filterAgencyName === 'UBND TP') {
          matches = matches && (pAgency === 'UBND TP' || pAgency === 'UBND');
        } else if (filterAgencyName === OTHER_AGENCIES) {
          matches = matches && overviewAgencyGroup(pAgency) === OTHER_AGENCIES;
        } else if (filterAgencyName === 'HĐND TP') {
          matches = matches && pAgency.includes('HĐND');
        } else {
          matches = matches && pAgency === filterAgencyName;
        }
      }
      if (filterLocation) matches = matches && isProjectInLocation(p.location, filterLocation);
      if (filterInvestor) matches = matches && p.investor === filterInvestor;
      if (filterProjectStage) matches = matches && p.stage === filterProjectStage;
      if (filterParentStep) matches = matches && p.parentStep === filterParentStep;

      if (searchQuery) {
        matches = matches && textMatches(searchQuery, p.name, p.investor, p.location, p.code);
      }

      if (customFilterType === 'announced') {
        // User criteria: "THỰC HIỆN ĐẦU TƯ" or has completed GPXD phase
        matches = matches && (p.stage === 'THỰC HIỆN ĐẦU TƯ' || isPhaseCompleted(p, 'gpxd'));
      } else if (customFilterType === 'approved') {
        // User criteria: Completed the policy approval step (CHỦ TRƯƠNG ĐẦU TƯ)
        matches = matches && isPhaseCompleted(p, 'chutruong');
      } else if (customFilterType === 'licensed') {
        // User criteria: "CHUẨN BỊ ĐẦU TƯ" and finished building permit step
        const isLicensed = isPhaseCompleted(p, 'gpxd');
        matches = matches && p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isLicensed;
      }

      return matches;
    });
  }, [processedProjects, filterAgencyName, filterLocation, filterInvestor, filterProjectStage, filterParentStep, searchQuery, customFilterType]);

  // Display filter (includes status filter for project lists)
  const globalFilteredProjects = useMemo(() => {
    return baseFilteredProjects.filter(p => {
      const status = getProjectStatus(p);
      if (statusFilter === 'delayed') return status === 'delayed';
      if (statusFilter === 'ontime') return status === 'ontime';
      return true;
    });
  }, [baseFilteredProjects, statusFilter]);

  const totalProjectsCount = baseFilteredProjects.length;
  const getProjectExtendedInfo = (project: Project) => {
    const info = computeProjectActivePhase(project);
    // Agency shown on the card = the one the project is counted under (current process step)
    const stepAgency = resolveProjectStepAgency(project, processes);
    return stepAgency
      ? { ...info, agencyName: getAgencyWithDepartment(getProjectActiveAgency(project), getStepDepartment(project), project.currentStep) }
      : info;
  };

  const overdueProjectsCount = baseFilteredProjects.filter(p => getProjectStatus(p) === 'delayed').length;
  const onTimeProjectsCount = totalProjectsCount - overdueProjectsCount;

  // Procedure Statistics (Always based on baseFilteredProjects to maintain consistent step status)
  const activeParentStepNames = Array.from(new Set(baseFilteredProjects.map(p => p.parentStep || 'Chưa có thủ tục')));
  const filteredSteps = activeParentStepNames.filter(stepName => {
    return baseFilteredProjects.some(p => (p.parentStep || 'Chưa có thủ tục') === stepName);
  });
  
  const totalActiveStepsCount = filteredSteps.length;
  const delayedStepsCount = filteredSteps.filter(stepName => 
    baseFilteredProjects.some(p => (p.parentStep || 'Chưa có thủ tục') === stepName && getProjectStatus(p) === 'delayed')
  ).length;
  const onTimeStepsCount = totalActiveStepsCount - delayedStepsCount;

  useEffect(() => {
    setProjects(initialProjects || []);
  }, [initialProjects]);


  const handleSearch = (query: string) => {
    if (!query.trim()) return;
    setSearchQuery(query);
    setStatusFilter('all');
    navigateTo('search-results');
  };

  const showInvestorStat = !currentUser || currentUser.roleId === 'Admin' || (currentUser.userType === 'agency' && currentUser.agencyId === '1') || currentUser.userType === 'investor';

  const dynamicAgencies = [
    ...processingAgencies.map(a => {
      const agencyProjects = globalFilteredProjects.filter(p => getProjectActiveAgency(p) === a.name);
      
      const overdueCount = agencyProjects.filter(p => getProjectStatus(p) === 'delayed').length;
      const ontimeCount = agencyProjects.filter(p => getProjectStatus(p) === 'ontime').length;
      const totalInAgency = overdueCount + ontimeCount;

      return {
        ...a,
        count: totalInAgency,
        delayedCount: overdueCount,
        ontimeCount: ontimeCount,
        subtext: 'dự án đang xử lý',
        color: 'bg-emerald-50',
        iconColor: 'text-emerald-500'
      };
    }).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    ...(showInvestorStat ? [{
      id: 'investor-stat',
      name: 'Chủ đầu tư',
      count: globalFilteredProjects.filter(p => {
        if (getProjectActiveAgency(p) !== 'Chủ đầu tư') return false;
        const status = getProjectStatus(p);
        return status === 'delayed' || status === 'ontime';
      }).length,
      delayedCount: globalFilteredProjects.filter(p => {
        if (getProjectActiveAgency(p) !== 'Chủ đầu tư') return false;
        return getProjectStatus(p) === 'delayed';
      }).length,
      ontimeCount: globalFilteredProjects.filter(p => {
        if (getProjectActiveAgency(p) !== 'Chủ đầu tư') return false;
        return getProjectStatus(p) === 'ontime';
      }).length,
      subtext: 'dự án đang xử lý',
      color: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      departments: []
    }] : [])
  ].filter(a => {
    if (!currentUser || currentUser.roleId === 'Admin' || (currentUser.userType as string) === 'city_leader' || (currentUser.userType === 'agency' && currentUser.agencyId === '1')) {
      return true;
    }
    if (currentUser.userType === 'investor') {
      return a.id === 'investor-stat';
    }
    if (currentUser.userType === 'agency') {
      return String(a.id) === String(currentUser.agencyId);
    }
    return true;
  });

  const dynamicDepartments = selectedAgency ? (
    (selectedAgency.name.includes('Phường xã') || selectedAgency.name.includes('Phường/Xã') || selectedAgency.name.includes('UBND cấp xã, phường') 
      ? Array.from(new Set(locations.map(l => l.ward))) 
      : (selectedAgency.departments || [])
    ).map((deptName: string, index: number) => {
      const isWardView = selectedAgency.name.includes('Phường xã') || selectedAgency.name.includes('Phường/Xã') || selectedAgency.name.includes('UBND cấp xã, phường');
      
      // If ward view, check if it matches the location filter
      if (isWardView && filterLocation) {
        if (deptName !== filterLocation) {
          return null;
        }
      }

      const deptProjects = globalFilteredProjects.filter(p => {
        const agencyName = getProjectActiveAgency(p);
        const matchesAgency = selectedAgency.name === 'UBND cấp xã, phường'
          ? (agencyName.includes('xã') || agencyName.includes('phường') || agencyName.includes('Phường') || agencyName.includes('Xã') || agencyName === 'UBND cấp xã, phường')
          : agencyName === selectedAgency.name;
        // Check if department matches (for normal agencies) or ward matches (for UBND cấp xã, phường)
        const projectDept = getStepDepartment(p);
        const matchesDept = projectDept === deptName || p.currentDepartment === deptName || p.location.includes(deptName);
        return matchesAgency && matchesDept;
      });

      const delayedCount = deptProjects.filter(p => getProjectStatus(p) === 'delayed').length;
      const ontimeCount = deptProjects.filter(p => getProjectStatus(p) === 'ontime').length;
      const totalCount = delayedCount + ontimeCount;
      
      let displayCount = totalCount;
      if (statusFilter === 'delayed') displayCount = delayedCount;
      if (statusFilter === 'ontime') displayCount = ontimeCount;

      return {
        id: `${selectedAgency.id}-${index}`,
        name: deptName,
        projectCount: displayCount,
        totalCount,
        delayedCount,
        ontimeCount
      };
    })
  ).filter((dept: any) => dept !== null && dept.projectCount > 0) : [];

  const handleAgencyClick = (agency: any, status: 'all' | 'delayed' | 'ontime' = 'all') => {
    setSelectedAgency(agency);
    setStatusFilter(status);
    setCustomFilterType(null);
    
    if (agency.id === 'investor-stat' || agency.id === 'no-investor-stat') {
      navigateTo('projects');
      return;
    }

    if (agency.departments && agency.departments.length > 0) {
      navigateTo('departments');
    } else {
      navigateTo('projects');
    }
  };

  const handleDeptClick = (dept: any, status: 'all' | 'delayed' | 'ontime' = 'all') => {
    setSelectedDept(dept);
    setStatusFilter(status);
    setCustomFilterType(null);
    navigateTo('projects');
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    navigateTo('detail');
  };

  const FilterPanel = ({ hideInvestorAndStage = false }: { hideInvestorAndStage?: boolean }) => {
    const agencies = Array.from(new Set([
      ...(processingAgencies || []).map(a => a.name),
      ...(projects || []).map(p => p.currentAgency).filter(Boolean)
    ]));

    return (
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50 border-b border-slate-200 overflow-hidden"
          >
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cơ quan</label>
                  <select 
                    value={filterAgencyName}
                    onChange={(e) => setFilterAgencyName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="">Tất cả</option>
                    {agencies.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Địa điểm / Phòng ban
                  </label>
                  <select 
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="">Chọn cơ quan/phòng ban</option>
                    {processingAgencies.map(agency => (
                      <optgroup key={agency.id} label={agency.name}>
                        <option value={agency.name}>{agency.name}</option>
                        {agency.departments && agency.departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {!hideInvestorAndStage && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Chủ đầu tư
                      </label>
                      <select 
                        value={filterInvestor}
                        onChange={(e) => setFilterInvestor(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                      >
                        <option value="">Tất cả</option>
                        {investors.map((i, idx) => (
                          <option key={idx} value={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Giai đoạn
                      </label>
                      <select 
                        value={filterProjectStage}
                        onChange={(e) => setFilterProjectStage(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                      >
                        <option value="">Tất cả</option>
                        {projectStages.map((s, idx) => (
                          <option key={idx} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
              <button 
                onClick={() => {
                  setFilterAgencyName('');
                  setFilterLocation('');
                  setFilterInvestor('');
                  setFilterProjectStage('');
                  setStatusFilter(null);
                  setCustomFilterType(null);
                  setFilterParentStep(null);
                  setSelectedChildStep(null);
                  setSearchQuery('');
                  
                  // Clear focus elements
                  setSelectedAgency(null);
                  setSelectedDept(null);
                  setSelectedParentStep(null);
                }}
                className="w-full py-2 text-xs font-bold text-blue-600 uppercase tracking-widest hover:bg-blue-50 transition-colors rounded-lg"
              >
                Xóa bộ lọc
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const handleStageClick = (stage: string, status: 'all' | 'delayed' | 'ontime') => {
    setFilterProjectStage(stage);
    setStatusFilter(status);
    setCustomFilterType(null);
    navigateTo('steps');
  };

  // --- Views ---

  const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const displayName = payload.value;
    const match = displayName.match(/^(.*)\s\((.*)\)$/);
    
    if (match) {
      const name = match[1];
      const stats = `(${match[2]})`;
      return (
        <g transform={`translate(${x},${y})`}>
          <text x={-10} y={0} dy={-2} textAnchor="end" fill="#334155" fontSize={14} fontWeight="bold">
            {name}
          </text>
          <text x={-10} y={0} dy={16} textAnchor="end" fill="#64748b" fontSize={12} fontWeight="bold">
            {stats}
          </text>
        </g>
      );
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={-10} y={0} dy={4} textAnchor="end" fill="#334155" fontSize={14} fontWeight="bold">
          {displayName}
        </text>
      </g>
    );
  };

  const AgencyDossiersStats = () => {
    // 1. Group 1: Agency Units
    const agencyKeys = [
      { key: 'Sở Xây dựng', label: 'Sở Xây dựng', short: 'SXD' },
      { key: 'Sở Quy hoạch Kiến trúc', label: 'Sở Quy hoạch Kiến trúc', short: 'SQHKT' },
      { key: 'UBND cấp xã, phường', label: 'UBND cấp xã, phường', short: 'UBND P/X' },
      { key: OTHER_AGENCIES, label: OTHER_AGENCIES, short: 'Khác' },
    ];

    const group1Items = agencyKeys.map(item => {
      const projects = processedProjects.filter(p => overviewAgencyGroup(getProjectActiveAgency(p)) === item.key);

      const qh = projects.filter(p => getProjectStatus(p) === 'delayed').length;
      const ch = projects.length - qh;

      return {
        key: item.key,
        label: item.label,
        short: item.short,
        ch,
        qh,
        total: projects.length,
      };
    });

    // "Cơ quan khác" (UBND TP, Sở NNMT, Chủ đầu tư…) is listed only when a project is there
    const shownGroup1Items = group1Items.filter(i => i.key !== OTHER_AGENCIES || i.total > 0);
    const group1CH = group1Items.reduce((acc, curr) => acc + curr.ch, 0);
    const group1QH = group1Items.reduce((acc, curr) => acc + curr.qh, 0);
    const group1Total = group1Items.reduce((acc, curr) => acc + curr.total, 0);

    // 2. Group 2: Investors
    const investorProjectsHas = processedProjects.filter(p => p.investor && p.investor.trim() !== '' && p.investor !== 'Chưa có chủ đầu tư');
    const investorProjectsNo = processedProjects.filter(p => !p.investor || p.investor === 'Chưa có chủ đầu tư' || p.investor.trim() === '');

    const hasInvestorQH = investorProjectsHas.filter(p => getProjectStatus(p) === 'delayed').length;
    const hasInvestorCH = investorProjectsHas.length - hasInvestorQH;

    const noInvestorQH = investorProjectsNo.filter(p => getProjectStatus(p) === 'delayed').length;
    const noInvestorCH = investorProjectsNo.length - noInvestorQH;

    // Total for Bar chart max scaling
    const maxBarValue = Math.max(...shownGroup1Items.map(i => i.total), 1);

    const handleUnitClick = (unitName: string, status: 'all' | 'delayed' | 'ontime' = 'all') => {
      setFilterParentStep(null);
      setSelectedChildStep(null);
      setCustomFilterType(null);
      setStatusFilter(status);

      if (unitName === 'Chủ đầu tư') {
        setSelectedAgency({ id: 'investor-stat', name: 'Chủ đầu tư' });
        setFilterAgencyName('Chủ đầu tư');
        setTimeout(() => navigateTo('projects'), 0);
      } else if (unitName === 'Chưa có chủ đầu tư') {
        setSelectedAgency({ id: 'no-investor-stat', name: 'Chưa có chủ đầu tư' });
        setFilterAgencyName('Chưa có chủ đầu tư');
        setTimeout(() => navigateTo('projects'), 0);
      } else {
        let searchAgency = unitName;
        if (unitName === 'Sở NN & MT') {
          searchAgency = 'Sở NNMT';
        }
        let foundAgency: any = processingAgencies.find(a => a.name.includes(searchAgency) || searchAgency.includes(a.name));
        if (foundAgency) {
          setSelectedAgency(foundAgency);
          setFilterAgencyName(foundAgency.name);
          if (foundAgency.departments && foundAgency.departments.length > 0) {
            setTimeout(() => navigateTo('departments'), 0);
          } else {
            setTimeout(() => navigateTo('projects'), 0);
          }
        } else {
          setFilterAgencyName(unitName);
          setTimeout(() => navigateTo('projects'), 0);
        }
      }
    };

    return (
      <div className="mt-8">
        <div className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-100 shadow-xl p-4 sm:p-6 lg:p-7 w-full">
          {/* Section Main Header */}
          <div className="flex items-center gap-2.5 mb-6 pb-2 border-b border-slate-100">
            <div className="text-[#1e3a8a] flex items-center justify-center">
              <Layers size={22} className="text-[#1e3a8a]" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-[#1e3a8a] uppercase tracking-wider">
              HỒ SƠ THEO ĐƠN VỊ
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* LEFT PANEL: Overview charts */}
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
              {/* Top Sub-section: TỔNG QUAN THEO CQNN */}
              <div>
                <h3 className="text-xs font-black text-[#1e40af] uppercase tracking-wider mb-4">
                  TỔNG QUAN THEO CQNN
                </h3>
                
                {/* Vertical Stacked Bar Chart */}
                <div className="flex items-end justify-center gap-6 sm:gap-10 h-36 pb-1">
                  {shownGroup1Items.map((unit) => {
                    const barHeightPx = Math.max((unit.total / maxBarValue) * 105, 16);
                    const chHeightPercent = unit.total > 0 ? (unit.ch / unit.total) * 100 : 0;
                    const qhHeightPercent = unit.total > 0 ? (unit.qh / unit.total) * 100 : 0;

                    return (
                      <div 
                        key={unit.key}
                        onClick={() => handleUnitClick(unit.key, 'all')}
                        className="flex flex-col items-center cursor-pointer group/bar transition-transform hover:-translate-y-0.5"
                        title={`${unit.label}: ${unit.total} hồ sơ (CH: ${unit.ch}, QH: ${unit.qh})`}
                      >
                        {/* Header number on top of bar */}
                        <div className="flex flex-col items-center mb-1.5 font-black text-xs sm:text-sm leading-none">
                          <span className="text-slate-800">{unit.total}</span>
                        </div>

                        {/* Stacked Vertical Bar */}
                        <div 
                          className="w-10 sm:w-11 rounded-t-md rounded-b-xs overflow-hidden flex flex-col justify-end bg-slate-100 transition-all shadow-xs"
                          style={{ height: `${barHeightPx}px` }}
                        >
                          {/* Top segment: CH (Green) */}
                          {unit.ch > 0 && (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnitClick(unit.key, 'ontime');
                              }}
                              className="bg-[#16a34a] hover:bg-[#15803d] transition-colors"
                              style={{ height: `${chHeightPercent}%` }}
                              title={`${unit.label} - Còn hạn: ${unit.ch}`}
                            />
                          )}
                          {/* Bottom segment: QH (Red) */}
                          {unit.qh > 0 && (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnitClick(unit.key, 'delayed');
                              }}
                              className="bg-[#be123c] hover:bg-[#9f1239] transition-colors"
                              style={{ height: `${qhHeightPercent}%` }}
                              title={`${unit.label} - Quá hạn: ${unit.qh}`}
                            />
                          )}
                        </div>

                        <span className="text-xs font-black text-slate-800 mt-2.5 uppercase tracking-wider text-center">
                          {unit.short}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dotted Separator Line */}
              <div className="border-b border-dashed border-slate-200/90 my-5" />

              {/* Bottom Sub-section: TỔNG QUAN THEO CHỦ ĐẦU TƯ */}
              <div>
                <h3 className="text-xs font-black text-[#1e40af] uppercase tracking-wider mb-3.5">
                  TỔNG QUAN THEO CHỦ ĐẦU TƯ
                </h3>

                <div className="space-y-3.5">
                  {/* Item 1: Đã có chủ đầu tư */}
                  <div className="p-3 sm:p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    <div 
                      onClick={() => handleUnitClick('Chủ đầu tư', 'all')}
                      className="flex items-center justify-between mb-2 cursor-pointer group/inv"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] inline-block shrink-0" />
                        <span className="text-xs sm:text-sm font-extrabold text-slate-800 group-hover/inv:text-blue-700 transition-colors">
                          Đã có chủ đầu tư
                        </span>
                      </div>
                      <span className="text-xs font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        {investorProjectsHas.length} dự án
                      </span>
                    </div>

                    {/* Stacked Horizontal Progress Bar */}
                    <div className="w-full h-3 bg-slate-200/70 rounded-full overflow-hidden flex shadow-inner mb-2.5">
                      {hasInvestorCH > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnitClick('Chủ đầu tư', 'ontime');
                          }}
                          className="bg-[#16a34a] hover:bg-[#15803d] h-full cursor-pointer transition-colors" 
                          style={{ width: `${(hasInvestorCH / (investorProjectsHas.length || 1)) * 100}%` }} 
                          title={`Đã có CĐT - Còn hạn: ${hasInvestorCH}`}
                        />
                      )}
                      {hasInvestorQH > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnitClick('Chủ đầu tư', 'delayed');
                          }}
                          className="bg-[#be123c] hover:bg-[#9f1239] h-full cursor-pointer transition-colors" 
                          style={{ width: `${(hasInvestorQH / (investorProjectsHas.length || 1)) * 100}%` }} 
                          title={`Đã có CĐT - Quá hạn: ${hasInvestorQH}`}
                        />
                      )}
                    </div>

                    {/* Detail count buttons/badges */}
                    <div className="flex items-center justify-between text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => handleUnitClick('Chủ đầu tư', 'ontime')}
                        className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                        <span>Còn hạn:</span>
                        <span className="font-black text-emerald-800">{hasInvestorCH}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnitClick('Chủ đầu tư', 'delayed')}
                        className="flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#be123c]" />
                        <span>Quá hạn:</span>
                        <span className="font-black text-rose-800">{hasInvestorQH}</span>
                      </button>
                    </div>
                  </div>

                  {/* Item 2: Chưa có chủ đầu tư */}
                  <div className="p-3 sm:p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    <div 
                      onClick={() => handleUnitClick('Chưa có chủ đầu tư', 'all')}
                      className="flex items-center justify-between mb-2 cursor-pointer group/inv"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#64748b] inline-block shrink-0" />
                        <span className="text-xs sm:text-sm font-extrabold text-slate-800 group-hover/inv:text-blue-700 transition-colors">
                          Chưa có chủ đầu tư
                        </span>
                      </div>
                      <span className="text-xs font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/80 shadow-2xs">
                        {investorProjectsNo.length} dự án
                      </span>
                    </div>

                    {/* Stacked Horizontal Progress Bar */}
                    <div className="w-full h-3 bg-slate-200/70 rounded-full overflow-hidden flex shadow-inner mb-2.5">
                      {noInvestorCH > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnitClick('Chưa có chủ đầu tư', 'ontime');
                          }}
                          className="bg-[#16a34a] hover:bg-[#15803d] h-full cursor-pointer transition-colors" 
                          style={{ width: `${(noInvestorCH / (investorProjectsNo.length || 1)) * 100}%` }} 
                          title={`Chưa có CĐT - Còn hạn: ${noInvestorCH}`}
                        />
                      )}
                      {noInvestorQH > 0 && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnitClick('Chưa có chủ đầu tư', 'delayed');
                          }}
                          className="bg-[#be123c] hover:bg-[#9f1239] h-full cursor-pointer transition-colors" 
                          style={{ width: `${(noInvestorQH / (investorProjectsNo.length || 1)) * 100}%` }} 
                          title={`Chưa có CĐT - Quá hạn: ${noInvestorQH}`}
                        />
                      )}
                    </div>

                    {/* Detail count buttons/badges */}
                    <div className="flex items-center justify-between text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => handleUnitClick('Chưa có chủ đầu tư', 'ontime')}
                        className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                        <span>Còn hạn:</span>
                        <span className="font-black text-emerald-800">{noInvestorCH}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnitClick('Chưa có chủ đầu tư', 'delayed')}
                        className="flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#be123c]" />
                        <span>Quá hạn:</span>
                        <span className="font-black text-rose-800">{noInvestorQH}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: Details table */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-4 sm:p-5">
              <h3 className="text-xs font-black text-[#1e40af] uppercase tracking-wider mb-4">
                CHI TIẾT THEO CQNN
              </h3>

              {/* GROUP 1: CQNN */}
              <div className="border border-blue-100/90 rounded-2xl overflow-hidden mt-1 shadow-xs">
                {/* Group 1 Header */}
                <div className="bg-[#f0f7ff] px-3.5 py-2.5 flex items-center justify-between border-b border-blue-100/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-[#1e40af] flex items-center justify-center shrink-0">
                      <Building2 size={13} className="text-[#1e40af]" />
                    </div>
                    <span className="text-xs font-black text-[#1e40af] uppercase tracking-wider">
                      CQNN
                    </span>
                  </div>

                  <div className="flex items-center gap-6 sm:gap-8 shrink-0 text-[11px] font-black uppercase tracking-wider">
                    <span className="text-[#16a34a] w-8 sm:w-10 text-center">CH</span>
                    <span className="text-[#be123c] w-8 sm:w-10 text-center">QH</span>
                    <span className="text-[#1e40af] w-12 sm:w-14 text-right">TỔNG</span>
                  </div>
                </div>

                {/* Group 1 Rows */}
                <div className="divide-y divide-slate-100/80 bg-white">
                  {shownGroup1Items.map((unit) => (
                    <div 
                      key={unit.key}
                      className="px-3.5 py-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                    >
                      <span 
                        onClick={() => handleUnitClick(unit.key, 'all')}
                        className="text-xs sm:text-sm font-medium text-slate-700 cursor-pointer hover:text-blue-600 truncate pr-2"
                      >
                        {unit.label}
                      </span>
                      <div className="flex items-center gap-6 sm:gap-8 shrink-0">
                        <span 
                          onClick={() => handleUnitClick(unit.key, 'ontime')}
                          className={`w-8 sm:w-10 text-center text-xs sm:text-sm font-extrabold ${unit.ch > 0 ? 'text-[#16a34a] cursor-pointer hover:underline' : 'text-slate-300'}`}
                        >
                          {unit.ch}
                        </span>
                        <span 
                          onClick={() => handleUnitClick(unit.key, 'delayed')}
                          className={`w-8 sm:w-10 text-center text-xs sm:text-sm font-extrabold ${unit.qh > 0 ? 'text-[#be123c] cursor-pointer hover:underline' : 'text-slate-300'}`}
                        >
                          {unit.qh}
                        </span>
                        <span 
                          onClick={() => handleUnitClick(unit.key, 'all')}
                          className="w-12 sm:w-14 text-right text-xs sm:text-sm font-black text-slate-900 cursor-pointer hover:text-blue-600"
                        >
                          {unit.total}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Group 1 Subtotal Footer */}
                <div className="bg-[#f0f7ff]/90 px-3.5 py-2.5 flex items-center justify-between border-t border-blue-100/70">
                  <span className="text-xs sm:text-sm font-black text-[#1e40af] uppercase tracking-wider">
                    TỔNG CỘNG
                  </span>
                  <div className="flex items-center gap-6 sm:gap-8 shrink-0">
                    <span className="w-8 sm:w-10 text-center text-xs sm:text-sm font-black text-[#16a34a]">
                      {group1CH}
                    </span>
                    <span className="w-8 sm:w-10 text-center text-xs sm:text-sm font-black text-[#be123c]">
                      {group1QH}
                    </span>
                    <span className="w-12 sm:w-14 text-right text-xs sm:text-sm font-black text-slate-900">
                      {group1Total}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  };

  const StageStatsTable = () => {
    // Collect all unique parent steps from all processes to map them to stages correctly
    const allParentSteps: { name: string; shortName?: string; stage: string }[] = [];
    processes.forEach((proc: any) => {
      (proc.parentSteps || []).forEach((ps: any) => {
        if (!allParentSteps.find(item => item.name === ps.name)) {
          allParentSteps.push({ name: ps.name, shortName: ps.shortName, stage: ps.stage });
        }
      });
    });

    const data = projectStages.map(stageName => {
      const stageProjects = baseFilteredProjects.filter(p => p.stage === stageName);
      
      // Get parent steps for this stage
      const stepsForStage = allParentSteps
        .filter(ps => ps.stage.toUpperCase() === stageName.toUpperCase());
      
      const subSteps = stepsForStage.map(step => {
        const stepProjects = stageProjects.filter(p => p.parentStep === step.name);
        const delayed = stepProjects.filter(p => getProjectStatus(p) === 'delayed').length;
        const total = stepProjects.length;
        const ontime = total - delayed;

        return { name: step.name, shortName: step.shortName, total, delayed, ontime };
      }).filter(s => s.total > 0);

      return {
        name: stageName,
        total: stageProjects.length,
        subSteps
      };
    }).filter(stage => stage.total > 0);

    if (data.length === 0) return null;

    return (
      <div className="mt-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-[#1e3a8a] text-center w-full uppercase tracking-tight">Thống kê theo giai đoạn</h2>
        </div>

        {/* MOBILE & TABLET VIEW - Beautiful card-based list layout matching design */}
        <div className="block lg:hidden space-y-6">
          {data.map(stage => (
            <div key={stage.name} className="bg-white rounded-[20px] border border-slate-200/80 shadow-md overflow-hidden">
              {/* Header Box */}
              <div 
                onClick={() => {
                  setFilterProjectStage(stage.name);
                  setFilterParentStep(null);
                  setSelectedChildStep(null);
                  setCustomFilterType(null);
                  setStatusFilter(null);
                  navigateTo('steps');
                }}
                className="bg-[#324cb4] text-white p-4 font-black uppercase tracking-wide flex justify-between items-center cursor-pointer hover:bg-[#283e9b] transition-colors"
              >
                <span className="text-sm sm:text-base font-extrabold tracking-wider">{stage.name}</span>
                <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-black min-w-[32px] text-center">
                  {stage.total}
                </span>
              </div>
              
              {/* Detailed Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="py-2.5 px-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest pl-5">GIAI ĐOẠN</th>
                      <th className="py-2.5 px-3 text-[10px] sm:text-xs font-bold text-emerald-600 uppercase tracking-wider text-right w-24">Còn hạn</th>
                      <th className="py-2.5 px-4 text-[10px] sm:text-xs font-bold text-rose-600 uppercase tracking-wider text-right w-24 pr-5">Quá hạn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stage.subSteps.map(step => (
                      <tr key={step.name} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3 px-4 pl-5">
                          <div 
                            onClick={() => { 
                              setFilterParentStep(step.name); 
                              setSelectedChildStep(null);
                              setCustomFilterType(null);
                              setStatusFilter(null);
                              navigateTo('projects'); 
                            }}
                            className="font-extrabold text-[#0f172a] text-sm hover:text-indigo-600 cursor-pointer"
                          >
                            {step.shortName || step.name}
                          </div>
                        </td>
                        <td 
                          onClick={() => { 
                            setFilterParentStep(step.name); 
                            setSelectedChildStep(null);
                            setCustomFilterType(null);
                            setStatusFilter('ontime'); 
                            navigateTo('projects'); 
                          }}
                          className="py-3 px-3 text-right font-black text-sm hover:text-emerald-600 cursor-pointer w-24"
                        >
                          {step.ontime > 0 ? (
                            <span className="text-[#16a34a] text-lg font-extrabold">{step.ontime}</span>
                          ) : (
                            <span className="text-slate-300 font-extrabold">0</span>
                          )}
                        </td>
                        <td 
                          onClick={() => { 
                            setFilterParentStep(step.name); 
                            setSelectedChildStep(null);
                            setCustomFilterType(null);
                            setStatusFilter('delayed'); 
                            navigateTo('projects'); 
                          }}
                          className="py-3 px-4 pr-5 text-right font-black text-sm hover:text-rose-600 cursor-pointer w-24"
                        >
                          {step.delayed > 0 ? (
                            <span className="text-[#be123c] text-lg font-extrabold">{step.delayed}</span>
                          ) : (
                            <span className="text-slate-300 font-extrabold">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Total Summary Row */}
                    <tr className="bg-slate-50/40 border-t border-slate-200/80 font-semibold text-slate-700">
                      <td className="py-3.5 px-4 pl-5 text-sm font-extrabold text-slate-700">Tổng cộng</td>
                      <td className="py-3.5 px-3 text-right text-lg font-black text-[#16a34a] w-24">
                        {stage.subSteps.reduce((acc, s) => acc + s.ontime, 0)}
                      </td>
                      <td className="py-3.5 px-4 pr-5 text-right text-lg font-black text-[#be123c] w-24">
                        {stage.subSteps.reduce((acc, s) => acc + s.delayed, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP VIEW - Kept completely original grid-based design */}
        <div className="hidden lg:block space-y-4">
          {data.map(stage => (
            <div key={stage.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div 
                onClick={() => {
                  setFilterProjectStage(stage.name);
                  setFilterParentStep(null);
                  setSelectedChildStep(null);
                  setCustomFilterType(null);
                  setStatusFilter(null);
                  navigateTo('steps');
                }}
                className="bg-[#D1E9FF] text-[#1E3A8A] p-2 text-base font-black uppercase tracking-tight text-center cursor-pointer hover:bg-sky-300 transition-colors border-b border-slate-300"
              >
                {stage.name} ({stage.total})
              </div>
              
              {/* Sub-steps Grid */}
              <div 
                className="grid"
                style={{ 
                  gridTemplateColumns: `repeat(${stage.subSteps.length}, minmax(0, 1fr))`
                }}
              >
                {stage.subSteps.map((step, idx) => (
                  <div 
                    key={step.name}
                    className={`flex flex-col bg-white ${idx < stage.subSteps.length - 1 ? 'border-r border-slate-300' : ''}`}
                  >
                    {/* Sub-step Title */}
                    <div 
                      onClick={() => { 
                        setFilterParentStep(step.name); 
                        setSelectedChildStep(null);
                        setCustomFilterType(null);
                        setStatusFilter(null);
                        navigateTo('projects'); 
                      }}
                      className="p-2.5 text-[12px] font-black text-center h-20 flex items-center justify-center leading-tight uppercase border-b border-slate-300 cursor-pointer bg-slate-100 hover:bg-sky-100 transition-colors text-[#1e3a8a]"
                    >
                      <div className="line-clamp-4 px-1">{step.shortName || step.name}</div>
                    </div>
                    
                    {/* Sub-step Counts */}
                    <div className="flex h-12">
                      {/* Ontime Count */}
                      <div 
                        onClick={() => { 
                          setFilterParentStep(step.name); 
                          setSelectedChildStep(null);
                          setCustomFilterType(null);
                          setStatusFilter('ontime'); 
                          navigateTo('projects'); 
                        }}
                        className="flex-1 flex flex-col items-center justify-center bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer border-r border-slate-200"
                        title="Dự án Còn hạn"
                      >
                         <span className="text-xl font-black text-emerald-700 leading-none">{step.ontime}</span>
                         <span className="text-[10px] text-emerald-600 font-bold mt-0.5">CÒN HẠN</span>
                      </div>
                      
                      {/* Delayed Count */}
                      <div 
                        onClick={() => { 
                          setFilterParentStep(step.name); 
                          setSelectedChildStep(null);
                          setCustomFilterType(null);
                          setStatusFilter('delayed'); 
                          navigateTo('projects'); 
                        }}
                        className="flex-1 flex flex-col items-center justify-center bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                        title="Dự án Quá hạn"
                      >
                         <span className="text-xl font-black text-rose-700 leading-none">{step.delayed}</span>
                         <span className="text-[10px] text-rose-600 font-bold mt-0.5">QUÁ HẠN</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Overview = () => {
    const stagesToDisplay = projectStages.map(stage => ({ name: stage, dataName: stage }));

    // Donut: with no projects Recharts draws nothing (and drops the centre label), so show a grey ring
    const hasPieData = overdueProjectsCount + onTimeProjectsCount > 0;
    const pieData = (delayedLabel: string, ontimeLabel: string) => hasPieData
      ? [
          { name: delayedLabel, value: overdueProjectsCount, status: 'delayed' },
          { name: ontimeLabel, value: onTimeProjectsCount, status: 'ontime' }
        ]
      : [{ name: 'Chưa có dự án', value: 1, status: '' }];

    return (
      <div className="flex flex-col h-full bg-slate-50">
        {/* Header */}
        <div className="bg-[#1e40af] text-white p-6 pb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          <div className="relative z-10 flex flex-col items-center text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight uppercase">{dashboardTitle}</h1>
            <div className="flex items-center gap-2 mt-2 text-blue-100/80 text-sm sm:text-base font-bold tracking-widest uppercase">
              THEO DÕI TIẾN ĐỘ DỰ ÁN NOXH
              <ChevronRight size={16} className="text-blue-300" />
              <ChevronRight size={16} className="text-blue-300 -ml-2" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl relative z-20 overflow-y-auto pb-24">
          
          {/* Header Summary Statistics - Bento Grid Style */}
          {/* MOBILE & TABLET VIEW - Beautiful project stats card matching the design */}
          <div className="block xl:hidden bg-white rounded-[24px] border border-slate-100 shadow-md p-6 relative overflow-hidden group w-full mb-6">
            {/* Header of the card */}
            <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-100/60">
              <div className="text-indigo-600">
                <Layers size={20} />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Thống kê dự án</h3>
            </div>

            {/* Top: Donut + Badge counters */}
            <div className="flex items-center gap-4 sm:gap-6 justify-between w-full mb-6">
              {/* Left Side: Pie/Donut Chart */}
              <div className="h-[120px] w-[120px] relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData('KH bị chậm', 'CQNN đang xử lý')}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={56}
                      paddingAngle={0}
                      dataKey="value"
                      onClick={(data) => {
                        const payload = data.payload || data;
                        if (!payload.status) return;
                        setSelectedAgency(null);
                        setSelectedDept(null);
                        setSelectedParentStep(null);
                        setFilterParentStep(null);
                        setSelectedChildStep(null);
                        setCustomFilterType(null);
                        setStatusFilter(payload.status);
                        navigateTo('projects');
                      }}
                      className="cursor-pointer outline-none"
                    >
                      {hasPieData ? [
                        <Cell key="delayed" fill="#be123c" stroke="transparent" />,
                        <Cell key="ontime" fill="#16a34a" stroke="transparent" />
                      ] : <Cell fill="#e2e8f0" stroke="transparent" />}
                      <Label 
                        content={({ viewBox }) => {
                          const { cx, cy } = viewBox as any;
                          return (
                            <g>
                              <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-3xl font-extrabold tracking-tighter">
                                {totalProjectsCount}
                              </text>
                              <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[10px] font-extrabold uppercase tracking-widest">
                                DỰ ÁN
                              </text>
                            </g>
                          );
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Right Side: Stacked Badges in soft background */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                {/* KH_BI_CHAM Counter */}
                <button 
                  onClick={() => { 
                    setSelectedAgency(null);
                    setSelectedDept(null);
                    setSelectedParentStep(null);
                    setFilterParentStep(null);
                    setSelectedChildStep(null);
                    setCustomFilterType(null);
                    setStatusFilter('delayed'); 
                    navigateTo('projects'); 
                  }}
                  className="w-full flex items-center justify-between p-3 flex-row bg-rose-50/70 hover:bg-rose-100 rounded-[20px] border border-rose-100/30 transition-all active:scale-[0.98]"
                >
                  <div className="text-left min-w-0">
                    <p className="text-[11px] font-extrabold text-[#be123c] uppercase tracking-wide">KH bị chậm</p>
                    <p className="text-[9px] font-medium text-slate-500 mt-0.5">Trễ hạn kế hoạch</p>
                  </div>
                  <span className="text-2xl font-black text-[#be123c] font-sans tracking-tight ml-2 shrink-0">{overdueProjectsCount}</span>
                </button>

                {/* CQNN_DANG_XU_LY Counter */}
                <button 
                  onClick={() => { 
                    setSelectedAgency(null);
                    setSelectedDept(null);
                    setSelectedParentStep(null);
                    setFilterParentStep(null);
                    setSelectedChildStep(null);
                    setCustomFilterType(null);
                    setStatusFilter('ontime'); 
                    navigateTo('projects'); 
                  }}
                  className="w-full flex items-center justify-between p-3 flex-row bg-emerald-50/70 hover:bg-emerald-100 rounded-[20px] border border-emerald-100/30 transition-all active:scale-[0.98]"
                >
                  <div className="text-left min-w-0">
                    <p className="text-[11px] font-extrabold text-[#16a34a] uppercase tracking-wide">CQNN đang xử lý</p>
                    <p className="text-[9px] font-medium text-slate-500 mt-0.5">Theo đúng tiến độ</p>
                  </div>
                  <span className="text-2xl font-black text-[#16a34a] font-sans tracking-tight ml-2 shrink-0">{onTimeProjectsCount}</span>
                </button>
              </div>
            </div>

            {/* Soft Spacer line */}
            <div className="border-t border-slate-100 my-4" />

            {/* Bottom List items */}
            <div className="space-y-4">
              {/* Item 1 */}
              <div 
                onClick={() => {
                  setCustomFilterType('approved');
                  navigateTo('projects');
                }}
                className="flex items-center justify-between py-1 cursor-pointer hover:bg-slate-50/50 rounded-xl px-2 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 text-[#1e3a8a] rounded-xl flex items-center justify-center shrink-0">
                    <LayoutDashboard size={20} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-extrabold text-[#1e3a8a] tracking-tight">Chấp thuận chủ trương</h4>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">Đã phê duyệt</p>
                  </div>
                </div>
                <span className="text-2xl font-black text-[#1e3a8a]">
                  {processedProjects.filter(p => isPhaseCompleted(p, 'chutruong')).length}
                </span>
              </div>

              {/* Line separator */}
              <div className="border-t border-slate-100/80" />

              {/* Item 2 */}
              <div 
                onClick={() => {
                  setCustomFilterType('licensed');
                  navigateTo('projects');
                }}
                className="flex items-center justify-between py-1 cursor-pointer hover:bg-slate-50/50 rounded-xl px-2 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-[#eef2ff] text-[#312e81] rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={20} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-extrabold text-[#1e3a8a] tracking-tight">GP Xây dựng</h4>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">Sẵn sàng thi công</p>
                  </div>
                </div>
                <span className={`text-2xl font-black ${
                  processedProjects.filter(p => p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isPhaseCompleted(p, 'gpxd')).length > 0 
                    ? 'text-indigo-800' : 'text-slate-300'
                }`}>
                  {processedProjects.filter(p => {
                    const isLicensed = isPhaseCompleted(p, 'gpxd');
                    return p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isLicensed;
                  }).length}
                </span>
              </div>

              {/* Line separator */}
              <div className="border-t border-slate-100/80" />

              {/* Item 3 */}
              <div 
                onClick={() => {
                  setCustomFilterType('announced');
                  navigateTo('projects');
                }}
                className="flex items-center justify-between py-1 cursor-pointer hover:bg-slate-50/50 rounded-xl px-2 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 text-[#16a34a] rounded-xl flex items-center justify-center shrink-0">
                    <FileCheck size={20} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-sm font-extrabold text-[#1e3a8a] tracking-tight">Dự án đã công bố</h4>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">Danh mục chính thức</p>
                  </div>
                </div>
                <span className={`text-2xl font-black ${
                  processedProjects.filter(p => p.stage === 'THỰC HIỆN ĐẦU TƯ' || isPhaseCompleted(p, 'gpxd')).length > 0
                    ? 'text-[#16a34a]' : 'text-slate-300'
                }`}>
                  {processedProjects.filter(p => p.stage === 'THỰC HIỆN ĐẦU TƯ' || isPhaseCompleted(p, 'gpxd')).length}
                </span>
              </div>
            </div>
          </div>

          {/* DESKTOP VIEW - Beautiful unified statistics card matching user screenshot exactly */}
          <div className="hidden xl:block bg-white rounded-[24px] border border-slate-200/95 shadow-sm overflow-hidden mb-8 mt-4">
            {/* Header of the unified card */}
            <div className="flex items-center gap-2.5 px-6 py-4.5 border-b border-slate-100 bg-white">
              <Layers size={18} className="text-[#1e3a8a] stroke-[2.5]" />
              <h3 className="text-sm font-extrabold text-[#1e3a8a] uppercase tracking-wider">Thống kê dự án</h3>
            </div>
            
            {/* Body: Flex container with vertical dividers */}
            <div className="flex flex-row items-stretch divide-x divide-slate-200/70">
              
              {/* Panel 1: Pie Chart & Blocked/On-time Progress (occupies approx 3.8/10 weight) */}
              <div className="flex-[4.5] min-w-0 p-6 flex flex-row items-center justify-between gap-4">
                {/* Left Side: Pie Chart */}
                <div className="h-[125px] w-[125px] relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData('KH bị chậm tiến độ', 'CQNN Đang xử lý')}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={54}
                        paddingAngle={3}
                        dataKey="value"
                        onClick={(data) => {
                          const payload = data.payload || data;
                          if (!payload.status) return;
                          setSelectedAgency(null);
                          setSelectedDept(null);
                          setSelectedParentStep(null);
                          setFilterParentStep(null);
                          setSelectedChildStep(null);
                          setCustomFilterType(null);
                          setStatusFilter(payload.status);
                          navigateTo('projects');
                        }}
                        className="cursor-pointer outline-none"
                      >
                        {hasPieData ? [
                          <Cell key="delayed" fill="#be123c" stroke="transparent" />,
                          <Cell key="ontime" fill="#16a34a" stroke="transparent" />
                        ] : <Cell fill="#e2e8f0" stroke="transparent" />}
                        <Label 
                          content={({ viewBox }) => {
                            const { cx, cy } = viewBox as any;
                            return (
                              <g>
                                <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-[26px] font-black tracking-tight">
                                  {totalProjectsCount}
                                </text>
                                <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[9px] font-bold uppercase tracking-[0.1em]">
                                  DỰ ÁN
                                </text>
                              </g>
                            );
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Right Side: Two status boxes stacked vertically */}
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                  <button 
                    onClick={() => { 
                      setSelectedAgency(null);
                      setSelectedDept(null);
                      setSelectedParentStep(null);
                      setFilterParentStep(null);
                      setSelectedChildStep(null);
                      setCustomFilterType(null);
                      setStatusFilter('delayed'); 
                      navigateTo('projects'); 
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 bg-[rgb(254,242,242)] hover:bg-rose-100/60 rounded-[20px] border border-rose-100/30 transition-all hover:shadow-xs active:scale-[0.98]"
                  >
                    <div className="text-left min-w-0">
                      <p className="text-xs font-black text-rose-900 uppercase tracking-wide">KH bị chậm</p>
                      <p className="text-[10px] font-medium text-rose-700/60 mt-0.5">Trễ hạn kế hoạch</p>
                    </div>
                    <span className="text-3xl font-black text-rose-800 font-sans tracking-tight ml-3 shrink-0">{overdueProjectsCount}</span>
                  </button>

                  <button 
                    onClick={() => { 
                      setSelectedAgency(null);
                      setSelectedDept(null);
                      setSelectedParentStep(null);
                      setFilterParentStep(null);
                      setSelectedChildStep(null);
                      setCustomFilterType(null);
                      setStatusFilter('ontime'); 
                      navigateTo('projects'); 
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 bg-[rgb(240,253,244)] hover:bg-emerald-100/60 rounded-[20px] border border-emerald-100/30 transition-all hover:shadow-xs active:scale-[0.98]"
                  >
                    <div className="text-left min-w-0">
                      <p className="text-xs font-black text-emerald-900 uppercase tracking-wide">CQNN đang xử lý</p>
                      <p className="text-[10px] font-medium text-emerald-700/60 mt-0.5">Theo đúng tiến độ</p>
                    </div>
                    <span className="text-3xl font-black text-emerald-700 font-sans tracking-tight ml-3 shrink-0">{onTimeProjectsCount}</span>
                  </button>
                </div>
              </div>

              {/* Panel 2: Chấp thuận chủ trương */}
              <div 
                onClick={() => {
                  setCustomFilterType('approved');
                  navigateTo('projects');
                }}
                className="flex-[2.1] p-6 cursor-pointer hover:bg-slate-50/50 transition-all active:scale-[0.99] group flex flex-col justify-center"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col justify-between h-full">
                    {/* Icon Container */}
                    <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                      <LayoutDashboard size={20} className="stroke-[2.5]" />
                    </div>
                    
                    {/* Texts */}
                    <div className="mt-4">
                      <h4 className="text-[14px] font-black text-[#1e3a8a] tracking-tight leading-snug group-hover:text-indigo-900 transition-colors">
                        Chấp thuận chủ trương
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">
                        Đã phê duyệt
                      </p>
                    </div>
                  </div>
                  
                  {/* Big Number */}
                  <div className="text-right pl-3">
                    <span className="text-[44px] font-black text-indigo-950 leading-none tracking-tight">
                      {processedProjects.filter(p => isPhaseCompleted(p, 'chutruong')).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Panel 3: GP xây dựng */}
              <div 
                onClick={() => {
                  setCustomFilterType('licensed');
                  navigateTo('projects');
                }}
                className="flex-[2.1] p-6 cursor-pointer hover:bg-slate-50/50 transition-all active:scale-[0.99] group flex flex-col justify-center"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col justify-between h-full">
                    {/* Icon Container */}
                    <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                      <Building2 size={20} className="stroke-[2.5]" />
                    </div>
                    
                    {/* Texts */}
                    <div className="mt-4">
                      <h4 className="text-[14px] font-black text-[#1e3a8a] tracking-tight leading-snug group-hover:text-blue-900 transition-colors">
                        GP Xây dựng
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">
                        Sẵn sàng thi công
                      </p>
                    </div>
                  </div>
                  
                  {/* Big Number */}
                  <div className="text-right pl-3">
                    {(() => {
                      const count = processedProjects.filter(p => {
                        const isLicensed = isPhaseCompleted(p, 'gpxd');
                        return p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isLicensed;
                      }).length;
                      return (
                        <span className={`text-[44px] font-black leading-none tracking-tight ${
                          count > 0 ? 'text-[#1e3a8a]' : 'text-slate-300'
                        }`}>
                          {count}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Panel 4: Dự án đã công bố */}
              <div 
                onClick={() => {
                  setCustomFilterType('announced');
                  navigateTo('projects');
                }}
                className="flex-[2.1] p-6 cursor-pointer hover:bg-slate-50/50 transition-all active:scale-[0.99] group flex flex-col justify-center"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col justify-between h-full">
                    {/* Icon Container */}
                    <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                      <FileCheck size={20} className="stroke-[2.5]" />
                    </div>
                    
                    {/* Texts */}
                    <div className="mt-4">
                      <h4 className="text-[14px] font-black text-emerald-700 tracking-tight leading-snug group-hover:text-emerald-800 transition-colors">
                        Dự án đã công bố
                      </h4>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">
                        Danh mục chính thức
                      </p>
                    </div>
                  </div>
                  
                  {/* Big Number */}
                  <div className="text-right pl-3">
                    {(() => {
                      const count = processedProjects.filter(p => p.stage === 'THỰC HIỆN ĐẦU TƯ' || isPhaseCompleted(p, 'gpxd')).length;
                      return (
                        <span className={`text-[44px] font-black leading-none tracking-tight ${
                          count > 0 ? 'text-emerald-600' : 'text-slate-300'
                        }`}>
                          {count}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Dossier statistics by Agency */}
          <StableView render={AgencyDossiersStats} />

          {/* Project Statistics by Stage */}
          <StableView render={StageStatsTable} />

        </div>
      </div>
    );
  };

  const AgenciesStats = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">Thống kê theo cơ quan</h1>
            <p className="text-blue-100/60 text-xs font-bold tracking-widest uppercase">
              {statusFilter === 'delayed' ? 'KH bị chậm tiến độ' : statusFilter === 'ontime' ? 'CQNN đang xử lý' : 'Tất cả dự án'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-white text-blue-600' : 'bg-white/10 text-white'}`}
        >
          <Filter size={24} />
        </button>
      </div>

      <StableView render={() => FilterPanel({})} />

      <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto">
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-6 h-[600px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={(showInvestorStat && currentUser?.userType !== 'investor' ? dynamicAgencies.concat({
                id: 'no-investor-stat',
                name: 'Chưa có chủ đầu tư',
                count: globalFilteredProjects.filter(p => p.investor === 'Chưa có chủ đầu tư').length,
                delayedCount: globalFilteredProjects.filter(p => p.investor === 'Chưa có chủ đầu tư' && getProjectStatus(p) === 'delayed').length,
                ontimeCount: globalFilteredProjects.filter(p => p.investor === 'Chưa có chủ đầu tư' && getProjectStatus(p) === 'ontime').length,
                subtext: 'dự án đang xử lý',
                color: 'bg-emerald-50',
                iconColor: 'text-emerald-500',
                departments: [],
                displayOrder: 999
              }) : dynamicAgencies)
              .filter(a => a.count > 0)
              .sort((a, b) => b.count - a.count)
              .map(a => ({
                originalName: a.name,
                displayName: `${a.name} (${a.count}/${totalProjectsCount})`,
                total: a.count,
                ontime: a.count - a.delayedCount,
                delayed: a.delayedCount,
                agency: a
              }))}
              margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="displayName" 
                type="category" 
                width={200}
                tick={<CustomYAxisTick />}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-xl overflow-hidden">
                        <p className="text-xs font-black text-slate-800 mb-2">{data.originalName}</p>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">CQNN Đang xử lý</span>
                            <span className="text-xs font-black text-[#047857]">{data.ontime}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 border-b border-slate-50 pb-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">KH bị chậm tiến độ</span>
                            <span className="text-xs font-black text-[#be123c]">{data.delayed}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 pt-1">
                            <span className="text-[10px] font-bold text-[#1e40af] uppercase">Tổng đang xử lý</span>
                            <span className="text-xs font-black text-[#1e40af]">{data.total}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {(statusFilter === 'all' || statusFilter === 'ontime') && (
                <Bar 
                  dataKey="ontime" 
                  fill="#059669" 
                  radius={[0, 4, 4, 0]} 
                  barSize={24}
                  onClick={(data: any) => handleAgencyClick(data.agency || data.payload?.agency, 'ontime')}
                  className="cursor-pointer"
                >
                  <LabelList dataKey="ontime" position="right" style={{ fontSize: '14px', fontWeight: 'bold', fill: '#059669' }} />
                </Bar>
              )}
              {(statusFilter === 'all' || statusFilter === 'delayed') && (
                <Bar 
                  dataKey="delayed" 
                  fill="#e11d48" 
                  radius={[0, 4, 4, 0]} 
                  barSize={24}
                  onClick={(data: any) => handleAgencyClick(data.agency || data.payload?.agency, 'delayed')}
                  className="cursor-pointer"
                >
                  <LabelList dataKey="delayed" position="right" style={{ fontSize: '14px', fontWeight: 'bold', fill: '#e11d48' }} />
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const DepartmentStats = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">{selectedAgency?.name}</h1>
            <p className="text-blue-100/60 text-xs font-bold tracking-widest uppercase">
              {statusFilter === 'delayed' ? 'Dự án quá hạn' : statusFilter === 'ontime' ? 'Dự án đang xử lý' : 'Thống kê chi tiết'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-white text-blue-600' : 'bg-white/10 text-white'}`}
        >
          <Filter size={24} />
        </button>
      </div>

      <StableView render={() => FilterPanel({ hideInvestorAndStage: selectedAgency?.name.includes('Phường xã') || selectedAgency?.name.includes('Phường/Xã') || selectedAgency?.name.includes('UBND cấp xã, phường') })} />

      <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto">
        <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-100/60">
          <div className="text-blue-600">
            <Layers size={20} />
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Hồ sơ theo đơn vị</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {dynamicDepartments.map((dept: any) => (
            <div
              key={dept.id}
              onClick={() => handleDeptClick(dept, statusFilter)}
              className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col gap-0.5 group cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-left">
                  <p className="text-sm sm:text-base font-bold text-slate-800 leading-tight line-clamp-2">{dept.name}</p>
                  {statusFilter === 'all' && (
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-none mt-1">
                      Tổng số {dept.totalCount}
                    </p>
                  )}
                </div>
                {statusFilter !== 'all' && (
                  <div className="flex-shrink-0">
                    <span className={`text-2xl sm:text-3xl font-black leading-none ${statusFilter === 'delayed' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {dept.projectCount}
                    </span>
                  </div>
                )}
              </div>
              
              {statusFilter === 'all' && (
                <div className="flex justify-between items-end mt-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeptClick(dept, 'delayed');
                    }}
                    className="hover:scale-110 transition-transform"
                  >
                    <span className="text-2xl sm:text-3xl font-black text-rose-600 leading-none">{dept.delayedCount}</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeptClick(dept, 'ontime');
                    }}
                    className="hover:scale-110 transition-transform"
                  >
                    <span className="text-2xl sm:text-3xl font-black text-emerald-600 leading-none">{dept.ontimeCount}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const getParentStepStats = () => {
    const parentSteps = new Set<string>();
    baseFilteredProjects.forEach(p => {
      parentSteps.add(p.parentStep || 'Chưa có thủ tục');
    });

    return Array.from(parentSteps)
      .filter(stepName => textMatches(stepSearchTerm, stepName))
      .map(stepName => {
        const stepProjects = baseFilteredProjects.filter(p => (p.parentStep || 'Chưa có thủ tục') === stepName);
        const delayed = stepProjects.filter(p => getProjectStatus(p) === 'delayed').length;
        const ontime = stepProjects.filter(p => getProjectStatus(p) === 'ontime').length;
        const total = stepProjects.length;
        
        let count = total;
        if (statusFilter === 'delayed') count = delayed > 0 ? delayed : 0;
        if (statusFilter === 'ontime') count = (delayed === 0 && ontime > 0) ? ontime : 0;

        return {
          name: stepName,
          count,
          total: total,
          delayed,
          ontime,
          isDelayed: delayed > 0,
          isOnTime: delayed === 0 && ontime > 0
        };
      }).filter(s => {
        if (statusFilter === 'delayed') return s.isDelayed;
        if (statusFilter === 'ontime') return s.isOnTime;
        return s.count > 0;
      });
  };

  const getChildStepStats = (parentStepName: string) => {
    const childSteps = new Set<string>();
    baseFilteredProjects.forEach(p => {
      if (p.parentStep === parentStepName && p.childStep) childSteps.add(p.childStep);
    });

    return Array.from(childSteps)
      .filter(stepName => textMatches(stepSearchTerm, stepName))
      .map(stepName => {
        const stepProjects = baseFilteredProjects.filter(p => p.parentStep === parentStepName && p.childStep === stepName);
        const delayed = stepProjects.filter(p => getProjectStatus(p) === 'delayed').length;
        const ontime = stepProjects.filter(p => getProjectStatus(p) === 'ontime').length;
        const total = stepProjects.length;
        
        let count = total;
        if (statusFilter === 'delayed') count = delayed > 0 ? delayed : 0;
        if (statusFilter === 'ontime') count = (delayed === 0 && ontime > 0) ? ontime : 0;

        return {
          name: stepName,
          count,
          total: total,
          delayed,
          ontime,
          isDelayed: delayed > 0,
          isOnTime: delayed === 0 && ontime > 0
        };
      }).filter(s => {
        if (statusFilter === 'delayed') return s.isDelayed;
        if (statusFilter === 'ontime') return s.isOnTime;
        return s.count > 0;
      });
  };

  const StepsStats = () => {
    const rawData = getParentStepStats();
    const totalCount = rawData.reduce((acc, curr) => acc + curr.count, 0);
    const chartData = rawData
      .sort((a, b) => b.count - a.count)
      .map(step => ({
        ...step,
        value: step.count,
        originalName: step.name,
        displayName: `${step.name} (${step.count})`,
      }));

    // Dynamic Color Schemes
    const theme = {
      header: statusFilter === 'delayed' ? 'bg-rose-700' : statusFilter === 'ontime' ? 'bg-emerald-700' : 'bg-[#1e40af]',
      subline: statusFilter === 'delayed' ? 'text-rose-100/60' : statusFilter === 'ontime' ? 'text-emerald-100/60' : 'text-blue-100/60',
      chartText: statusFilter === 'delayed' ? 'fill-rose-900' : statusFilter === 'ontime' ? 'fill-emerald-900' : 'fill-slate-800',
      palette: statusFilter === 'delayed' 
        ? ['#9f1239', '#be123c', '#fb7185', '#e11d48', '#fda4af', '#fecdd3', '#fff1f2']
        : statusFilter === 'ontime'
        ? ['#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5']
        : ['#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'],
      focus: statusFilter === 'delayed' ? 'focus:ring-rose-500/20' : statusFilter === 'ontime' ? 'focus:ring-emerald-500/20' : 'focus:ring-blue-500/20',
      dot: statusFilter === 'delayed' ? 'bg-rose-600' : statusFilter === 'ontime' ? 'bg-emerald-600' : 'bg-blue-600'
    };

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className={`${theme.header} text-white p-6 pb-12 flex items-center justify-between transition-colors duration-500`}>
          <div className="flex items-center gap-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">Thống kê theo thủ tục</h1>
              <p className={`${theme.subline} text-[10px] font-bold tracking-widest uppercase leading-tight`}>
                {statusFilter === 'delayed' ? 'KH bị chậm tiến độ' : statusFilter === 'ontime' ? 'CQNN đang xử lý' : 'Tất cả thủ tục'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm theo tên thủ tục..." 
              value={stepSearchTerm}
              onChange={(e) => setStepSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 ${theme.focus} transition-all font-bold`}
            />
          </div>

          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-6 min-h-[400px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => {
                      const step = data.payload || data;
                      setSelectedParentStep(step.originalName);
                      setFilterParentStep(step.originalName);
                      setSelectedChildStep(null);
                      setStatusFilter(statusFilter);
                      navigateTo('projects');
                    }}
                    className="cursor-pointer outline-none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={theme.palette[index % theme.palette.length]} />
                    ))}
                    <Label 
                      content={({ viewBox }) => {
                        const { cx, cy } = viewBox as any;
                        return (
                          <g>
                            <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" className={`${theme.chartText} text-3xl font-black`}>
                              {chartData.length}
                            </text>
                            <text x={cx} y={cy + 20} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[10px] font-black uppercase tracking-widest leading-none">
                              {statusFilter === 'all' ? 'Thủ tục' : statusFilter === 'delayed' ? 'KH bị chậm' : 'Đang xử lý'}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[200px]">
                            <p className="text-xs font-black text-slate-800 mb-2">{data.originalName}</p>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Số lượng dự án</span>
                                <span className={`text-sm font-black ${statusFilter === 'delayed' ? 'text-rose-600' : statusFilter === 'ontime' ? 'text-emerald-600' : 'text-blue-600'}`}>
                                  {data.count}
                                </span>
                              </div>
                              {statusFilter === 'all' && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-[10px] font-bold text-rose-500 uppercase">KH bị chậm</span>
                                  <span className="text-sm font-black text-rose-600">{data.delayed}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center text-slate-400 gap-2">
                <Search size={48} className="opacity-20" />
                <p className="text-sm font-bold">Không có dữ liệu phù hợp</p>
              </div>
            )}

            {/* Summary Bar for Procedures */}
            <div className={`mt-2 mb-4 p-3 rounded-2xl border ${statusFilter === 'delayed' ? 'bg-rose-50 border-rose-100' : statusFilter === 'ontime' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'} flex items-center justify-between`}>
              <span className={`text-xs font-black uppercase tracking-widest ${statusFilter === 'delayed' ? 'text-rose-700' : statusFilter === 'ontime' ? 'text-emerald-700' : 'text-blue-700'}`}>
                Danh sách thủ tục
              </span>
              <div className={`px-3 py-1 rounded-full font-black text-xs ${statusFilter === 'delayed' ? 'bg-rose-600' : statusFilter === 'ontime' ? 'bg-emerald-600' : 'bg-blue-600'} text-white shadow-sm`}>
                {chartData.length} {statusFilter === 'delayed' ? 'Thủ tục quá hạn' : statusFilter === 'ontime' ? 'Thủ tục còn hạn' : 'Thủ tục'}
              </div>
            </div>

            {/* List for StepStats */}
            <div className="mt-4 space-y-2">
              {chartData.map((step, index) => (
                <button
                  key={step.originalName}
                  onClick={() => {
                    setSelectedParentStep(step.originalName);
                    setFilterParentStep(step.originalName);
                    setSelectedChildStep(null);
                    setStatusFilter(statusFilter);
                    navigateTo('projects');
                  }}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.palette[index % theme.palette.length] }}></div>
                    <span className="text-sm font-bold text-slate-700 text-left">{step.originalName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className={`text-lg font-black ${statusFilter === 'delayed' ? 'text-rose-700' : statusFilter === 'ontime' ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {step.count}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">dự án</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ChildStepsStats = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">{selectedParentStep}</h1>
            <p className="text-blue-100/60 text-xs font-bold tracking-widest uppercase">Thống kê bước con</p>
          </div>
        </div>
      </div>

      <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto">
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm theo tên bước con..." 
            value={stepSearchTerm}
            onChange={(e) => setStepSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {selectedParentStep && getChildStepStats(selectedParentStep).map((step) => (
            <div
              key={step.name}
              onClick={() => {
                setSelectedChildStep(step.name);
                setStatusFilter(statusFilter);
                navigateTo('projects');
              }}
              className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col gap-0.5 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-left">
                  <p className="text-sm sm:text-base font-bold text-slate-800 leading-tight line-clamp-2">{step.name}</p>
                  {statusFilter === 'all' && (
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-none mt-1">
                      Tổng số {step.total}
                    </p>
                  )}
                </div>
                {statusFilter !== 'all' && (
                  <div className="flex-shrink-0">
                    <span className={`text-2xl sm:text-3xl font-black leading-none ${statusFilter === 'delayed' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {step.count}
                    </span>
                  </div>
                )}
              </div>
              
              {statusFilter === 'all' && (
                <div className="flex justify-between items-end mt-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChildStep(step.name);
                      setStatusFilter('delayed');
                      navigateTo('projects');
                    }}
                    className="hover:scale-110 transition-transform"
                  >
                    <span className="text-2xl sm:text-3xl font-black text-rose-600 leading-none">{step.delayed}</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChildStep(step.name);
                      setStatusFilter('ontime');
                      navigateTo('projects');
                    }}
                    className="hover:scale-110 transition-transform"
                  >
                    <span className="text-2xl sm:text-3xl font-black text-emerald-600 leading-none">{step.ontime}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ProjectList = () => {
    const [localSearch, setLocalSearch] = useState('');

      const filteredProjects = globalFilteredProjects.filter(p => {
        let matches = true;
        if (selectedChildStep) {
          matches = p.currentStep === selectedChildStep;
        } else if (selectedDept) {
          const agencyName = getProjectActiveAgency(p);
          const matchesAgency = selectedAgency?.name === 'UBND cấp xã, phường'
            ? (agencyName.includes('xã') || agencyName.includes('phường') || agencyName.includes('Phường') || agencyName.includes('Xã') || agencyName === 'UBND cấp xã, phường')
            : agencyName === selectedAgency?.name;
          const projectDept = getStepDepartment(p);
          matches = matchesAgency && (projectDept === selectedDept.name || p.currentDepartment === selectedDept.name || p.location.includes(selectedDept.name));
        } else if (selectedAgency) {
          const pAgency = getProjectActiveAgency(p);
          if (selectedAgency.id === 'no-investor-stat') {
            matches = p.investor === 'Chưa có chủ đầu tư';
          } else if (selectedAgency.id === 'investor-stat') {
            matches = p.investor && p.investor.trim() !== '' && p.investor !== 'Chưa có chủ đầu tư';
          } else if (selectedAgency.name === 'UBND cấp xã, phường') {
            matches = pAgency.includes('xã') || pAgency.includes('phường') || pAgency.includes('Phường') || pAgency.includes('Xã') || pAgency === 'UBND cấp xã, phường';
          } else {
            matches = pAgency === selectedAgency?.name;
          }
        }
        
        if (statusFilter === 'delayed') matches = matches && getProjectStatus(p) === 'delayed';
        if (statusFilter === 'ontime') matches = matches && getProjectStatus(p) === 'ontime';
        
        if (localSearch) {
        matches = matches && textMatches(localSearch, p.name, p.investor);
      }

      return matches;
    });
    
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">
                {statusFilter === 'delayed' ? 'KH bị chậm' : statusFilter === 'ontime' ? 'CQNN đang xử lý' : 'Danh sách dự án'}
              </h1>
              <p className="text-blue-100/60 text-xs font-bold tracking-widest uppercase">
                {selectedDept?.name || selectedAgency?.name || filterParentStep || 'Tất cả dự án'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-white text-blue-600' : 'bg-white/10 text-white'}`}
          >
            <Filter size={24} />
          </button>
        </div>

        <StableView render={() => FilterPanel({})} />

        <div className="bg-white px-6 py-4 border-b border-slate-100">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Tìm kiếm theo tên dự án, chủ đầu tư..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto pb-24">
          <div className="space-y-4">
            {filteredProjects.length > 0 ? filteredProjects.map((p) => {
              const info = getProjectExtendedInfo(p);
              return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleProjectClick(p)}
                  className="w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 text-left"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-base font-black text-slate-800 line-clamp-2 leading-tight flex-1">{p.name}</p>
                    {info.status === 'delayed' ? (
                      <AlertCircle size={20} className="text-rose-500 ml-2 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 size={20} className="text-emerald-500 ml-2 flex-shrink-0" />
                    )}
                  </div>
                  
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">{p.investor}</p>
                  
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                    <span className="text-blue-600">{info.activePhase.name}</span>
                    <span className="text-slate-300">•</span>
                    <span>{info.agencyName}</span>
                    <span className="text-slate-300">•</span>
                    <span className={`font-bold ${info.status === 'delayed' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatDate(info.planNnStr || p.deadline)}
                    </span>
                  </div>
                </motion.button>
              );
            }) : (
              <div className="text-center py-12 text-slate-400 italic text-sm">
                Không có dự án nào đang xử lý tại đây...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const SearchResults = () => {
    const filteredProjects = globalFilteredProjects.filter(p => {
      let matches = textMatches(searchQuery, p.name, p.code, p.investor);
      
      return matches;
    });
    
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">KẾT QUẢ TÌM KIẾM</h1>
              <p className="text-blue-100/60 text-xs font-bold tracking-widest uppercase">"{searchQuery}"</p>
            </div>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-white text-blue-600' : 'bg-white/10 text-white'}`}
          >
            <Filter size={24} />
          </button>
        </div>

        <div className="bg-white px-6 py-4 border-b border-slate-100">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              defaultValue={searchQuery}
              placeholder="Tìm kiếm dự án khác..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch((e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>
        </div>

        <StableView render={() => FilterPanel({})} />

        <div className="flex-1 -mt-8 bg-white rounded-t-[32px] p-6 shadow-2xl overflow-y-auto pb-24">
          <div className="space-y-4">
            {filteredProjects.length > 0 ? filteredProjects.map((p) => {
              const info = getProjectExtendedInfo(p);
              return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleProjectClick(p)}
                  className="w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 text-left"
                >
                <div className="flex justify-between items-start">
                   <p className="text-base font-black text-slate-800 line-clamp-2 leading-tight flex-1">{p.name}</p>
                   {getProjectStatus(p) === 'delayed' ? (
                     <AlertCircle size={20} className="text-rose-500 ml-2 flex-shrink-0" />
                   ) : (
                     <CheckCircle2 size={20} className="text-emerald-500 ml-2 flex-shrink-0" />
                   )}
                </div>
                
                <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">{p.investor}</p>
                
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                   <span className="text-blue-600">{info.activePhase.name}</span>
                   <span className="text-slate-300">•</span>
                   <span>{info.agencyName}</span>
                   <span className="text-slate-300">•</span>
                   <span className={`font-bold ${info.status === 'delayed' ? 'text-rose-600' : 'text-emerald-600'}`}>
                     {formatDate(info.planNnStr || p.deadline)}
                   </span>
                </div>
              </motion.button>
            );
          }) : (
            <div className="text-center py-12 text-slate-400 italic text-sm">
              Không tìm thấy dự án nào phù hợp...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

  const ProjectDetail = () => {
    if (!selectedProject) return null;

    interface AttachmentItem {
      id?: number | string;
      name: string;
      size?: string;
      fileType?: string;
      createdAt?: string;
    }

    interface ActualProgress {
      cdtDate: string;
      cdtNote?: string;
      cdtAttachments?: AttachmentItem[];
      nnDate: string;
      nnNote?: string;
      nnAttachments?: AttachmentItem[];
    }

    // Milestone view of the project (server) and the plan of its current step
    const projectMilestones = milestoneListOf(selectedProject);
    const { activePhase } = computeProjectActivePhase(selectedProject);
    const currentPlans = (selectedProject as any).milestones?.[(selectedProject as any).currentStepId] || {};
    const activePlanCdt = currentPlans.investor || null;
    const activePlanNn = currentPlans.agency || null;
    const completedMilestones = projectMilestones.filter(m => m.nnActual || m.nnPlan === 'X').length;


    // State for Postgres db history logs
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const fetchHistoryLogs = async () => {
      if (!selectedProject?.id) return;
      setIsLoadingHistory(true);
      try {
        const res = await apiFetch(`/api/projects/${selectedProject.id}/history`);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            console.warn('Received HTML response instead of JSON. Skipping history fetch.');
            setHistoryLogs([]);
            return;
          }
          const data = await res.json();
          setHistoryLogs(data);
        } else {
          setHistoryLogs([]);
        }
      } catch (err) {
        console.error('Error fetching dashboard history:', err);
        setHistoryLogs([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    useEffect(() => {
      fetchHistoryLogs();
    }, [selectedProject?.id]);


    // Step and agency of the project's current process step (server, src/lib/stepProgress); the milestone
    // the project is at when no step can be told
    const resolvedStepAgency = resolveProjectStepAgency(selectedProject, processes);
    const currentStepDisplay = resolvedStepAgency
      ? selectedProject.currentStep
      : (activePhase.name || selectedProject.parentStep || '—');
    const agencyDisplay = resolvedStepAgency
      ? getAgencyWithDepartment(getProjectActiveAgency(selectedProject), getStepDepartment(selectedProject), selectedProject.currentStep)
      : (activePhase.agency || selectedProject.currentAgency || '—');

    return (
      <div className="flex flex-col h-full bg-slate-50 relative pb-24 overflow-y-auto">
        {/* Header Section */}
        <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center gap-4 shrink-0">
          <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
               <span className="px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded uppercase tracking-widest">{selectedProject.code}</span>
            </div>
            <h1 className="text-xl font-black tracking-tight leading-tight uppercase">CHI TIẾT DỰ ÁN GANTT</h1>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 -mt-8 bg-slate-50 rounded-t-[32px] p-4 sm:p-6 shadow-2xl space-y-6">
          {/* Summary Info Card */}
          <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedProject.name}</h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-bold">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-rose-500" />
                    <span>{selectedProject.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 size={14} className="text-blue-500" />
                    <span>{selectedProject.investor}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                    <FileText size={14} className="text-emerald-500" />
                    <span className="uppercase tracking-wider">{selectedProject.projectCategory || 'Chưa phân loại'}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 self-start lg:self-center">
                {[
                  { label: 'Căn hộ', value: selectedProject.apartmentCount || '0', color: 'blue' },
                  { label: 'Tầng cao', value: selectedProject.height || '0', color: 'purple' },
                  { label: 'Mốc xong', value: `${completedMilestones}/${projectMilestones.length}`, color: 'emerald' },
                ].map((stat, idx) => (
                  <div key={idx} className={`px-3 py-2 bg-${stat.color}-50 border border-${stat.color}-100 rounded-2xl text-center min-w-[70px] sm:min-w-[90px]`}>
                    <p className="text-[8px] font-black text-slate-400 uppercase">{stat.label}</p>
                    <p className={`text-sm font-black text-${stat.color}-600`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                 <div className="flex items-center gap-2 text-slate-600">
                   <div className="w-3.5 h-3.5 bg-emerald-500 rounded-lg" />
                   <span>Hoàn thành</span>
                 </div>
                 <div className="flex items-center gap-2 text-slate-600">
                   <div className="w-3.5 h-3.5 bg-amber-400 rounded-lg" />
                   <span>Đang thực hiện</span>
                 </div>
                 <div className="flex items-center gap-2 text-slate-600">
                   <div className="w-3.5 h-3.5 bg-blue-600 rounded-lg" />
                   <span>Đúng hạn</span>
                 </div>
                 <div className="flex items-center gap-2 text-slate-600">
                   <div className="w-3.5 h-3.5 bg-rose-500 rounded-lg" />
                   <span>Quá hạn</span>
                 </div>
                 <div className="flex items-center gap-2 text-slate-600">
                   <div className="w-3.5 h-3.5 bg-slate-200 rounded-lg" />
                   <span>Chưa bắt đầu</span>
                 </div>
              </div>
            </div>
          </div>

          {/* Current Step Status Card */}
          <div className="bg-blue-600 rounded-[28px] p-6 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 opacity-80">Bước hiện tại</p>
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-white/20 rounded-xl shrink-0 mt-0.5">
                     <Circle size={18} className="fill-white" />
                   </div>
                   <p className="text-sm font-bold leading-tight">{currentStepDisplay}</p>
                </div>
              </div>

              <div className="lg:col-span-1">
                <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 opacity-80">Cơ quan xử lý</p>
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-white/20 rounded-xl shrink-0 mt-0.5">
                     <Building2 size={18} />
                   </div>
                   <p className="text-sm font-bold leading-tight">{agencyDisplay}</p>
                </div>
              </div>

              <div className="lg:col-span-1">
                <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 opacity-80">Thời hạn CĐT</p>
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-white/20 rounded-xl shrink-0 mt-0.5">
                     <User size={18} />
                   </div>
                   <div>
                     <p className="text-sm font-bold leading-tight">{activePlanCdt ? formatDate(activePlanCdt) : formatDate(selectedProject.stepDeadline || selectedProject.deadline)}</p>
                     <p className="text-[9px] font-bold text-blue-100 mt-1 opacity-60">{activePlanCdt ? 'HXL chủ đầu tư – bước hiện tại' : 'Dự kiến hoàn thành'}</p>
                   </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 opacity-80">Thời hạn Cơ quan NN</p>
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-white/20 rounded-xl shrink-0 mt-0.5">
                     <Building2 size={18} />
                   </div>
                   <div>
                     <p className="text-sm font-bold leading-tight">{activePlanNn ? formatDate(activePlanNn) : formatDate(selectedProject.deadline)}</p>
                     <p className="text-[9px] font-bold text-blue-100 mt-1 opacity-60">{activePlanNn ? 'HXL cơ quan – bước hiện tại' : 'Dự kiến phê duyệt'}</p>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Gantt by milestone (Cấu hình Giai đoạn & Mốc Milestone), same board as Sơ đồ Gantt → chi tiết */}
          <MilestoneGanttBoard
            project={selectedProject}
            currentUser={currentUser}
            milestones={milestoneProgress?.[selectedProject.id] || {}}
            projectStages={projectStagesRaw}
            processes={processes}
            processingAgencies={processingAgencies}
            onSubmitMilestone={onSubmitMilestone}
          />

          {/* History Section - Preserved logic */}
          <section className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm mt-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
              <History size={16} className="text-blue-600" />
              Lịch sử xử lý dự án
            </h3>
            <div className="space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
               {/* Current processing step */}
               <div className="relative pl-10">
                  <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-blue-100 border-4 border-white shadow-sm flex items-center justify-center z-10 scale-110">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer group">
                    <div className="flex items-center justify-between gap-4">
                       <div>
                          <p className="text-sm font-black text-slate-800 leading-tight group-hover:text-blue-700">{currentStepDisplay}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">
                            {agencyDisplay}
                          </p>
                       </div>
                       <div className="text-right shrink-0">
                          <span className="text-[9px] font-black text-blue-600 bg-white px-2 py-0.5 rounded-lg border border-blue-200 uppercase tracking-widest">Đang xử lý</span>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">{activePlanNn ? formatDate(activePlanNn) : formatDate(selectedProject.stepDeadline || selectedProject.deadline)}</p>
                       </div>
                    </div>
                  </div>
               </div>

               {/* Database status update logs */}
               {isLoadingHistory ? (
                 <div className="flex items-center justify-center py-8">
                   <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                 </div>
               ) : historyLogs.length === 0 ? null : (
                 historyLogs.map((log, index) => (
                   <div key={log.id || index} className="relative pl-10 opacity-80 hover:opacity-100 transition-opacity">
                     <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-emerald-100 border-4 border-white shadow-sm flex items-center justify-center z-10 transition-transform hover:scale-110">
                       <CheckCircle2 size={16} className="text-emerald-600" />
                     </div>
                     <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 transition-all">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2">
                           <div className="flex-1">
                              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                                {log.userName || 'Người dùng'} <span className="text-slate-400 lowercase italic font-normal">đã cập nhật</span>
                              </p>
                              <p className="text-sm font-semibold text-slate-700 leading-relaxed italic">{normalizeDatesInText(log.description)}</p>
                           </div>
                           <div className="text-right shrink-0">
                              <p className="text-[10px] font-bold text-slate-400 font-mono">
                                {log.createdAt ? (
                                  toDisplayDateTime(log.createdAt)
                                ) : 'Chưa rõ thời gian'}
                              </p>
                           </div>
                        </div>
                     </div>
                   </div>
                 ))
               )}
            </div>
          </section>
        </div>

      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-full text-slate-400">Đang tải dữ liệu...</div>;

  return (
    <div className="h-full w-full max-w-7xl mx-auto bg-slate-100 shadow-2xl overflow-hidden relative sm:border-x border-slate-200">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {view === 'overview' && <StableView key="Overview" render={Overview} />}
          {view === 'agencies' && <StableView key="AgenciesStats" render={AgenciesStats} />}
          {view === 'steps' && <StableView key="StepsStats" render={StepsStats} />}
          {view === 'child-steps' && <StableView key="ChildStepsStats" render={ChildStepsStats} />}
          {view === 'search-results' && <StableView key="SearchResults" render={SearchResults} />}
          {view === 'departments' && <StableView key="DepartmentStats" render={DepartmentStats} />}
          {view === 'projects' && <StableView key="ProjectList" render={ProjectList} />}
          {view === 'detail' && <StableView key="ProjectDetail" render={ProjectDetail} />}
        </motion.div>
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 z-30">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <button 
            onClick={goToOverview}
            className={`flex flex-col items-center gap-1 ${view === 'overview' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <LayoutDashboard size={24} />
            <span className="text-xs font-bold">Trang chủ</span>
          </button>
          <button 
            onClick={() => {
              if (view !== 'search-results') {
                setSearchQuery('');
                navigateTo('search-results');
              }
            }}
            className={`flex flex-col items-center gap-1 ${view === 'search-results' ? 'text-blue-600' : 'text-slate-400'}`}
          >
            <Search size={24} />
            <span className="text-xs font-bold">Tìm kiếm</span>
          </button>
          {/* No notification feature exists yet, so the bar has no "Thông báo" tab */}
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="flex flex-col items-center gap-1 text-slate-400 hover:text-blue-600"
            >
              <User size={24} />
              <span className="text-xs font-bold">Cá nhân</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
