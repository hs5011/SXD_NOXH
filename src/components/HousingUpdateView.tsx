import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, Clock, CheckCircle2, AlertCircle, 
  FileText, MessageSquare, History, Info, 
  ChevronRight, ChevronDown, Upload, Save, Send, AlertTriangle, Search,
  User, Calendar, Shield, MapPin, DollarSign,
  FileCheck, FileX, Paperclip, Download, Eye, Trash2,
  ArrowLeft, ListTodo, Route, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { parseDate, formatLocalDate, getAgencyWithDepartment, toDisplayDate, toDisplayDateTime, normalizeDatesInText } from '../lib/projectUtils';

registerLocale('vi', vi);

import { isStepCompleted, normalizeAgencyName } from '../lib/stepAgency';
import { legacyPhaseOf } from '../lib/stepProgress';
import { apiFetch, uploadProjectFile, describeUploadFailures, downloadAttachment, isStoredAttachmentId } from '../utils/apiFetch';
import { checkUploadFiles, normalizeUploadConfig, uploadExtensionsLabel, uploadAcceptAttr } from '../lib/uploadRules';

// --- Types ---
import { Process, ParentStep, ChildStep } from './StepManagementView';
import { isDateAfter } from '../lib/dateCompare';
import { isValidDateInput, INVALID_DATE_MESSAGE } from '../lib/dateInput';

interface ExtendedParentStep extends ParentStep {
  status?: string;
}

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  location: string;
  type: string;
  fundingSource: string;
  currentStage: string;
  currentStep: string;
  processingAgency: string;
  processingDept: string;
  status: string;
  completionRate: number;
  isPublicInvestment: boolean;
  processId?: string;
  milestones?: Record<string, {
    agency?: string;
    investor?: string;
  }>;
  implementationPlan?: Record<string, {
    agencyActualDate?: string;
    investorActualDate?: string;
  }>;
}

// --- Mock Data ---

// Blank placeholder used only when no project is passed in (keeps the screen from crashing).
// It carries NO sample values: every field is empty, so nothing fake can reach the statistics.
const EMPTY_PROJECT: Project = {
  id: '',
  code: '',
  name: '',
  investor: '',
  location: '',
  type: '',
  fundingSource: '',
  currentStage: '',
  currentStep: '',
  processingAgency: '',
  processingDept: '',
  status: '',
  completionRate: 0,
  isPublicInvestment: false,
  processId: '',
  milestones: {},
  implementationPlan: {}
} as Project;

// Step statuses that close the step: only these record an actual completion date
const DONE_STATUSES = ['Hoàn thành', 'Đã phê duyệt'];

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface HousingUpdateViewProps {
  project?: any;
  currentUser?: any;
  onBack?: () => void;
  // Kept for callers of the former flow; progress is saved through onSubmitStep
  onSuccess?: (updatedProject: any) => boolean | void | Promise<boolean | void>;
  // Saves one side of one step on the server (POST /api/projects/:id/progress/step). Resolves with the
  // recomputed project, null when queued offline; rejects with the server's message.
  onSubmitStep?: (projectId: string, payload: any) => Promise<any>;
  processingAgencies?: any[];
  stepStatuses?: string[];
  processes?: Process[];
  initialStepId?: string;
  initialSubStepId?: string;
  // The account may follow this project but not update it (e.g. a ward before its own step)
  readOnly?: boolean;
}

