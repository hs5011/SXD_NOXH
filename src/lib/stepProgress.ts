// Progress of a project, kept per process step and per side, and the milestone view derived from it.
// Shared by server.ts (the only writer) and the client (Gantt, step screen). Must stay free of browser
// APIs and React imports.
//
// One source: every date / status is recorded on a child step of the process, for one side:
//   cdt = Chủ đầu tư (submits the file)   nn = the processing agency (cơ quan nhà nước, or the investor
//   itself for a step whose agency is "Chủ đầu tư").
// A milestone (danh mục "Cấu hình Giai đoạn & Mốc Milestone") is linked to procedures (parent steps,
// field milestoneName). Its plan and actual dates are computed from the steps of those procedures, and a
// date entered on the milestone (Gantt "+ nhập TT") is written onto those steps. A milestone that no
// procedure of the project's process is linked to keeps its own entry under the key "ms:<name>".

import { parseDateStrict } from './dateCompare';

export type ProgressSide = 'cdt' | 'nn';

export interface ProgressAttachment {
  id: string;
  name: string;
  size?: string;
  type?: string;
}

export interface ProgressEntry {
  planDate?: string;      // HXL kế hoạch, yyyy-MM-dd
  planSource?: 'auto';    // planDate computed when the previous step closed (date + processing days)
  actualDate?: string;    // ngày thực tế (TT), yyyy-MM-dd
  expectedDate?: string;  // ngày hoàn thành dự kiến while the step is still open, yyyy-MM-dd
  status?: string;        // processing status of the step (nn side)
  note?: string;
  attachments?: ProgressAttachment[];
  nextStepIds?: string[]; // nn: steps chosen as "Bước tiếp theo" when the step was closed
  source?: 'step' | 'milestone' | 'migration';
  updatedBy?: string;
  updatedAt?: string;
}

export type StepSides = Partial<Record<ProgressSide, ProgressEntry>>;
export type ProjectStepProgress = Record<string, StepSides>;

export const DONE_STEP_STATUSES = ['Hoàn thành', 'Đã phê duyệt'];
export const MILESTONE_KEY_PREFIX = 'ms:';
export const QUICK_INPUT_NOTE = 'Nhập nhanh từ mốc tiến độ';

export const milestoneKey = (name: string) => MILESTONE_KEY_PREFIX + String(name ?? '').trim();

// ─── Dates ────────────────────────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

// Any accepted date text (dd/mm/yyyy, dd/mm/yy, yyyy-mm-dd) → yyyy-MM-dd, '' when not a date
export const toIsoDate = (value: any): string => {
  const d = parseDateStrict(typeof value === 'string' ? value : '');
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
};

export const isoToDisplay = (iso: string | undefined | null): string => {
  const d = parseDateStrict(iso || '');
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
};

const minIso = (values: (string | undefined)[]): string =>
  values.filter((v): v is string => !!v).sort()[0] || '';
const maxIso = (values: (string | undefined)[]): string => {
  const list = values.filter((v): v is string => !!v).sort();
  return list[list.length - 1] || '';
};

// ─── Names ────────────────────────────────────────────────────────────────────────────────────────
const normName = (s: any) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
export const sameMilestone = (a: any, b: any): boolean => !!normName(a) && normName(a) === normName(b);

// ─── Catalog ──────────────────────────────────────────────────────────────────────────────────────
export interface CatalogMilestone {
  name: string;
  stage: string;
  order: number;
}

// Milestones of the catalog in display order (stage order, then milestone order). With a stage name,
// only that stage's milestones.
export const catalogMilestones = (stages: any[] | undefined | null, stageName?: string): CatalogMilestone[] => {
  const list: CatalogMilestone[] = [];
  (Array.isArray(stages) ? stages : []).forEach((stage: any) => {
    const name = typeof stage === 'string' ? stage : stage?.name;
    if (!name) return;
    if (stageName && normName(name) !== normName(stageName)) return;
    const milestones = typeof stage === 'object' && Array.isArray(stage?.milestones) ? stage.milestones : [];
    milestones.forEach((m: any) => {
      const mName = typeof m === 'string' ? m : m?.name;
      if (mName && String(mName).trim()) list.push({ name: String(mName).trim(), stage: String(name).trim(), order: list.length });
    });
  });
  return list;
};

