import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Building2, MapPin, User, Calendar, Info, FileText, Upload, Trash2, DollarSign, Maximize, Users, Plus, Download, AlertCircle } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { PROJECT_STAGES } from '../constants';

registerLocale('vi', vi);

import { Agency } from './AgencyManagement';
import { Process } from './StepManagementView';
import { calculateProjectStatus, parseDate, syncDetailedToRoot, formatLocalDate, getAgencyWithDepartment, toDisplayDate } from '../lib/projectUtils';
import { matchWardLocation } from '../lib/locationMatch';
import { isValidDateInput, INVALID_DATE_MESSAGE } from '../lib/dateInput';
import { apiFetch, downloadAttachment, isStoredAttachmentId } from '../utils/apiFetch';
import { useUploadConfig, uploadRejectReason, uploadExtensionsLabel, uploadAcceptAttr } from '../lib/uploadRules';
import { SearchableSelect } from './SearchableSelect';
import { isDateBefore, isDateAfter, laterDate } from '../lib/dateCompare';

interface Location {
  ward: string;
  oldArea: string;
}

interface CreateProjectProps {
  onClose: () => void;
  onSuccess: (project?: any, rawFiles?: { id: string; file: File }[]) => void | Promise<void>;
  project?: any;
  investors: string[];
  locations: Location[];
  projectGroups: string[];
  fundingSources: string[];
  projectStages: any[];
  processingAgencies: Agency[];
  processes: Process[];
  followers: string[];
  buildingGrades: string[];
  projectCategories: string[];
  projectStatuses: string[];
  // Editing by an account other than Sở Xây dựng / Admin: general information is read-only
  // (the server refuses changes to it, see SXD_ONLY_PROJECT_FIELDS in server.ts)
  lockGeneralInfo?: boolean;
}

// Fields under "Thông tin chung dự án" kept as stored when lockGeneralInfo is set
const LOCKED_GENERAL_FIELDS = ['code', 'name', 'investor', 'location', 'processId', 'projectGroup', 'projectCategory', 'buildingGrade', 'fundingSource', 'isKeyProject', 'isPublicInvestment', 'follower', 'status'];

interface LegalFile {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  milestoneKey?: string; // Add milestoneKey
}

const PROJECT_REGIONS = [
  'Quận 1', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 6', 'Quận 7', 'Quận 8', 'Quận 10', 'Quận 11', 'Quận 12',
  'Bình Tân', 'Bình Thạnh', 'Gò Vấp', 'Phú Nhuận', 'Tân Bình', 'Tân Phú', 'Thủ Đức',
  'Bình Chánh', 'Cần Giờ', 'Củ Chi', 'Hóc Môn', 'Nhà Bè'
];