export default function HousingUpdateView({ 
  project: initialProject, 
  currentUser,
  onBack,
  onSuccess,
  onSubmitStep,
  processingAgencies = [],
  stepStatuses = ['Chưa bắt đầu', 'Đang xử lý', 'Chờ bổ sung hồ sơ', 'Đã trình', 'Đã phê duyệt', 'Hoàn thành', 'Bị trả hồ sơ', 'Tạm dừng'],
  processes = [],
  initialStepId,
  initialSubStepId,
  readOnly = false
}: HousingUpdateViewProps) {
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});
  const toggleStage = (stage: string) => {
    setCollapsedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
  };
  const [project, setProject] = useState<any>(initialProject || EMPTY_PROJECT);
  const [activeStepId, setActiveStepId] = useState<string>(initialStepId || '');
  const [activeSubStepId, setActiveSubStepId] = useState<string>(initialSubStepId || '');
  const [activeTab, setActiveTab] = useState<'substeps' | 'docs' | 'process' | 'history'>('substeps');
  const [historyPage, setHistoryPage] = useState(1);
  const itemsPerPage = 10;

  const [isSaving, setIsSaving] = useState(false);
  const [nextStepIds, setNextStepIds] = useState<string[]>([]);
  const [completionDate, setCompletionDate] = useState<string>(todayYmd);
  const [currentStatus, setCurrentStatus] = useState<string>('Đang xử lý');
  const isStepDone = DONE_STATUSES.includes(currentStatus);
  // Typed text that is not a date (the picker would silently keep the previous value)
  const [completionDateError, setCompletionDateError] = useState<string | null>(null);
  // Last text typed in the date field: the picker empties the input before onBlur fires
  const rawCompletionDateRef = useRef('');
  const [processingContent, setProcessingContent] = useState<string>('');
  const [isNextStepDropdownOpen, setIsNextStepDropdownOpen] = useState(false);
  const [nextStepSearch, setNextStepSearch] = useState('');
  // Closing a step requires choosing who takes the file next (unless no later step is left)
  const [nextStepError, setNextStepError] = useState<string | null>(null);
  useEffect(() => { setNextStepError(null); }, [nextStepIds, currentStatus, activeSubStepId]);

  // Status / date the form starts from for a step: its saved status (when still in the catalog) with the
  // actual or expected date, else "Đang xử lý" today
  const stepFormState = (proj: any, subStepId: string): { status: string; date: string } => {
    const ip = proj?.implementationPlan?.[subStepId] || {};
    const saved = ip.agencyStatus;
    if (saved && stepStatuses.includes(saved)) {
      const date = DONE_STATUSES.includes(saved) ? ip.agencyActualDate : ip.agencyExpectedDate;
      return { status: saved, date: date || todayYmd() };
    }
    return { status: 'Đang xử lý', date: todayYmd() };
  };
  // CĐT side of the selected step: date the investor submitted the file, and a note
  const [cdtDate, setCdtDate] = useState('');
  const [cdtNote, setCdtNote] = useState('');
  const [isSavingCdt, setIsSavingCdt] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cdtError, setCdtError] = useState<string | null>(null);

  // Selecting another step in the table loads that step's saved status
  useEffect(() => {
    if (!activeSubStepId) return;
    const formState = stepFormState(project, activeSubStepId);
    setCurrentStatus(formState.status);
    setCompletionDate(formState.date);
    const ip = project?.implementationPlan?.[activeSubStepId] || {};
    setCdtDate(ip.investorActualDate || '');
    setCdtNote(ip.investorNote || '');
    setSaveError(null);
    setCdtError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubStepId]);

  // PostgreSQL Integrated Extra Details States
  const [attachments, setAttachments] = useState<any[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  const paginatedLogs = useMemo(() => historyLogs.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage), [historyLogs, historyPage]);
  const totalPages = useMemo(() => Math.ceil(historyLogs.length / itemsPerPage), [historyLogs]);

  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileErrorMsg, setFileErrorMsg] = useState<string | null>(null);
  const [uploadConfig, setUploadConfig] = useState<any>({
    allowedExtensions: 'JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR',
    maxSizeMb: 20
  });

  const fetchAttachments = async (projId: string) => {
    if (!projId || String(projId).trim() === '' || String(projId) === 'undefined') {
      setAttachments([]);
      return;
    }
    setIsLoadingAttachments(true);
    try {
      const res = await apiFetch(`/api/projects/${projId}/attachments`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          console.warn('Received HTML response instead of JSON. Skipping attachments fetch.');
          setAttachments([]);
          return;
        }
        const data = await res.json();
        setAttachments(data);
      } else {
        setAttachments([]);
      }
    } catch (err) {
      console.error('Error fetching database attachments:', err);
      setAttachments([]);
    } finally {
      setIsLoadingAttachments(false);
    }
  };

  const fetchHistory = async (projId: string) => {
    if (!projId || String(projId).trim() === '' || String(projId) === 'undefined') {
      setHistoryLogs([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const res = await apiFetch(`/api/projects/${projId}/history`);
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
      console.error('Error fetching database history:', err);
      setHistoryLogs([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchUploadConfig = async () => {
    try {
      const res = await apiFetch(`/api/upload-config`);
      if (res.ok) {
        const data = await res.json();
        setUploadConfig(data);
      }
    } catch (err) {
      console.error('Lỗi tải cấu hình upload:', err);
    }
  };

  useEffect(() => {
    fetchUploadConfig();
  }, []);

  useEffect(() => {
    if (project?.id && String(project.id).trim() !== '' && String(project.id) !== 'undefined') {
      fetchAttachments(project.id);
      fetchHistory(project.id);
    } else {
      setAttachments([]);
      setHistoryLogs([]);
    }
  }, [project?.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileErrorMsg(null);
    if (e.target.files) {
      const { accepted, message } = checkUploadFiles(Array.from(e.target.files), normalizeUploadConfig(uploadConfig));
      if (message) setFileErrorMsg(message);

      setSelectedFiles(prev => [...prev, ...accepted]);
      e.target.value = ''; // Reset file input value to allow uploading the same file again
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDownloadFile = (att: any) => {
    if (!att) return;
    
    if (att instanceof File) {
      const url = URL.createObjectURL(att);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // Stored files are fetched through the signed-in API by numeric id (no file name in the URL)
    if (isStoredAttachmentId(att.id)) {
      downloadAttachment(att.id, att.name).then(r => { if (!r.ok) alert(r.error); });
    } else if (att.url) {
      window.open(att.url, '_blank');
    }
  };

  const removeAttachment = async (id: number) => {
    const fileName = attachments.find(att => att.id === id)?.name || 'tệp này';
    if (!window.confirm(`Xóa vĩnh viễn "${fileName}" khỏi hồ sơ dự án? Thao tác này không thể hoàn tác.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/attachments/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setAttachments(attachments.filter(att => att.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Không xóa được tệp. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error("Error deleting attachment:", err);
      alert('Không kết nối được máy chủ để xóa tệp.');
    }
  };

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

  const selectedProcess = processes.find(p => p.id === project.processId);
  const steps: ExtendedParentStep[] = selectedProcess?.parentSteps || [];

  // Step selection is (re)initialised only when the project, the requested step or the process
  // definitions change, not when App hands back the same project after a save
  const stepInitKeyRef = useRef('');
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
      const initKey = `${initialProject.id}|${initialProject.processId}|${initialStepId || ''}|${initialSubStepId || ''}|${processes.length}`;
      if (stepInitKeyRef.current === initKey) return;
      stepInitKeyRef.current = initKey;
      const proc = processes.find(p => p.id === initialProject.processId);
      if (proc && proc.parentSteps.length > 0) {
        // Use initial IDs if provided, otherwise find first valid
        if (initialStepId && proc.parentSteps.some(s => s.id === initialStepId)) {
          setActiveStepId(initialStepId);
          if (initialSubStepId) {
            const parent = proc.parentSteps.find(s => s.id === initialStepId);
            if (parent?.childSteps?.some(cs => cs.id === initialSubStepId)) {
              setActiveSubStepId(initialSubStepId);
            } else if (parent?.childSteps?.length > 0) {
              setActiveSubStepId(parent.childSteps[0].id);
            }
          } else {
            const parent = proc.parentSteps.find(s => s.id === initialStepId);
            if (parent?.childSteps?.length > 0) {
              setActiveSubStepId(parent.childSteps[0].id);
            }
          }
        } else {
          // Fallback to first step if no initial IDs or invalid
          const isValid = proc.parentSteps.some(s => s.id === activeStepId);
          if (!activeStepId || !isValid) {
            setActiveStepId(proc.parentSteps[0].id);
            if (proc.parentSteps[0].childSteps?.length > 0) {
              setActiveSubStepId(proc.parentSteps[0].childSteps[0].id);
            }
          } else {
            const currentStep = proc.parentSteps.find(s => s.id === activeStepId);
            const isSubValid = currentStep?.childSteps?.some(s => s.id === activeSubStepId);
            if (!activeSubStepId || !isSubValid) {
              if (currentStep?.childSteps && currentStep.childSteps.length > 0) {
                setActiveSubStepId(currentStep.childSteps[0].id);
              }
            }
          }
        }
      }
    }
  }, [initialProject, processes, initialStepId, initialSubStepId]);

  useEffect(() => {
    const currentStep = steps.find(s => s.id === activeStepId);
    if (currentStep && currentStep.childSteps && currentStep.childSteps.length > 0) {
      // Only reset if current activeSubStep is not in the new activeStep's children
      if (!currentStep.childSteps.find(cs => cs.id === activeSubStepId)) {
        setActiveSubStepId(currentStep.childSteps[0].id);
      }
    }
  }, [activeStepId, steps]);
  
  const activeStep = steps.find(s => s.id === activeStepId) || steps[0];
  const activeSubStep = activeStep?.childSteps?.find(cs => cs.id === activeSubStepId) || activeStep?.childSteps?.[0];

  // HXL of a step. A step without its own date shows the milestone plan kept in the former columns only
  // when no step of its procedure has one, and only on the step the server writes that plan to (CĐT →
  // first step, CQNN → last step): copied onto every step it looked like each step had that deadline.
  const stepPlanDate = (parent: any, child: any, side: 'cdt' | 'nn'): string => {
    const field = side === 'cdt' ? 'investor' : 'agency';
    const own = project.milestones?.[child?.id]?.[field];
    if (own) return own;
    const children: any[] = parent?.childSteps || [];
    if (children.some(c => project.milestones?.[c.id]?.[field])) return '';
    const anchor = side === 'cdt' ? children[0] : children[children.length - 1];
    if (!anchor || anchor.id !== child?.id) return '';
    const linked = parent?.milestoneName;
    const phase = linked ? legacyPhaseOf(linked) : undefined;
    const key = linked ? (phase ? `${phase.planKey}_${side}_date` : null) : getStepDateKey(child.name, parent?.name || '', side === 'cdt');
    return (key && project[key]) || '';
  };

  // Get all sub-steps for the "Next Step" select
  const allSubSteps = steps.flatMap(s => s.childSteps || []);

  const addDays = (dateStr: string, days: number) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '---';
    date.setDate(date.getDate() + (days || 0));
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === '---') return dateStr || '---';
    return toDisplayDate(dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Hoàn thành': return 'bg-emerald-500';
      case 'Đang xử lý': return 'bg-blue-500';
      case 'Chờ bổ sung hồ sơ': return 'bg-amber-500';
      case 'Bị trả hồ sơ': return 'bg-rose-500';
      default: return 'bg-slate-300';
    }
  };

  const getStatusLabel = (status: string) => {
    return status;
  };

  const getSubStepStatus = (childId: string) => {
    const milestone = project.milestones?.[childId];
    const actual = project.implementationPlan?.[childId];
    
    if (!milestone && !actual) return 'not_started';

    const hasAgencyActual = !!actual?.agencyActualDate;
    const hasInvestorActual = !!actual?.investorActualDate;
    
    if (!hasAgencyActual && !hasInvestorActual) return 'not_started';

    const isAgencyOverdue = hasAgencyActual && milestone?.agency && actual?.agencyActualDate && isDateAfter(actual.agencyActualDate, milestone.agency);
    const isInvestorOverdue = hasInvestorActual && milestone?.investor && actual?.investorActualDate && isDateAfter(actual.investorActualDate, milestone.investor);

    if (isAgencyOverdue || isInvestorOverdue) return 'overdue';
    
    return 'completed';
  };

  // Who records what on the selected step (same rules as the server, which decides in the end):
  //   CQNN side → the agency of the step (a ward also its SQHKT planning step; the investor for a
  //   "Chủ đầu tư" step); CĐT side → the project's investor. Sở Xây dựng / Admin record both.
  const baseAgency = (name: any) => normalizeAgencyName(String(name ?? '').replace(/\s*\(.*\)\s*$/, ''));
  const isSxdOrAdmin = currentUser?.roleId === 'Admin' || (currentUser?.userType === 'agency' && currentUser?.agencyId === '1');
  const isOwnInvestor = currentUser?.userType === 'investor' && !!project.investor && project.investor === currentUser?.investorId;
  const stepAgency = baseAgency(activeSubStep?.agency);
  const isInvestorStep = stepAgency === 'Chủ đầu tư';
  const userAgency = baseAgency(processingAgencies.find((a: any) => a.id === currentUser?.agencyId)?.name);
  const canEditNn = !readOnly && !!activeSubStep && (
    isSxdOrAdmin
    || (isInvestorStep && isOwnInvestor)
    || (currentUser?.userType === 'agency' && (
      currentUser?.agencyId === '6'
        ? ['UBND cấp xã, phường', 'Sở Quy hoạch Kiến trúc'].includes(stepAgency)
        : !!userAgency && userAgency === stepAgency
    ))
  );
  const canEditCdt = !readOnly && !!activeSubStep && (isSxdOrAdmin || isOwnInvestor);
  const activeIsSkipped = !!project.implementationPlan?.[activeSubStepId]?.skipped;

  const moveToCurrentStep = (updated: any) => {
    const target = updated?.currentStepId;
    const parent = target ? steps.find(s => (s.childSteps || []).some(cs => cs.id === target)) : undefined;
    const sub = target && parent ? target : activeSubStepId;
    if (parent && target) {
      setActiveStepId(parent.id);
      setActiveSubStepId(target);
    }
    const formState = stepFormState(updated, sub);
    setCurrentStatus(formState.status);
    setCompletionDate(formState.date);
    const ip = updated?.implementationPlan?.[sub] || {};
    setCdtDate(ip.investorActualDate || '');
    setCdtNote(ip.investorNote || '');
  };

  // ① CQNN side of the selected step
  const handleSave = async () => {
    if (!canEditNn || completionDateError || !onSubmitStep) return;
    setSaveError(null);
    if (!completionDate) {
      setCompletionDateError('Vui lòng nhập ngày hoàn thành.');
      return;
    }
    if (isStepDone && completionDate > todayYmd()) {
      setCompletionDateError('Ngày hoàn thành thực tế không được sau ngày hôm nay.');
      return;
    }
    if (isStepDone && nextStepIds.length === 0) {
      const idx = allSubSteps.findIndex(s => s.id === activeSubStepId);
      const laterStepOpen = allSubSteps
        .slice(idx + 1)
        .some(s => !isStepCompleted(s.id, project.milestones || {}, project.implementationPlan || {}));
      if (idx !== -1 && laterStepOpen) {
        setNextStepError('Bước này đã kết thúc: vui lòng chọn "Bước tiếp theo" để chuyển hồ sơ cho cơ quan xử lý tiếp.');
        return;
      }
    }
    setIsSaving(true);
    try {
      // Files first: the step keeps the list of what was attached with this update
      const uploadFailures: { name: string; error: string }[] = [];
      const uploaded: { id: string; name: string; size?: string }[] = [];
      for (const file of selectedFiles) {
        const r = await uploadProjectFile(project.id, file);
        if (r.ok) uploaded.push({ id: String(r.doc?.id), name: r.doc?.name || file.name, size: r.doc?.size });
        else uploadFailures.push({ name: file.name, error: r.error });
      }
      if (uploadFailures.length > 0) alert(describeUploadFailures(uploadFailures));

      const previous = project.implementationPlan?.[activeSubStepId]?.agencyAttachments || [];
      const updated = await onSubmitStep(project.id, {
        stepId: activeSubStepId,
        side: 'nn',
        status: currentStatus,
        date: completionDate,
        note: processingContent,
        attachments: uploaded.length > 0 ? [...previous, ...uploaded] : undefined,
        nextStepIds: isStepDone ? nextStepIds : []
      });
      if (updated) {
        setProject(updated);
        setSelectedFiles([]);
        setProcessingContent('');
        setNextStepIds([]);
        moveToCurrentStep(updated);
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Không lưu được cập nhật.');
    } finally {
      setIsSaving(false);
      fetchAttachments(project.id);
      fetchHistory(project.id);
    }
  };

  // ① CĐT side of the selected step (date the investor submitted the file)
  const handleSaveCdt = async () => {
    if (!canEditCdt || !onSubmitStep) return;
    setCdtError(null);
    if (cdtDate && cdtDate > todayYmd()) {
      setCdtError('Ngày nộp hồ sơ không được sau ngày hôm nay.');
      return;
    }
    setIsSavingCdt(true);
    try {
      // Clearing a submission date that was recorded clears its note too
      const hadDate = !!project.implementationPlan?.[activeSubStepId]?.investorActualDate;
      const note = hadDate && !cdtDate ? '' : cdtNote;
      const updated = await onSubmitStep(project.id, { stepId: activeSubStepId, side: 'cdt', date: cdtDate, note });
      if (updated) {
        setProject(updated);
        const ip = updated.implementationPlan?.[activeSubStepId] || {};
        setCdtDate(ip.investorActualDate || '');
        setCdtNote(ip.investorNote || '');
      }
    } catch (err: any) {
      setCdtError(err?.message || 'Không lưu được tiến độ chủ đầu tư.');
    } finally {
      setIsSavingCdt(false);
      fetchHistory(project.id);
    }
  };

  return (
    <div className="flex flex-col space-y-2.5 max-w-7xl mx-auto w-full px-4 sm:px-6 py-2 font-sans text-slate-800 antialiased">
      {/* A. HEADER THÔNG TIN DỰ ÁN */}
      <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all"
                title="Quay lại"
              >
                <ArrowLeft size={15} />
              </button>
            )}
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded border border-blue-100">
              {project.code}
            </span>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded border border-emerald-100">
              {project.status === 'Delayed' || project.status === 'Trễ' ? 'Chậm tiến độ' : 'Đang xử lý'}
            </span>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            hidden={!canEditNn}
            className={`flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 transition-all ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {isSaving ? 'Đang lưu...' : 'Lưu cập nhật'}
          </button>
        </div>

        <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{project.name}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-xs sm:text-sm font-medium uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span>Quy trình:</span>
            <span className="text-blue-700 font-bold">{selectedProcess?.name || 'Chưa gán quy trình'}</span>
          </div>
          <div className="hidden sm:block text-slate-300">|</div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <User size={13} className="text-slate-400 shrink-0" />
            <span>{project.investor || 'Chưa có chủ đầu tư'}</span>
          </div>
          <div className="hidden sm:block text-slate-300">|</div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <MapPin size={13} className="text-slate-400 shrink-0" />
            <span>{project.location}</span>
          </div>
        </div>
      </div>

      {/* CURRENT STEP BANNER CARD */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <FileText size={17} />
          </div>
          <div>
            <p className="text-sm sm:text-base font-bold text-slate-900">
              Bước hiện tại: <span className="text-blue-700 font-bold">{activeSubStep?.name || activeStep?.name}</span>
            </p>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Thủ tục: {activeStep?.name || '—'}
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 min-w-[180px] w-full md:w-auto shrink-0 text-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center border-b border-slate-200 pb-1 mb-2">HXL Kế hoạch</p>
          <div className="space-y-1 font-sans">
            <div className="flex items-center justify-between text-xs sm:text-sm gap-4">
              <span className="text-slate-500 font-bold uppercase tracking-wider">CQNN</span>
              <span className="font-bold text-slate-800">
                {formatDate(stepPlanDate(activeStep, activeSubStep, 'nn')) || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm gap-4">
              <span className="text-slate-500 font-bold uppercase tracking-wider">CĐT</span>
              <span className="font-bold text-rose-700">
                {formatDate(stepPlanDate(activeStep, activeSubStep, 'cdt')) || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {!canEditNn && (
        <div role="status" className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2">
          <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-amber-800">
            {readOnly
              ? 'Bạn đang xem tiến độ dự án trên địa bàn. Dự án chưa đến bước do đơn vị bạn xử lý nên chưa thể cập nhật.'
              : canEditCdt
                ? 'Trạng thái xử lý của bước này do ' + (activeSubStep?.agency || 'cơ quan xử lý') + ' cập nhật. Bạn cập nhật ngày nộp hồ sơ ở mục "Tiến độ chủ đầu tư" bên dưới.'
                : 'Bước này do ' + (activeSubStep?.agency || 'cơ quan khác') + ' xử lý: bạn chỉ xem được tiến độ.'}
          </p>
        </div>
      )}
      {activeIsSkipped && (
        <div role="status" className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2">
          <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-slate-600">
            Bước này thuộc nhánh không áp dụng: thủ tục đã kết thúc qua nhánh khác.
          </p>
        </div>
      )}
      {saveError && (
        <div role="alert" className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-rose-700">{saveError}</p>
        </div>
      )}

      {/* TWO-COLUMN UPDATE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3" hidden={!canEditNn}>
        {/* Left Column: Nội dung xử lý */}
        <div className="lg:col-span-8 bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider">NỘI DUNG XỬ LÝ</h4>
          </div>

          <div className="space-y-4">
            <textarea 
              className="w-full p-3 bg-white border border-slate-200 rounded-lg min-h-[100px] focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm font-medium text-slate-800 placeholder:text-slate-350 font-sans"
              placeholder="Nhập nội dung xử lý chi tiết... Ví dụ: Đã tiếp nhận hồ sơ, đang thẩm định tính pháp lý dự án, yêu cầu bổ sung giấy tờ..."
              value={processingContent}
              onChange={(e) => setProcessingContent(e.target.value)}
              maxLength={2000}
            />

            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-2">
              <Info size={16} className="text-blue-600 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold text-blue-800">Vui lòng cập nhật trạng thái và ngày hoàn thành trước khi lưu.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">{isStepDone ? 'Ngày hoàn thành thực tế' : 'Ngày hoàn thành dự kiến'}</label>
                <div className="relative h-[38px] sm:h-[40px]">
                  <DatePicker 
                    selected={parseDate(completionDate)}
                    onChange={(date) => {
                      setCompletionDate(date ? formatLocalDate(date) : '');
                      if (date) { rawCompletionDateRef.current = ''; setCompletionDateError(null); }
                    }}
                    onChangeRaw={(e: any) => { rawCompletionDateRef.current = e?.target?.value ?? ''; }}
                    onBlur={() => {
                      setCompletionDateError(isValidDateInput(rawCompletionDateRef.current) ? null : INVALID_DATE_MESSAGE);
                    }}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="dd/mm/yyyy"
                    locale="vi"
                    portalId="root"
                    className="w-full pl-9 pr-3 h-full bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 font-sans outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
                  />
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
                {completionDateError && (
                  <p className="text-xs font-semibold text-rose-600 flex items-center gap-1 ml-0.5">
                    <AlertCircle size={12} /> {completionDateError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">
                  Trạng thái <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select 
                    className="w-full pl-3 pr-9 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all text-sm font-semibold text-slate-800 appearance-none cursor-pointer font-sans"
                    value={currentStatus}
                    onChange={(e) => setCurrentStatus(e.target.value)}
                  >
                    {stepStatuses.map(status => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">Hồ sơ đính kèm</label>
                {uploadConfig && (
                  <p className="text-xs text-slate-450 italic ml-0.5">
                    {uploadExtensionsLabel(normalizeUploadConfig(uploadConfig))} • Tối đa <span className="font-semibold text-slate-500">{uploadConfig.maxSizeMb} MB/tệp</span>
                  </p>
                )}
              </div>
              
              {fileErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg text-xs whitespace-pre-line leading-normal flex gap-2 font-sans">
                  <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>{fileErrorMsg}</div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <input 
                  type="file" 
                  id="project-file-upload-input" 
                  multiple 
                  accept={uploadAcceptAttr(normalizeUploadConfig(uploadConfig))}
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                <button 
                  type="button"
                  onClick={() => document.getElementById('project-file-upload-input')?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-dashed border-slate-200 text-slate-500 rounded-lg text-sm font-semibold hover:bg-slate-100 hover:border-slate-300 hover:text-slate-700 transition-all justify-center group font-sans"
                >
                  <Paperclip size={16} className="group-hover:scale-110 transition-transform text-slate-400" />
                  Chọn tệp tin đính kèm <span className="text-xs text-slate-400 font-normal">(Có thể chọn nhiều file)</span>
                </button>
                
                {selectedFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="px-3 py-1.5 bg-blue-50/70 text-blue-900 rounded-lg text-xs font-bold flex items-center justify-between border border-blue-100 group font-sans">
                        <button
                          type="button"
                          onClick={() => {
                            const url = URL.createObjectURL(file);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = file.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-2 min-w-0 pr-2 hover:text-blue-700 cursor-pointer text-left truncate"
                          title="Nhấp để tải tệp về máy"
                        >
                          <Paperclip size={14} className="text-blue-600 shrink-0" />
                          <span className="truncate underline-offset-2 hover:underline">{file.name}</span>
                          <span className="text-[10px] text-blue-500 font-medium shrink-0">({file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`})</span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => {
                              const url = URL.createObjectURL(file);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-100/80 rounded transition-colors"
                            title="Tải tệp về"
                          >
                            <Download size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleRemoveSelectedFile(idx)}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                            title="Xóa tệp"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Cập nhật trạng thái & Dự kiến */}
        <div className="lg:col-span-4 bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider">CẬP NHẬT TRẠNG THÁI</h4>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">Bước tiếp theo{isStepDone && <span className="text-rose-500"> *</span>}</label>
              {nextStepError && (
                <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {nextStepError}
                </p>
              )}
              <div className="space-y-2 font-sans">
                {/* Selected Steps Tags */}
                {nextStepIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {nextStepIds.map(id => {
                      const step = allSubSteps.find(s => s.id === id);
                      return (
                        <div key={id} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold flex items-center gap-1.5 border border-blue-100 max-w-full">
                          <span className="truncate max-w-[200px]">{step?.name}</span>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNextStepIds(nextStepIds.filter(i => i !== id));
                            }} 
                            className="text-blue-500 hover:text-blue-700 font-bold leading-none px-1 text-sm shrink-0"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Searchable Dropdown to add steps */}
                <div className="relative z-10">
                  {isNextStepDropdownOpen && (
                    <div 
                      className="fixed inset-0 z-30 bg-transparent" 
                      onClick={() => setIsNextStepDropdownOpen(false)}
                    />
                  )}
                  
                  <div 
                    onClick={() => setIsNextStepDropdownOpen(!isNextStepDropdownOpen)}
                    className="w-full pl-3 pr-9 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none transition-all cursor-pointer text-slate-800 flex items-center justify-between min-h-[40px] hover:border-blue-300 shadow-sm relative z-40"
                  >
                    <span className="truncate select-none text-slate-400 font-medium">-- Chọn bước tiếp theo --</span>
                    <ChevronDown size={16} className="text-slate-400 shrink-0 ml-1" />
                  </div>

                  {isNextStepDropdownOpen && (
                    // Anchored to the right edge and wider than the narrow side column, so long
                    // procedure names stay readable; height capped to the viewport
                    <div className="absolute right-0 mt-1 w-[min(28rem,calc(100vw-2rem))] max-h-[min(500px,60vh)] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 font-sans space-y-2">
                      {/* Search box inside dropdown */}
                      <div className="relative sticky top-0 bg-white pb-2 pt-1 border-b border-slate-100 z-10 flex items-center">
                        <Search size={14} className="absolute left-2.5 text-slate-400" />
                        <input
                          type="text"
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-100 focus:border-blue-300 focus:bg-white font-medium text-slate-800"
                          placeholder="Tìm kiếm bước..."
                          value={nextStepSearch}
                          onChange={(e) => setNextStepSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      </div>
                      
                      {/* List options */}
                      <div className="pt-1.5 space-y-2 max-h-[450px] overflow-y-auto">
                        {(() => {
                          const groups = steps.map(parent => {
                            const filteredChildren = (parent.childSteps || [])
                              .filter(ss => ss.id !== activeSubStepId && !nextStepIds.includes(ss.id))
                              .filter(ss => ss.name.toLowerCase().includes(nextStepSearch.toLowerCase()));
                            
                            return {
                              parentName: parent.name,
                              childSteps: filteredChildren
                            };
                          }).filter(group => group.childSteps.length > 0);
                          
                          if (groups.length === 0) {
                            return (
                              <div className="p-3 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                                Không tìm thấy kết quả
                              </div>
                            );
                          }

                          return groups.map((group, groupIdx) => (
                            <div key={groupIdx} className="space-y-1">
                              {/* Parent Step / Procedure Header */}
                              <div className="px-3 py-1.5 text-xs font-extrabold text-blue-900 uppercase tracking-wider bg-slate-50 border-l-4 border-blue-500 rounded-r select-none">
                                {group.parentName}
                              </div>
                              {/* Child Steps / Procedures */}
                              <div className="pl-3 space-y-1">
                                {group.childSteps.map(ss => (
                                  <div 
                                    key={ss.id}
                                    onClick={() => {
                                      setNextStepIds([...nextStepIds, ss.id]);
                                      setNextStepSearch('');
                                      setIsNextStepDropdownOpen(false);
                                    }}
                                    className="px-3 py-2 hover:bg-blue-50 hover:text-blue-800 text-slate-800 rounded text-sm font-semibold cursor-pointer transition-colors leading-tight"
                                  >
                                    {ss.name}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider">NGÀY HOÀN THÀNH DỰ KIẾN</h4>
            </div>

            <div className="space-y-3">
              {nextStepIds.length === 0 ? (
                <div className="p-5 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 space-y-2 min-h-[120px]">
                  <Calendar size={24} className="text-slate-300" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">CHƯA CHỌN BƯỚC TIẾP THEO</p>
                </div>
              ) : (
                nextStepIds.map(id => {
                  const step = allSubSteps.find(s => s.id === id);
                  if (!step) return null;
                  return (
                    <div key={id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 shadow-sm hover:shadow transition-all font-sans">
                      <p className="text-sm font-bold text-blue-800 mb-2 uppercase tracking-tight">{step.name}</p>
                      <div className="flex items-end justify-between text-xs gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cơ quan chủ trì</p>
                          <p className="text-sm font-semibold text-slate-800">{getAgencyWithDepartment(step.agency, step.department, step.name)}</p>
                        </div>
                        <div className="space-y-1 text-right">
                          {(() => {
                            // An entered plan of the next step is kept (src/lib/stepProgress applyStepUpdate)
                            const plan = project.milestones?.[id] as any;
                            const kept = plan?.agency && !plan?.agencyAuto;
                            return (
                              <>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kept ? 'HXL kế hoạch (giữ nguyên)' : 'HXL dự kiến'}</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {kept ? formatDate(plan.agency) : addDays(completionDate, step.slaDays)}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CĐT SIDE OF THE SELECTED STEP: date the investor submitted the file */}
      {activeSubStep && (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-4 bg-emerald-600 rounded-full" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wider">Tiến độ chủ đầu tư</h4>
              <span className="text-xs text-slate-400 font-medium normal-case">— bước: {activeSubStep.name}</span>
            </div>
            {canEditCdt && (
              <button
                type="button"
                onClick={handleSaveCdt}
                disabled={isSavingCdt}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save size={14} /> {isSavingCdt ? 'Đang lưu...' : 'Lưu tiến độ CĐT'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">Ngày CĐT nộp hồ sơ</label>
              <div className="relative h-[38px]">
                <DatePicker
                  selected={parseDate(cdtDate)}
                  onChange={(date) => setCdtDate(date ? formatLocalDate(date) : '')}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/yyyy"
                  locale="vi"
                  portalId="root"
                  maxDate={new Date()}
                  disabled={!canEditCdt}
                  className="w-full pl-9 pr-3 h-full bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
                />
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
              <p className="text-[11px] text-slate-400 ml-0.5">
                HXL CĐT: {formatDate(project.milestones?.[activeSubStepId]?.investor) || '—'}
              </p>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">Nội dung</label>
              <textarea
                value={cdtNote}
                onChange={(e) => setCdtNote(e.target.value)}
                maxLength={2000}
                disabled={!canEditCdt}
                rows={2}
                placeholder="Ví dụ: Đã nộp hồ sơ đề nghị thẩm định, số văn bản..."
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none disabled:bg-slate-50"
              />
            </div>
          </div>
          {cdtError && <p role="alert" className="text-xs font-semibold text-rose-600">{cdtError}</p>}
        </div>
      )}

      {/* FULL-WIDTH TABS CARD AT BOTTOM */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Tab Selection Header */}
        <div id="sub-tabs" className="bg-slate-50 border-b border-slate-100 overflow-x-auto">
          <div className="flex items-center px-2 sm:px-3 divide-x divide-slate-100">
            <button 
              onClick={() => setActiveTab('substeps')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all relative ${
                activeTab === 'substeps' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <ListTodo size={16} />
              TT hiện tại
              {activeTab === 'substeps' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
            </button>
            <button 
              onClick={() => setActiveTab('process')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all relative ${
                activeTab === 'process' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Route size={16} />
              Quy trình
              {activeTab === 'process' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
            </button>
            <button 
              onClick={() => setActiveTab('docs')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all relative ${
                activeTab === 'docs' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <FileText size={16} />
              Hồ sơ
              {activeTab === 'docs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all relative ${
                activeTab === 'history' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <History size={16} />
              Lịch sử
              {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-3 sm:p-3.5">
          {activeTab === 'substeps' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-3 py-2 text-sm font-bold text-slate-500 uppercase tracking-wider">Tên bước con</th>
                    <th className="px-3 py-2 text-center text-sm font-bold text-slate-500 uppercase tracking-wider">HXL CQ NN</th>
                    <th className="px-3 py-2 text-center text-sm font-bold text-slate-500 uppercase tracking-wider">TT CQ NN</th>
                    <th className="px-3 py-2 text-center text-sm font-bold text-slate-500 uppercase tracking-wider">HXL CĐT</th>
                    <th className="px-3 py-2 text-center text-sm font-bold text-slate-500 uppercase tracking-wider">TT CĐT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeStep?.childSteps?.map((child: any) => {
                    const milestone = project.milestones?.[child.id];
                    const actual = project.implementationPlan?.[child.id];
                    const isActive = activeSubStepId === child.id;
                    
                    return (
                      <tr 
                        key={child.id} 
                        onClick={() => setActiveSubStepId(child.id)}
                        className={`cursor-pointer transition-all ${
                          isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="px-2.5 py-2">
                          <div className="flex items-center gap-1.5">
                            {isActive && <div className="w-1 h-6 bg-blue-600 rounded-full shrink-0" />}
                            <div>
                              <p className={`text-sm font-bold ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{child.name}</p>
                              <p className="text-xs text-slate-400 font-bold uppercase mt-0.5 tracking-tight">{getAgencyWithDepartment(child.agency, child.department, child.name)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className="text-sm font-semibold text-blue-600 font-sans">
                            {formatDate(stepPlanDate(activeStep, child, 'nn')) || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {!actual?.agencyActualDate && actual?.skipped ? (
                            <span className="text-xs font-semibold text-slate-400 italic">Không áp dụng</span>
                          ) : !actual?.agencyActualDate && actual?.agencyStatus ? (
                            // Step still open: its processing status (and expected date) instead of "---"
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                                <span className={`w-2 h-2 rounded-full ${getStatusColor(actual.agencyStatus)}`} />
                                {actual.agencyStatus}
                              </span>
                              {actual.agencyExpectedDate && (
                                <span className="text-[11px] text-slate-400">DK: {formatDate(actual.agencyExpectedDate)}</span>
                              )}
                            </span>
                          ) : (
                            <span className={`text-sm font-semibold font-sans ${actual?.agencyActualDate ? 'text-slate-800 bg-slate-100 px-2 py-0.5 rounded' : 'text-slate-300'}`}>
                              {formatDate(actual?.agencyActualDate) || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-sm font-semibold text-slate-800 font-sans">
                            {formatDate(stepPlanDate(activeStep, child, 'cdt')) || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-semibold font-sans ${actual?.investorActualDate ? 'text-slate-800 bg-slate-100 px-2 py-0.5 rounded' : 'text-slate-300'}`}>
                            {formatDate(actual?.investorActualDate) || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="space-y-2">
              {isLoadingAttachments ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : attachments.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300 space-y-1">
                  <FileX size={20} className="text-slate-400 stroke-[1.5]" />
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Không có tệp đính kèm nào</p>
                </div>
              ) : (
                attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-white hover:shadow-sm transition-all group font-sans">
                    <button
                      type="button"
                      onClick={() => handleDownloadFile(att)}
                      className="flex items-center gap-3 text-left cursor-pointer group/title min-w-0 pr-2"
                      title="Nhấp để tải file về máy trong tab mới"
                    >
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-blue-600 shadow-sm shrink-0 group-hover/title:scale-110 transition-transform">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-800 group-hover/title:text-blue-600 transition-colors truncate">{att.name}</p>
                        <p className="text-sm text-slate-500 font-medium">
                          Tải lên: {att.createdAt ? toDisplayDate(formatLocalDate(new Date(att.createdAt))) : ''} • {att.size} • {att.fileType || 'FILE'}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center shrink-0">
                      <button 
                        type="button"
                        onClick={() => handleDownloadFile(att)}
                        className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-md transition-all" 
                        title="Tải xuống"
                      >
                        <Download size={15} />
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="p-1 hover:bg-rose-50 text-rose-500 rounded-md transition-all ml-1"
                          title="Xóa tệp"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'process' && (
            <div className="space-y-3 relative pl-2">
              
              {Object.entries(steps.reduce((acc: any, step: any) => {
                const stage = step.stage || 'Chưa phân loại';
                if (!acc[stage]) acc[stage] = [];
                acc[stage].push(step);
                return acc;
              }, {})).map(([stage, stageSteps]: any) => (
                <div key={stage} className="space-y-4">
                  <h4 
                    className="flex items-center gap-2 text-base font-black text-blue-800 uppercase tracking-widest bg-blue-50 px-3 py-2 rounded-md border-0 border-blue-100 cursor-pointer hover:bg-blue-100"
                    onClick={() => toggleStage(stage)}
                  >
                    {collapsedStages[stage] ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    {stage} ({stageSteps.length} thủ tục)
                  </h4>
                  {!collapsedStages[stage] && stageSteps.map((step: any, index: number) => {
                    const isStepActive = activeStepId === step.id;
                    return (
                      <div key={step.id} className={`relative pl-9 p-3 rounded-lg border mb-2 ${isStepActive ? 'bg-blue-50/50 border-blue-200' : 'bg-transparent border-transparent'}`}>
                        <div 
                          onClick={() => setActiveStepId(step.id)}
                          className={`absolute left-3 top-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer border-2 transition-all z-10 ${
                            isStepActive 
                              ? 'bg-blue-600 border-blue-600 text-white shadow shadow-blue-100' 
                              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                          }`}
                        >
                          {index + 1}
                        </div>
                        
                        <div className="pl-6">
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <h5 
                              onClick={() => setActiveStepId(step.id)}
                              className={`text-base font-semibold cursor-pointer hover:text-blue-700 transition-colors ${
                                isStepActive ? 'text-blue-700' : 'text-slate-800'
                              }`}
                            >
                              {step.name}
                            </h5>
                          </div>

                          {/* Child Steps in nested list */}
                          {step.childSteps && step.childSteps.length > 0 && (
                            <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-100">
                              {step.childSteps.map((sub: any) => {
                                const subStatus = getSubStepStatus(sub.id);
                                const isSubActive = activeSubStepId === sub.id;
                                return (
                                  <div 
                                    key={sub.id} 
                                    onClick={() => {
                                      setActiveStepId(step.id);
                                      setActiveSubStepId(sub.id);
                                    }}
                                    className="flex items-start gap-2 cursor-pointer group"
                                  >
                                    <span className={`text-sm leading-none shrink-0 ${
                                      isSubActive ? 'text-blue-600 font-bold' : 'text-slate-300 group-hover:text-slate-400'
                                    }`}>•</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-semibold leading-tight ${
                                        isSubActive ? 'text-blue-600' :
                                        subStatus === 'completed' ? 'text-slate-800' :
                                        'text-slate-500 group-hover:text-slate-700'
                                      }`}>
                                        {sub.name}
                                      </span>
                                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">{getAgencyWithDepartment(sub.agency, sub.department, sub.name)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300 space-y-1">
                  <Clock size={20} className="text-slate-300" />
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Không có lịch sử xử lý nào</p>
                </div>
              ) : (
                <>
                  {paginatedLogs.map((log, index) => (
                    <div key={log.id} className="flex gap-2 relative">
                      {index < paginatedLogs.length - 1 && <div className="absolute left-3 top-7 bottom-0 w-[2px] bg-slate-100" />}
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 z-10 border border-slate-200 shadow-sm">
                        <User size={12} />
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-0.5 gap-0.5">
                          <p className="text-base font-bold text-slate-800">
                            {log.userName} 
                            <span className="text-slate-500 font-medium text-sm ml-1.5">đã thực hiện cập nhật</span>
                          </p>
                          <span className="text-sm text-slate-500 font-semibold font-sans">
                            {log.createdAt ? (
                              toDisplayDateTime(log.createdAt)
                            ) : 'Chưa rõ thời gian'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                          <p className="text-base text-slate-700 leading-normal font-sans">{normalizeDatesInText(log.description)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 px-1">
                      <p className="text-sm text-slate-500">
                        Trang hiện tại <br />
                        <span className="font-semibold text-slate-800">
                          Hiển thị {Math.min((historyPage - 1) * itemsPerPage + 1, historyLogs.length)} - {Math.min(historyPage * itemsPerPage, historyLogs.length)} / {historyLogs.length}
                        </span>
                      </p>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1">
                        <button
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={historyPage === 1}
                          className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        >
                          <ChevronRight size={18} className="rotate-180" />
                        </button>
                        {[...Array(totalPages)].map((_, i) => (
                          <button
                            key={i + 1}
                            onClick={() => setHistoryPage(i + 1)}
                            className={`w-8 h-8 rounded-lg text-sm font-semibold ${
                              historyPage === i + 1
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                        <button
                          onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                          disabled={historyPage === totalPages}
                          className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---

function FormLabel({ label }: { label: string }) {
  if (!label) return null;
  if (label.includes('*')) {
    const parts = label.split('*');
    return (
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">
        {parts[0]}
        <span className="text-red-500 font-bold ml-0.5">*</span>
        {parts.slice(1).join('*')}
      </label>
    );
  }
  return (
    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-0.5">{label}</label>
  );
}

function FormField({ label, value, defaultValue, placeholder, type = 'text', readOnly = false, onChange }: any) {
  return (
    <div className="space-y-1.5 font-sans">
      <FormLabel label={label} />
      <input 
        type={type}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={onChange}
        className={`w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none transition-all ${
          readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
        }`}
      />
    </div>
  );
}

function FormSelect({ label, options, value, defaultValue, onChange, readOnly = false, placeholder }: any) {
  return (
    <div className="space-y-1.5 font-sans">
      <FormLabel label={label} />
      <div className="relative">
        <select 
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={readOnly}
          className={`w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold outline-none transition-all appearance-none cursor-pointer ${
            readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-100 focus:border-blue-400'
          }`}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt: any) => {
            const isObject = typeof opt === 'object';
            const label = isObject ? opt.label : opt;
            const val = isObject ? opt.value : opt;
            return <option key={val} value={val}>{label}</option>;
          })}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronRight size={13} className="rotate-90" />
        </div>
      </div>
    </div>
  );
}

function FormTextArea({ label, placeholder, defaultValue, value, onChange }: any) {
  return (
    <div className="space-y-1.5 font-sans">
      <FormLabel label={label} />
      <textarea 
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 min-h-[80px] transition-all"
      />
    </div>
  );
}

function TabButton({ active, onClick, label, icon: Icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all relative ${
        active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={16} />
      {label}
      {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
    </button>
  );
}