// ─── Process structure ────────────────────────────────────────────────────────────────────────────
export interface ProgressStep {
  id: string;
  name: string;
  agency: string;
  department?: string;
  slaDays: number;
  procedureId: string;
  procedureName: string;
}

const procedureSteps = (ps: any): ProgressStep[] =>
  (ps?.childSteps || []).filter(Boolean).map((cs: any) => ({
    id: String(cs.id ?? ''),
    name: cs.name || '',
    agency: cs.agency || '',
    department: cs.department || undefined,
    slaDays: Number(cs.slaDays) || 0,
    procedureId: String(ps.id ?? ''),
    procedureName: ps.name || ''
  }));

export const processSteps = (process: any): ProgressStep[] =>
  (process?.parentSteps || []).flatMap((ps: any) => procedureSteps(ps));

export const linkedProcedures = (process: any, milestoneName: string): any[] =>
  (process?.parentSteps || []).filter((ps: any) => sameMilestone(ps?.milestoneName, milestoneName));

// The agency handling a step for the "nn" side; "Chủ đầu tư" steps are processed by the investor
export const isInvestorStep = (step: { agency?: string } | null | undefined) =>
  normName(step?.agency) === normName('Chủ đầu tư');

// ─── Procedure state ──────────────────────────────────────────────────────────────────────────────
export interface ProcedureState {
  id: string;
  steps: ProgressStep[];
  openSteps: ProgressStep[];
  done: boolean;
  doneDate: string;
  exitStepId: string;  // the step whose closing ended the procedure
  started: boolean;
}

const nnOf = (progress: ProjectStepProgress, id: string) => progress?.[id]?.nn || {};
const cdtOf = (progress: ProjectStepProgress, id: string) => progress?.[id]?.cdt || {};
const isClosed = (progress: ProjectStepProgress, id: string) => !!nnOf(progress, id).actualDate;
// Status of an open step meaning the file is being handled there
const isWorkStatus = (status: string | undefined) => !!status && status !== 'Chưa bắt đầu' && !DONE_STEP_STATUSES.includes(status);

// Steps a closed step handed the file to ("Bước tiếp theo"), anywhere in the process
export const chosenNextStepIds = (progress: ProjectStepProgress): Set<string> => {
  const ids = new Set<string>();
  Object.entries(progress || {}).forEach(([key, sides]) => {
    if (key.startsWith(MILESTONE_KEY_PREFIX) || !sides?.nn?.actualDate) return;
    (sides.nn.nextStepIds || []).forEach(id => ids.add(String(id)));
  });
  return ids;
};

// Where the file is among open steps: a step being processed (has a status), then a step chosen as
// "Bước tiếp theo", then the others in process order. A branch not chosen must not come first.
export const orderOpenSteps = <T extends { id: string }>(open: T[], progress: ProjectStepProgress): T[] => {
  const chosen = chosenNextStepIds(progress);
  const rank = (s: T) => (isWorkStatus(nnOf(progress, s.id).status) ? 2 : chosen.has(s.id) ? 1 : 0);
  return open.map((s, i) => ({ s, i })).sort((a, b) => rank(b.s) - rank(a.s) || a.i - b.i).map(x => x.s);
};

// A procedure may contain alternative branches (e.g. đất ≥2ha thuộc 01 / 02 đơn vị hành chính), so it
// is NOT "every step done". It is done when a step is closed and every "Bước tiếp theo" chosen for it
// lies outside the procedure, when its last step is closed, or when all its steps are closed.
export const procedureState = (ps: any, progress: ProjectStepProgress): ProcedureState => {
  const steps = procedureSteps(ps);
  const ids = new Set(steps.map(s => s.id));
  const exits = steps.filter(s => {
    if (!isClosed(progress, s.id)) return false;
    const next = (nnOf(progress, s.id).nextStepIds || []).map(String);
    return next.length > 0 && next.every(id => !ids.has(id));
  });
  const last = steps[steps.length - 1];
  const closers = [...exits];
  if (last && isClosed(progress, last.id) && !closers.includes(last)) closers.push(last);
  const allClosed = steps.length > 0 && steps.every(s => isClosed(progress, s.id));
  // A step reopened with a processing status (e.g. after a quick input closed every step) means the file
  // is still in the procedure
  const reopened = steps.some(s => !isClosed(progress, s.id) && isWorkStatus(nnOf(progress, s.id).status));
  const done = steps.length > 0 && !reopened && (closers.length > 0 || allClosed);

  let doneDate = '';
  let exitStepId = '';
  if (done) {
    const pool = closers.length > 0 ? closers : steps;
    pool.forEach(s => {
      const d = nnOf(progress, s.id).actualDate || '';
      if (d && d >= doneDate) { doneDate = d; exitStepId = s.id; }
    });
  }
  const started = steps.some(s => {
    const nn = nnOf(progress, s.id);
    return !!(nn.actualDate || nn.status || cdtOf(progress, s.id).actualDate);
  });
  const openSteps = orderOpenSteps(steps.filter(s => !isClosed(progress, s.id)), progress);
  return { id: String(ps?.id ?? ''), steps, openSteps, done, doneDate, exitStepId, started };
};

