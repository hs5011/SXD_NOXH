// Server side of the step / milestone progress (rules in src/lib/stepProgress.ts).
//
// Reading: the progress of a project = rows of project_progress laid over what the project still holds in
// its former JSON fields (milestones / implementationPlan per step). Milestones whose steps hold nothing
// yet fall back to the former milestone storage (columns *_cdt_date / *_nn_date and project_actual_progress).
// The composed project keeps the former fields filled, so screens not yet moved keep working.
//
// Writing: only through the functions below; the former fields of the project row are no longer written.

import { findActiveSteps, flattenProcessSteps, isStepCompleted } from '../src/lib/stepAgency.ts';
import { isPlanDatePassed } from '../src/lib/phaseLogic.ts';
import {
  ProjectStepProgress, MilestoneProgress, ProgressSide,
  applyMilestoneInput, applyMilestonePlan, catalogMilestones, computeMilestones,
  isoToDisplay, legacyPhaseOf, legacyStepViews, legacyValuesFor, linkedProcedures, orderOpenSteps, processSteps, toIsoDate
} from '../src/lib/stepProgress.ts';

export const findProcess = (meta: any, project: any) =>
  (meta?.processes || []).find((p: any) => p && String(p.id) === String(project?.processId));

// Step data the project row still holds in its former JSON fields, in the progress shape
export function progressFromProjectJson(project: any, process: any): ProjectStepProgress {
  const out: ProjectStepProgress = {};
  const ms = project?.milestones || {};
  const ip = project?.implementationPlan || project?.extra?.implementationPlan || {};
  processSteps(process).forEach(step => {
    const m = ms[step.id] || {};
    const a = ip[step.id] || {};
    const cdtPlan = toIsoDate(m.investor);
    const nnPlan = toIsoDate(m.agency);
    const nnActual = toIsoDate(a.agencyActualDate || m.actualDate);
    const cdtActual = toIsoDate(a.investorActualDate);
    const cdt: any = {};
    const nn: any = {};
    if (cdtPlan) cdt.planDate = cdtPlan;
    if (cdtActual) cdt.actualDate = cdtActual;
    if (nnPlan) nn.planDate = nnPlan;
    if (nnActual) nn.actualDate = nnActual;
    if (a.agencyStatus) nn.status = a.agencyStatus;
    if (toIsoDate(a.agencyExpectedDate)) nn.expectedDate = toIsoDate(a.agencyExpectedDate);
    if (Object.keys(cdt).length || Object.keys(nn).length) {
      out[step.id] = {};
      if (Object.keys(cdt).length) out[step.id].cdt = { ...cdt, source: 'migration' };
      if (Object.keys(nn).length) out[step.id].nn = { ...nn, source: 'migration' };
    }
  });
  return out;
}

// Rows win per step and side
export function effectiveProgress(project: any, process: any, rows: ProjectStepProgress | undefined): ProjectStepProgress {
  const base = progressFromProjectJson(project, process);
  Object.entries(rows || {}).forEach(([key, sides]) => {
    base[key] = { ...(base[key] || {}), ...sides };
  });
  return base;
}

// Current step, status and percentage, same rules as calculateProjectStatus (src/lib/projectUtils)
export function stepStatusFields(process: any, progress: ProjectStepProgress) {
  const views = legacyStepViews(process, progress);
  const steps = flattenProcessSteps(process);
  if (!process || steps.length === 0) return null;
  const done = steps.filter(s => isStepCompleted(s.id, views.milestones, views.implementationPlan)).length;
  // The step chosen as "Bước tiếp theo" comes before steps that only have a plan (branch not taken)
  const active = orderOpenSteps(findActiveSteps(steps, views.milestones, views.implementationPlan), progress);
  let status = 'On Track';
  active.forEach(s => {
    const m = views.milestones[s.id] || {};
    const deadline = m.agency || m.investor;
    if (deadline && isPlanDatePassed(deadline)) status = 'Delayed';
  });
  const first = active[0];
  const parent = (process.parentSteps || []).find((ps: any) => first && ps.name === first.parentName);
  return {
    progress: Math.round((done / steps.length) * 100),
    currentStep: first ? first.name : (done === steps.length ? 'Hoàn thành' : 'Khởi tạo hồ sơ'),
    childStep: first ? first.name : '',
    parentStep: first ? first.parentName : '',
    currentStepId: first ? first.id : '',
    currentAgency: first ? first.agency || 'Chủ đầu tư' : 'N/A',
    status,
    ...(parent?.stage ? { stage: parent.stage } : {})
  };
}

export interface ComposedProject {
  project: any;
  milestones: Record<string, MilestoneProgress>;
  legacyActual: Record<string, any>;
}