export default function CreateProject({ 
  onClose, 
  onSuccess, 
  project, 
  investors, 
  locations, 
  projectGroups, 
  fundingSources,
  projectStages,
  processingAgencies,
  processes,
  followers,
  buildingGrades,
  projectCategories,
  projectStatuses,
  lockGeneralInfo = false
}: CreateProjectProps) {
  const isEdit = !!project;

  // Wards offered in "Địa điểm"; legacy values like "Phường X, TP.HCM" are mapped onto them
  const wardNames = (processingAgencies || [])
    .filter(agency => agency.name === 'UBND cấp xã, phường')
    .flatMap(agency => agency.departments || []);

  const [formData, setFormData] = useState({
    code: project?.code || `NOXH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    name: project?.name || '',
    investor: project?.investor || '',
    location: matchWardLocation(project?.location || '', wardNames),
    isKeyProject: project?.isKeyProject || false,
    totalArea: project?.totalArea ?? '',
    height: project?.height ?? '',
    apartmentCount: project?.apartmentCount ?? '',
    totalInvestment: project?.totalInvestment ?? '',
    landStatus: project?.landStatus || '',
    startDate: project?.startDate || '',
    endDate: project?.endDate || '',
    projectGroup: project?.projectGroup || '',
    buildingGrade: project?.buildingGrade || '',
    projectCategory: project?.projectCategory || '',
    fundingSource: project?.fundingSource || '',
    processId: project?.processId || '',
    follower: project?.follower || '',
    // Only a status picked from the catalog is a manual override; computed codes ('On Track',
    // 'Delayed') stay out of the field so they keep being recalculated on save
    status: project?.status && (projectStatuses || []).includes(project.status) ? project.status : '',
    // Detailed Milestones
    milestones: project?.milestones || {},
    implementationPlan: project?.implementationPlan || {}
  });
  
  const [files, setFiles] = useState<LegalFile[]>(project?.files || []);
  const [rawFiles, setRawFiles] = useState<{ id: string; file: File }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Text typed into a date field that is not a date (the picker would silently discard it)
  const [dateInputErrors, setDateInputErrors] = useState<Record<string, string>>({});
  // Last text typed in each date field: the picker empties the input before onBlur fires
  const rawDateRef = useRef<Record<string, string>>({});
  const checkDateInput = (field: 'startDate' | 'endDate', raw: string) => {
    setDateInputErrors(prev => {
      const next = { ...prev };
      if (isValidDateInput(raw, true)) delete next[field];
      else next[field] = INVALID_DATE_MESSAGE;
      return next;
    });
  };
  const [submitting, setSubmitting] = useState(false);
  // Chặn bấm Lưu nhiều lần: ref cập nhật ngay, không chờ re-render như state
  const submittingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'general' | 'legal'>('general');
  const stageObjects = (projectStages || []).map(s => {
    if (typeof s === 'string') {
      return { name: s, milestones: [] };
    }
    return {
      name: s.name || '',
      milestones: Array.isArray(s.milestones) ? s.milestones : []
    };
  });

  const stageNames = stageObjects.map(s => s.name);
  const defaultStage = stageNames[0] || 'CHUẨN BỊ ĐẦU TƯ';
  const [activeStageTab, setActiveStageTab] = useState<string>(defaultStage);
  
  useEffect(() => {
    if (stageNames && stageNames.length > 0) {
      if (!stageNames.includes(activeStageTab)) {
        setActiveStageTab(stageNames[0]);
      }
    }
  }, [projectStages, activeStageTab]);

  const [activeMilestoneFiles, setActiveMilestoneFiles] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allowed types and size come from the Admin upload settings (the server checks the same values)
  const uploadConfig = useUploadConfig();

  const renderError = (field: string) => {
    if (errors[field]) {
      return (
        <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1 animate-in fade-in slide-in-from-top-1">
          <AlertCircle size={10} /> {errors[field]}
        </p>
      );
    }
    return null;
  };

  useEffect(() => {
    if (isEdit && project?.id) {
      const fetchAttachments = async () => {
        try {
          const res = await apiFetch(`/api/projects/${project.id}/attachments`);
          if (res.ok) {
            const data = await res.json();
            const formatted = data.map((att: any) => ({
              id: String(att.id),
              name: att.name,
              type: att.fileType || (att.name.split('.').pop()?.toUpperCase() || 'FILE'),
              size: att.size,
              date: att.createdAt ? toDisplayDate(formatLocalDate(new Date(att.createdAt))) : '',
              milestoneKey: att.milestoneKey || null
            }));
            setFiles(formatted);
          } else {
            const text = await res.text();
            console.error(`Error response fetching attachments: ${res.status} ${res.statusText}`, text);
          }
        } catch (err) {
          console.error("Error fetching project attachments inside CreateProject:", err);
        }
      };
      fetchAttachments();
    }
  }, [project?.id, isEdit]);

  const getStepName = (stepId: string) => {
    const process = processes.find(p => p.id === formData.processId);
    if (!process) return 'N/A';
    
    for (const ps of process.parentSteps) {
      if (ps.id === stepId) return ps.name;
      const cs = ps.childSteps.find(c => c.id === stepId);
      if (cs) return cs.name;
    }
    return 'N/A';
  };

  const formatDateStr = (ymd: string) => toDisplayDate(ymd);

  const handleMilestoneChange = (key: string, type: 'investor' | 'agency' | 'actualDate', value: string) => {
    if (value !== '') {
      if (type === 'agency') {
        const investorVal = (formData.milestones as any)[key]?.investor;
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`
          );
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = (formData.milestones as any)[key]?.agency;
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`
          );
          return;
        }
      }
    }

    setFormData({
      ...formData,
      milestones: {
        ...formData.milestones,
        [key]: {
          ...formData.milestones[key],
          [type]: value
        }
      }
    });
  };

  // Same rule as the server (src/lib/stepProgress): CĐT plan of a milestone = HXL CĐT of its first step,
  // CQNN plan = the latest HXL CQNN of its steps
  const getAutoParentDate = (parent: any, type: 'investor' | 'agency') => {
    if (type === 'investor') {
      const first = (parent.childSteps || [])[0];
      const firstVal = first ? (formData.milestones as any)[first.id]?.investor : '';
      if (firstVal) return firstVal;
    }
    let maxDateStr = '';
    if (parent.childSteps && parent.childSteps.length > 0) {
      parent.childSteps.forEach((child: any) => {
        const dStr = (formData.milestones as any)[child.id]?.[type];
        if (dStr) {
          if (!maxDateStr || isDateAfter(dStr, maxDateStr)) {
            maxDateStr = dStr;
          }
        }
      });
    }
    return maxDateStr;
  };

  const getParentDisplayDate = (parent: any, type: 'investor' | 'agency') => {
    const customVal = (formData.milestones as any)[parent.id]?.[type];
    const autoVal = getAutoParentDate(parent, type);
    if (customVal && autoVal) {
      return laterDate(customVal, autoVal);
    }
    return customVal || autoVal;
  };

  const handleParentMilestoneChange = (parent: any, type: 'investor' | 'agency', value: string) => {
    const autoVal = getAutoParentDate(parent, type);
    if (value && autoVal && isDateBefore(value, autoVal)) {
      alert(
        `Cảnh báo: Ngày được chọn cho mốc quy trình "${parent.name}" (${formatDateStr(value)}) không được nhỏ hơn ngày lớn nhất của các bước con (${formatDateStr(autoVal)}).`
      );
      return;
    }

    if (value !== '') {
      if (type === 'agency') {
        const investorVal = getParentDisplayDate(parent, 'investor');
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`
          );
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = getParentDisplayDate(parent, 'agency');
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`
          );
          return;
        }
      }
    }

    const updatedParentMilestone = { ...((formData.milestones as any)[parent.id] || {}) };
    if (value === '') {
      delete updatedParentMilestone[type];
    } else {
      updatedParentMilestone[type] = value;
    }

    setFormData({
      ...formData,
      milestones: {
        ...formData.milestones,
        [parent.id]: updatedParentMilestone
      }
    });
  };

  const getMilestoneDisplayDate = (milestoneName: string, linkedParent: any, type: 'investor' | 'agency') => {
    if (linkedParent) {
      return getParentDisplayDate(linkedParent, type);
    }
    return (formData.milestones as any)[milestoneName]?.[type] || '';
  };

  const handleMilestoneDateChange = (milestoneName: string, linkedParent: any, type: 'investor' | 'agency', value: string) => {
    if (linkedParent) {
      handleParentMilestoneChange(linkedParent, type, value);
      return;
    }

    if (value !== '') {
      if (type === 'agency') {
        const investorVal = (formData.milestones as any)[milestoneName]?.investor;
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(`Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`);
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = (formData.milestones as any)[milestoneName]?.agency;
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(`Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`);
          return;
        }
      }
    }

    setFormData({
      ...formData,
      milestones: {
        ...formData.milestones,
        [milestoneName]: {
          ...((formData.milestones as any)[milestoneName] || {}),
          [type]: value
        }
      }
    });
  };

  const addFile = (file: File, milestoneKey?: string) => {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const rejectReason = uploadRejectReason(file, uploadConfig);
    if (rejectReason) {
      alert(`File "${file.name}": ${rejectReason}`);
      return;
    }

    const fileId = Math.random().toString(36).substr(2, 9);
    const newFile: LegalFile = {
      id: fileId,
      name: file.name,
      type: fileExt.toUpperCase(),
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      date: `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`,
      milestoneKey
    };
    setFiles([...files, newFile]);
    setRawFiles(prev => [...prev, { id: fileId, file }]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, milestoneKey?: string) => {
    if (e.target.files) {
      Array.from(e.target.files as FileList).forEach((file: File) => addFile(file, milestoneKey));
      e.target.value = ''; // Reset file input value to allow uploading the same file again
    }
  };

  const removeFile = async (id: string) => {
    try {
      if (isNaN(Number(id))) {
        // This is a local unsaved file with a string ID, just filter it out from React state
        setFiles(files.filter(f => f.id !== id));
        setRawFiles(rawFiles.filter(f => f.id !== id));
        return;
      }

      // Saved files are deleted on the server immediately (even if the form is cancelled afterwards) → confirm first
      const fileName = files.find(f => f.id === id)?.name || 'tệp này';
      if (!window.confirm(`Xóa vĩnh viễn "${fileName}" khỏi hồ sơ dự án? Thao tác này không thể hoàn tác, kể cả khi bạn bấm Hủy biểu mẫu.`)) {
        return;
      }

      const res = await apiFetch(`/api/attachments/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setFiles(files.filter(f => f.id !== id));
        setRawFiles(rawFiles.filter(f => f.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Không xóa được tệp. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      alert('Không kết nối được máy chủ để xóa tệp.');
    }
  };

  const handleDownloadFile = (file: LegalFile) => {
    const rawObj = rawFiles.find(rf => rf.id === file.id);
    if (rawObj) {
      const url = URL.createObjectURL(rawObj.file);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', rawObj.file.name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Saved file: fetched through the signed-in API by numeric id (no file name in the URL)
      downloadAttachment(file.id, file.name).then(r => { if (!r.ok) alert(r.error); });
    }
  };

  // Domain validation rules; returns one message per invalid field
  const validateForm = (fd: typeof formData): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    if (!String(fd.code || '').trim()) newErrors.code = "Mã dự án không được để trống";
    if (!fd.name.trim()) newErrors.name = "Tên dự án không được để trống";
    if (!fd.investor) newErrors.investor = "Vui lòng chọn chủ đầu tư";
    if (!fd.location) newErrors.location = "Vui lòng chọn địa điểm (phường/xã)";
    if (!fd.projectCategory) newErrors.projectCategory = "Vui lòng chọn loại hình dự án";
    if (!fd.processId) newErrors.processId = "Vui lòng chọn quy trình áp dụng";

    // Numeric validations
    if (fd.totalArea !== '' && Number(fd.totalArea) < 0) {
      newErrors.totalArea = "Diện tích không được âm";
    }
    if (fd.height !== '') {
      const h = Number(fd.height);
      if (h < 0) {
        newErrors.height = "Tầng cao không được âm";
      } else if (!Number.isInteger(h)) {
        newErrors.height = "Tầng cao phải là số nguyên";
      }
    }
    if (fd.apartmentCount !== '') {
      const a = Number(fd.apartmentCount);
      if (a < 0) {
        newErrors.apartmentCount = "Số lượng căn hộ không được âm";
      } else if (!Number.isInteger(a)) {
        newErrors.apartmentCount = "Số lượng căn hộ phải là số nguyên";
      }
    }
    if (fd.totalInvestment !== '' && Number(fd.totalInvestment) < 0) {
      newErrors.totalInvestment = "Tổng mức đầu tư không được âm";
    }

    // Time span: completion cannot precede the start
    if (fd.startDate && fd.endDate && isDateBefore(fd.endDate, fd.startDate)) {
      newErrors.endDate = "Ngày hoàn thành phải sau hoặc bằng ngày bắt đầu";
    }
    return newErrors;
  };

  // Once the form has been submitted with errors, drop each message as soon as its field is fixed
  useEffect(() => {
    setErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const current = validateForm(formData);
      const next: Record<string, string> = {};
      keys.forEach(k => { if (current[k]) next[k] = current[k]; });
      return Object.keys(next).length === keys.length ? prev : next;
    });
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = validateForm(formData);
    if (lockGeneralInfo) LOCKED_GENERAL_FIELDS.forEach(k => { delete newErrors[k]; });
    if (Object.keys(dateInputErrors).length > 0) {
      setActiveTab('general');
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Every validated field lives on the first tab
      setActiveTab('general');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrors({});
    setSubmitting(true);
    
    // Materialize all parent milestones (either override or auto-calculated)
    const finalMilestones = { ...formData.milestones };
    const selectedProc = processes.find(p => p.id === formData.processId);
    if (selectedProc) {
      selectedProc.parentSteps.forEach((parent) => {
        const invDate = getParentDisplayDate(parent, 'investor');
        const agDate = getParentDisplayDate(parent, 'agency');
        
        if (invDate || agDate) {
          finalMilestones[parent.id] = {
            ...(finalMilestones[parent.id] || {}),
            ...(invDate ? { investor: invDate } : {}),
            ...(agDate ? { agency: agDate } : {})
          };
        }
      });
    }

    const { progress, currentStep, status: calculatedStatus, currentAgency, childStep, parentStep, currentStepId } = calculateProjectStatus(finalMilestones, formData.processId, processes, formData.implementationPlan || {});

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const updatedProject = {
      ...project,
      ...formData,
      milestones: finalMilestones,
      files,
      progress,
      status: formData.status || calculatedStatus || 'Chưa xác định',
      currentStep,
      currentAgency,
      childStep,
      parentStep,
      currentStepId,
      deadline: formData.endDate || formatLocalDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    };

    if (lockGeneralInfo && project) {
      LOCKED_GENERAL_FIELDS.forEach(k => { (updatedProject as any)[k] = project[k]; });
    }

    const synchronizedProject = syncDetailedToRoot(updatedProject, processes);

    // Giữ nút Lưu bị khóa tới khi lưu xong (POST/PUT, upload, tải lại dữ liệu)
    try {
      await onSuccess(synchronizedProject, rawFiles);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const processOptions = processes.map(p => ({ value: p.id, label: p.name }));
  const investorOptions = investors.map(inv => ({ value: inv, label: inv }));
  const followerOptions = followers.map(f => ({ value: f, label: f }));
  const projectGroupOptions = projectGroups.map(pg => ({ value: pg, label: pg }));
  const buildingGradeOptions = buildingGrades.map(bg => ({ value: bg, label: bg }));
  const fundingSourceOptions = fundingSources.map(fs => ({ value: fs, label: fs }));
  
  const locationOptions = processingAgencies
    .filter(agency => agency.name === 'UBND cấp xã, phường')
    .flatMap(agency => {
      const opts: { value: string; label: string; group: string }[] = [];
      if (agency.departments) {
        agency.departments.forEach(dept => {
          opts.push({ value: dept, label: dept, group: agency.name });
        });
      }
      return opts;
    });

  const projectCategoryOptions = projectCategories.map(pc => ({ value: pc, label: pc }));
  const statusOptions = projectStatuses.map(status => ({ value: status, label: status }));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-8xl h-[92vh] rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 my-4 flex flex-col">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
              <Building2 size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">{isEdit ? 'Cập nhật thông tin Dự án' : 'Khởi tạo Dự án NOXH mới'}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">Hệ thống Quản lý Dự án Sở Xây dựng</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all">
            <X size={24} />
          </button>
        </div>

        {/* Main Content Split */}
        <div className="flex-1 overflow-hidden flex">
          <form id="create-project-form" noValidate onSubmit={handleSubmit} className="flex flex-1 overflow-hidden w-full">
            {/* Left Column: Form Info (70%) */}
            <div className="w-[70%] overflow-y-auto border-r border-slate-100 flex flex-col">
              {/* Tabs Navigation */}
              <div className="flex border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === 'general' 
                      ? 'text-blue-600 border-blue-600 bg-white' 
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}
                >
                  1. THÔNG TIN CHUNG DỰ ÁN
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('legal')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === 'legal' 
                      ? 'text-blue-600 border-blue-600 bg-white' 
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}
                >
                  2. Kế hoạch thực hiện
                </button>
              </div>

              <div className="p-5 space-y-5">
                {activeTab === 'general' && (
                  <>
                    {/* Section 1: Thông tin chung */}
                    <div className="space-y-3 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="flex items-center gap-3 pb-1.5 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                          <Info size={18} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Thông tin chung dự án</h4>
                      </div>
                      
                      {lockGeneralInfo && (
                        <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          Thông tin chung chỉ Sở Xây dựng được thay đổi. Bạn có thể cập nhật quy mô, thời gian, kế hoạch thực hiện và hồ sơ đính kèm.
                        </p>
                      )}
                      <fieldset disabled={lockGeneralInfo} className={lockGeneralInfo ? 'pointer-events-none opacity-70' : ''}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2.5">
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mã dự án <span className="text-rose-500">*</span></label>
                          <input 
                            required
                            type="text" 
                            value={formData.code} 
                            onChange={e => setFormData({...formData, code: e.target.value})}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          />
                          {renderError('code')}
                        </div>
                        <div className="md:col-span-2 space-y-0.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tên dự án <span className="text-rose-500">*</span></label>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                  type="checkbox" 
                                  checked={formData.isKeyProject}
                                  onChange={e => setFormData({...formData, isKeyProject: e.target.checked})}
                                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                                />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-amber-600 transition-colors">Dự án trọng điểm</span>
                              </label>
                            </div>
                          </div>
                          <textarea 
                            placeholder="Ví dụ: Dự án Nhà ở xã hội tại số 04 Phan Chu Trinh..."
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            rows={3}
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all resize-y ${
                              errors.name ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'
                            }`}
                          />
                          {renderError('name')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quy trình thực hiện <span className="text-rose-500">*</span></label>
                          <SearchableSelect 
                            options={processOptions}
                            value={formData.processId}
                            onChange={val => setFormData({...formData, processId: val})}
                            placeholder="Chọn quy trình..."
                            error={!!errors.processId}
                          />
                          {renderError('processId')}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chủ đầu tư <span className="text-rose-500">*</span></label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <input 
                                type="checkbox" 
                                checked={formData.investor === 'Chưa có chủ đầu tư'}
                                onChange={e => setFormData({...formData, investor: e.target.checked ? 'Chưa có chủ đầu tư' : ''})}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">Chưa có chủ đầu tư</span>
                            </label>
                          </div>
                          {formData.investor !== 'Chưa có chủ đầu tư' && (
                            <SearchableSelect 
                              options={investorOptions}
                              value={formData.investor}
                              onChange={val => setFormData({...formData, investor: val})}
                              placeholder="Chọn chủ đầu tư..."
                              error={!!errors.investor}
                            />
                          )}
                          {renderError('investor')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Người theo dõi</label>
                          <SearchableSelect 
                            options={followerOptions}
                            value={formData.follower}
                            onChange={val => setFormData({...formData, follower: val})}
                            placeholder="Chọn người theo dõi..."
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhóm dự án</label>
                          <SearchableSelect 
                            options={projectGroupOptions}
                            value={formData.projectGroup}
                            onChange={val => setFormData({...formData, projectGroup: val})}
                            placeholder="Chọn nhóm dự án..."
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cấp công trình</label>
                          <SearchableSelect 
                            options={buildingGradeOptions}
                            value={formData.buildingGrade}
                            onChange={val => setFormData({...formData, buildingGrade: val})}
                            placeholder="Chọn cấp công trình..."
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nguồn vốn</label>
                          <SearchableSelect 
                            options={fundingSourceOptions}
                            value={formData.fundingSource}
                            onChange={val => setFormData({...formData, fundingSource: val})}
                            placeholder="Chọn nguồn vốn..."
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Địa điểm <span className="text-rose-500">*</span></label>
                          </div>
                          <SearchableSelect 
                            options={locationOptions}
                            value={formData.location}
                            onChange={val => setFormData({...formData, location: val})}
                            placeholder="Chọn phường/xã..."
                            error={!!errors.location}
                          />
                          {renderError('location')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân loại dự án <span className="text-rose-500">*</span></label>
                          <SearchableSelect 
                            options={projectCategoryOptions}
                            value={formData.projectCategory}
                            onChange={val => setFormData({...formData, projectCategory: val})}
                            placeholder="Chọn phân loại..."
                            error={!!errors.projectCategory}
                          />
                          {renderError('projectCategory')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trạng thái dự án</label>
                          <SearchableSelect 
                            options={statusOptions}
                            value={formData.status}
                            onChange={val => setFormData({...formData, status: val})}
                            placeholder="Tự động dựa theo tiến độ bước"
                          />
                        </div>
                      </div>
                      </fieldset>
                    </div>

                    {/* Section 2: Quy mô & Tiến độ thực hiện */}
                    <div className="space-y-3 animate-in fade-in slide-in-from-left-4 duration-500">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <Maximize size={18} />
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Quy mô dự án</h4>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-2.5">
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Diện tích đất (ha)</label>
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={formData.totalArea}
                            onChange={e => setFormData({...formData, totalArea: e.target.value})}
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              errors.totalArea ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500'
                            }`}
                          />
                          {renderError('totalArea')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tầng cao</label>
                          <input 
                            type="number" 
                            step="1"
                            min="0"
                            placeholder="0"
                            value={formData.height}
                            onChange={e => setFormData({...formData, height: e.target.value})}
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              errors.height ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500'
                            }`}
                          />
                          {renderError('height')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng căn hộ</label>
                          <input 
                            type="number" 
                            step="1"
                            min="0"
                            placeholder="0"
                            value={formData.apartmentCount}
                            onChange={e => setFormData({...formData, apartmentCount: e.target.value})}
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              errors.apartmentCount ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500'
                            }`}
                          />
                          {renderError('apartmentCount')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <DollarSign size={12} /> Tổng mức đầu tư (Tỷ)
                          </label>
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={formData.totalInvestment}
                            onChange={e => setFormData({...formData, totalInvestment: e.target.value})}
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              errors.totalInvestment ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-500'
                            }`}
                          />
                          {renderError('totalInvestment')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày bắt đầu (Từ)</label>
                          <DatePicker 
                            selected={parseDate(formData.startDate)}
                            onChange={(date) => {
                              setFormData({...formData, startDate: date ? formatLocalDate(date) : ''});
                              if (date) { rawDateRef.current.startDate = ''; checkDateInput('startDate', ''); }
                            }}
                            onChangeRaw={(e: any) => { rawDateRef.current.startDate = e?.target?.value ?? ''; }}
                            onBlur={() => checkDateInput('startDate', rawDateRef.current.startDate || '')}
                            dateFormat={["dd/MM/yyyy", "yyyy"]}
                            placeholderText="dd/mm/yyyy"
                            title="Nhập dd/mm/yyyy hoặc chỉ năm (yyyy)"
                            locale="vi"
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              dateInputErrors.startDate || errors.startDate ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'
                            }`}
                          />
                          {dateInputErrors.startDate ? (
                            <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1">
                              <AlertCircle size={10} /> {dateInputErrors.startDate}
                            </p>
                          ) : renderError('startDate')}
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày hoàn thành (Đến)</label>
                          <DatePicker 
                            selected={parseDate(formData.endDate)}
                            onChange={(date) => {
                              setFormData({...formData, endDate: date ? formatLocalDate(date) : ''});
                              if (date) { rawDateRef.current.endDate = ''; checkDateInput('endDate', ''); }
                            }}
                            onChangeRaw={(e: any) => { rawDateRef.current.endDate = e?.target?.value ?? ''; }}
                            onBlur={() => checkDateInput('endDate', rawDateRef.current.endDate || '')}
                            dateFormat={["dd/MM/yyyy", "yyyy"]}
                            placeholderText="dd/mm/yyyy"
                            title="Nhập dd/mm/yyyy hoặc chỉ năm (yyyy)"
                            locale="vi"
                            className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none focus:ring-4 transition-all ${
                              dateInputErrors.endDate || errors.endDate ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-500' : 'border-slate-200 focus:ring-blue-500/10 focus:border-blue-500'
                            }`}
                          />
                          {dateInputErrors.endDate ? (
                            <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1">
                              <AlertCircle size={10} /> {dateInputErrors.endDate}
                            </p>
                          ) : renderError('endDate')}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'legal' && (
                  /* Section 3: Kế hoạch thực hiện */
                  <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-3 pb-1.5 border-b border-slate-100">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                        <FileText size={18} />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Kế hoạch thực hiện chi tiết</h4>
                    </div>
                    
                    {!formData.processId ? (
                      <div className="p-12 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold italic">Vui lòng chọn quy trình ở tab Thông tin chung để lập kế hoạch</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Stage Sub-tabs */}
                        <div className="flex p-1 bg-slate-100 rounded-2xl flex-wrap gap-1">
                          {(stageNames.length > 0 ? stageNames : ['CHUẨN BỊ ĐẦU TƯ', 'THỰC HIỆN ĐẦU TƯ', 'KẾT THÚC ĐẦU TƯ']).map((stage) => {
                            const isActive = activeStageTab === stage;
                            return (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => setActiveStageTab(stage)}
                                className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-black rounded-xl transition-all duration-200 ${
                                  isActive
                                    ? 'bg-white text-blue-700 shadow-md shadow-slate-200/50'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                }`}
                              >
                                {stage}
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-12 gap-4 px-4 pt-2">
                          <div className="col-span-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bước quy trình / Cơ quan xử lý</div>
                          <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Hạn CĐT</div>
                          <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Hạn Cơ quan NN</div>
                        </div>

                        {(() => {
                          const selectedProc = processes.find(p => p.id === formData.processId);
                          if (!selectedProc) return null;

                          const activeStageObj = stageObjects.find(s => s.name === activeStageTab);
                          const stageMilestones = activeStageObj ? activeStageObj.milestones : [];

                          const parentStepsInStage = selectedProc.parentSteps.filter(step => {
                            const stage = step.stage || (stageNames[0] || 'CHUẨN BỊ ĐẦU TƯ');
                            return stage === activeStageTab;
                          });

                          const renderedMilestones = stageMilestones.map(milestone => {
                            const linkedParent = selectedProc.parentSteps.find(p => p.milestoneName === milestone);
                            return {
                              milestone,
                              linkedParent,
                            };
                          });

                          const standardProcedures = parentStepsInStage.filter(p => !p.milestoneName || !stageMilestones.includes(p.milestoneName));

                          const getStageHeaderStyles = (stage: string) => {
                            switch (stage.toUpperCase()) {
                              case 'CHUẨN BỊ ĐẦU TƯ':
                                return {
                                  bg: 'bg-blue-50/70 text-blue-800 border-blue-100',
                                  dot: 'bg-blue-500'
                                };
                              case 'THỰC HIỆN ĐẦU TƯ':
                                return {
                                  bg: 'bg-emerald-50/70 text-emerald-800 border-emerald-100',
                                  dot: 'bg-emerald-500'
                                };
                              case 'KẾT THÚC ĐẦU TƯ':
                                return {
                                  bg: 'bg-purple-50/70 text-purple-800 border-purple-100',
                                  dot: 'bg-purple-500'
                                };
                              default:
                                return {
                                  bg: 'bg-slate-50 text-slate-800 border-slate-200',
                                  dot: 'bg-slate-500'
                                };
                            }
                          };

                          if (renderedMilestones.length === 0 && standardProcedures.length === 0) {
                            return (
                              <div className="p-8 text-center bg-slate-50 rounded-[24px] border border-slate-100">
                                <p className="text-slate-400 text-xs font-bold italic">Không có mốc milestone hoặc thủ tục nào thuộc giai đoạn này.</p>
                              </div>
                            );
                          }

                          const styles = getStageHeaderStyles(activeStageTab);

                          return (
                            <div className="space-y-4 animate-in fade-in duration-200">
                              {/* Stage Header Banner */}
                              <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border ${styles.bg} font-black text-xs uppercase tracking-wider`}>
                                <span className={`w-2 h-2 rounded-full ${styles.dot} animate-pulse`} />
                                Giai đoạn: {activeStageTab}
                              </div>

                              <div className="space-y-6 pl-2 border-l border-slate-100">
                                {/* Render Configured Milestones First */}
                                {renderedMilestones.length > 0 && (
                                  <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-blue-700 uppercase tracking-widest pl-2">Mốc Tiến độ (Milestones)</h4>
                                    {renderedMilestones.map(({ milestone, linkedParent }) => (
                                      <React.Fragment key={milestone}>
                                        {/* Milestone Row */}
                                        <div className="grid grid-cols-12 gap-3 items-center py-2 px-4 bg-orange-50/50 rounded-2xl border border-orange-100/75">
                                          <div className="col-span-6">
                                            {linkedParent ? (
                                              <>
                                                <p className="text-xs font-black text-slate-900 leading-snug">
                                                  {linkedParent.name}
                                                </p>
                                                <div className="mt-1.5 flex">
                                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[9px] font-black text-emerald-700 uppercase tracking-wider">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    MỐC: {milestone.toUpperCase()}
                                                  </span>
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <p className="text-xs font-black text-slate-900 leading-snug">
                                                  {milestone}
                                                </p>
                                                <span className="text-[9px] block text-slate-400 italic font-medium mt-1">
                                                  Chưa liên kết bước thủ tục trong quy trình
                                                </span>
                                              </>
                                            )}
                                          </div>
                                          <div className="col-span-3">
                                            <DatePicker 
                                              selected={parseDate(getMilestoneDisplayDate(milestone, linkedParent, 'investor'))}
                                              onChange={(date) => handleMilestoneDateChange(milestone, linkedParent, 'investor', date ? formatLocalDate(date) : '')}
                                              dateFormat="dd/MM/yyyy"
                                              placeholderText={linkedParent ? "Tự động tính" : "Chọn ngày"}
                                              locale="vi"
                                              className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800"
                                            />
                                          </div>
                                          <div className="col-span-3">
                                            <DatePicker 
                                              selected={parseDate(getMilestoneDisplayDate(milestone, linkedParent, 'agency'))}
                                              onChange={(date) => handleMilestoneDateChange(milestone, linkedParent, 'agency', date ? formatLocalDate(date) : '')}
                                              dateFormat="dd/MM/yyyy"
                                              placeholderText={linkedParent ? "Tự động tính" : "Chọn ngày"}
                                              locale="vi"
                                              className="w-full px-3 py-1.5 bg-white border border-slate-250 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800"
                                            />
                                          </div>
                                        </div>

                                        {/* Child Steps of Linked Procedure */}
                                        {linkedParent && linkedParent.childSteps.map((child: any) => (
                                          <div key={child.id} className="grid grid-cols-12 gap-3 items-center py-2 px-4 bg-white rounded-2xl border border-slate-100 ml-6 hover:border-blue-200 transition-all group">
                                            <div className="col-span-6">
                                              <p className="text-xs font-bold text-slate-700">{child.name}</p>
                                              <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                                <Building2 size={10} /> {getAgencyWithDepartment(child.agency, child.department, child.name)}
                                              </p>
                                            </div>
                                            <div className="col-span-3">
                                              <DatePicker 
                                                selected={parseDate((formData.milestones as any)[child.id]?.investor)}
                                                onChange={(date) => handleMilestoneChange(child.id, 'investor', date ? formatLocalDate(date) : '')}
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="Chọn ngày"
                                                locale="vi"
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                              />
                                            </div>
                                            <div className="col-span-3">
                                              <DatePicker 
                                                selected={parseDate((formData.milestones as any)[child.id]?.agency)}
                                                onChange={(date) => handleMilestoneChange(child.id, 'agency', date ? formatLocalDate(date) : '')}
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="Chọn ngày"
                                                locale="vi"
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                )}

                                {/* Render Non-milestone Procedures Below */}
                                {standardProcedures.length > 0 && (
                                  <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Thủ tục khác trong giai đoạn</h4>
                                    {standardProcedures.map((parent) => (
                                      <React.Fragment key={parent.id}>
                                        <div className="grid grid-cols-12 gap-3 items-center py-2 px-4 bg-slate-50 rounded-2xl border border-slate-100">
                                          <div className="col-span-12">
                                            <span className="text-xs font-bold text-slate-700">{parent.name}</span>
                                          </div>
                                        </div>
                                        {parent.childSteps.map((child) => (
                                          <div key={child.id} className="grid grid-cols-12 gap-3 items-center py-2 px-4 bg-white rounded-2xl border border-slate-100 ml-6 hover:border-blue-200 transition-all group">
                                            <div className="col-span-6">
                                              <p className="text-xs font-bold text-slate-700">{child.name}</p>
                                              <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                                <Building2 size={10} /> {getAgencyWithDepartment(child.agency, child.department, child.name)}
                                              </p>
                                            </div>
                                            <div className="col-span-3">
                                              <DatePicker 
                                                selected={parseDate((formData.milestones as any)[child.id]?.investor)}
                                                onChange={(date) => handleMilestoneChange(child.id, 'investor', date ? formatLocalDate(date) : '')}
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="Chọn ngày"
                                                locale="vi"
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                              />
                                            </div>
                                            <div className="col-span-3">
                                              <DatePicker 
                                                selected={parseDate((formData.milestones as any)[child.id]?.agency)}
                                                onChange={(date) => handleMilestoneChange(child.id, 'agency', date ? formatLocalDate(date) : '')}
                                                dateFormat="dd/MM/yyyy"
                                                placeholderText="Chọn ngày"
                                                locale="vi"
                                                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Files & Upload (30%) */}
            <div className="w-[30%] bg-slate-50/50 flex flex-col">
              <div className="p-8 flex-1 flex flex-col space-y-8 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload size={18} className="text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Hồ sơ đính kèm</h4>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md">
                    {files.length} file
                  </span>
                </div>

                {/* File List Area */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {files.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                          <th className="py-2 px-1">STT</th>
                          <th className="py-2 px-1">Tên file</th>
                          <th className="py-2 px-1">Dung lượng</th>
                          <th className="py-2 px-1">Ngày</th>
                          <th className="py-2 px-1 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {files.map((file, index) => (
                          <tr key={file.id} className="group hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-1 text-xs font-bold text-slate-500">{index + 1}</td>
                            <td className="py-3 px-1">
                              <p className="text-xs font-bold text-slate-900 truncate max-w-[150px]" title={file.name}>{file.name}</p>
                              {file.milestoneKey && (
                                <p className="text-[9px] font-bold text-blue-600 mt-0.5">
                                  {getStepName(file.milestoneKey)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-1 text-xs text-slate-500">{file.size}</td>
                            <td className="py-3 px-1 text-xs text-slate-500">{file.date}</td>
                            <td className="py-3 px-1 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button type="button" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all" onClick={() => handleDownloadFile(file)} title="Tải xuống">
                                  <Download size={14} />
                                </button>
                                <button type="button" onClick={() => removeFile(file.id)} className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all" title="Xóa file">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
                      <FileText size={48} strokeWidth={1} className="mb-4 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest opacity-40">Chưa có tài liệu</p>
                    </div>
                  )}
                </div>

                {/* Upload Area */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-[28px] p-8 flex flex-col items-center justify-center text-slate-400 hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer group shrink-0"
                >
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                    <Upload size={24} className="text-slate-300 group-hover:text-blue-500" />
                  </div>
                  <p className="text-xs font-bold text-slate-500 text-center">Kéo thả hoặc nhấp để tải lên</p>
                  <p className="text-[10px] mt-1 opacity-60">{uploadExtensionsLabel(uploadConfig)} (Max {uploadConfig.maxSizeMb}MB)</p>
                  <input 
                    type="file" 
                    multiple
                    accept={uploadAcceptAttr(uploadConfig)}
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => handleFileChange(e)}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Popover for milestone files */}
        {activeMilestoneFiles && (
          <div className="fixed inset-0 bg-slate-900/20 z-[60] flex items-center justify-center" onClick={() => setActiveMilestoneFiles(null)}>
            <div className="bg-white rounded-3xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h4 className="font-bold mb-4 text-slate-800">
                {getStepName(activeMilestoneFiles)}
              </h4>
              <div className="space-y-2">
                {files.filter(f => f.milestoneKey === activeMilestoneFiles).map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <span className="text-xs truncate flex-1 mr-2">{file.name}</span>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => handleDownloadFile(file)} className="p-1 text-slate-400 hover:text-blue-600"><Download size={14} /></button>
                      <button type="button" onClick={() => removeFile(file.id)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-8 border-t border-slate-100 flex justify-end gap-4 bg-white shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-10 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Hủy bỏ
          </button>
          <button 
            type="submit"
            form="create-project-form"
            disabled={submitting}
            className="px-14 py-4 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            <Save size={20} />
            {submitting ? 'Đang xử lý...' : (isEdit ? 'Cập nhật dự án' : 'Khởi tạo dự án')}
          </button>
        </div>
      </div>
    </div>
  );
}
