// Which child step a project is at, and which agency handles it.
// Shared by server.ts (who may see/edit a project) and the client (lists, dashboards, saving progress),
// so both sides always agree. Must stay free of browser APIs and React imports.
//
// Step names are NOT unique: the <2ha processes reuse the same name for a Sở QHKT / UBND TP step and a
// UBND cấp xã, phường step, and different processes reuse names too. A project's step is therefore
// resolved by step id inside the project's own process, never by name across all processes.

// Spellings of the ward agency found in process configurations, all meaning "UBND cấp xã, phường"
const AGENCY_ALIASES: Record<string, string> = {
  'ubnd xã phường': 'UBND cấp xã, phường',
  'ubnd xã, phường': 'UBND cấp xã, phường',
  'ubnd cấp xã phường': 'UBND cấp xã, phường',
  'ubnd phường xã': 'UBND cấp xã, phường',
  'ubnd phường, xã': 'UBND cấp xã, phường'
};

export const normalizeAgencyName = (name: string | undefined | null): string => {
  const value = typeof name === 'string' ? name.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  return AGENCY_ALIASES[value.toLowerCase()] || value;
};

export interface FlatStep {
  id: string;
  name: string;
  agency: string;
  parentName: string;
}

export const flattenProcessSteps = (process: any): FlatStep[] => {
  const steps: FlatStep[] = [];
  (process?.parentSteps || []).forEach((ps: any) => {
    (ps?.childSteps || []).forEach((cs: any) => {
      if (cs) steps.push({ id: String(cs.id ?? ''), name: cs.name || '', agency: cs.agency || '', parentName: ps?.name || '' });
    });
  });
  return steps;
};

// A step is closed by its processing side (agencyActualDate). The investor's date is when the file was
// submitted (CĐT nộp) and does not close the step. A step of a branch not taken (skipped, see
// src/lib/stepProgress) counts as passed.
const stepActualDate = (stepId: string, milestones: any, implementationPlan: any): string => {
  const m = milestones?.[stepId] || {};
  const ip = implementationPlan?.[stepId] || {};
  return m.actualDate || ip.agencyActualDate || (ip.skipped ? 'skipped' : '');
};

export const isStepCompleted = (stepId: string, milestones: any, implementationPlan: any): boolean =>
  !!stepActualDate(stepId, milestones, implementationPlan);

// Steps being worked on, in process order: not completed and with a planned (HXL) date or a processing
// status (the file is there, e.g. "Đang xử lý"), plus the first step while none is completed or being
// processed. When steps are completed but nothing further is planned, the first unfinished step after the
// last completed one (a step closed without choosing "Bước tiếp theo" must not send the project back to
// "Khởi tạo hồ sơ" with no agency in charge).
export const findActiveSteps = (steps: FlatStep[], milestones: any = {}, implementationPlan: any = {}): FlatStep[] => {
  const doneFlags = steps.map(s => isStepCompleted(s.id, milestones, implementationPlan));
  const inProcess = steps.map((s, i) => !doneFlags[i] && !!implementationPlan?.[s.id]?.agencyStatus);
  const noneStarted = !doneFlags.some(Boolean) && !inProcess.some(Boolean);
  const active = steps.filter((s, i) => {
    if (doneFlags[i]) return false;
    const m = milestones?.[s.id] || {};
    return !!m.investor || !!m.agency || inProcess[i] || (noneStarted && i === 0);
  });
  // A step being processed is where the file is: it comes before steps that only have a plan
  const ids = steps.map(s => s.id);
  active.sort((a, b) => Number(inProcess[ids.indexOf(b.id)]) - Number(inProcess[ids.indexOf(a.id)]));
  if (active.length > 0 || doneFlags.every(Boolean)) return active;

  const lastDone = doneFlags.lastIndexOf(true);
  const next = steps.findIndex((_, i) => i > lastDone && !doneFlags[i]);
  const idx = next !== -1 ? next : doneFlags.indexOf(false);
  return [steps[idx]];
};

// The project's current child step, or null when it cannot be told apart.
// 1. currentStepId stored with the project (saved since this module exists)
// 2. the only step of its process named like project.currentStep / childStep
// 3. several steps share that name: the one the project's plan data points at
// 4. a project whose process is missing: the first step with that name in any process
export const resolveProjectStep = (project: any, processes: any[] | undefined | null): FlatStep | null => {
  if (!project || !Array.isArray(processes)) return null;
  const proc = processes.find(p => p && p.id === project.processId);
  const stepName = project.currentStep || project.childStep || '';

  if (proc) {
    const steps = flattenProcessSteps(proc);
    if (project.currentStepId) {
      const byId = steps.find(s => s.id === String(project.currentStepId));
      if (byId && (!stepName || byId.name === stepName)) return byId;
    }
    const candidates = steps.filter(s => s.name === stepName);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const active = findActiveSteps(steps, project.milestones || {}, project.implementationPlan || {})[0];
      return candidates.find(c => c.id === active?.id) || null;
    }
    return null;
  }

  if (!stepName) return null;
  for (const p of processes) {
    const match = flattenProcessSteps(p).find(s => s.name === stepName);
    if (match) return match;
  }
  return null;
};

// Steps the file is at when it was handed to several steps at once ("Bước tiếp theo" with 2+ steps):
// project.handlingStepIds is set by the server (server/progressService.handlingStepIds). Empty when the
// project has no parallel hand-off.
export const handlingSteps = (project: any, processes: any[] | undefined | null): FlatStep[] => {
  const ids: string[] = Array.isArray(project?.handlingStepIds) ? project.handlingStepIds.map(String) : [];
  if (ids.length < 2 || !Array.isArray(processes)) return [];
  const proc = processes.find(p => p && p.id === project.processId);
  if (!proc) return [];
  const steps = flattenProcessSteps(proc);
  return ids.map(id => steps.find(s => s.id === id)).filter((s): s is FlatStep => !!s);
};

// The step an account works on: with parallel steps, the one handled by its agency (name without the
// bracketed department), else the project's current step
export const resolveStepForAgency = (project: any, processes: any[] | undefined | null, agencyName: string): FlatStep | null => {
  const own = normalizeAgencyName(agencyName);
  const base = (name: string) => normalizeAgencyName(String(name ?? '').replace(/\s*\(.*\)\s*$/, ''));
  if (own) {
    const mine = handlingSteps(project, processes).find(s => base(s.agency) === own);
    if (mine) return mine;
  }
  return resolveProjectStep(project, processes);
};

// Agencies (normalized, without department) of every step the file is at, parallel ones included
export const handlingAgencyNames = (project: any, processes: any[] | undefined | null): string[] =>
  handlingSteps(project, processes).map(s => normalizeAgencyName(String(s.agency ?? '').replace(/\s*\(.*\)\s*$/, ''))).filter(Boolean);

// Agency (normalized) handling the project's current step; '' when unknown or ambiguous
export const resolveProjectStepAgency = (project: any, processes: any[] | undefined | null): string =>
  normalizeAgencyName(resolveProjectStep(project, processes)?.agency);
