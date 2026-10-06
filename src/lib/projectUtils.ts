import { STANDARD_PHASES, computeActivePhase, isPhaseSideDone } from './phaseLogic';
import { Process } from '../components/StepManagementView';
import { findActiveSteps, flattenProcessSteps, isStepCompleted, resolveProjectStepAgency } from './stepAgency';

export const removeVietnameseTones = (str: string | undefined | null): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};

export const parseDate = (dateString: string | undefined | null): Date | null => {
  if (typeof dateString !== 'string') return null;
  if (!dateString || dateString === 'X' || dateString === '--') return null;
  
  // Handle dd/mm/yyyy or dd/mm/yy
  if (dateString.includes('/')) {
    const parts = dateString.split('/').map(Number);
    if (parts.length >= 2) {
      const day = parts[0];
      const month = parts[1];
      let year = parts[2] || new Date().getFullYear();
      
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

      if (year < 100) year += 2000;
      const date = new Date(year, month - 1, day);
      
      // Strict validation: check if the components match to capture roll-over dates (e.g. Feb 31 -> March 3)
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return null;
      }
      
      return isNaN(date.getTime()) ? null : date;
    }
  }

  // Handle yyyy-mm-dd (avoiding UTC conversion issues)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const parts = dateString.split('-').map(Number);
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      
      const date = new Date(year, month - 1, day);
      
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return null;
      }
      
      return isNaN(date.getTime()) ? null : date;
    }
  }
  
  // Fallback
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

// The single display format for dates: dd/MM/yyyy (4-digit year). Stored values come in several
// shapes ("30/6/26", "2026-06-30", "30/06/2026", ISO timestamps); each is shown the same way.
// Text that is not a date (notes, "X") is returned unchanged.
export const toDisplayDate = (value: string | undefined | null): string => {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const date = parseDate(value.trim());
  if (!date || isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

// Dates written inside free text (history entries saved before dates were unified, e.g.
// "từ 25/5/26 thành 30/6/26") shown as dd/MM/yyyy; the stored text is not changed
export const normalizeDatesInText = (text: string | undefined | null): string =>
  String(text ?? '').replace(/(^|[^\d/])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\d/])/g, (m, pre, d, mo, y) => {
    const shown = toDisplayDate(`${d}/${mo}/${y}`);
    return /^\d{2}\/\d{2}\/\d{4}$/.test(shown) ? pre + shown : m;
  });