// Open steps of finished procedures (the branch not taken): shown as "không áp dụng", not as pending work
export const skippedStepIds = (process: any, progress: ProjectStepProgress): Set<string> => {
  const skipped = new Set<string>();
  (process?.parentSteps || []).forEach((ps: any) => {
    const st = procedureState(ps, progress);
    if (st.done) st.openSteps.forEach(s => skipped.add(s.id));
  });
  return skipped;
};

// ─── Milestone view ───────────────────────────────────────────────────────────────────────────────
export interface MilestoneProgress {
  name: string;
  stage: string;
  linked: boolean;          // false: no procedure of the project's process is linked (own entry)
  procedureIds: string[];
  stepIds: string[];
  cdtPlan: string;          // yyyy-MM-dd, or 'X' kept from legacy data (không áp dụng / đã xong)
  nnPlan: string;
  cdtActual: string;
  nnActual: string;
  cdtNote: string;
  nnNote: string;
  cdtAttachments: ProgressAttachment[];
  nnAttachments: ProgressAttachment[];
  agency: string;           // agency responsible now (open step), or that closed it, or of the first step
  currentStepId: string;    // first open step of an unfinished linked procedure
  anchorCdtStepId: string;  // step the CĐT date of the milestone is written to
}

// Values from the former storage (legacy columns *_cdt_date / *_nn_date and the project_actual_progress
// table), used only where the steps hold nothing yet
export interface LegacyMilestoneValues {
  cdtPlan?: string;
  nnPlan?: string;
  cdtActual?: string;
  nnActual?: string;
  cdtNote?: string;
  nnNote?: string;
  cdtAttachments?: ProgressAttachment[];
  nnAttachments?: ProgressAttachment[];
}

const planOrX = (v: any): string => (String(v ?? '').trim().toUpperCase() === 'X' ? 'X' : toIsoDate(v));

