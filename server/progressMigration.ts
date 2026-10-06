// Phase 3: the progress a project still holds in the former storage, moved onto its steps (project_progress).
//
// Former storage:
//   - step data in the project row's JSON (milestones[stepId] = plans, implementationPlan[stepId] = actuals)
//   - milestone plans in the columns *_cdt_date / *_nn_date ("X" = Đã xong)
//   - milestone actuals in project_actual_progress (TT CĐT / TT CQNN, notes, attachments)
// Rules (agreed 2026-10-05): what the steps already hold wins; a milestone value is written onto the steps
// with the same rules as an entry made today (src/lib/stepProgress: applyMilestonePlan / applyMilestoneInput);
// a milestone no procedure links to gets its own entry "ms:<name>". "X" stays in its former column (the
// composition still reads it). Nothing is deleted: the former storage stays until it is dropped separately.

import { resolveProjectStep } from '../src/lib/stepAgency.ts';
import {
  ProjectStepProgress, ProgressSide, MilestoneProgress,
  applyMilestoneInput, applyMilestonePlan, catalogMilestones, computeMilestone, procedureState,
  legacyValuesFor, linkedProcedures, toIsoDate
} from '../src/lib/stepProgress.ts';
import { effectiveProgress, findProcess, stepStatusFields } from './progressService.ts';

// Recorded as updated_by on every row the migration writes, so the run can be told apart (and undone)
export const MIGRATION_USER = 'Chuyển dữ liệu tiến độ (đợt 3)';
const IN_PROCESS_STATUS = 'Đang xử lý';

export interface MilestoneMigration {
  name: string;
  linked: boolean;
  old: { cdtPlan: string; nnPlan: string; cdtActual: string; nnActual: string };
  new: { cdtPlan: string; nnPlan: string; cdtActual: string; nnActual: string };
  actions: string[];    // what was written onto the steps
  conflicts: string[];  // former value differs from the steps: the steps win
  warnings: string[];
}

export interface ProjectMigration {
  id: string;
  code: string;
  name: string;
  processId: string;
  processFound: boolean;
  storedStep: string;   // step the project row holds today (current_step / currentStepId)
  newStep: string;      // step derived from the progress after the migration
  storedStepNote: string;
  stepChanged: boolean;
  milestones: MilestoneMigration[];
  rowsToWrite: number;
  before: ProjectStepProgress;
  after: ProjectStepProgress;
}

const isX = (v: any) => String(v ?? '').trim().toUpperCase() === 'X';
const planOrX = (v: any) => (isX(v) ? 'X' : toIsoDate(v));
const pick = (m: MilestoneProgress | undefined) => ({
  cdtPlan: m?.cdtPlan || '', nnPlan: m?.nnPlan || '', cdtActual: m?.cdtActual || '', nnActual: m?.nnActual || ''
});
const SIDE_LABEL: Record<ProgressSide, string> = { cdt: 'CĐT', nn: 'CQNN' };