// Server timestamps (ISO, UTC) shown in local time: "HH:mm - dd/MM/yyyy"
export const toDisplayDateTime = (value: string | undefined | null): string => {
  if (typeof value !== 'string' || value.trim() === '') return '';
  if (!value.includes('T')) return toDisplayDate(value);
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} - ${toDisplayDate(formatLocalDate(date))}`;
};

export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString || dateString === 'X' || dateString === '--') return '';
  return toDisplayDate(dateString);
};

export const formatLocalDate = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Same dd/MM/yyyy format; '-' for an empty / not-applicable value
export const formatShortDate = (dateString: string | undefined | null): string => {
  if (!dateString || dateString === 'X' || dateString === '--' || dateString === '-') return '-';
  return toDisplayDate(dateString);
};

export const isDateOverdue = (deadlineStr: string | undefined | null, actualStr?: string | undefined | null): boolean => {
  if (actualStr && actualStr !== '-' && actualStr !== 'X' && actualStr.trim() !== '') return false;
  if (!deadlineStr || deadlineStr === '-' || deadlineStr === 'X' || deadlineStr === '--' || deadlineStr.trim() === '') return false;
  const deadlineDate = parseDate(deadlineStr);
  if (!deadlineDate || isNaN(deadlineDate.getTime())) return false;
  
  // Set deadline to the end of that day: 23:59:59.999 so projects on the deadline day itself are NOT marked overdue
  const deadlineEndOfDay = new Date(
    deadlineDate.getFullYear(),
    deadlineDate.getMonth(),
    deadlineDate.getDate(),
    23, 59, 59, 999
  );
  return Date.now() > deadlineEndOfDay.getTime();
};

export const getAgencyWithDepartment = (agencyName?: string, departmentName?: string, stepName?: string): string => {
  if (!agencyName) return 'Chưa phân công';
  
  if (agencyName.includes('(') && agencyName.includes(')')) {
    return agencyName;
  }

  if (agencyName.toLowerCase().includes('sở xây dựng')) {
    let dept = departmentName?.trim();
    if (!dept) {
      const nameLower = (stepName || '').toLowerCase();
      if (nameLower.includes('chủ trương') || nameLower.includes('công bố') || nameLower.includes('thông báo')) {
        dept = 'Phòng PTĐT';
      } else if (nameLower.includes('hạ tầng') || nameLower.includes('đấu nối') || nameLower.includes('bảo trì') || nameLower.includes('htkt')) {
        dept = 'Phòng QLBT & KTCTGT';
      } else if (nameLower.includes('xây dựng') || nameLower.includes('gpxd') || nameLower.includes('giấy phép')) {
        dept = 'Phòng QLXDCT DDCN';
      } else if (nameLower.includes('nghiệm thu') || nameLower.includes('chất lượng') || nameLower.includes('bcnckt') || nameLower.includes('nckt') || nameLower.includes('khả thi')) {
        dept = 'Phòng QLCL CTXD';
      } else if (nameLower.includes('giá') || nameLower.includes('vật liệu')) {
        dept = 'Phòng KT & VLXD';
      } else if (nameLower.includes('nhà ở') || nameLower.includes('thuê') || nameLower.includes('mua') || nameLower.includes('bất động sản')) {
        dept = 'Phòng QLN & TTBĐS';
      } else {
        dept = 'Phòng PTĐT';
      }
    }
    return `Sở Xây dựng (${dept})`;
  }

  return agencyName;
};

// Defined in phaseLogic so server.ts uses the exact same phases and completion rule
export { STANDARD_PHASES };

export const getMinPhaseIndexFromStep = (pStep: string, cStep: string): number => {
  const p = (pStep || '').toLowerCase();
  const c = (cStep || '').toLowerCase();
  if (p.includes('quy hoạch') || p.includes('1/500') || c.includes('quy hoạch') || c.includes('1/500')) return 1;
  if (p.includes('giao đất') || p.includes('thuê đất') || p.includes('đất đai') || c.includes('giao đất') || c.includes('thuê đất')) return 2;
  if (p.includes('hạ tầng') || c.includes('hạ tầng')) return 3;
  if (p.includes('nghiên cứu khả thi') || p.includes('bcnckt') || c.includes('khả thi')) return 4;
  if (p.includes('pccc') || c.includes('pccc')) return 5;
  if (p.includes('giấy phép') || p.includes('gpxd') || c.includes('giấy phép') || c.includes('gpxd')) return 6;
  return 0;
};

export const getDynamicProjectInfo = (project: any, actualDataInput?: any) => {
  if (!project) {
    return {
      activePhaseIndex: 0,
      activePhase: STANDARD_PHASES[0],
      activeAgency: 'Chưa xác định',
      dynamicParentStep: '',
      dynamicCurrentStep: '',
      completedPhasesCount: 0,
      isCompleted: false
    };
  }

  let actualData = actualDataInput;
  if (!actualData) {
    // Callers should pass the server progress (App's actualProgress[project.id]); no per-browser cache here
    actualData = (project as any).actualData || {};
  }

  const { activePhaseIndex: activeIdx, activePhase, completedPhasesCount, isCompleted } = computeActivePhase(project, actualData);

  return {
    activePhaseIndex: activeIdx,
    activePhase,
    activeAgency: activePhase.agency,
    dynamicParentStep: activePhase.fullStepName,
    dynamicCurrentStep: activePhase.name,
    completedPhasesCount,
    isCompleted
  };
};

export interface ProjectStatus {
  progress: number;
  currentStep: string;
  status: string;
  currentAgency: string;
  childStep: string;
  parentStep: string;
  // Id of the current child step (step names repeat, see stepAgency.ts); '' when none
  currentStepId: string;
}

// Who currently holds the project file.
// 1. A configured process (Cấu hình quy trình) wins: the agency of the project's current child step,
//    resolved inside its own process (see stepAgency.ts – step names repeat).
// 2. Otherwise derive it from the 7 legal phases: while the investor's part of the active phase is
//    still missing, the file is with the investor ('Chủ đầu tư'); after that with the phase's agency.
export const getStepAgency = (project: any, processes?: any[], actualData?: any): string => {
  if (!project) return 'Chưa xác định';

  if (Array.isArray(processes) && processes.length > 0 && project.currentStep) {
    const stepAgency = resolveProjectStepAgency(project, processes);
    if (stepAgency) return stepAgency;
  }

  const info = getDynamicProjectInfo(project, actualData);
  if (info.isCompleted) return info.activeAgency || 'Chưa xác định';
  const phase = info.activePhase;
  const actual = (actualData || (project as any).actualData || {})[phase.id];
  if (!isPhaseSideDone(project[phase.cdtKey], actual?.cdtDate)) return 'Chủ đầu tư';
  return phase.agency || 'Chưa xác định';
};

export const calculateProjectStatus = (milestones: any, processId: string, processes: Process[], implementationPlan: any = {}): ProjectStatus => {
  const empty = { progress: 0, currentStep: 'Chưa chọn quy trình', status: 'On Track', currentAgency: '', childStep: '', parentStep: '', currentStepId: '' };
  if (!Array.isArray(processes)) return empty;

  const selectedProcess = processes.find(p => p && p.id === processId);
  if (!selectedProcess) return empty;

  const allSteps = flattenProcessSteps(selectedProcess);
  const ms = milestones || {};
  const plan = implementationPlan || {};
  const completedCount = allSteps.filter(s => isStepCompleted(s.id, ms, plan)).length;
  const activeSteps = findActiveSteps(allSteps, ms, plan);

  // Check for delays in active steps
  let status = 'On Track';
  activeSteps.forEach(s => {
    const m = ms[s.id] || {};
    const deadline = m.agency || m.investor;
    if (deadline && isDateOverdue(deadline)) {
      status = 'Delayed';
    }
  });

  const first = activeSteps[0];
  const firstActiveName = first ? first.name : '';
  const currentStep = firstActiveName || (allSteps.length > 0 && completedCount === allSteps.length ? 'Hoàn thành' : 'Khởi tạo hồ sơ');
  const childStep = firstActiveName;
  const parentStep = first ? first.parentName : '';
  const currentAgency = first ? first.agency || 'Chủ đầu tư' : 'N/A';
  const progress = allSteps.length > 0 ? Math.round((completedCount / allSteps.length) * 100) : 0;

  return { progress, currentStep, status, currentAgency, childStep, parentStep, currentStepId: first ? first.id : '' };
};

/**
 * Synchronizes high-level project dates from/to detailed milestones.
 * Direction 1: detailed milestones -> high-level root keys (from child steps to parent root fields)
 */
export const syncDetailedToRoot = (project: any, processes: any[]): any => {
  const updated = { ...project };
  if (!updated.milestones || !updated.processId || !Array.isArray(processes)) return updated;

  const process = processes.find(p => p && p.id === updated.processId);
  if (!process || !Array.isArray(process.parentSteps)) return updated;

  const getPhaseKeys = (parentName: string, parentShortName?: string, milestoneName?: string) => {
    const name = (milestoneName || parentShortName || parentName || '').toLowerCase();
    if (name.includes('chủ trương') || name.includes('chutruong')) {
      return { cdtKey: 'chutruong_cdt_date', nnKey: 'chutruong_nn_date' };
    }
    if (name.includes('1/500') || name.includes('qh1500') || name.includes('quy hoạch')) {
      return { cdtKey: 'qh1500_cdt_date', nnKey: 'qh1500_nn_date' };
    }
    if (name.includes('giao đất') || name.includes('giaodat') || name.includes('thuê đất')) {
      return { cdtKey: 'qdgiaodat_cdt_date', nnKey: 'qdgiaodat_nn_date' };
    }
    if (name.includes('hạ tầng') || name.includes('đấu nối') || name.includes('htkt') || name.includes('đtm')) {
      return { cdtKey: 'htkt_dtm_cdt_date', nnKey: 'htkt_dtm_nn_date' };
    }
    if (name.includes('khả thi') || name.includes('nckt') || name.includes('bcnckt') || name.includes('báo cáo nghiên cứu')) {
      return { cdtKey: 'baocaonckt_cdt_date', nnKey: 'baocaonckt_nn_date' };
    }
    if (name.includes('phòng cháy') || name.includes('pccc') || name.includes('chữa cháy') || name.includes('hỏa hoạn')) {
      return { cdtKey: 'pccc_cdt_date', nnKey: 'pccc_nn_date' };
    }
    if (name.includes('giấy phép') || name.includes('gpxd') || name.includes('xây dựng')) {
      return { cdtKey: 'gpxaydung_cdt_date', nnKey: 'gpxaydung_nn_date' };
    }
    return null;
  };

  const formattedMilestones = { ...updated.milestones };

  process.parentSteps.forEach((parent: any) => {
    if (!parent.milestoneName) return; // Skip if this procedure is not configured as a milestone in the process

    const keys = getPhaseKeys(parent.name, parent.shortName, parent.milestoneName);
    if (!keys) return;

    const childSteps = parent.childSteps || [];

    const investorDates: Date[] = [];
    const agencyDates: Date[] = [];

    childSteps.forEach((child: any) => {
      const childMilestone = formattedMilestones[child.id];
      if (childMilestone) {
        if (childMilestone.investor) {
          const d = parseDate(childMilestone.investor);
          if (d) investorDates.push(d);
        }
        if (childMilestone.agency) {
          const d = parseDate(childMilestone.agency);
          if (d) agencyDates.push(d);
        }
      }
    });

    const parentMilestone = formattedMilestones[parent.id];
    let finalInvestorDate: string | null = null;
    let finalAgencyDate: string | null = null;

    const autoInvestorDateStr = investorDates.length > 0 
      ? formatLocalDate(new Date(Math.max(...investorDates.map(d => d.getTime()))))
      : null;
    const customInvestorDateStr = parentMilestone?.investor 
      ? formatLocalDate(parseDate(parentMilestone.investor))
      : null;

    if (customInvestorDateStr && autoInvestorDateStr) {
      finalInvestorDate = customInvestorDateStr >= autoInvestorDateStr ? customInvestorDateStr : autoInvestorDateStr;
    } else {
      finalInvestorDate = customInvestorDateStr || autoInvestorDateStr;
    }

    const autoAgencyDateStr = agencyDates.length > 0 
      ? formatLocalDate(new Date(Math.max(...agencyDates.map(d => d.getTime()))))
      : null;
    const customAgencyDateStr = parentMilestone?.agency 
      ? formatLocalDate(parseDate(parentMilestone.agency))
      : null;

    if (customAgencyDateStr && autoAgencyDateStr) {
      finalAgencyDate = customAgencyDateStr >= autoAgencyDateStr ? customAgencyDateStr : autoAgencyDateStr;
    } else {
      finalAgencyDate = customAgencyDateStr || autoAgencyDateStr;
    }

    if (finalInvestorDate) {
      updated[keys.cdtKey] = formatDate(finalInvestorDate);
      if (!formattedMilestones[parent.id]) {
        formattedMilestones[parent.id] = {};
      }
      formattedMilestones[parent.id].investor = formatDate(finalInvestorDate);
    } else {
      updated[keys.cdtKey] = '';
    }
    
    if (finalAgencyDate) {
      updated[keys.nnKey] = formatDate(finalAgencyDate);
      if (!formattedMilestones[parent.id]) {
        formattedMilestones[parent.id] = {};
      }
      formattedMilestones[parent.id].agency = formatDate(finalAgencyDate);
    } else {
      updated[keys.nnKey] = '';
    }
  });

  updated.milestones = formattedMilestones;
  return updated;
};

/**
 * Direction 2: high-level root keys -> detailed milestones (from parent root fields to last child step of that parent step and parent step itself)
 */
export const syncRootToDetailed = (project: any, processes: any[]): any => {
  const updated = { ...project };
  if (!updated.processId || !Array.isArray(processes)) return updated;

  const process = processes.find(p => p && p.id === updated.processId);
  if (!process || !Array.isArray(process.parentSteps)) return updated;

  const getPhaseKeys = (parentName: string, parentShortName?: string, milestoneName?: string) => {
    const name = (milestoneName || parentShortName || parentName || '').toLowerCase();
    if (name.includes('chủ trương') || name.includes('chutruong')) {
      return { cdtKey: 'chutruong_cdt_date', nnKey: 'chutruong_nn_date' };
    }
    if (name.includes('1/500') || name.includes('qh1500') || name.includes('quy hoạch')) {
      return { cdtKey: 'qh1500_cdt_date', nnKey: 'qh1500_nn_date' };
    }
    if (name.includes('giao đất') || name.includes('giaodat') || name.includes('thuê đất')) {
      return { cdtKey: 'qdgiaodat_cdt_date', nnKey: 'qdgiaodat_nn_date' };
    }
    if (name.includes('hạ tầng') || name.includes('đấu nối') || name.includes('htkt') || name.includes('đtm')) {
      return { cdtKey: 'htkt_dtm_cdt_date', nnKey: 'htkt_dtm_nn_date' };
    }
    if (name.includes('khả thi') || name.includes('nckt') || name.includes('bcnckt') || name.includes('báo cáo nghiên cứu')) {
      return { cdtKey: 'baocaonckt_cdt_date', nnKey: 'baocaonckt_nn_date' };
    }
    if (name.includes('phòng cháy') || name.includes('pccc') || name.includes('chữa cháy') || name.includes('hỏa hoạn')) {
      return { cdtKey: 'pccc_cdt_date', nnKey: 'pccc_nn_date' };
    }
    if (name.includes('giấy phép') || name.includes('gpxd') || name.includes('xây dựng')) {
      return { cdtKey: 'gpxaydung_cdt_date', nnKey: 'gpxaydung_nn_date' };
    }
    return null;
  };

  const milestones = { ...(updated.milestones || {}) };

  process.parentSteps.forEach((parent: any) => {
    if (!parent.milestoneName) return; // Skip if this procedure is not configured as a milestone in the process

    const keys = getPhaseKeys(parent.name, parent.shortName, parent.milestoneName);
    if (!keys) return;

    const childSteps = parent.childSteps || [];

    const cdtDate = updated[keys.cdtKey];
    const nnDate = updated[keys.nnKey];

    // Synchronize parent step directly
    if (!milestones[parent.id]) {
      milestones[parent.id] = {};
    }
    if (cdtDate) {
      milestones[parent.id].investor = formatDate(cdtDate);
    } else {
      delete milestones[parent.id].investor;
    }
    if (nnDate) {
      milestones[parent.id].agency = formatDate(nnDate);
    } else {
      delete milestones[parent.id].agency;
    }

    // Also synchronize last child if exists
    const lastChild = childSteps[childSteps.length - 1];
    if (lastChild) {
      const childId = lastChild.id;
      if (!milestones[childId]) {
        milestones[childId] = {};
      }

      if (cdtDate) {
        milestones[childId].investor = formatDate(cdtDate);
      } else {
        delete milestones[childId].investor;
      }
      if (nnDate) {
        milestones[childId].agency = formatDate(nnDate);
      } else {
        delete milestones[childId].agency;
      }
    }
  });

  updated.milestones = milestones;
  return updated;
};