export const computeMilestone = (
  process: any,
  milestone: CatalogMilestone,
  progress: ProjectStepProgress,
  legacy: LegacyMilestoneValues = {}
): MilestoneProgress => {
  const procs = linkedProcedures(process, milestone.name);
  const base: MilestoneProgress = {
    name: milestone.name, stage: milestone.stage, linked: procs.length > 0,
    procedureIds: procs.map((p: any) => String(p.id)), stepIds: [],
    cdtPlan: '', nnPlan: '', cdtActual: '', nnActual: '', cdtNote: '', nnNote: '',
    cdtAttachments: [], nnAttachments: [], agency: '', currentStepId: '', anchorCdtStepId: ''
  };

  if (procs.length === 0) {
    const own = progress?.[milestoneKey(milestone.name)] || {};
    const c = own.cdt || {};
    const n = own.nn || {};
    return {
      ...base,
      cdtPlan: c.planDate || planOrX(legacy.cdtPlan),
      nnPlan: n.planDate || planOrX(legacy.nnPlan),
      cdtActual: c.actualDate || toIsoDate(legacy.cdtActual),
      nnActual: n.actualDate || toIsoDate(legacy.nnActual),
      cdtNote: c.note ?? legacy.cdtNote ?? '',
      nnNote: n.note ?? legacy.nnNote ?? '',
      cdtAttachments: c.attachments || legacy.cdtAttachments || [],
      nnAttachments: n.attachments || legacy.nnAttachments || []
    };
  }

  const states = procs.map((ps: any) => procedureState(ps, progress));
  const steps = states.flatMap(s => s.steps);
  const first = steps[0];

  // CĐT: plan of the first step, actual = first submission among the steps
  const cdtPlan = (first && cdtOf(progress, first.id).planDate) || minIso(steps.map(s => cdtOf(progress, s.id).planDate));
  const cdtActual = minIso(steps.map(s => cdtOf(progress, s.id).actualDate));
  const cdtAnchor = steps.find(s => cdtActual && cdtOf(progress, s.id).actualDate === cdtActual) || first;

  // CQNN: latest planned decision; actual when every linked procedure is finished
  const nnPlan = maxIso(steps.map(s => nnOf(progress, s.id).planDate));
  const nnDone = states.every(s => s.done);
  const nnActual = nnDone ? maxIso(states.map(s => s.doneDate)) : '';
  const exitState = nnDone ? states.find(s => s.doneDate === nnActual) : undefined;
  const exitStep = exitState ? steps.find(s => s.id === exitState.exitStepId) : undefined;

  const openState = states.find(s => !s.done);
  const current = openState?.openSteps[0];
  const agency = (exitStep || current || first)?.agency || '';

  const anyStepData = steps.some(s => {
    const p = progress?.[s.id];
    return !!(p?.cdt?.planDate || p?.cdt?.actualDate || p?.nn?.planDate || p?.nn?.actualDate);
  });
  const useLegacy = !anyStepData;

  return {
    ...base,
    stepIds: steps.map(s => s.id),
    cdtPlan: cdtPlan || (useLegacy ? planOrX(legacy.cdtPlan) : ''),
    nnPlan: nnPlan || (useLegacy ? planOrX(legacy.nnPlan) : ''),
    cdtActual: cdtActual || (useLegacy ? toIsoDate(legacy.cdtActual) : ''),
    nnActual: nnActual || (useLegacy ? toIsoDate(legacy.nnActual) : ''),
    cdtNote: (cdtAnchor && cdtOf(progress, cdtAnchor.id).note) || (useLegacy ? legacy.cdtNote || '' : ''),
    nnNote: (exitStep && nnOf(progress, exitStep.id).note) || (useLegacy ? legacy.nnNote || '' : ''),
    cdtAttachments: (cdtAnchor && cdtOf(progress, cdtAnchor.id).attachments) || (useLegacy ? legacy.cdtAttachments || [] : []),
    nnAttachments: (exitStep && nnOf(progress, exitStep.id).attachments) || (useLegacy ? legacy.nnAttachments || [] : []),
    agency,
    currentStepId: nnDone ? '' : (current?.id || ''),
    anchorCdtStepId: first?.id || ''
  };
};

export const computeMilestones = (
  process: any,
  stages: any[] | undefined | null,
  progress: ProjectStepProgress,
  legacyFor: (m: CatalogMilestone) => LegacyMilestoneValues = () => ({})
): Record<string, MilestoneProgress> => {
  const out: Record<string, MilestoneProgress> = {};
  catalogMilestones(stages).forEach(m => { out[m.name] = computeMilestone(process, m, progress, legacyFor(m)); });
  return out;
};

// ─── Writes (pure: return a new progress object) ──────────────────────────────────────────────────
const clone = (p: ProjectStepProgress): ProjectStepProgress => JSON.parse(JSON.stringify(p || {}));
const stamp = (entry: ProgressEntry, user?: string): ProgressEntry => ({ ...entry, updatedBy: user, updatedAt: new Date().toISOString() });
const setEntry = (p: ProjectStepProgress, key: string, side: ProgressSide, entry: ProgressEntry) => {
  p[key] = { ...(p[key] || {}), [side]: entry };
};

export interface StepUpdate {
  stepId: string;
  side: ProgressSide;
  date: string;            // TT when the status closes the step (or for the cdt side); else expected date
  status?: string;         // nn only
  note?: string;
  attachments?: ProgressAttachment[];
  nextStepIds?: string[];  // nn only, when closing
  user?: string;
}

