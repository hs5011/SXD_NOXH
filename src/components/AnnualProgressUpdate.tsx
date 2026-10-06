import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, Calendar, Clock, AlertCircle, 
  Save, CheckCircle2, Building2, ChevronRight, 
  ChevronLeft, Download, Info, Edit3, X, Check,
  ArrowUpDown, ArrowUp, ArrowDown, Layers,
  Paperclip, Upload, Trash2, File,
  Compass, Wrench, Briefcase, CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, parse, isValid } from 'date-fns';
import * as XLSX from 'xlsx';
import { matchesSearch as textMatches, normalizeSearchText } from '../lib/textSearch';
import { uploadProjectFile, describeUploadFailures } from '../utils/apiFetch';
import { useUploadConfig, checkUploadFiles, uploadExtensionsLabel, uploadAcceptAttr } from '../lib/uploadRules';
import { parseDate as projectParseDate, formatDate as projectFormatDate, toDisplayDate } from '../lib/projectUtils';
import { catalogMilestones, isoToDisplay, legacyPhaseOf, type MilestoneProgress } from '../lib/stepProgress';

// Helper to parse dates robustly
const parseDate = (dateStr: string | undefined): Date | null => {
  return projectParseDate(dateStr);
};

// Helper to format Date to dd/mm/yyyy
const formatDate = (date: Date | null): string => {
  if (!date || isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  isPublicInvestment: boolean;
  processId?: string;
  milestones?: any;
  // Annual progress fields (red-boxed in image)
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
  completion_date?: string;
  progress_status_2026?: string;
}

interface AnnualProgressUpdateProps {
  projects?: Project[];
  processes?: any[];
  reportDate: string;
  setReportDate: (date: string) => void;
  // Resolves false when the server rejected the change (App has already shown the error)
  onUpdateProject?: (project: any) => Promise<void | boolean> | void | boolean;
  projectStages?: any[];
  // Milestone view per project (server, src/lib/stepProgress)
  milestoneProgress?: Record<string, Record<string, MilestoneProgress>>;
}

// Columns = milestones of the catalog (Cấu hình Giai đoạn & Mốc Milestone) of the stage tab; plans come
// from the server's milestone view (computed from the steps, src/lib/stepProgress). "Chỉnh sửa mốc" sends
// milestonePlans, which the server writes onto the steps (CĐT → first step, CQNN → latest-plan step).
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

export default function AnnualProgressUpdate({ 
  projects: initialProjects = [], 
  processes = [],
  reportDate, 
  setReportDate,
  onUpdateProject,
  projectStages,
  milestoneProgress = {}
 }: AnnualProgressUpdateProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [updatingProgressProject, setUpdatingProgressProject] = useState<Project | null>(null);
  const [updateContent, setUpdateContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const uploadConfig = useUploadConfig();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Project | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [showAll, setShowAll] = useState(false);
  const [activeStage, setActiveStage] = useState('CHUẨN BỊ ĐẦU TƯ');

  const itemsPerPage = 10;

  // New search or stage → back to page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeStage]);

  // Plan of a milestone: the value being edited ("Chỉnh sửa mốc") or the server's milestone view
  const planOf = (project: any, phase: any, side: 'cdt' | 'nn'): string => {
    const edited = project?.milestonePlans?.[phase.id]?.[side];
    if (edited !== undefined) return edited;
    const m = milestoneProgress?.[project?.id]?.[phase.id];
    const v = (side === 'cdt' ? m?.cdtPlan : m?.nnPlan) || '';
    return v === 'X' ? v : isoToDisplay(v);
  };
  const getCdtDate = (project: Project, phase: any) => planOf(project, phase, 'cdt');
  const getNnDate = (project: Project, phase: any) => planOf(project, phase, 'nn');
  // The server has a view of every catalog milestone for every project (linked or own entry)
  const isPhaseActiveForProject = (phaseId: string, project: Project | null, _processes?: any[]): boolean =>
    !!project && !!milestoneProgress?.[project.id]?.[phaseId];

  const activePhases = React.useMemo(() => catalogMilestones(projectStages).map((m, i) => ({
    id: m.name,
    displayName: m.name,
    stage: m.stage,
    theme: COLUMN_THEMES[i % COLUMN_THEMES.length]
  })), [projectStages]);

  const setPlan = (phase: any, side: 'cdt' | 'nn', value: string) => {
    setEditingProject(prev => prev ? ({
      ...prev,
      milestonePlans: {
        ...((prev as any).milestonePlans || {}),
        [phase.id]: { ...((prev as any).milestonePlans?.[phase.id] || {}), [side]: value }
      }
    } as any) : prev);
  };

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // Returns true only when the change was saved; files are uploaded after the project itself is saved
  const handleSave = async (project: Project, files: File[] = []): Promise<boolean> => {
    setIsSaving(true);
    try {
      if (onUpdateProject) {
        let result: void | boolean;
        try {
          result = await onUpdateProject(project);
        } catch (err) {
          console.error("Failed to update project progress", err);
          result = false;
        }
        if (result === false) {
          alert('Lưu tiến độ thất bại. Dữ liệu chưa được cập nhật, vui lòng thử lại.');
          return false;
        }
      }

      if (files.length > 0) {
        const failures: { name: string; error: string }[] = [];
        for (const file of files) {
          const r = await uploadProjectFile(project.id, file);
          if (!r.ok) failures.push({ name: file.name, error: r.error || '' });
        }
        if (failures.length > 0) alert(describeUploadFailures(failures));
      }

      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
      setEditingProject(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      return true;
    } finally {
      setIsSaving(false);
    }
  };


  const handleSort = (key: keyof Project) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const visiblePhases = React.useMemo(() => {
    return activePhases.filter(p => p.stage === activeStage);
  }, [activePhases, activeStage]);

  const handleExportExcel = () => {
    // Header Row 1
    const header1 = [
      "Mã dự án", "Tên dự án", "Chủ đầu tư", 
      ...visiblePhases.flatMap(p => [p.displayName, ""]),
      "Hoàn thành", `Tiến độ đến ${reportDate}`
    ];

    // Header Row 2
    const header2 = [
      "", "", "", 
      ...visiblePhases.flatMap(() => ["CĐT", "NN"]),
      "", ""
    ];

    // Data rows
    const dataRows = filteredProjects.map(p => {
      return [
        p.code,
        p.name,
        p.investor,
        ...visiblePhases.flatMap(phase => {
          const isActive = isPhaseActiveForProject(phase.id, p, processes);
          return [
            isActive ? (getCdtDate(p, phase) || '') : '',
            isActive ? (getNnDate(p, phase) || '') : ''
          ];
        }),
        p.completion_date || '',
        p.progress_status_2026 || ''
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...dataRows]);

    // Merges: { s: { r: row, c: col }, e: { r: row, c: col } }
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // Mã dự án
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Tên dự án
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Chủ đầu tư
    ];

    visiblePhases.forEach((_, idx) => {
      const colIdx = 3 + idx * 2;
      merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 1 } }); // Phase Merged Header
    });

    const completionColIdx = 3 + visiblePhases.length * 2;
    const progressColIdx = completionColIdx + 1;
    merges.push({ s: { r: 0, c: completionColIdx }, e: { r: 1, c: completionColIdx } }); // Hoàn thành
    merges.push({ s: { r: 0, c: progressColIdx }, e: { r: 1, c: progressColIdx } }); // Tiến độ

    ws['!merges'] = merges;

    // Set column widths
    const cols = [
      { wch: 15 }, { wch: 40 }, { wch: 25 }
    ];
    visiblePhases.forEach(() => {
      cols.push({ wch: 12 }, { wch: 12 });
    });
    cols.push({ wch: 15 }, { wch: 30 });
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TienDoDuAn");
    XLSX.writeFile(wb, `TienDoDuAn_${activeStage}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
  };

  const filteredProjects = projects
    .filter(p => textMatches(searchTerm, p.name, p.code, p.investor))
    .sort((a, b) => {
      if (!sortConfig.key) return 0;
      
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';

      if (sortConfig.key === 'code') {
        const getNum = (codeStr: string) => {
          if (!codeStr) return 999;
          const match = codeStr.match(/\d+/);
          return match ? parseInt(match[0], 10) : 999;
        };
        const numA = getNum(aValue as string);
        const numB = getNum(bValue as string);
        if (numA !== numB) {
          return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
        }
      }

      if (sortConfig.key === 'completion_date') {
        const aDate = parseDate(aValue as string) || new Date(0);
        const bDate = parseDate(bValue as string) || new Date(0);
        return sortConfig.direction === 'asc' 
          ? aDate.getTime() - bDate.getTime() 
          : bDate.getTime() - aDate.getTime();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const currentProjects = showAll 
    ? filteredProjects 
    : filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const renderDateCell = (dateStr: string | undefined) => {
    if (dateStr === 'X') {
      return (
        <div className="flex justify-center">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-black uppercase shadow-sm leading-none whitespace-nowrap">
            <Check size={10} strokeWidth={4} /> Đã xong
          </span>
        </div>
      );
    }
    
    if (!dateStr || dateStr === '-') return '-';
    
    // dd/MM/yyyy, the format used on every screen
    return toDisplayDate(dateStr);
  };

  const tableMinWidth = visiblePhases.length > 5 ? 'min-w-[2200px]' : (visiblePhases.length > 3 ? 'min-w-[1500px]' : 'min-w-[1000px]');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Cập nhật kế hoạch dự án</h2>
          <p className="text-slate-500 text-sm mt-1">Cập nhật các mốc thời gian hoạch định của các dự án</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Đến ngày:</span>
            <DatePicker
              selected={parseDate(reportDate)}
              onChange={(date: Date | null) => setReportDate(formatDate(date))}
              dateFormat="dd/MM/yyyy"
              placeholderText="dd/mm/yyyy"
              className="text-sm font-bold text-slate-700 outline-none w-[88px] bg-transparent"
            />
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm dự án, mã dự án..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 w-48 sm:w-56 md:w-64"
            />
          </div>
          <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer text-sm shadow-sm"
            title="Xuất Excel"
          >
            <Download size={18} className="text-slate-500" />
            Xuất Excel
          </button>
        </div>
      </div>

      {showSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-3"
        >
          <CheckCircle2 size={18} />
          <span className="text-base font-bold">Cập nhật tiến độ thành công!</span>
        </motion.div>
      )}

      {/* Tabs for Stage selection */}
      <div className="flex border-b border-slate-200 w-full gap-8 overflow-x-auto pb-px">
        {[
          { id: 'CHUẨN BỊ ĐẦU TƯ', label: 'Chuẩn bị đầu tư', icon: Briefcase },
          { id: 'THỰC HIỆN ĐẦU TƯ', label: 'Thực hiện đầu tư', icon: Wrench },
          { id: 'KẾT THÚC ĐẦU TƯ', label: 'Kết thúc đầu tư', icon: CheckSquare }
        ].map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeStage === tab.id;
          const stageCount = activePhases.filter(p => p.stage === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveStage(tab.id);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 pb-3.5 text-sm font-bold transition-all cursor-pointer border-b-2 relative -mb-[1.5px] whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <TabIcon size={18} />
              <span>{tab.label}</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ml-1 ${isActive ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                {stageCount} mốc
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar overflow-y-hidden">
          <table className={`w-full border-separate border-spacing-0 ${tableMinWidth}`}>
            <thead>
              <tr className="bg-slate-50/80">
                <th rowSpan={2} className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 sticky left-0 bg-slate-50 z-20 w-12">
                  STT
                </th>
                <th 
                  rowSpan={2}
                  onClick={() => handleSort('name')}
                  className="p-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 sticky left-12 bg-slate-50 z-20 cursor-pointer hover:text-blue-600 transition-colors w-[250px]"
                >
                  <div className="flex items-center gap-1">
                    Dự án
                    {sortConfig.key === 'name' ? (
                      sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : <ArrowUpDown size={12} className="opacity-30" />}
                  </div>
                </th>
                {visiblePhases.map(phase => (
                  <th 
                    key={phase.id} 
                    colSpan={2} 
                    className={`p-4 text-center text-[10px] font-black ${phase.theme.text} ${phase.theme.bg} uppercase tracking-widest border-b ${phase.theme.border} border-r ${phase.theme.border}`}
                  >
                    {phase.displayName}
                  </th>
                ))}
                <th 
                  rowSpan={2}
                  onClick={() => handleSort('completion_date')}
                  className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 cursor-pointer hover:text-blue-600 transition-colors bg-slate-50/80"
                >
                  <div className="flex items-center justify-center gap-1">
                    Hoàn thành
                    {sortConfig.key === 'completion_date' ? (
                      sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : <ArrowUpDown size={12} className="opacity-30" />}
                  </div>
                </th>
                <th rowSpan={2} className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 border-r border-slate-100 bg-slate-50/80">Tiến độ {reportDate}</th>
                <th rowSpan={2} className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">Thao tác</th>
              </tr>
              <tr className="bg-slate-50/50">
                {visiblePhases.map(phase => (
                  <React.Fragment key={`${phase.id}-sub`}>
                    <th className={`p-2 text-[9px] font-bold ${phase.theme.text} ${phase.theme.bg} uppercase border-b ${phase.theme.borderLight} border-r ${phase.theme.borderLight}`}>CĐT</th>
                    <th className={`p-2 text-[9px] font-bold ${phase.theme.text} ${phase.theme.bg} uppercase border-b ${phase.theme.borderLight} border-r ${phase.theme.border}`}>NN</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5 + visiblePhases.length * 2} className="p-12 text-center text-slate-400 font-medium italic">Đang tải dữ liệu...</td>
                </tr>
              ) : currentProjects.length === 0 ? (
                <tr>
                  <td colSpan={5 + visiblePhases.length * 2} className="p-12 text-center text-slate-400 font-medium italic">Không tìm thấy dự án nào</td>
                </tr>
              ) : (
                currentProjects.map((project, idx) => (
                  <tr key={project.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 border-b border-slate-100 border-r border-slate-100 text-center text-sm font-bold text-slate-600 sticky left-0 bg-white group-hover:bg-slate-50 z-10 w-12">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="p-4 border-b border-slate-100 border-r border-slate-100 sticky left-12 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[250px]">
                      <div className="min-w-[200px]">
                        <p className="text-sm font-black text-slate-900 line-clamp-1">{project.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{project.code}</p>
                      </div>
                    </td>
                    {visiblePhases.map(phase => {
                      const isActive = isPhaseActiveForProject(phase.id, project, processes);
                      return (
                        <React.Fragment key={phase.id}>
                          <td className={`p-2 text-center border-b border-slate-100 border-r border-slate-100 text-sm font-medium text-slate-600 ${phase.theme.bg}/5`}>
                            {isActive ? renderDateCell(getCdtDate(project, phase)) : '-'}
                          </td>
                          <td className={`p-2 text-center border-b border-slate-100 border-r border-slate-100 text-sm font-medium text-slate-600 ${phase.theme.bg}/10`}>
                            {isActive ? renderDateCell(getNnDate(project, phase)) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="p-2 text-center border-b border-slate-100 border-r border-slate-100 text-sm font-medium text-slate-600">{renderDateCell(project.completion_date)}</td>
                    <td className="p-2 text-center border-b border-slate-100 border-r border-slate-100">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full line-clamp-1">{project.progress_status_2026 || 'Chưa cập nhật'}</span>
                    </td>
                    <td className="p-2 text-center border-b border-slate-100">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setEditingProject({...project})}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Chỉnh sửa mốc thời gian"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            setUpdatingProgressProject({...project});
                            setUpdateContent(project.progress_status_2026 || '');
                            setAttachments([]);
                          }}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1"
                          title="Cập nhật tiến độ"
                        >
                          <Clock size={16} />
                          <span className="text-sm font-bold hidden xl:inline">Cập nhật</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>


        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <p className="text-base font-bold text-slate-500">
              Hiển thị {currentProjects.length} / {filteredProjects.length} dự án
            </p>
            <button 
              onClick={() => setShowAll(!showAll)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all shadow-sm border ${
                showAll 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10 hover:bg-blue-700' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Layers size={14} />
              {showAll ? 'Bật phân trang' : 'Xem tất cả'}
            </button>
          </div>
          {!showAll && (
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-base font-black text-slate-900 px-4">
                Trang {currentPage} / {totalPages || 1}
              </span>
              <button 
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Update Modal */}
      <AnimatePresence>
        {updatingProgressProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Cập nhật tiến độ dự án</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">{updatingProgressProject.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setUpdatingProgressProject(null)}
                  className="p-2 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-600 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Edit3 size={14} className="text-emerald-500" />
                    Nội dung cập nhật
                  </label>
                  <textarea 
                    rows={5}
                    placeholder="Nhập chi tiết tiến độ thực tế hiện tại của dự án..."
                    value={updateContent}
                    onChange={(e) => setUpdateContent(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-[24px] text-base outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all resize-none font-medium"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Paperclip size={14} className="text-emerald-500" />
                    Đính kèm danh sách file liên quan
                  </label>
                  
                  <div className="border-2 border-dashed border-slate-200 rounded-[24px] p-8 flex flex-col items-center justify-center gap-3 bg-slate-50/50 hover:bg-slate-50 hover:border-emerald-300 transition-all cursor-pointer group relative">
                    <input 
                      type="file" 
                      multiple 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept={uploadAcceptAttr(uploadConfig)}
                      onChange={(e) => {
                        if (e.target.files) {
                          const { accepted, message } = checkUploadFiles(Array.from(e.target.files), uploadConfig);
                          if (message) alert(message);
                          setAttachments(prev => [...prev, ...accepted]);
                          e.target.value = '';
                        }
                      }}
                    />
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:scale-110 transition-all shadow-sm">
                      <Upload size={24} />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-slate-700">Kéo thả hoặc Click để tải lên</p>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Hỗ trợ {uploadExtensionsLabel(uploadConfig)} (Tối đa {uploadConfig.maxSizeMb}MB)</p>
                    </div>
                  </div>

                  {attachments.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {attachments.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                              <File size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-700 truncate max-w-[300px]">{file.name}</p>
                              <p className="text-xs text-slate-400 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setUpdatingProgressProject(null)}
                  className="px-6 py-2.5 text-base font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={() => {
                    if (updatingProgressProject) {
                      handleSave({
                        ...updatingProgressProject,
                        progress_status_2026: updateContent
                      }, attachments).then(ok => {
                        // Keep the dialog (and the typed content/files) open when saving failed
                        if (ok) {
                          setUpdatingProgressProject(null);
                          setAttachments([]);
                        }
                      });
                    }
                  }}
                  disabled={isSaving || !updateContent.trim()}
                  className="px-8 py-2.5 bg-emerald-600 text-white rounded-2xl text-base font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Clock size={18} className="animate-spin" /> : <Save size={18} />}
                  Cập nhật tiến độ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-black text-slate-900">Cập nhật kế hoạch dự án</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{editingProject.name}</p>
                </div>
                <button 
                  onClick={() => setEditingProject(null)}
                  className="p-2 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-600 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {visiblePhases.map(phase => {
                    if (!isPhaseActiveForProject(phase.id, editingProject, processes)) return null;
                    const cdtVal = getCdtDate(editingProject, phase);
                    const nnVal = getNnDate(editingProject, phase);
                    const isDone = cdtVal === 'X' && nnVal === 'X';
                    
                    return (
                      <div key={phase.id} className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="flex items-center justify-between w-full">
                          <h4 className={`text-sm font-black ${phase.theme.text} uppercase tracking-widest flex items-center gap-2`}>
                            <div className={`w-1.5 h-4 ${phase.theme.text.replace('text-', 'bg-')} rounded-full`} />
                            {phase.displayName}
                          </h4>
                          {legacyPhaseOf(phase.id) && <label className="flex items-center gap-2 cursor-pointer group/done">
                            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                              isDone
                                ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                : 'border-slate-200 bg-white group-hover/done:border-emerald-300'
                            }`}>
                              {isDone && <Check size={12} strokeWidth={4} className="text-white" />}
                              <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={isDone}
                                onChange={(e) => {
                                  const val = e.target.checked ? 'X' : '';
                                  setPlan(phase, 'cdt', val);
                                  setPlan(phase, 'nn', val);
                                }}
                              />
                            </div>
                            <span className={`text-[11px] font-black uppercase tracking-widest transition-colors ${
                              isDone
                                ? 'text-emerald-600' 
                                : 'text-slate-400 group-hover/done:text-slate-500'
                            }`}>Đã xong</span>
                          </label>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider ml-1">CĐT (Ngày)</label>
                            <DatePicker
                              selected={parseDate(cdtVal)}
                              onChange={(date: Date | null) => setPlan(phase, 'cdt', formatDate(date))}
                              disabled={isDone}
                              dateFormat="dd/MM/yyyy"
                              placeholderText="dd/mm/yyyy"
                              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider ml-1">Cơ quan NN (Ngày)</label>
                            <DatePicker
                              selected={parseDate(nnVal)}
                              onChange={(date: Date | null) => setPlan(phase, 'nn', formatDate(date))}
                              disabled={isDone}
                              dateFormat="dd/MM/yyyy"
                              placeholderText="dd/mm/yyyy"
                              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Hoàn thành & Tiến độ */}
                  <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                        Kết thúc & Tiến độ thực tế
                      </h4>
                      <div className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-full shadow-sm">
                        <Clock size={12} className="text-blue-500" />
                        <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Tiến độ đến: {reportDate}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider ml-1">Ngày hoàn thành dự kiến</label>
                        <DatePicker
                          selected={parseDate(editingProject.completion_date)}
                          onChange={(date: Date | null) => setEditingProject({...editingProject, completion_date: formatDate(date)})}
                          dateFormat="dd/MM/yyyy"
                          placeholderText="dd/mm/yyyy"
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider ml-1">Nội dung tiến độ thực tế</label>
                        <textarea 
                          placeholder="Nhập nội dung tiến độ (Ví dụ: Đã hoàn thành móng, đang lên tầng 1...)"
                          value={editingProject.progress_status_2026 || ''}
                          onChange={(e) => setEditingProject({...editingProject, progress_status_2026: e.target.value})}
                          rows={3}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setEditingProject(null)}
                  className="px-6 py-2.5 text-base font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={() => handleSave(editingProject)}
                  disabled={isSaving}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-base font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Clock size={18} className="animate-spin" /> : <Save size={18} />}
                  Lưu cập nhật
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
