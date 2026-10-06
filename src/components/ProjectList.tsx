import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Filter, ChevronRight, MapPin, 
  Building2, Calendar, Clock, AlertCircle, Plus,
  Pencil, Trash2, ChevronLeft, Download, GitBranch, ChevronDown,
  CheckCircle2, Check, X, AlertTriangle, RotateCw, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

import { Agency } from './AgencyManagement';
import { Process } from './StepManagementView';
import { SearchableSelect } from './SearchableSelect';
import { getAgencyWithDepartment, formatDate, formatShortDate, isDateOverdue } from '../lib/projectUtils';
import { isProjectOverdue } from '../lib/phaseLogic';
import { matchesSearch as textMatches, normalizeSearchText } from '../lib/textSearch';
import { csvRow } from '../lib/csv';
import { UserAccount } from '../types';


// sessionStorage key for the remembered search / filters / page of the project list
const LIST_VIEW_KEY = 'noxh.projectList.view';

interface ProjectListProps {
  projects?: any[];
  onProjectClick?: (project: any) => void;
  onEditClick?: (project: any) => void;
  onDeleteClick?: (project: any) => void;
  onUpdateProgressClick?: (project: any) => void;
  onHousingUpdateClick?: (project: any, stepId?: string, subStepId?: string) => void;
  onUpdatePlanClick?: (project: any) => void;
  onCreateClick?: () => void;
  filter?: any;
  key?: React.Key;
  projectStages?: string[];
  processingAgencies?: Agency[];
  locations?: { ward: string, oldArea: string }[];
  // Actual progress by project id – used for the shared "quá hạn" rule
  actualProgress?: Record<string, any>;
  processes?: Process[];
  projectGroups?: string[];
  fundingSources?: string[];
  followers?: string[];
  investors?: string[];
  projectCategories?: string[];
  currentUser?: UserAccount | null;
  // Decided by App (same rule as the server); when absent every visible project counts as editable
  canEditProject?: (project: any) => boolean;
}