// The project as the screens read it, plus its milestone view
export function composeProject(project: any, meta: any, legacyActual: any, rows: ProjectStepProgress | undefined): ComposedProject {
  const process = findProcess(meta, project);
  const progress = effectiveProgress(project, process, rows);
  const views = legacyStepViews(process, progress);
  const composed: any = {
    ...project,
    milestones: { ...(project.milestones || {}), ...views.milestones },
    implementationPlan: { ...(project.implementationPlan || {}), ...views.implementationPlan }
  };

  const milestones = computeMilestones(process, meta?.projectStages, progress, m => legacyValuesFor(project, legacyActual, m.name));

  // Former milestone columns / actual progress, so screens not yet on the milestone view stay in step
  const derivedActual: Record<string, any> = { ...(legacyActual || {}) };
  Object.values(milestones).forEach(mp => {
    const phase = legacyPhaseOf(mp.name);
    if (!phase) return;
    // "Đã xong" ticked on the milestone (Cập nhật kế hoạch dự án) is kept on the former column
    const isX = (v: any) => String(v ?? '').trim().toUpperCase() === 'X';
    if (isX(project[`${phase.planKey}_cdt_date`])) mp.cdtPlan = 'X';
    if (isX(project[`${phase.planKey}_nn_date`])) mp.nnPlan = 'X';
    if (mp.cdtPlan) composed[`${phase.planKey}_cdt_date`] = mp.cdtPlan === 'X' ? 'X' : isoToDisplay(mp.cdtPlan);
    if (mp.nnPlan) composed[`${phase.planKey}_nn_date`] = mp.nnPlan === 'X' ? 'X' : isoToDisplay(mp.nnPlan);
    derivedActual[phase.id] = {
      ...(derivedActual[phase.id] || {}),
      cdtDate: mp.cdtActual, nnDate: mp.nnActual,
      cdtNote: mp.cdtNote, nnNote: mp.nnNote,
      cdtAttachments: mp.cdtAttachments, nnAttachments: mp.nnAttachments
    };
  });

  if (Object.keys(rows || {}).length > 0 || Object.keys(progress).length > 0) {
    const fields = stepStatusFields(process, progress);
    if (fields) Object.assign(composed, fields);
  }
  return { project: composed, milestones, legacyActual: derivedActual };
}

// Before a milestone is changed through the steps, what it shows only from the former milestone storage
// is written onto its steps (otherwise the first new step date would hide it)
export function materializeLegacyMilestone(process: any, stages: any[], progress: ProjectStepProgress, project: any, legacyActual: any, milestoneName: string, user?: string): ProjectStepProgress {
  const procs = linkedProcedures(process, milestoneName);
  if (procs.length === 0) return progress;
  const milestone = catalogMilestones(stages).find(m => m.name === milestoneName);
  if (!milestone) return progress;
  const mp = computeMilestones(process, stages, progress, m => legacyValuesFor(project, legacyActual, m.name))[milestoneName];
  const stepIds = new Set(procs.flatMap((ps: any) => (ps.childSteps || []).map((c: any) => String(c.id))));
  const hasStepData = Object.entries(progress).some(([k, s]) => stepIds.has(k) && !!(s.cdt?.planDate || s.cdt?.actualDate || s.nn?.planDate || s.nn?.actualDate));
  if (!mp || hasStepData) return progress;

  let p = progress;
  if (mp.cdtPlan && mp.cdtPlan !== 'X') p = applyMilestonePlan(process, p, milestoneName, 'cdt', mp.cdtPlan, user);
  if (mp.nnPlan && mp.nnPlan !== 'X') p = applyMilestonePlan(process, p, milestoneName, 'nn', mp.nnPlan, user);
  if (mp.cdtActual) p = applyMilestoneInput(process, p, { milestone: milestoneName, side: 'cdt', date: mp.cdtActual, note: mp.cdtNote, attachments: mp.cdtAttachments, user });
  if (mp.nnActual) p = applyMilestoneInput(process, p, { milestone: milestoneName, side: 'nn', date: mp.nnActual, note: mp.nnNote, attachments: mp.nnAttachments, user });
  return p;
}

// Milestone a step belongs to (through its procedure), if any
export function milestoneOfStep(process: any, stages: any[], stepId: string): string | null {
  const ps = (process?.parentSteps || []).find((p: any) => (p.childSteps || []).some((c: any) => String(c.id) === String(stepId)));
  if (!ps?.milestoneName) return null;
  const m = catalogMilestones(stages).find(x => linkedProcedures(process, x.name).includes(ps));
  return m ? m.name : null;
}

export type { ProgressSide };