export function planProjectMigration(project: any, meta: any, legacyActual: any, rows: ProjectStepProgress | undefined): ProjectMigration {
  const process = findProcess(meta, project);
  const stages = meta?.projectStages || [];
  const before: ProjectStepProgress = rows || {};
  // Step data of the JSON fields becomes rows (rows already written win)
  let p: ProjectStepProgress = effectiveProgress(project, process, rows);
  const milestones: MilestoneMigration[] = [];

  catalogMilestones(stages).forEach(m => {
    const legacy = legacyValuesFor(project, legacyActual, m.name);
    const old = {
      cdtPlan: planOrX(legacy.cdtPlan), nnPlan: planOrX(legacy.nnPlan),
      cdtActual: toIsoDate(legacy.cdtActual), nnActual: toIsoDate(legacy.nnActual)
    };
    const linked = linkedProcedures(process, m.name).length > 0;
    const actions: string[] = [];
    const conflicts: string[] = [];
    const warnings: string[] = [];
    // What the steps alone show (no fallback to the former storage)
    const steps = () => computeMilestone(process, m, p, {});

    (['cdt', 'nn'] as ProgressSide[]).forEach(side => {
      const oldPlan = side === 'cdt' ? old.cdtPlan : old.nnPlan;
      if (!oldPlan || oldPlan === 'X') return;
      const cur = side === 'cdt' ? steps().cdtPlan : steps().nnPlan;
      if (!cur) {
        p = applyMilestonePlan(process, p, m.name, side, oldPlan, MIGRATION_USER);
        actions.push(`KH ${SIDE_LABEL[side]} ${oldPlan}`);
      } else if (cur !== oldPlan) {
        conflicts.push(`KH ${SIDE_LABEL[side]}: cột cũ ${oldPlan}, bước ${cur} → giữ theo bước`);
      }
    });

    (['cdt', 'nn'] as ProgressSide[]).forEach(side => {
      const oldActual = side === 'cdt' ? old.cdtActual : old.nnActual;
      if (!oldActual) return;
      const cur = side === 'cdt' ? steps().cdtActual : steps().nnActual;
      if (!cur) {
        p = applyMilestoneInput(process, p, {
          milestone: m.name, side, date: oldActual,
          note: side === 'cdt' ? legacy.cdtNote : legacy.nnNote,
          attachments: side === 'cdt' ? legacy.cdtAttachments : legacy.nnAttachments,
          user: MIGRATION_USER
        });
        actions.push(`TT ${SIDE_LABEL[side]} ${oldActual}`);
      } else if (cur !== oldActual) {
        conflicts.push(`TT ${SIDE_LABEL[side]}: bảng cũ ${oldActual}, bước ${cur} → giữ theo bước`);
      }
    });

    const now = pick(steps());
    if (now.cdtActual && now.nnActual && now.nnActual < now.cdtActual) warnings.push(`TT CQNN ${now.nnActual} trước TT CĐT ${now.cdtActual}`);
    if (isX(legacy.cdtPlan) || isX(legacy.nnPlan)) warnings.push('"Đã xong" (X) giữ ở cột cũ');
    // A ticked "X" is still shown through the former column
    if (isX(legacy.cdtPlan)) now.cdtPlan = 'X';
    if (isX(legacy.nnPlan)) now.nnPlan = 'X';
    milestones.push({ name: m.name, linked, old, new: now, actions, conflicts, warnings });
  });

  // The step the project row holds (current_step, entered when the project was registered) carries no date.
  // It is recorded as "Đang xử lý" on that step, so the project stays there instead of falling back to the
  // first planned step; unless the dates moved above already finished its procedure.
  const stored = resolveProjectStep(project, meta?.processes || []);
  let storedStepNote = '';
  if (stored && process) {
    const ps = (process.parentSteps || []).find((x: any) => (x.childSteps || []).some((c: any) => String(c.id) === stored.id));
    const nn = p[stored.id]?.nn || {};
    if (ps && procedureState(ps, p).done) {
      storedStepNote = 'thủ tục của bước đang lưu đã xong theo TT';
    } else if (!nn.actualDate && !nn.status) {
      p = { ...p, [stored.id]: { ...(p[stored.id] || {}), nn: { ...nn, status: IN_PROCESS_STATUS, source: 'migration' } } };
      storedStepNote = `ghi "${IN_PROCESS_STATUS}" vào bước đang lưu`;
    }
  } else if (String(project.currentStep || '').trim()) {
    storedStepNote = 'không xác định được bước đang lưu trong quy trình';
  }

  // Rows the migration writes carry its name (updated_by)
  const after: ProjectStepProgress = JSON.parse(JSON.stringify(p));
  let rowsToWrite = 0;
  Object.entries(after).forEach(([key, sides]) => {
    (['cdt', 'nn'] as ProgressSide[]).forEach(side => {
      const e = sides?.[side];
      if (!e) return;
      if (JSON.stringify(e) === JSON.stringify(before[key]?.[side] ?? null)) return;
      e.updatedBy = MIGRATION_USER;
      if (!e.source) e.source = 'migration';
      rowsToWrite++;
    });
  });

  const fields = Object.keys(after).length > 0 ? stepStatusFields(process, after) : null;
  const newStepId = fields?.currentStepId || '';
  const storedStep = stored ? stored.name : String(project.currentStep || '');
  const newStep = fields ? fields.currentStep : storedStep;
  return {
    id: String(project.id), code: project.code || '', name: project.name || '',
    processId: String(project.processId ?? ''), processFound: !!process,
    storedStep, newStep, storedStepNote,
    stepChanged: fields ? (stored ? stored.id !== newStepId : storedStep !== newStep) : false,
    milestones, rowsToWrite, before, after
  };
}
