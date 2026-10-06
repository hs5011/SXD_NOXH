import { parseDateStrict } from './dateCompare';

// The 7 standard legal phases of a social-housing project and the rule deciding which one is active.
// Shared by server.ts (who may see/edit a project) and the client (dashboards, Gantt) so both sides
// always agree on a project's current phase and responsible agency. Must stay free of browser APIs.

export const STANDARD_PHASES = [
  { id: 'chutruong', cdtKey: 'chutruong_cdt_date', nnKey: 'chutruong_nn_date', agency: 'Sở Xây dựng', name: 'Chấp thuận chủ trương đầu tư', fullStepName: 'Chấp thuận chủ trương đầu tư đồng thời giao chủ đầu tư theo pháp luật về nhà ở' },
  { id: 'qh1500', cdtKey: 'qh1500_cdt_date', nnKey: 'qh1500_nn_date', agency: 'Sở Quy hoạch Kiến trúc', name: 'Phê duyệt quy hoạch 1/500', fullStepName: 'Thẩm định, phê duyệt quy hoạch chi tiết tỷ lệ 1/500 hoặc chấp thuận quy hoạch tổng mặt bằng tỷ lệ 1/500 (quy hoạch chi tiết được lập theo quy trình rút gọn) theo pháp luật về quy hoạch đô thị và nông thôn' },
  { id: 'giaodat', cdtKey: 'qdgiaodat_cdt_date', nnKey: 'qdgiaodat_nn_date', agency: 'UBND cấp xã, phường', name: 'Giao đất, cho thuê đất', fullStepName: 'Giao đất, cho thuê đất hoặc cho phép chuyển mục đích sử dụng đất theo pháp luật về đất đai' },
  { id: 'htkt', cdtKey: 'htkt_dtm_cdt_date', nnKey: 'htkt_dtm_nn_date', agency: 'Sở Xây dựng', name: 'Đấu nối hạ tầng kỹ thuật', fullStepName: 'Thẩm định, phê duyệt quy hoạch, đấu nối hạ tầng kỹ thuật và môi trường' },
  { id: 'bcnckt', cdtKey: 'baocaonckt_cdt_date', nnKey: 'baocaonckt_nn_date', agency: 'Sở Xây dựng', name: 'Báo cáo nghiên cứu khả thi', fullStepName: 'Báo cáo nghiên cứu khả thi' },
  { id: 'pccc', cdtKey: 'pccc_cdt_date', nnKey: 'pccc_nn_date', agency: 'Sở Xây dựng', name: 'Thẩm duyệt PCCC', fullStepName: 'Thẩm duyệt thiết kế về phòng cháy và chữa cháy' },
  { id: 'gpxd', cdtKey: 'gpxaydung_cdt_date', nnKey: 'gpxaydung_nn_date', agency: 'Sở Xây dựng', name: 'Cấp giấy phép xây dựng', fullStepName: 'Cấp giấy phép xây dựng' }
];

export type StandardPhase = typeof STANDARD_PHASES[number];

const hasText = (v: any): boolean => typeof v === 'string' && v.trim() !== '';

// One side (CĐT or cơ quan NN) of a phase is done when it has an actual completion date,
// or the plan cell is marked 'X' (not applicable / already done).
// An EMPTY plan cell means "no date planned yet" – it is NOT done.
export const isPhaseSideDone = (planValue: any, actualDate: any): boolean =>
  hasText(actualDate) || planValue === 'X';

export const isPhaseDone = (project: any, phase: StandardPhase, actualData?: any): boolean => {
  const actual = actualData ? actualData[phase.id] : undefined;
  return (
    isPhaseSideDone(project?.[phase.cdtKey], actual?.cdtDate) &&
    isPhaseSideDone(project?.[phase.nnKey], actual?.nnDate)
  );
};

export interface ActivePhaseInfo {
  activePhaseIndex: number;
  activePhase: StandardPhase;
  activeAgency: string;
  completedPhasesCount: number;
  isCompleted: boolean;
}

// The active phase is the first phase not yet done; when all are done it stays on the last one.
export const computeActivePhase = (project: any, actualData?: any): ActivePhaseInfo => {
  let completedPhasesCount = 0;
  let activeIdx = -1;
  STANDARD_PHASES.forEach((phase, idx) => {
    if (isPhaseDone(project, phase, actualData)) {
      completedPhasesCount++;
    } else if (activeIdx === -1) {
      activeIdx = idx;
    }
  });
  if (activeIdx === -1) activeIdx = STANDARD_PHASES.length - 1;

  const activePhase = STANDARD_PHASES[activeIdx];
  return {
    activePhaseIndex: activeIdx,
    activePhase,
    activeAgency: activePhase.agency,
    completedPhasesCount,
    isCompleted: completedPhasesCount === STANDARD_PHASES.length
  };
};

// ─── Overdue ("quá hạn") – the single definition used by every screen ───────────────────────
// A side (CĐT / cơ quan NN) is overdue when it is not done and the END of its planned day has passed,
// so a project is NOT late on the deadline day itself. Only the active phase (and, defensively, any
// earlier unfinished phase) counts; phases not reached yet are never overdue.

export type PhaseSideStatus = 'done' | 'delayed' | 'in_progress' | 'not_started';

export const isPlanDatePassed = (planValue: any, now: Date = new Date()): boolean => {
  const d = parseDateStrict(typeof planValue === 'string' ? planValue : '');
  if (!d) return false;
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return now.getTime() > endOfDay.getTime();
};

export const getPhaseSideStatus = (
  planValue: any,
  actualDate: any,
  phaseIndex: number,
  activePhaseIndex: number,
  now: Date = new Date()
): PhaseSideStatus => {
  if (isPhaseSideDone(planValue, actualDate)) return 'done';
  if (phaseIndex < activePhaseIndex) return 'delayed';
  if (phaseIndex === activePhaseIndex) return isPlanDatePassed(planValue, now) ? 'delayed' : 'in_progress';
  return 'not_started';
};

export const isProjectOverdue = (project: any, actualData?: any, now: Date = new Date()): boolean => {
  const { activePhaseIndex } = computeActivePhase(project, actualData);
  return STANDARD_PHASES.some((phase, idx) => {
    if (idx > activePhaseIndex) return false;
    const actual = actualData ? actualData[phase.id] : undefined;
    return (
      getPhaseSideStatus(project?.[phase.cdtKey], actual?.cdtDate, idx, activePhaseIndex, now) === 'delayed' ||
      getPhaseSideStatus(project?.[phase.nnKey], actual?.nnDate, idx, activePhaseIndex, now) === 'delayed'
    );
  });
};