// ① Update of one step. Closing the step (Hoàn thành / Đã phê duyệt) records the actual date and the
// chosen next steps, whose CQNN plan becomes date + their processing days — unless the step already has
// a plan that was entered (Kế hoạch, Chỉnh sửa mốc, imported data): a plan is not moved by the actual
// progress, otherwise a step finished ahead of its plan would show as late. Any other status reopens the
// step: the date is the expected completion date.
export const applyStepUpdate = (process: any, progress: ProjectStepProgress, u: StepUpdate): ProjectStepProgress => {
  const p = clone(progress);
  const date = toIsoDate(u.date);
  const prev = p[u.stepId]?.[u.side] || {};
  const attachments = u.attachments !== undefined ? u.attachments : prev.attachments;
  if (u.side === 'cdt') {
    setEntry(p, u.stepId, 'cdt', stamp({ ...prev, actualDate: date || undefined, note: u.note ?? prev.note, attachments, source: 'step' }, u.user));
    return p;
  }
  const closes = DONE_STEP_STATUSES.includes(u.status || '');
  const next = closes ? (u.nextStepIds || []).map(String) : [];
  const entry: ProgressEntry = {
    ...prev,
    status: u.status || prev.status,
    note: u.note ?? prev.note,
    attachments,
    actualDate: closes ? date || undefined : undefined,
    expectedDate: closes ? undefined : date || undefined,
    nextStepIds: closes ? next : undefined,
    source: 'step'
  };
  setEntry(p, u.stepId, 'nn', stamp(entry, u.user));

  if (closes && date) {
    const steps = processSteps(process);
    next.forEach(id => {
      const step = steps.find(s => s.id === id);
      if (!step) return;
      const d = parseDateStrict(date)!;
      d.setDate(d.getDate() + (step.slaDays || 0));
      const planDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const nn = p[id]?.nn || {};
      if (nn.planDate && nn.planSource !== 'auto') return;
      setEntry(p, id, 'nn', stamp({ ...nn, planDate, planSource: 'auto' }, u.user));
    });
  }
  return p;
};

export interface MilestoneInput {
  milestone: string;
  side: ProgressSide;
  date: string;            // '' clears what was entered from the milestone
  note?: string;
  attachments?: ProgressAttachment[];
  user?: string;
}

// Steps a new CQNN date of a finished procedure moves: the step that ended it, and the steps a quick input
// closed together with it (same date); steps closed on the step screen keep their date
export const milestoneMovedStepIds = (st: ProcedureState, progress: ProjectStepProgress): string[] => {
  const target = st.exitStepId || st.steps[st.steps.length - 1]?.id;
  if (!st.done || !target) return [];
  const date = progress?.[target]?.nn?.actualDate;
  const together = st.steps.filter(s => s.id !== target && progress?.[s.id]?.nn?.source === 'milestone'
    && !!date && progress[s.id]!.nn!.actualDate === date).map(s => s.id);
  return [target, ...together];
};

// ② Date entered on a milestone, written onto the steps of the linked procedures:
//   cdt → first step of the procedure (CĐT nộp hồ sơ)
//   nn  → every still-open step of the procedures is closed on that date ("nhập nhanh"); when they are
//         already finished, the step that finished them gets the new date
export const applyMilestoneInput = (process: any, progress: ProjectStepProgress, input: MilestoneInput): ProjectStepProgress => {
  const p = clone(progress);
  const date = toIsoDate(input.date);
  const procs = linkedProcedures(process, input.milestone);

  if (procs.length === 0) {
    const key = milestoneKey(input.milestone);
    const prev = p[key]?.[input.side] || {};
    setEntry(p, key, input.side, stamp({
      ...prev, actualDate: date || undefined, note: input.note ?? prev.note,
      attachments: input.attachments ?? prev.attachments, source: 'milestone'
    }, input.user));
    return p;
  }

  const states = procs.map((ps: any) => procedureState(ps, p));
  const steps = states.flatMap(s => s.steps);

  if (input.side === 'cdt') {
    const anchor = steps[0];
    if (!anchor) return p;
    // A date entered on a step later than the anchor stays; the milestone shows the earliest one
    const prev = p[anchor.id]?.cdt || {};
    setEntry(p, anchor.id, 'cdt', stamp({
      ...prev, actualDate: date || undefined, note: input.note ?? prev.note,
      attachments: input.attachments ?? prev.attachments, source: 'milestone'
    }, input.user));
    return p;
  }

  if (!date) {
    // Clearing: undo only what the quick input closed; steps closed on the step screen stay
    steps.forEach(s => {
      const nn = p[s.id]?.nn;
      if (nn?.source === 'milestone' && nn.actualDate) {
        const { actualDate, ...rest } = nn;
        setEntry(p, s.id, 'nn', stamp({ ...rest, status: undefined }, input.user));
      }
    });
    return p;
  }

  states.forEach((st, i) => {
    const lastStep = st.steps[st.steps.length - 1];
    if (st.done) {
      const target = st.exitStepId || lastStep?.id;
      if (!target) return;
      milestoneMovedStepIds(st, p).forEach(id => {
        const nn = p[id]?.nn || {};
        setEntry(p, id, 'nn', stamp(id === target
          ? { ...nn, actualDate: date, note: input.note ?? nn.note, attachments: input.attachments ?? nn.attachments }
          : { ...nn, actualDate: date }, input.user));
      });
      return;
    }
    st.openSteps.forEach(s => {
      const nn = p[s.id]?.nn || {};
      const isLast = s.id === lastStep?.id;
      setEntry(p, s.id, 'nn', stamp({
        ...nn,
        status: 'Hoàn thành',
        actualDate: date,
        expectedDate: undefined,
        nextStepIds: undefined,
        note: isLast ? (input.note || nn.note || QUICK_INPUT_NOTE) : (nn.note || QUICK_INPUT_NOTE),
        attachments: isLast ? (input.attachments ?? nn.attachments) : nn.attachments,
        source: 'milestone'
      }, input.user));
    });
    void i;
  });
  return p;
};

