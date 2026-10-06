import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, Filter, Download, ChevronLeft, ChevronRight, ChevronDown, 
  Search, Building2, MapPin, Info, CheckCircle2, Clock, AlertCircle,
  Check, RotateCcw, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { matchesSearch as textMatches, normalizeSearchText } from '../lib/textSearch';
import { toDisplayDate } from '../lib/projectUtils';
import { MilestoneProgress, activeMilestoneIndex, catalogMilestones, milestoneSideStatus } from '../lib/stepProgress';

interface MilestoneData {
  investorDate?: string;
  investorStatus: 'done' | 'in_progress' | 'not_started' | 'delayed';
  agencyDate?: string;
  agencyStatus: 'done' | 'in_progress' | 'not_started' | 'delayed';
}

interface Project {
  id: string;
  name: string;
  code: string;
  investor: string;
  location: string;
  stage: string;
  currentStep: string;
  childStep?: string;
  progress: number;
  status: string;
  deadline: string;
  // Additional fields for Gantt
  area?: string;
  height?: string;
  units?: string;
  apartmentCount?: number;
  startDate?: string;
  endDate?: string;
  textProgress?: string;
  milestoneDetails: {
    [key: string]: MilestoneData;
  };
}

interface GanttDashboardNOXHProps {
  projects?: Project[];
  reportDate: string;
  projectStatuses: string[];
  projectStages: string[];
  projectStagesRaw?: any[];
  processes?: any[];
  onProjectClick?: (project: any) => void;
  actualProgress?: Record<string, any>;
  milestoneProgress?: Record<string, Record<string, MilestoneProgress>>;
  onResetActualProgress?: () => void;
  currentUser?: any;
}

// Tham chiếu ổn định để dùng làm giá trị mặc định thay cho literal `[]` trong destructuring:
// literal `[]` tạo mảng mới ở MỖI lần render, khiến các useEffect/useMemo phụ thuộc vào nó
// (vd. dòng ~583, ~274) chạy lại vô hạn khi component re-render sau khi setState bên trong.
const EMPTY_ARRAY: any[] = [];
const EMPTY_OBJECT: Record<string, any> = {};

// Columns = milestones of the catalog ("Cấu hình Giai đoạn & Mốc Milestone"), for the stage chosen in the
// combobox. Values come from the server, computed from the step progress (src/lib/stepProgress.ts).
const COLUMN_THEMES = [
  { text: 'text-blue-700', bg: 'bg-[#E3F2FD]', border: 'border-blue-200', borderLight: 'border-blue-100' },
  { text: 'text-purple-700', bg: 'bg-[#F3E5F5]', border: 'border-purple-200', borderLight: 'border-purple-100' },
  { text: 'text-emerald-700', bg: 'bg-[#E8F5E9]', border: 'border-emerald-200', borderLight: 'border-emerald-100' },
  { text: 'text-amber-700', bg: 'bg-[#FFFDE7]', border: 'border-amber-200', borderLight: 'border-amber-100' },
  { text: 'text-rose-700', bg: 'bg-[#FBE9E7]', border: 'border-rose-200', borderLight: 'border-rose-100' },
  { text: 'text-pink-700', bg: 'bg-[#FCE4EC]', border: 'border-pink-200', borderLight: 'border-pink-100' },
  { text: 'text-cyan-700', bg: 'bg-[#E0F7FA]', border: 'border-cyan-200', borderLight: 'border-cyan-100' },
  { text: 'text-orange-700', bg: 'bg-[#FFE0B2]', border: 'border-orange-200', borderLight: 'border-orange-100' },
  { text: 'text-teal-700', bg: 'bg-[#E0F2F1]', border: 'border-teal-200', borderLight: 'border-teal-100' },
  { text: 'text-indigo-700', bg: 'bg-[#E8EAF6]', border: 'border-indigo-200', borderLight: 'border-indigo-100' },
];

// Dates are shown as dd/MM/yyyy everywhere (toDisplayDate)
const formatDisplayDate = (dateStr: string | undefined): string => {
  if (!dateStr || dateStr === '--') return '--';
  if (dateStr === 'X') return 'X';
  return toDisplayDate(dateStr);
};

