import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, MapPin, Building2, Calendar, Clock,
  Maximize2, X, Save, Pin, Check,
  Upload, Paperclip, FileText, Loader2, Download, ChevronDown, Info
} from 'lucide-react';
import { parseDate, formatDate, formatLocalDate } from '../lib/projectUtils';
import DatePicker, { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale';
import { uploadProjectFile, describeUploadFailures, downloadAttachment, isStoredAttachmentId } from '../utils/apiFetch';
import { useUploadConfig, checkUploadFiles, uploadExtensionsLabel, uploadAcceptAttr } from '../lib/uploadRules';
import { normalizeAgencyName } from '../lib/stepAgency';
import {
  MilestoneProgress, ProgressAttachment, activeMilestoneIndex, catalogMilestones, milestoneSideStatus
} from '../lib/stepProgress';
import "react-datepicker/dist/react-datepicker.css";

registerLocale('vi', vi);

// ② Gantt of one project by milestone (danh mục "Cấu hình Giai đoạn & Mốc Milestone", stage chosen in the
// combobox) with the quick progress entry ("+ nhập TT"). The values are computed by the server from the
// steps of the procedures linked to each milestone, and a date saved here is written onto those steps
// (src/lib/stepProgress.ts). Used by ProjectGanttDetail and the Dashboard App project detail.

export interface MilestoneGanttBoardProps {
  project: any;
  currentUser?: any;
  milestones?: Record<string, MilestoneProgress>;
  projectStages?: any[];
  processes?: any[];
  processingAgencies?: any[];
  onSubmitMilestone?: (projectId: string, changes: any[]) => Promise<boolean>;
}

const ALL_STAGES = 'Tất cả giai đoạn';
const COLUMN_THEMES = [
  { bg: 'bg-[#E3F2FD]', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-[#F3E5F5]', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-[#E8F5E9]', text: 'text-emerald-700', border: 'border-emerald-200' },
  { bg: 'bg-[#FFFDE7]', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-[#FBE9E7]', text: 'text-rose-700', border: 'border-rose-200' },
  { bg: 'bg-[#FCE4EC]', text: 'text-pink-700', border: 'border-pink-200' },
  { bg: 'bg-[#E0F7FA]', text: 'text-cyan-700', border: 'border-cyan-200' },
];
const OTHER_AGENCY_ROW = 'Cơ quan nhà nước';
const WARD_WORK_AGENCIES = ['UBND cấp xã, phường', 'Sở Quy hoạch Kiến trúc'];

const baseAgency = (name: any) => normalizeAgencyName(String(name ?? '').replace(/\s*\(.*\)\s*$/, ''));
const showDate = (v: string | undefined) => (v === 'X' ? 'Đã xong' : formatDate(v || ''));

const isLate = (plan: string, actual: string) => {
  const p = parseDate(plan);
  const a = parseDate(actual);
  return !!(p && a && a > p);
};

const KH_STYLES: Record<string, string> = {
  done: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-600 border border-amber-200',
  delayed: 'bg-rose-50 text-rose-700 border border-rose-200',
  not_started: 'bg-slate-50 text-slate-400 border border-slate-200'
};

export default function MilestoneGanttBoard({
  project, currentUser, milestones = {}, projectStages = [], processes = [], processingAgencies = [], onSubmitMilestone
}: MilestoneGanttBoardProps) {
  const allMilestones = useMemo(() => catalogMilestones(projectStages), [projectStages]);
  const stageNames = useMemo(
    () => Array.from(new Set(allMilestones.map(m => m.stage))),
    [allMilestones]
  );
  const projectList = useMemo(() => allMilestones.map(m => milestones[m.name]).filter(Boolean), [allMilestones, milestones]);
  const activeIdx = activeMilestoneIndex(projectList, project?.currentStepId);
  const [stage, setStage] = useState<string>(() => projectList[activeIdx]?.stage || stageNames[0] || ALL_STAGES);

  const shown = useMemo(
    () => projectList.filter(m => stage === ALL_STAGES || m.stage === stage),
    [projectList, stage]
  );
  const process = processes.find((p: any) => p.id === project?.processId);

  // Rows of agencies: the one in charge of each shown milestone (open step, or the one that finished it)
  const agencyRows = useMemo(() => {
    const rows: string[] = [];
    shown.forEach(m => {
      const row = m.linked && m.agency ? baseAgency(m.agency) : OTHER_AGENCY_ROW;
      if (!rows.includes(row)) rows.push(row);
    });
    return rows;
  }, [shown]);
  const rowOf = (m: MilestoneProgress) => (m.linked && m.agency ? baseAgency(m.agency) : OTHER_AGENCY_ROW);

  // Same rules as the server (canWriteStepSide); the server decides in the end
  const isSxdOrAdmin = currentUser?.roleId === 'Admin' || (currentUser?.userType === 'agency' && currentUser?.agencyId === '1');
  const isOwnInvestor = currentUser?.userType === 'investor' && project?.investor === currentUser?.investorId;
  const userAgency = baseAgency(processingAgencies.find((a: any) => a.id === currentUser?.agencyId)?.name);
  const canEditCdt = isSxdOrAdmin || isOwnInvestor;
  const canEditNn = (m: MilestoneProgress) => {
    if (isSxdOrAdmin) return true;
    if (!m.linked || currentUser?.userType !== 'agency') return false;
    const holder = baseAgency(m.agency);
    if (currentUser?.agencyId === '6') return WARD_WORK_AGENCIES.includes(holder);
    return !!userAgency && userAgency === holder;
  };

  const [editing, setEditing] = useState<MilestoneProgress | null>(null);
  const [cdtDate, setCdtDate] = useState('');
  const [cdtNote, setCdtNote] = useState('');
  const [cdtAtts, setCdtAtts] = useState<ProgressAttachment[]>([]);
  const [cdtFiles, setCdtFiles] = useState<File[]>([]);
  const [nnDate, setNnDate] = useState('');
  const [nnNote, setNnNote] = useState('');
  const [nnAtts, setNnAtts] = useState<ProgressAttachment[]>([]);
  const [nnFiles, setNnFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const uploadConfig = useUploadConfig();

  if (!project) return null;

  const openModal = (m: MilestoneProgress) => {
    setEditing(m);
    setCdtDate(m.cdtActual || '');
    setCdtNote(m.cdtNote || '');
    setCdtAtts(m.cdtAttachments || []);
    setCdtFiles([]);
    setNnDate(m.nnActual || '');
    setNnNote(m.nnNote || '');
    setNnAtts(m.nnAttachments || []);
    setNnFiles([]);
    setSaveError(null);
  };

  const download = (file: any) => {
    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    if (isStoredAttachmentId(file.id)) {
      downloadAttachment(file.id, file.name).then(r => { if (!r.ok) alert(r.error); });
    }
  };

  const save = async () => {
    if (!editing || !onSubmitMilestone) return;
    setSaving(true);
    setSaveError(null);
    try {
      const failures: { name: string; error: string }[] = [];
      const upload = async (files: File[]) => {
        const done: ProgressAttachment[] = [];
        for (const f of files) {
          const r = await uploadProjectFile(project.id, f);
          if (r.ok) done.push({ id: String(r.doc?.id), name: r.doc?.name || f.name, size: r.doc?.size });
          else failures.push({ name: f.name, error: r.error });
        }
        return done;
      };
      const changes: any[] = [];
      const sameList = (a: ProgressAttachment[], b: ProgressAttachment[]) => JSON.stringify(a.map(x => x.id)) === JSON.stringify(b.map(x => x.id));
      if (canEditCdt) {
        const atts = [...cdtAtts, ...(await upload(cdtFiles))];
        if (cdtDate !== (editing.cdtActual || '') || cdtNote !== (editing.cdtNote || '') || !sameList(atts, editing.cdtAttachments || [])) {
          changes.push({ milestone: editing.name, side: 'cdt', date: cdtDate, note: cdtNote, attachments: atts });
        }
      }
      if (canEditNn(editing)) {
        const atts = [...nnAtts, ...(await upload(nnFiles))];
        if (nnDate !== (editing.nnActual || '') || nnNote !== (editing.nnNote || '') || !sameList(atts, editing.nnAttachments || [])) {
          changes.push({ milestone: editing.name, side: 'nn', date: nnDate, note: nnNote, attachments: atts });
        }
      }
      if (failures.length > 0) alert(describeUploadFailures(failures));
      if (changes.length === 0) { setEditing(null); return; }
      const ok = await onSubmitMilestone(String(project.id), changes);
      if (ok) setEditing(null);
    } catch (err: any) {
      setSaveError(err?.message || 'Không lưu được tiến độ.');
    } finally {
      setSaving(false);
    }
  };

  const doneCount = shown.filter(m => m.nnActual || m.nnPlan === 'X').length;
  const indexOf = (m: MilestoneProgress) => projectList.indexOf(m);
  const procedureNames = (m: MilestoneProgress) =>
    (process?.parentSteps || []).filter((ps: any) => m.procedureIds.includes(String(ps.id))).map((ps: any) => ps.name);

  const renderAttachments = (list: ProgressAttachment[], setList: (l: ProgressAttachment[]) => void, files: File[], setFiles: (f: File[]) => void, editable: boolean, tone: 'blue' | 'amber') => (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Hồ sơ đính kèm</label>
        {editable && (
          <p className="text-[10px] text-slate-400 italic">
            {uploadExtensionsLabel(uploadConfig)} • Tối đa <span className="font-semibold text-slate-500">{uploadConfig.maxSizeMb} MB/tệp</span>
          </p>
        )}
      </div>
      {editable && (
        <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-sm">
          <Upload size={14} className={tone === 'blue' ? 'text-blue-600' : 'text-amber-600'} />
          <span>Chọn tệp đính kèm</span>
          <input
            type="file"
            multiple
            accept={uploadAcceptAttr(uploadConfig)}
            onChange={(e) => {
              if (e.target.files) {
                const { accepted, message } = checkUploadFiles(Array.from(e.target.files), uploadConfig);
                if (message) alert(message);
                setFiles([...files, ...accepted]);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
        </label>
      )}
      {(list.length > 0 || files.length > 0) ? (
        <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
          {list.map((file, idx) => (
            <div key={`att-${file.id}-${idx}`} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
              <button type="button" onClick={() => download(file)} className="flex items-center gap-2 min-w-0 pr-2 text-left hover:text-blue-600" title="Tải file về">
                <FileText size={14} className="text-blue-500 shrink-0" />
                <span className="font-medium text-slate-700 truncate">{file.name}</span>
                {file.size && <span className="text-[10px] text-slate-400 shrink-0">({file.size})</span>}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => download(file)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Tải file về"><Download size={14} /></button>
                {editable && (
                  <button type="button" onClick={() => setList(list.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-rose-500" title="Bỏ tệp khỏi mốc"><X size={14} /></button>
                )}
              </div>
            </div>
          ))}
          {files.map((file, idx) => (
            <div key={`new-${idx}`} className="flex items-center justify-between bg-blue-50/60 px-3 py-1.5 rounded-lg border border-blue-100 text-xs">
              <span className="flex items-center gap-2 min-w-0 pr-2">
                <Paperclip size={14} className="text-blue-600 shrink-0" />
                <span className="font-medium text-blue-900 truncate">{file.name}</span>
                <span className="text-[10px] text-blue-500 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
              </span>
              <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-rose-500" title="Bỏ tệp"><X size={14} /></button>
            </div>
          ))}
        </div>
      ) : (!editable && <p className="text-[11px] text-slate-400 italic">Không có tệp.</p>)}
    </div>
  );

  const renderSide = (side: 'cdt' | 'nn') => {
    if (!editing) return null;
    const isCdt = side === 'cdt';
    const editable = isCdt ? canEditCdt : canEditNn(editing);
    const plan = isCdt ? editing.cdtPlan : editing.nnPlan;
    const date = isCdt ? cdtDate : nnDate;
    const setDate = isCdt ? setCdtDate : setNnDate;
    const note = isCdt ? cdtNote : nnNote;
    const setNote = isCdt ? setCdtNote : setNnNote;
    const tone = isCdt ? 'blue' : 'amber';
    const planIso = plan && plan !== 'X' ? plan : '';
    return (
      <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
        <div className={`flex items-center gap-2 ${isCdt ? 'text-blue-600' : 'text-amber-600'} border-b border-slate-100 pb-2`}>
          {isCdt ? <Building2 size={16} /> : <Maximize2 size={16} />}
          <span className="text-[10px] font-black uppercase tracking-widest">{isCdt ? 'CĐT nộp (tiến độ)' : 'Cơ quan NN (tiến độ)'}</span>
          {!editable && <span className="ml-auto text-[9px] font-bold text-slate-400 normal-case">Chỉ xem</span>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400">
              Kế hoạch {isCdt ? 'CĐT' : 'NN'}: <span className="text-slate-600">{showDate(plan) || '--'}</span>
            </p>
            {editable && planIso && (
              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!date && date === planIso}
                  onChange={(e) => setDate(e.target.checked ? planIso : '')}
                  className="w-3 h-3 border-slate-300 rounded cursor-pointer"
                />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Lấy ngày KH</span>
              </label>
            )}
          </div>
          <div className="relative h-[44px]">
            <DatePicker
              selected={parseDate(date)}
              onChange={(d) => setDate(d ? formatLocalDate(d) : '')}
              dateFormat="dd/MM/yyyy"
              placeholderText="dd/mm/yyyy"
              locale="vi"
              portalId="root"
              maxDate={new Date()}
              disabled={!editable}
              className="w-full pl-4 pr-10 h-full bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Calendar size={16} /></div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Nội dung / Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            disabled={!editable}
            placeholder="Nhập nội dung hoặc ghi chú..."
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-slate-400 disabled:bg-slate-50"
          />
        </div>
        {isCdt
          ? renderAttachments(cdtAtts, setCdtAtts, cdtFiles, setCdtFiles, editable, tone)
          : renderAttachments(nnAtts, setNnAtts, nnFiles, setNnFiles, editable, tone)}
      </div>
    );
  };

  const statusOf = (m: MilestoneProgress, side: 'cdt' | 'nn') => milestoneSideStatus(m, side, indexOf(m), activeIdx);
  const canOpen = (m: MilestoneProgress) => canEditCdt || canEditNn(m);
  const offerInput = (m: MilestoneProgress, side: 'cdt' | 'nn') => {
    const plan = side === 'cdt' ? m.cdtPlan : m.nnPlan;
    if (plan === 'X') return false;
    if (!(side === 'cdt' ? canEditCdt : canEditNn(m))) return false;
    return !!plan || indexOf(m) <= activeIdx;
  };

  return (
    <>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col mb-6">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"><Maximize2 size={18} /></div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Sơ đồ gantt tiến độ thực hiện</h2>
          </div>
          <div className="relative w-64">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              aria-label="Giai đoạn"
              className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer"
            >
              <option>{ALL_STAGES}</option>
              {stageNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 italic">
            Giai đoạn này chưa có mốc tiến độ nào trong danh mục "Cấu hình Giai đoạn &amp; Mốc Milestone".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 table-fixed min-w-[720px]">
              <thead>
                <tr className="h-16">
                  <th className="sticky left-0 top-0 z-[60] bg-[#2C3E50] text-white text-[9px] font-black uppercase tracking-widest px-2 py-4 border-r border-slate-700 w-[120px]">Cơ quan NN</th>
                  <th className="sticky left-[120px] top-0 z-[60] bg-[#2C3E50] text-white px-1 py-4 border-r border-slate-700 w-10"></th>
                  {shown.map((m) => {
                    const t = COLUMN_THEMES[indexOf(m) % COLUMN_THEMES.length];
                    return (
                      <th key={m.name} title={m.linked ? `Thủ tục: ${procedureNames(m).join('; ')}` : 'Chưa có thủ tục nào của quy trình liên kết mốc này'}
                        className={`sticky top-0 z-50 px-1 py-4 border-r ${t.border} ${t.bg} ${t.text} text-[9px] font-black uppercase tracking-tighter text-center`}>
                        <div className="line-clamp-2">{m.name}</div>
                        {!m.linked && <div className="text-[8px] font-bold normal-case text-slate-400">(mốc riêng)</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Chủ đầu tư */}
                <tr>
                  <td rowSpan={2} className="sticky left-0 z-30 bg-white px-2 py-4 border-r border-b border-slate-200 align-middle">
                    <div className="text-[10px] font-black text-blue-700 leading-tight uppercase tracking-tighter">Chủ đầu tư</div>
                  </td>
                  <td className="sticky left-[120px] z-30 bg-white px-1 py-2 border-r border-b border-slate-200 text-center">
                    <span className="px-1.5 py-0.5 border border-blue-200 text-blue-600 text-[8px] font-black rounded-md uppercase">KH</span>
                  </td>
                  {shown.map(m => (
                    <td key={m.name} className="border-r border-b border-slate-100 p-1 relative bg-white h-12">
                      {m.cdtPlan && (
                        <div className={`absolute inset-y-2 left-1 right-1 rounded-lg flex items-center justify-center text-[10px] font-black uppercase leading-none ${KH_STYLES[statusOf(m, 'cdt')]}`}>
                          {statusOf(m, 'cdt') === 'done' && <Check size={10} strokeWidth={4} className="mr-0.5" />}{showDate(m.cdtPlan)}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="h-12">
                  <td className="sticky left-[120px] z-30 bg-[#F8FAFC] px-1 py-2 border-r border-b border-slate-200 text-center">
                    <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-black rounded-md uppercase">TT</span>
                  </td>
                  {shown.map(m => (
                    <td key={m.name} className="border-r border-b border-slate-100 p-1 relative bg-[#F8FAFC] h-12">
                      {m.cdtActual ? (
                        <div onClick={() => canOpen(m) && openModal(m)} title="Xem / sửa tiến độ"
                          className={`absolute inset-y-2 left-1 right-1 ${isLate(m.cdtPlan, m.cdtActual) ? 'bg-rose-500' : 'bg-blue-600'} rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-md ${canOpen(m) ? 'cursor-pointer hover:opacity-90' : ''}`}>
                          {formatDate(m.cdtActual)}
                        </div>
                      ) : offerInput(m, 'cdt') && (
                        <button onClick={() => openModal(m)} className="absolute inset-x-1 inset-y-3 border border-dashed border-blue-300 bg-blue-50/50 rounded-lg text-blue-500 text-[8px] font-bold hover:bg-blue-100 uppercase">
                          + nhập TT
                        </button>
                      )}
                    </td>
                  ))}
                </tr>

                {agencyRows.map(row => (
                  <React.Fragment key={row}>
                    <tr>
                      <td rowSpan={2} className="sticky left-0 z-30 bg-white px-2 py-4 border-r border-b border-slate-200 align-middle">
                        <div className="text-[10px] font-black text-slate-700 leading-tight uppercase tracking-tighter">{row}</div>
                      </td>
                      <td className="sticky left-[120px] z-30 bg-white px-1 py-2 border-r border-b border-slate-200 text-center">
                        <span className="px-1.5 py-0.5 border border-blue-200 text-blue-600 text-[8px] font-black rounded-md uppercase">KH</span>
                      </td>
                      {shown.map(m => (
                        <td key={m.name} className="border-r border-b border-slate-100 p-1 relative bg-white h-12">
                          {rowOf(m) === row && m.nnPlan && (
                            <div className={`absolute inset-y-2 left-1 right-1 rounded-lg flex items-center justify-center text-[10px] font-black uppercase leading-none ${KH_STYLES[statusOf(m, 'nn')]}`}>
                              {statusOf(m, 'nn') === 'done' && <Check size={10} strokeWidth={4} className="mr-0.5" />}{showDate(m.nnPlan)}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="h-12">
                      <td className="sticky left-[120px] z-30 bg-[#F8FAFC] px-1 py-2 border-r border-b border-slate-200 text-center">
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-black rounded-md uppercase">TT</span>
                      </td>
                      {shown.map(m => (
                        <td key={m.name} className="border-r border-b border-slate-100 p-1 relative bg-[#F8FAFC] h-12">
                          {rowOf(m) === row && (m.nnActual ? (
                            <div onClick={() => canOpen(m) && openModal(m)} title="Xem / sửa tiến độ"
                              className={`absolute inset-y-2 left-1 right-1 ${isLate(m.nnPlan, m.nnActual) ? 'bg-rose-500' : 'bg-blue-600'} rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-md ${canOpen(m) ? 'cursor-pointer hover:opacity-90' : ''}`}>
                              {formatDate(m.nnActual)}
                            </div>
                          ) : offerInput(m, 'nn') && (
                            <button onClick={() => openModal(m)} className="absolute inset-x-1 inset-y-3 border border-dashed border-blue-300 bg-blue-50/50 rounded-lg text-blue-500 text-[8px] font-bold hover:bg-blue-100 uppercase">
                              + nhập TT
                            </button>
                          ))}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 leading-tight">Nhập tiến độ thực hiện</h3>
                <p className="text-xs text-slate-400 font-medium truncate max-w-[400px]">{project.name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" disabled={saving} title="Đóng">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto grow">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Pin size={16} /></div>
                <div className="space-y-1">
                  <p className="text-sm font-black text-slate-900">Mốc: {editing.name}</p>
                  {editing.linked ? (
                    <p className="text-[11px] text-slate-500">
                      Thủ tục: {procedureNames(editing).join('; ')}
                      {editing.agency && <> · Cơ quan đang xử lý: <span className="font-bold">{editing.agency}</span></>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">Mốc chưa liên kết thủ tục nào của quy trình: tiến độ lưu riêng cho mốc.</p>
                  )}
                </div>
              </div>
              {editing.linked && (
                <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
                  <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                  <span>
                    Ngày CĐT nộp được ghi vào bước đầu của thủ tục. Ngày cơ quan hoàn thành sẽ đóng các bước còn đang mở của thủ tục
                    (màn "Cập nhật" theo bước sẽ thấy ngay).
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {renderSide('cdt')}
                {renderSide('nn')}
              </div>
              {saveError && <p role="alert" className="text-xs font-semibold text-rose-600">{saveError}</p>}
            </div>
            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-black rounded-2xl hover:bg-slate-50 disabled:opacity-50">
                Hủy
              </button>
              <button onClick={save} disabled={saving || !(canEditCdt || canEditNn(editing))} className="px-6 py-2.5 bg-blue-600 text-white text-sm font-black rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50">
                {saving ? <><Loader2 size={18} className="animate-spin" />Đang lưu...</> : <><Save size={18} />Lưu tiến độ</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