// Plan date entered on a milestone (Cập nhật kế hoạch dự án → Chỉnh sửa mốc):
//   cdt → first step; nn → the step holding the latest CQNN plan, else the last step
export const applyMilestonePlan = (
  process: any, progress: ProjectStepProgress, milestone: string, side: ProgressSide, planDate: string, user?: string
): ProjectStepProgress => {
  const p = clone(progress);
  const iso = toIsoDate(planDate);
  const procs = linkedProcedures(process, milestone);
  let key: string | undefined;
  if (procs.length === 0) {
    key = milestoneKey(milestone);
  } else {
    const steps = procs.flatMap((ps: any) => procedureSteps(ps));
    if (side === 'cdt') {
      key = steps[0]?.id;
    } else {
      const latest = maxIso(steps.map(s => nnOf(p, s.id).planDate));
      key = (latest && steps.find(s => nnOf(p, s.id).planDate === latest)?.id) || steps[steps.length - 1]?.id;
    }
  }
  if (!key) return p;
  const prev = p[key]?.[side] || {};
  setEntry(p, key, side, stamp({ ...prev, planDate: iso || undefined, planSource: undefined }, user));
  return p;
};

export const applyStepPlan = (
  progress: ProjectStepProgress, stepId: string, side: ProgressSide, planDate: string, user?: string
): ProjectStepProgress => {
  const p = clone(progress);
  const prev = p[stepId]?.[side] || {};
  setEntry(p, stepId, side, stamp({ ...prev, planDate: toIsoDate(planDate) || undefined, planSource: undefined }, user));
  return p;
};

// ─── Views in the former project shape ────────────────────────────────────────────────────────────
// project.milestones[stepId] = { investor, agency } (plans) and project.implementationPlan[stepId]
// (actuals / status) as the existing screens read them. Only keys that have progress entries.
export const legacyStepViews = (process: any, progress: ProjectStepProgress) => {
  const milestones: Record<string, any> = {};
  const implementationPlan: Record<string, any> = {};
  const skipped = skippedStepIds(process, progress);
  Object.entries(progress || {}).forEach(([key, sides]) => {
    if (key.startsWith(MILESTONE_KEY_PREFIX)) return;
    const c = sides?.cdt || {};
    const n = sides?.nn || {};
    if (c.planDate || n.planDate) {
      milestones[key] = {
        ...(c.planDate ? { investor: c.planDate } : {}),
        ...(n.planDate ? { agency: n.planDate } : {}),
        // computed from the previous step's closing date: the next closing may recompute it
        ...(n.planDate && n.planSource === 'auto' ? { agencyAuto: true } : {})
      };
    }
    const ip: any = {};
    if (n.actualDate) ip.agencyActualDate = n.actualDate;
    if (n.expectedDate) ip.agencyExpectedDate = n.expectedDate;
    if (n.status) ip.agencyStatus = n.status;
    if (n.note) ip.agencyNote = n.note;
    if (n.attachments?.length) ip.agencyAttachments = n.attachments;
    if (n.updatedAt) ip.agencyStatusDate = n.updatedAt.slice(0, 10);
    if (c.actualDate) ip.investorActualDate = c.actualDate;
    if (c.note) ip.investorNote = c.note;
    if (c.attachments?.length) ip.investorAttachments = c.attachments;
    if (Object.keys(ip).length > 0) implementationPlan[key] = ip;
  });
  skipped.forEach(id => { implementationPlan[id] = { ...(implementationPlan[id] || {}), skipped: true }; });
  return { milestones, implementationPlan };
};