export default function ProjectList({ 
  projects: initialProjects = [],
  onProjectClick, 
  onEditClick, 
  onDeleteClick, 
  onUpdateProgressClick,
  onHousingUpdateClick,
  onUpdatePlanClick,
  onCreateClick, 
  filter,
  projectStages = [],
  processingAgencies = [],
  locations = [],
  actualProgress = {},
  processes = [],
  projectGroups = [],
  fundingSources = [],
  followers = [],
  investors = [],
  projectCategories = [],
  currentUser,
  canEditProject: canEditProjectProp
}: ProjectListProps) {
  // Search, filters and page survive leaving the list (Cập nhật → Quay lại) for this browser tab.
  // A filter passed in by the caller (dashboard drill-down) always wins over the saved view.
  const savedView = useRef<Record<string, any> | null>(
    filter ? null : (() => {
      try { return JSON.parse(sessionStorage.getItem(LIST_VIEW_KEY) || 'null'); } catch { return null; }
    })()
  ).current || {};
  const sv = (key: string) => (typeof savedView[key] === 'string' ? savedView[key] : '');

  const [projects, setProjects] = useState<any[]>(initialProjects);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(sv('searchTerm'));

  const isSxdOrAdmin = Boolean(
    currentUser &&
    (currentUser.roleId === 'Admin' ||
     currentUser.roleId?.toLowerCase() === 'admin' ||
     (currentUser.userType === 'agency' && currentUser.agencyId === '1'))
  );

  const canDeleteProject = (_p: any) => {
    return isSxdOrAdmin;
  };

  const canEditProject = (p: any) => {
    if (isSxdOrAdmin) return true;
    if (canEditProjectProp && !canEditProjectProp(p)) return false;
    if (!currentUser) return false;
    if (currentUser.userType === 'investor') {
      return p.investor === currentUser.investorId;
    }
    if (currentUser.userType === 'agency') {
      return true;
    }
    return false;
  };
  const [currentPage, setCurrentPage] = useState<number>(Number(savedView.currentPage) > 0 ? Number(savedView.currentPage) : 1);
  const itemsPerPage = 10;

  // New filters
  const [processFilter, setProcessFilter] = useState(sv('processFilter'));
  const [groupFilter, setGroupFilter] = useState(sv('groupFilter'));
  const [fundingFilter, setFundingFilter] = useState(sv('fundingFilter'));
  const [locationFilter, setLocationFilter] = useState(sv('locationFilter'));
  const [followerFilter, setFollowerFilter] = useState(sv('followerFilter'));
  const [investorFilter, setInvestorFilter] = useState(sv('investorFilter'));
  const [stageFilter, setStageFilter] = useState(sv('stageFilter'));
  const [stepFilter, setStepFilter] = useState(sv('stepFilter'));
  const [statusFilter, setStatusFilter] = useState(sv('statusFilter'));
  const [categoryFilter, setCategoryFilter] = useState(sv('categoryFilter'));
  const [showAllFilters, setShowAllFilters] = useState(false);

  // Any change of search or filter starts again from page 1 (otherwise page 3 of 1 page shows "no results").
  // Skipped on mount so a restored page is kept.
  const pageResetMountedRef = useRef(false);
  useEffect(() => {
    if (!pageResetMountedRef.current) { pageResetMountedRef.current = true; return; }
    setCurrentPage(1);
  }, [searchTerm, processFilter, groupFilter, fundingFilter, locationFilter, followerFilter, investorFilter, stageFilter, stepFilter, statusFilter, categoryFilter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LIST_VIEW_KEY, JSON.stringify({
        searchTerm, processFilter, groupFilter, fundingFilter, locationFilter, followerFilter,
        investorFilter, stageFilter, stepFilter, statusFilter, categoryFilter, currentPage
      }));
    } catch { /* storage unavailable: the view simply is not remembered */ }
  }, [searchTerm, processFilter, groupFilter, fundingFilter, locationFilter, followerFilter, investorFilter, stageFilter, stepFilter, statusFilter, categoryFilter, currentPage]);

  // Refreshed data (after a save) must not wipe the user's search and filters
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // A new filter from the caller replaces the current view; on mount without one, keep the restored view
  const filterMountedRef = useRef(false);
  useEffect(() => {
    const isMount = !filterMountedRef.current;
    filterMountedRef.current = true;
    if (isMount && !filter) return;

    // Reset filters
    setSearchTerm('');
    setProcessFilter('');
    setGroupFilter('');
    setFundingFilter('');
    setLocationFilter('');
    setFollowerFilter('');
    setInvestorFilter('');
    setStageFilter('');
    setStepFilter('');
    setStatusFilter('');
    setCategoryFilter('');

    if (filter) {
      if (filter.searchTerm) setSearchTerm(filter.searchTerm);
      if (filter.status) setStatusFilter(filter.status);
      if (filter.step) setStepFilter(filter.step);
      if (filter.region) setLocationFilter(filter.region);
      if (filter.investor) setInvestorFilter(filter.investor);
      if (filter.stage) setStageFilter(filter.stage);
      if (filter.alert) setStatusFilter(filter.alert === 'Delayed' ? 'Delayed' : filter.alert);
      if (filter.id) setSearchTerm(filter.id);
    }
  }, [filter]);


  const filteredProjects = projects.filter(p => {
    // Accent-insensitive ("Thu Duc" finds "Thủ Đức") and safe for empty fields
    const searchMatch = searchTerm === '' ||
      textMatches(searchTerm, p.name, p.code, p.investor, p.location) ||
      p.id === searchTerm;
    
    const processMatch = processFilter === '' || p.processId === processFilter;
    const groupMatch = groupFilter === '' || p.projectGroup === groupFilter;
    const fundingMatch = fundingFilter === '' || p.fundingSource === fundingFilter;
    const locationMatch = locationFilter === '' || (p.location && p.location.includes(locationFilter));
    const followerMatch = followerFilter === '' || p.follower === followerFilter;
    const investorMatch = investorFilter === '' || p.investor === investorFilter;
    const stageMatch = stageFilter === '' || p.stage === stageFilter;
    const stepMatch = stepFilter === '' || p.childStep === stepFilter || p.currentStep === stepFilter;
    // "Trễ hạn" uses the same rule as the dashboards (src/lib/phaseLogic), not the stored status
    const statusMatch = statusFilter === ''
      || (statusFilter === 'Delayed' ? isProjectOverdue(p, actualProgress[p.id]) : p.status === statusFilter);
    const categoryMatch = !categoryFilter || p.projectCategory === categoryFilter;

    return searchMatch && processMatch && groupMatch && fundingMatch && locationMatch && followerMatch && investorMatch && stageMatch && stepMatch && statusMatch && categoryMatch;
  });

  const getStepDateKey = (stepName: string, parentName: string = "", isInvestor: boolean = false) => {
    const lowerStep = stepName?.toLowerCase() || "";
    const lowerParent = parentName?.toLowerCase() || "";
    const combined = (lowerStep + " " + lowerParent).toLowerCase();
    
    const suffix = isInvestor ? "_cdt_date" : "_nn_date";
    
    if (combined.includes("chủ trương")) return "chutruong" + suffix;
    if (combined.includes("quy hoạch")) return "qh1500" + suffix;
    if (combined.includes("giao đất") || combined.includes("thuê đất") || combined.includes("qd giao đất")) return "qdgiaodat" + suffix;
    if (combined.includes("bc nckt") || combined.includes("nghiên cứu khả thi") || combined.includes("thẩm duyệt bc nckt")) return "baocaonckt" + suffix;
    if (combined.includes("pccc")) return "pccc" + suffix;
    if (combined.includes("hạ tầng kỹ thuật") || combined.includes("htkt")) return "htkt_dtm" + suffix;
    if (combined.includes("giấy phép xây dựng") || combined.includes("gpxd")) return "gpxaydung" + suffix;
    
    // Fallback for public investment specific steps if they don't have their own keys
    if (combined.includes("nhiệm vụ chuẩn bị đầu tư")) return "chutruong" + suffix;
    
    return null;
  };

  const getProjectStatusDetails = (p: any) => {
    const process = processes.find(proc => proc.id === p.processId);
    if (!process) return [];

    const allSteps: any[] = [];
    process.parentSteps.forEach(ps => {
      ps.childSteps.forEach(cs => {
        // Try to get data from structured milestone/plan first
        const m = p.milestones?.[cs.id];
        const plan = p.implementationPlan?.[cs.id];
        
        let invDeadline = m?.investor;
        let agyDeadline = m?.agency;
        let actual = plan?.agencyActualDate;

        // Fallback to flat props from appData.ts / DashboardApp pattern
        if (!invDeadline) {
          const invKey = getStepDateKey(cs.name, ps.name, true);
          if (invKey && p[invKey]) invDeadline = p[invKey];
        }
        if (!agyDeadline) {
          const agyKey = getStepDateKey(cs.name, ps.name, false);
          if (agyKey && p[agyKey]) agyDeadline = p[agyKey];
        }

        // If deadline is 'X' in initial data, it might mean it's already done
        if ((invDeadline === 'X' || agyDeadline === 'X') && !actual) {
          actual = 'X';
        }

        allSteps.push({ 
          id: cs.id, 
          parentId: ps.id,
          name: cs.name, 
          agency: cs.agency, 
          department: cs.department,
          parentName: ps.name,
          stage: ps.stage,
          investorDeadline: invDeadline,
          agencyDeadline: agyDeadline,
          actualDate: actual
        });
      });
    });

    // Priority 1: Match the currentStep name or childStep name from project data
    const currentStepInProcess = allSteps.find(s => 
      s.name === p.currentStep || s.name === p.childStep
    );
    if (currentStepInProcess) {
      return [currentStepInProcess];
    }

    // Priority 2: Fuzzy match - check if currentStep and process step share similar starting words
    const fuzzyMatch = allSteps.find(s => {
      if (!p.currentStep && !p.childStep) return false;
      const sName = s.name.toLowerCase();
      const pCurrent = p.currentStep?.toLowerCase() || "";
      const pChild = p.childStep?.toLowerCase() || "";
      
      // Check if one contains the other
      if (sName.includes(pCurrent) || pCurrent.includes(sName)) return true;
      if (sName.includes(pChild) || pChild.includes(sName)) return true;
      
      // Check if they start with the same verb (e.g. "Thẩm định")
      const sWords = sName.split(' ').filter(w => w.length > 2);
      const pWords = pCurrent.split(' ').filter(w => w.length > 2);
      if (sWords[0] === pWords[0] && sWords[0] !== undefined) return true;
      
      return false;
    });
    if (fuzzyMatch) {
      return [fuzzyMatch];
    }

    // Priority 3: Find the first step that is not completed and has a deadline
    const firstIncompleteWithDeadline = allSteps.find(s => 
      (!s.actualDate || s.actualDate === '-' || s.actualDate === '') && 
      (s.agencyDeadline && s.agencyDeadline !== 'X' && s.agencyDeadline !== '-')
    );
    if (firstIncompleteWithDeadline) {
      return [firstIncompleteWithDeadline];
    }

    // Priority 4: Find the first step that is not completed
    const firstIncomplete = allSteps.find(s => !s.actualDate || s.actualDate === '-' || s.actualDate === '');
    if (firstIncomplete) {
      return [firstIncomplete];
    }
    
    // Priority 5: Return the last step if all are completed
    if (allSteps.length > 0) {
      return [allSteps[allSteps.length - 1]];
    }

    return [];
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Delayed') {
      return (
        <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 shrink-0 shadow-sm">
          <X className="w-4.5 h-4.5" strokeWidth={3} />
        </div>
      );
    }
    if (status === 'Warning') {
      return (
        <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
          <AlertTriangle className="w-4.5 h-4.5" strokeWidth={3} />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-500 shrink-0 shadow-sm">
        <Check className="w-4.5 h-4.5" strokeWidth={3} />
      </div>
    );
  };

  const getBadgeStyle = (stepName: string) => {
    return 'bg-amber-50 text-amber-700 border border-amber-100/80';
  };

  const isDelayed = (deadline: string, actual: string) => {
    return isDateOverdue(deadline, actual);
  };

  const isCompleted = (actual: string) => !!actual;

  const getStatusColorClass = (deadline: string, actual: string) => {
    if (isCompleted(actual)) return 'text-emerald-600 font-bold';
    if (isDelayed(deadline, actual)) return 'text-rose-600 font-bold';
    return 'text-slate-600';
  };

  const exportToCSV = () => {
    const headers = ['Mã dự án', 'Tên dự án', 'Địa điểm', 'Tên chủ đầu tư', 'Tên thủ tục hiện tại', 'Tên bước hiện tại', 'Tên cơ quan NN xử lý', 'Hạn XL'];
    const dataRows = filteredProjects.map(p => {
      const statusDetails = getProjectStatusDetails(p);
      const step = statusDetails[0];
      
      return [
        p.code, 
        p.name, 
        p.location, 
        p.investor, 
        step ? step.parentName : '-',
        step ? step.name : '-',
        step ? getAgencyWithDepartment(step.agency, step.department, step.name) : '-',
        step ? formatDate(step.agencyDeadline) : '-'
      ];
    });
    
    const csvContent = [
      csvRow(headers),
      ...dataRows.map(csvRow)
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DanhSachDuAn_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải dữ liệu...</div>;

  const processOptions = processes.map(p => ({ value: p.id, label: p.name }));
  const groupOptions = projectGroups.map(g => ({ value: g, label: g }));
  const fundingOptions = fundingSources.map(f => ({ value: f, label: f }));
  
  const locationOptions = processingAgencies.flatMap(agency => {
    const opts = [{ value: agency.name, label: agency.name, group: agency.name }];
    if (agency.departments) {
      agency.departments.forEach(dept => {
        opts.push({ value: dept, label: dept, group: agency.name });
      });
    }
    return opts;
  });

  const categoryOptions = projectCategories.map(pc => ({ value: pc, label: pc }));
  const followerOptions = followers.map(f => ({ value: f, label: f }));
  const investorOptions = investors.map(i => ({ value: i, label: i }));
  const stageOptions = projectStages.map(s => ({ value: s, label: s }));

  const stepOptions = Array.from(new Set(
    processes.flatMap(p => p.parentSteps.flatMap(ps => ps.childSteps.map(cs => cs.name)))
  )).filter(Boolean).sort().map(s => ({ value: s, label: s }));

  const statusOptions = [
    { value: 'On Track', label: 'Đúng tiến độ' },
    { value: 'Delayed', label: 'Trễ hạn' },
    { value: 'Warning', label: 'Cảnh báo' }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Danh sách Dự án NOXH
          </h2>
          <p className="text-slate-500 text-sm mt-1">Quản lý và theo dõi thông tin chi tiết danh sách dự án nhà ở xã hội trên địa bàn.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button 
            onClick={exportToCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
          >
            <Download size={16} /> Xuất báo cáo
          </button>
          {onCreateClick && isSxdOrAdmin && (
            <button 
              onClick={onCreateClick}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition-all cursor-pointer"
            >
              <Plus size={16} /> Khởi tạo Dự án
            </button>
          )}
        </div>
      </div>

      {/* Filters Box Wrapper */}
      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 shadow-none w-full space-y-2">
        {/* Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-center w-full">
          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm kiếm dự án..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-9 pr-3 py-2 bg-slate-50/10 border border-slate-200/80 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-400 transition-all text-slate-700 placeholder:text-slate-400" 
              />
            </div>
          </div>
          <div className="col-span-1 lg:col-span-2">
            <SearchableSelect
              options={processOptions}
              value={processFilter}
              onChange={setProcessFilter}
              placeholder="Quy trình"
              className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
            />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <SearchableSelect
              options={stageOptions}
              value={stageFilter}
              onChange={setStageFilter}
              placeholder="Giai đoạn"
              className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
            />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <SearchableSelect
              options={groupOptions}
              value={groupFilter}
              onChange={setGroupFilter}
              placeholder="Nhóm dự án"
              className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
            />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <button
              onClick={() => setShowAllFilters(!showAllFilters)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer select-none w-full ${
                showAllFilters 
                  ? 'border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100/50' 
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter size={12} className="text-blue-500" />
              <span>{showAllFilters ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>
            </button>
          </div>
        </div>

        {/* Expanded Row 2 */}
        {showAllFilters && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 pt-1">
            {/* Hàng 1: Nguồn vốn | Phân loại dự án | Người theo dõi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
              <SearchableSelect
                options={fundingOptions}
                value={fundingFilter}
                onChange={setFundingFilter}
                placeholder="Nguồn vốn"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
              <SearchableSelect
                options={categoryOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
                placeholder="Phân loại dự án"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
              <SearchableSelect
                options={followerOptions}
                value={followerFilter}
                onChange={setFollowerFilter}
                placeholder="Người theo dõi"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
            </div>

            {/* Hàng 2: Cơ quan NN | Chủ đầu tư | Thủ tục */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
              <SearchableSelect
                options={locationOptions}
                value={locationFilter}
                onChange={setLocationFilter}
                placeholder="Cơ quan / Phòng ban"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
              <SearchableSelect
                options={investorOptions}
                value={investorFilter}
                onChange={setInvestorFilter}
                placeholder="Chủ đầu tư"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
              <SearchableSelect
                options={stepOptions}
                value={stepFilter}
                onChange={setStepFilter}
                placeholder="Thủ tục"
                className="!bg-white !rounded-xl !border-slate-200/80 !py-2 !px-3 text-xs font-medium text-slate-700"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-2 py-1 mt-6 mb-3">
        <span className="text-xs sm:text-sm font-bold text-slate-500">
          Đang hiển thị <span className="font-extrabold text-slate-900">{filteredProjects.length}</span> dự án
        </span>
      </div>

      {/* Project Cards List */}
      <div className="space-y-2.5">
        {paginatedProjects.length > 0 ? paginatedProjects.map((p) => {
          const statusDetails = getProjectStatusDetails(p);
          const step = statusDetails[0];
          return (
            <div 
              key={p.id} 
              onClick={() => onProjectClick?.(p)}
              className="bg-white rounded-2xl border border-slate-100 pt-2.5 pb-2 px-3.5 sm:pt-3 sm:pb-2.5 sm:px-4.5 shadow-sm hover:shadow-md hover:border-blue-100 transition-all flex items-start cursor-pointer relative"
            >
              {/* Main Content Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-blue-600 font-extrabold text-[11px] sm:text-xs uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-lg">
                      {p.code}
                    </span>
                    <span className="text-slate-400 text-xs font-semibold flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400 shrink-0" />
                      {p.location}
                    </span>
                  </div>

                  {/* Top Right Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => onUpdatePlanClick?.(p)}
                      className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all"
                      title="Kế hoạch"
                      hidden={!canEditProject(p)}
                    >
                      <Calendar size={13} />
                    </button>
                    {onEditClick && canEditProject(p) && (
                      <button 
                        onClick={() => onEditClick?.(p)}
                        className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all"
                        title="Sửa"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {onDeleteClick && canDeleteProject(p) && (
                      <button 
                        onClick={() => onDeleteClick?.(p)}
                        className="w-7 h-7 flex items-center justify-center bg-white border border-rose-200 text-rose-500 hover:text-rose-600 hover:bg-rose-50/50 rounded-lg transition-all"
                        title="Xóa"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Project Name */}
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mt-0.5 hover:text-blue-600 transition-colors">
                  {p.name}
                </h3>

                {/* Bottom Row: Active Step Details */}
                {step ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${getBadgeStyle(step.name)}`}>
                        {step.name}
                      </span>
                      {/* Processing status saved from "Cập nhật" (e.g. Chờ bổ sung hồ sơ) */}
                      {p.implementationPlan?.[step.id]?.agencyStatus && !p.implementationPlan?.[step.id]?.agencyActualDate && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                          {p.implementationPlan[step.id].agencyStatus}
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        {getAgencyWithDepartment(step.agency, step.department, step.name)}
                      </span>
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1 shrink-0">
                        <Calendar size={12} className="text-slate-400" />
                        HXL: {formatShortDate(step.agencyDeadline)}
                      </span>
                    </div>
                    
                    <div onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => onHousingUpdateClick?.(p, step.parentId, step.id)}
                        hidden={!canEditProject(p)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-lg transition-all shadow-md shadow-blue-500/10 uppercase tracking-wider"
                      >
                        <RotateCw size={11} strokeWidth={3} className="animate-spin-hover" />
                        Cập nhật
                      </button>
                      {!canEditProject(p) && (
                        <button
                          onClick={() => onHousingUpdateClick?.(p, step.parentId, step.id)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 text-[11px] font-black rounded-lg transition-all uppercase tracking-wider"
                          title="Dự án chưa đến bước do đơn vị bạn xử lý: chỉ xem tiến độ"
                        >
                          <Eye size={11} strokeWidth={3} />
                          Xem tiến độ
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Hoàn thành
                      </span>
                      <span className="text-xs font-bold text-slate-500">Dự án đã hoàn thành tất cả các bước</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="px-6 py-20 text-center text-slate-400 italic text-sm bg-white border border-slate-100 rounded-2xl shadow-sm">
            {projects.length === 0
              ? 'Chưa có dự án nào thuộc phạm vi theo dõi của bạn. Dự án sẽ hiện ở đây khi đến bước do đơn vị bạn xử lý.'
              : 'Không tìm thấy dự án nào khớp với từ khóa hoặc bộ lọc. Hãy thử xóa bớt điều kiện lọc.'}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-white border border-slate-200 rounded-2xl shadow-sm mt-4">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Trang hiện tại</p>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium leading-none">
              Hiển thị <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> / <span className="text-slate-900 font-bold">{filteredProjects.length}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent border border-transparent hover:border-blue-100"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1 bg-slate-50/80 p-1 rounded-xl border border-slate-100 overflow-x-auto max-w-[150px] sm:max-w-none">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`min-w-[28px] sm:min-w-[32px] h-7 sm:h-8 flex items-center justify-center rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                    currentPage === page 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                      : 'text-slate-500 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent border border-transparent hover:border-blue-100"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