export default function GanttDashboardNOXH({
  projects: initialProjects = EMPTY_ARRAY as Project[],
  reportDate,
  projectStatuses,
  projectStages,
  projectStagesRaw = EMPTY_ARRAY,
  processes = EMPTY_ARRAY,
  onProjectClick,
  actualProgress,
  milestoneProgress = EMPTY_OBJECT,
  onResetActualProgress,
  currentUser
}: GanttDashboardNOXHProps) {
  const today = React.useMemo(() => new Date(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('Tất cả giai đoạn');
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [isExpanded, setIsExpanded] = useState(false);

  // Every milestone of the catalog, in order; the columns show those of the chosen stage
  const allMilestones = React.useMemo(() => catalogMilestones(projectStagesRaw), [projectStagesRaw]);
  const activePhases = React.useMemo(() => allMilestones.map((m, i) => ({
    id: m.name,
    displayName: m.name,
    stage: m.stage,
    theme: COLUMN_THEMES[i % COLUMN_THEMES.length]
  })), [allMilestones]);

  const visiblePhases = React.useMemo(() => {
    if (stageFilter === 'Tất cả giai đoạn') {
      return activePhases;
    }
    const cleanedFilter = stageFilter.trim().toUpperCase();
    return activePhases.filter(p => (p.stage || '').trim().toUpperCase() === cleanedFilter);
  }, [activePhases, stageFilter]);

  const milestoneOf = (project: any, phase: { id: string }): MilestoneProgress | undefined =>
    milestoneProgress?.[project?.id]?.[phase.id];
  const milestoneListOf = (project: any): MilestoneProgress[] =>
    allMilestones.map(m => milestoneProgress?.[project?.id]?.[m.name]).filter((m): m is MilestoneProgress => !!m);

  const getCdtDate = (project: any, phase: any) => milestoneOf(project, phase)?.cdtPlan || '';
  const getNnDate = (project: any, phase: any) => milestoneOf(project, phase)?.nnPlan || '';
  const getActualCdtDate = (project: any, phase: any) => milestoneOf(project, phase)?.cdtActual || '';
  const getActualNnDate = (project: any, phase: any) => milestoneOf(project, phase)?.nnActual || '';

  // done / in_progress / delayed / not_started, against the milestone the project is at (the one whose
  // procedure holds its current step)
  const getPhaseStatuses = (p: any, phase: any) => {
    const list = milestoneListOf(p);
    const m = milestoneOf(p, phase);
    const planCdt = m?.cdtPlan || '';
    const planNn = m?.nnPlan || '';
    const actualCdt = m?.cdtActual || '';
    const actualNn = m?.nnActual || '';
    if (!m) {
      return { planCdt, planNn, actualCdt, actualNn, isCdtDone: false, isNnDone: false, isBothDone: false, cdtStatus: 'not_started' as const, nnStatus: 'not_started' as const };
    }
    const activeIdx = activeMilestoneIndex(list, p.currentStepId);
    const idx = list.indexOf(m);
    const cdtStatus = milestoneSideStatus(m, 'cdt', idx, activeIdx, today);
    const nnStatus = milestoneSideStatus(m, 'nn', idx, activeIdx, today);
    return {
      planCdt, planNn, actualCdt, actualNn,
      isCdtDone: cdtStatus === 'done',
      isNnDone: nnStatus === 'done',
      isBothDone: cdtStatus === 'done' && nnStatus === 'done',
      cdtStatus,
      nnStatus
    };
  };

  useEffect(() => {
    const enrichedData = initialProjects.map((p: any) => {
      const list = milestoneListOf(p);
      const activeIdx = activeMilestoneIndex(list, p.currentStepId);
      const details: { [key: string]: MilestoneData } = {};
      let hasDelayedStep = false;
      list.forEach((m, idx) => {
        const investorStatus = milestoneSideStatus(m, 'cdt', idx, activeIdx, today);
        const agencyStatus = milestoneSideStatus(m, 'nn', idx, activeIdx, today);
        details[m.name] = { investorDate: m.cdtPlan, investorStatus, agencyDate: m.nnPlan, agencyStatus };
        // "KH của CQNN bị chậm tiến độ": the CQNN side only (the investor's side shows on its own bar)
        if (idx <= activeIdx && agencyStatus === 'delayed') hasDelayedStep = true;
      });

      return {
        ...p,
        area: p.totalArea ? `${p.totalArea} ha` : p.area,
        height: p.height ? `${p.height} tầng` : p.height,
        units: p.apartmentCount ? `${p.apartmentCount} căn` : p.units,
        startDate: p.startDate || '--',
        endDate: p.endDate || '--',
        textProgress: p.progress_status_2026 || p.textProgress || 'Đang triển khai',
        milestoneDetails: details,
        status: hasDelayedStep ? 'Quá hạn' : 'Đang xử lý',
        stage: p.stage || projectStages?.[0] || 'Chuẩn bị đầu tư',
        currentStep: p.currentStep || list[activeIdx]?.name || ''
      };
    });
    setProjects(enrichedData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjects, milestoneProgress, allMilestones]);


  // Stage names compared without case / spacing differences ("Chuẩn bị đầu tư" = "CHUẨN BỊ ĐẦU TƯ"):
  // a project with no stage yet is shown under the first stage instead of disappearing from every filter
  const stageKey = (s: any) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toUpperCase();
  const inStage = (p: any) => stageFilter === 'Tất cả giai đoạn' || stageKey(p.stage) === stageKey(stageFilter);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = textMatches(searchTerm, p.name, p.code, p.currentStep);

    const matchesStage = inStage(p);
    const matchesStatus = statusFilter === 'Tất cả' || 
                          (statusFilter === 'Đang xử lý' && p.status === 'Đang xử lý') ||
                          (statusFilter === 'Chậm tiến độ' && p.status === 'Quá hạn');

    return matchesSearch && matchesStage && matchesStatus;
  });

  const projectsFilteredByStageOnly = React.useMemo(() => {
    return projects.filter(inStage);
  }, [projects, stageFilter]);

  const projectsFilteredByStageAndSearch = React.useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = textMatches(searchTerm, p.name, p.code, p.currentStep);
      
      return matchesSearch && inStage(p);
    });
  }, [projects, searchTerm, stageFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-emerald-500';
      case 'in_progress': return 'bg-amber-400';
      case 'delayed': return 'bg-rose-500';
      case 'not_started': return 'bg-slate-200';
      default: return 'bg-slate-100';
    }
  };

  const parseDateInternal = (dateStr: string | undefined): Date | null => {
    if (!dateStr || dateStr === '--' || dateStr === 'X') return null;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const getComparisonColor = (planDateStr: string | undefined, actualDateStr: string | undefined) => {
    const plan = parseDateInternal(planDateStr);
    const actual = parseDateInternal(actualDateStr);
    if (!plan || !actual) return 'bg-blue-600';
    return actual > plan ? 'bg-rose-500' : 'bg-blue-600';
  };

  const handleExport = () => {
    // Header Row 1
    const headerRow1 = [
      'STT', 
      'TÊN DỰ ÁN', 
      'ĐỊA ĐIỂM',
      'CHỦ ĐẦU TƯ',
      'DIỆN TÍCH',
      'TẦNG CAO',
      'SỐ CĂN HỘ',
      'TIẾN ĐỘ TH THEO CT CTĐT (Từ - Đến)',
      'KH / TT',
      ...visiblePhases.flatMap(phase => [phase.displayName.toUpperCase(), '']),
      'NGÀY HOÀN THÀNH'
    ];

    // Header Row 2
    const headerRow2 = [
      '', '', '', '', '', '', '', '', '',
      ...visiblePhases.flatMap(() => ['CĐT', 'CƠ QUAN NN']),
      ''
    ];

    // Two rows per project, as on screen: KH (plan) then TT (actual), dates dd/mm/yyyy
    const exportDate = (v: string) => (v ? formatDisplayDate(v) : '--');
    const dataRows = filteredProjects.flatMap((p, idx) => {
      const info = [
        idx + 1,
        `${p.name}\n(${p.code})\n${p.status === 'Quá hạn' ? 'Quá hạn' : 'Đang xử lý'}`,
        p.location,
        p.investor,
        p.area,
        p.height,
        p.units,
        `${toDisplayDate(p.startDate)} - ${toDisplayDate(p.endDate)}`,
      ];
      const plan: any[] = [...info, 'KH'];
      const actual: any[] = [...info.map(() => ''), 'TT'];
      visiblePhases.forEach(phase => {
        plan.push(exportDate(getCdtDate(p, phase)), exportDate(getNnDate(p, phase)));
        actual.push(exportDate(getActualCdtDate(p, phase)), exportDate(getActualNnDate(p, phase)));
      });
      plan.push(formatDisplayDate(p.deadline));
      actual.push('');
      return [plan, actual];
    });

    const aoaData = [headerRow1, headerRow2, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

    // Define Merges
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // STT
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Tên dự án
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Địa điểm
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Chủ đầu tư
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // Diện tích
      { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }, // Tầng cao
      { s: { r: 0, c: 6 }, e: { r: 1, c: 6 } }, // Số căn hộ
      { s: { r: 0, c: 7 }, e: { r: 1, c: 7 } }, // Tiến độ TH
      { s: { r: 0, c: 8 }, e: { r: 1, c: 8 } }, // KH / TT
    ];

    visiblePhases.forEach((_, idx) => {
      const colIdx = 9 + idx * 2;
      merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 1 } });
    });

    const completionColIdx = 9 + visiblePhases.length * 2;
    merges.push({ s: { r: 0, c: completionColIdx }, e: { r: 1, c: completionColIdx } }); // Ngày hoàn thành
    // Project information over its KH and TT rows
    filteredProjects.forEach((_, idx) => {
      const r = 2 + idx * 2;
      [0, 1, 2, 3, 4, 5, 6, 7, completionColIdx].forEach(c => merges.push({ s: { r, c }, e: { r: r + 1, c } }));
    });

    worksheet['!merges'] = merges;

    // Set column widths
    const cols = [
      { wch: 5 },  // STT
      { wch: 30 }, // Tên dự án
      { wch: 25 }, // Địa điểm
      { wch: 25 }, // Chủ đầu tư
      { wch: 15 }, // Diện tích
      { wch: 10 }, // Tầng cao
      { wch: 10 }, // Số căn hộ
      { wch: 20 }, // Tiến độ TH
      { wch: 7 },  // KH / TT
    ];

    visiblePhases.forEach(() => {
      cols.push({ wch: 12 }, { wch: 12 });
    });
    cols.push({ wch: 15 }); // Ngày hoàn thành
    worksheet['!cols'] = cols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gantt Dashboard NOXH');
    XLSX.writeFile(workbook, `Sơ_đồ_Gantt_Dự_án_NOXH_${stageFilter}.xlsx`);
  };

  const handleResetData = () => {
    if (currentUser?.roleId !== 'Admin') {
      alert('Chỉ tài khoản Quản trị viên (Admin) mới có quyền thực hiện thao tác này.');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn đặt lại tất cả dữ liệu tiến độ thực tế đã lưu về mặc định ban đầu không?\n\nLưu ý: Thao tác này CHỈ đặt lại dữ liệu tiến độ thực tế (actual progress). Toàn bộ danh sách dự án, tài khoản người dùng, phân quyền và tệp đính kèm sẽ được giữ nguyên toàn vẹn.')) {
      try {
        // Clear all items starting with actual_progress_
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('actual_progress_') || key === 'unsynced_actual_progress')) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        if (onResetActualProgress) {
          onResetActualProgress();
        } else {
          console.log('Đã reset dữ liệu tiến độ thực tế.');
          window.location.reload();
        }
      } catch (error) {
        console.error('Lỗi khi reset dữ liệu:', error);
        alert('Có lỗi xảy ra khi reset dữ liệu.');
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải dữ liệu...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sơ đồ Gantt dự án NOXH</h2>
          <p className="text-slate-500 text-sm mt-1">Theo dõi tất cả dự án, xác định dự án đang ở giai đoạn nào, bước nào, quá hạn hay đã hoàn thành.</p>
        </div>
        <div className="flex items-center gap-3">
          {currentUser?.roleId === 'Admin' && (
            <button 
              onClick={handleResetData}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-sm font-bold text-rose-600 transition-all cursor-pointer"
              title="Đặt lại dữ liệu tiến độ thực tế về mặc định ban đầu"
            >
              <RotateCcw size={18} /> Reset tiến độ thực tế
            </button>
          )}
          <button 
            onClick={handleExport}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 transition-all cursor-pointer"
          >
            <Download size={18} /> Xuất dữ liệu dự án
          </button>
        </div>
      </div>

      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col md:flex-row items-center gap-2">
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-blue-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Bộ lọc:</h3>
          </div>
          {statusFilter !== 'Tất cả' && (
            <button 
              onClick={() => setStatusFilter('Tất cả')}
              className="px-2 py-1 bg-blue-50 text-[10px] font-black text-blue-600 rounded-md hover:bg-blue-100 transition-colors uppercase flex items-center gap-1"
            >
              <RotateCcw size={10} /> Hiển thị tất cả
            </button>
          )}
        </div>
        
        <div className="flex-1 w-full flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 max-w-md w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm mã dự án, tên dự án, bước hiện tại..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="relative w-full md:w-64">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option>Tất cả giai đoạn</option>
              {projectStages.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {[
          { label: 'Tổng số dự án', value: projectsFilteredByStageOnly.length, icon: Building2, color: 'blue', filter: 'Tất cả' },
          { label: 'CQNN Đang xử lý', value: projectsFilteredByStageOnly.filter(p => p.status === 'Đang xử lý').length, icon: CheckCircle2, color: 'amber', filter: 'Đang xử lý' },
          { label: 'KH của CQNN bị chậm tiến độ', value: projectsFilteredByStageOnly.filter(p => p.status === 'Quá hạn').length, icon: AlertCircle, color: 'rose', filter: 'Chậm tiến độ' },
        ].map((stat, idx) => (
          <div 
            key={idx} 
            onClick={() => setStatusFilter(stat.filter)}
            className={`bg-white p-4 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center gap-4 ${statusFilter === stat.filter ? `ring-2 ring-${stat.color}-500 border-${stat.color}-200 bg-${stat.color}-50/30` : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
          >
            <div className={`w-10 h-10 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl flex items-center justify-center shrink-0`}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
              <p className="text-xl font-black text-slate-900 leading-none">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend & Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm text-xs font-medium text-slate-600 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-lg bg-emerald-500" />
            <span>Hoàn thành</span>
          </div>
            <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-lg bg-amber-400" />
            <span>Đang thực hiện</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-lg bg-blue-600" />
            <span>Đúng hạn</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-lg bg-rose-500" />
            <span>Quá hạn</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-lg bg-slate-200" />
            <span>Chưa bắt đầu</span>
          </div>
        </div>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-black text-slate-600 hover:bg-slate-50 transition-all shadow-sm uppercase tracking-widest shrink-0 border-b-2 active:translate-y-0.5 active:border-b-0"
        >
          <Layers size={18} className="text-slate-400" />
          {isExpanded ? 'Thu gọn' : 'Xem tất cả'}
        </button>
      </div>

      <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${isExpanded ? 'h-auto' : 'h-[calc(100vh-250px)]'}`}>
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1800px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 px-2 py-1 border-r border-b border-slate-200 text-center w-12">STT</th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 px-2 py-1 border-r border-b border-slate-200 w-[150px]">Tên dự án</th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 px-2 py-1 border-r border-b border-slate-200 w-[130px]">Địa điểm / Chủ đầu tư / Quy mô</th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 px-2 py-1 border-r border-b border-slate-200 text-center w-[120px]">Tiến độ TH theo CT CTĐT<br/><span className="lowercase font-normal">Từ - Đến</span></th>
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 border-r border-b border-slate-200 w-8"></th>
                {visiblePhases.map((phase, idx) => {
                  const theme = phase.theme || { text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' };
                  return (
                    <th key={idx} colSpan={2} className={`sticky top-0 z-20 ${theme.bg} ${theme.text} ${theme.border} px-2 pt-3 pb-1 border-r border-b text-center leading-tight align-bottom`}>
                      {phase.displayName}
                    </th>
                  );
                })}
                <th rowSpan={2} className="sticky top-0 z-20 bg-slate-50 px-4 py-2 border-b border-slate-200 text-center w-32">Ngày hoàn thành</th>
              </tr>
              <tr className="bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                {/* Placeholder for spanned headers */}
                {visiblePhases.map((phase, idx) => {
                  const theme = phase.theme || { text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' };
                  return (
                    <React.Fragment key={idx}>
                      <th className={`sticky top-[38px] z-20 ${theme.bg} px-2 pt-1 pb-2 border-r border-b border-slate-100 text-center w-20 align-top`}>CĐT</th>
                      <th className={`sticky top-[38px] z-20 ${theme.bg} px-2 pt-1 pb-2 border-r border-b ${theme.border} text-center w-20 align-top`}>Cơ quan NN</th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={100} className="py-16">
                    {/* Sticky so the message stays in view on a horizontally scrolled table */}
                    <div className="sticky left-0 w-[min(36rem,80vw)] px-6 text-sm text-slate-500 italic">
                      {projects.length === 0
                        ? 'Chưa có dự án nào thuộc phạm vi theo dõi của bạn. Dự án sẽ hiện ở đây khi đến bước do đơn vị bạn xử lý.'
                        : 'Không có dự án nào khớp với từ khóa hoặc giai đoạn đang lọc.'}
                    </div>
                  </td>
                </tr>
              )}
              {filteredProjects.map((p, idx) => {

                
                return (
                  <React.Fragment key={p.id}>
                    {/* KH Row */}
                    <tr className="hover:bg-slate-50 transition-colors group">
                      <td rowSpan={2} className="px-3 py-1 border-r border-b border-slate-100 text-center text-xs font-bold text-slate-900 align-top">{idx + 1}</td>
                      <td rowSpan={2} className="px-3 py-1 border-r border-b border-slate-100 align-top w-[150px]">
                        <div className="flex flex-col h-full justify-between">
                          <button 
                            onClick={() => onProjectClick?.(p)}
                            title={p.name}
                            className="space-y-0.5 text-left w-full focus:outline-none"
                          >
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{p.code}</p>
                            <p className="text-[11px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-tight uppercase line-clamp-4">{p.name}</p>
                          </button>
                        </div>
                      </td>
                      <td rowSpan={2} className="px-3 py-1 border-r border-b border-slate-100 align-top w-[130px]">
                        <div className="space-y-1">
                          <div className="flex items-start gap-1.5">
                            <MapPin size={12} className="text-slate-300 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-slate-600 leading-tight line-clamp-2">{p.location}</p>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <Building2 size={12} className="text-slate-300 mt-0.5 shrink-0" />
                            <div className="flex flex-col">
                              <p className="text-[11px] text-slate-700 font-bold leading-tight line-clamp-2">{p.investor}</p>
                              <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                                <span className="font-black text-slate-400 uppercase mr-1">QM:</span> 
                                {p.area}; {p.height}; {p.units}
                              </p>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td rowSpan={2} className="px-3 py-1 border-r border-b border-slate-100 text-center align-top w-[110px]">
                        <div className="bg-slate-50 rounded-lg p-1 border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Thời gian TH</p>
                          <p className="text-[10px] font-bold text-slate-700">{formatDisplayDate(p.startDate)}</p>
                          <div className="h-[1px] w-3 bg-slate-200 mx-auto my-0.5" />
                          <p className="text-[10px] font-bold text-slate-700">{formatDisplayDate(p.endDate)}</p>
                        </div>
                      </td>
                      
                      <td className="px-1 py-1.5 border-r border-b border-slate-50 text-center w-8">
                        <span className="px-1.5 py-0.5 border border-blue-200 text-blue-600 text-[9px] font-black rounded-md bg-blue-50/50 uppercase">KH</span>
                      </td>

                      {/* KH Milestones */}
                      {visiblePhases.map((phase, phaseIdx) => {
                        const {
                          planCdt,
                          planNn,
                          isCdtDone,
                          isNnDone,
                          isBothDone,
                          cdtStatus,
                          nnStatus
                        } = getPhaseStatuses(p, phase);

                        const isBothPlanX = planCdt === 'X' && planNn === 'X';

                        if (isBothPlanX) {
                          return (
                            <td key={`kh-done-${phaseIdx}`} colSpan={2} className="px-1 py-1.5 border-r border-b border-slate-50 text-center">
                              <div className="flex items-center justify-center">
                                <span className="flex items-center gap-1 px-3 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-black uppercase shadow-sm leading-none whitespace-nowrap">
                                  <Check size={12} strokeWidth={4} /> Đã xong
                                </span>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <React.Fragment key={`kh-${phaseIdx}`}>
                            <td className="px-1 py-1.5 border-r border-b border-slate-50 text-center">
                              {planCdt === 'X' ? (
                                <div className="flex items-center justify-center">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase shadow-sm leading-none whitespace-nowrap">
                                    <Check size={10} strokeWidth={4} /> Đã xong
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className={`w-full h-2 rounded-full transition-all ${getStatusColor(cdtStatus)}`} />
                                  <span className={`text-[10px] font-bold whitespace-nowrap ${cdtStatus === 'delayed' ? 'text-rose-500' : 'text-slate-500'}`}>
                                    {formatDisplayDate(planCdt)}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-1 py-1.5 border-r border-b border-slate-100 text-center">
                              {planNn === 'X' ? (
                                <div className="flex items-center justify-center">
                                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase shadow-sm leading-none whitespace-nowrap">
                                    <Check size={10} strokeWidth={4} /> Đã xong
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className={`w-full h-2 rounded-full transition-all ${getStatusColor(nnStatus)}`} />
                                  <span className={`text-[10px] font-bold whitespace-nowrap ${nnStatus === 'delayed' ? 'text-rose-500' : 'text-slate-500'}`}>
                                    {formatDisplayDate(planNn)}
                                  </span>
                                </div>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      <td rowSpan={2} className="px-4 py-2 border-b border-slate-100 text-center align-middle">
                        <span className="text-xs font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{formatDisplayDate(p.deadline)}</span>
                      </td>
                    </tr>

                    {/* TD Row */}
                    <tr className="hover:bg-slate-50 transition-colors group">
                      <td className="px-1 py-1 border-r border-b border-blue-100 text-center w-8 bg-blue-50/20">
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-md shadow-sm uppercase">TT</span>
                      </td>
                      
                      {/* TĐ Milestones */}
                      {visiblePhases.map((phase, phaseIdx) => {
                        const planCdt = getCdtDate(p, phase);
                        const planNn = getNnDate(p, phase);
                        const actualCdt = getActualCdtDate(p, phase);
                        const actualNn = getActualNnDate(p, phase);

                        return (
                          <React.Fragment key={`td-${phaseIdx}`}>
                            <td className="px-1 py-1.5 border-r border-b border-slate-50 text-center">
                              {actualCdt ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className={`w-full h-2 rounded-full shadow-sm ${getComparisonColor(planCdt, actualCdt)}`} />
                                  <span className="text-[10px] text-slate-900 font-black whitespace-nowrap">{formatDisplayDate(actualCdt)}</span>
                                </div>
                              ) : (
                                <div className="h-2 w-full border border-dashed border-slate-200 rounded-full bg-slate-50 opacity-40 mx-auto" />
                              )}
                            </td>
                            <td className="px-1 py-1.5 border-r border-b border-slate-100 text-center">
                              {actualNn ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className={`w-full h-2 rounded-full shadow-sm ${getComparisonColor(planNn, actualNn)}`} />
                                  <span className="text-[10px] text-slate-900 font-black whitespace-nowrap">{formatDisplayDate(actualNn)}</span>
                                </div>
                              ) : (
                                <div className="h-2 w-full border border-dashed border-slate-200 rounded-full bg-slate-50 opacity-40 mx-auto" />
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