// ─── Bridge to the former milestone storage ───────────────────────────────────────────────────────
// The 7 milestones the old screens / columns were built for, recognised by name. Used only to read old
// data and to keep the old columns filled for screens not yet moved to the milestone view.
export const LEGACY_PHASES: { id: string; planKey: string; match: (n: string) => boolean }[] = [
  { id: 'chutruong', planKey: 'chutruong', match: n => n.includes('chủ trương') },
  { id: 'qh1500', planKey: 'qh1500', match: n => n.includes('1/500') || n.includes('quy hoạch') },
  { id: 'giaodat', planKey: 'qdgiaodat', match: n => n.includes('giao đất') || n.includes('thuê đất') },
  { id: 'htkt', planKey: 'htkt_dtm', match: n => n.includes('htkt') || n.includes('hạ tầng') || n.includes('đtm') || n.includes('đấu nối') || n.includes('đầu nối') },
  { id: 'bcnckt', planKey: 'baocaonckt', match: n => n.includes('nckt') || n.includes('khả thi') },
  { id: 'pccc', planKey: 'pccc', match: n => n.includes('pccc') || n.includes('phòng cháy') },
  { id: 'gpxd', planKey: 'gpxaydung', match: n => n.includes('gpxd') || n.includes('giấy phép xây dựng') }
];

export const legacyPhaseOf = (milestoneName: string) => {
  const n = normName(milestoneName);
  return LEGACY_PHASES.find(p => p.match(n));
};

export const legacyValuesFor = (project: any, legacyActual: any, milestoneName: string): LegacyMilestoneValues => {
  const phase = legacyPhaseOf(milestoneName);
  if (!phase) return {};
  const a = legacyActual?.[phase.id] || {};
  return {
    cdtPlan: project?.[`${phase.planKey}_cdt_date`],
    nnPlan: project?.[`${phase.planKey}_nn_date`],
    cdtActual: a.cdtDate,
    nnActual: a.nnDate,
    cdtNote: a.cdtNote,
    nnNote: a.nnNote,
    cdtAttachments: Array.isArray(a.cdtAttachments) ? a.cdtAttachments : undefined,
    nnAttachments: Array.isArray(a.nnAttachments) ? a.nnAttachments : undefined
  };
};

// ─── Milestone status for the Gantt ───────────────────────────────────────────────────────────────
export type MilestoneSideStatus = 'done' | 'in_progress' | 'delayed' | 'not_started';

// Order of the milestones of a project in the catalog, and which one it is at: the milestone whose
// procedure holds the current step, else the first one not finished on the CQNN side
export const activeMilestoneIndex = (list: MilestoneProgress[], currentStepId?: string): number => {
  if (currentStepId) {
    const idx = list.findIndex(m => m.stepIds.includes(String(currentStepId)));
    if (idx !== -1) return idx;
  }
  const idx = list.findIndex(m => !(m.nnActual || m.nnPlan === 'X'));
  return idx === -1 ? list.length - 1 : idx;
};

export const milestoneSideStatus = (
  m: MilestoneProgress, side: ProgressSide, index: number, activeIndex: number, now: Date = new Date()
): MilestoneSideStatus => {
  const plan = side === 'cdt' ? m.cdtPlan : m.nnPlan;
  const actual = side === 'cdt' ? m.cdtActual : m.nnActual;
  if (actual || plan === 'X') return 'done';
  if (index > activeIndex) return 'not_started';
  if (index < activeIndex) return 'delayed';
  const d = parseDateStrict(plan || '');
  if (d) {
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (now.getTime() > endOfDay.getTime()) return 'delayed';
  }
  return 'in_progress';
};
