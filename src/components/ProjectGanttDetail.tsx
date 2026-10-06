import React from 'react';
import { ArrowLeft, MapPin, Building2, Calendar, Clock, Pin } from 'lucide-react';
import { formatDate } from '../lib/projectUtils';
import { MilestoneProgress, catalogMilestones } from '../lib/stepProgress';
import MilestoneGanttBoard from './MilestoneGanttBoard';

// Sơ đồ Gantt → chi tiết dự án: project header + the milestone Gantt with "+ nhập TT" (MilestoneGanttBoard)

interface ProjectGanttDetailProps {
  project: any;
  onBack: () => void;
  currentUser?: any;
  milestones?: Record<string, MilestoneProgress>;
  projectStages?: any[];
  processes?: any[];
  processingAgencies?: any[];
  onSubmitMilestone?: (projectId: string, changes: any[]) => Promise<boolean>;
}

export default function ProjectGanttDetail(props: ProjectGanttDetailProps) {
  const { project, onBack, milestones = {}, projectStages = [] } = props;
  if (!project) return null;

  // Milestones of the catalog the project has a view of, and how many are finished on the CQNN side
  const list = catalogMilestones(projectStages).map(m => milestones[m.name]).filter(Boolean);
  const doneCount = list.filter(m => m.nnActual || m.nnPlan === 'X').length;

  return (
    <div className="flex flex-col bg-slate-50 space-y-6 animate-in fade-in duration-500 relative pb-12 px-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 max-w-4xl">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors" title="Quay lại">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-slate-900 leading-tight">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2"><MapPin size={16} className="text-rose-500" /><span>{project.location}</span></div>
              <div className="flex items-center gap-2"><Building2 size={16} className="text-blue-500" /><span>{project.investor || 'Chưa có chủ đầu tư'}</span></div>
            </div>
          </div>
          <div className="flex gap-3">
            {[
              { label: 'Căn hộ', value: project.apartmentCount || '0', cls: 'bg-blue-50 border-blue-100 text-blue-600' },
              { label: 'Tầng cao', value: project.height || '0', cls: 'bg-purple-50 border-purple-100 text-purple-600' },
              { label: 'TT đã hoàn thành', value: `${doneCount}/${list.length}`, cls: 'bg-emerald-50 border-emerald-100 text-emerald-600' },
            ].map((stat, idx) => (
              <div key={idx} className={`px-4 py-2 border rounded-2xl text-center min-w-[100px] ${stat.cls}`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase">{stat.label}</p>
                <p className="text-lg font-black">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
            <span className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black rounded-lg uppercase tracking-wider">{project.projectCategory || 'Chưa xác định'}</span>
            <div className="flex items-center gap-2 text-slate-600"><Calendar size={16} className="text-slate-400" /><span>Bắt đầu: <span className="text-slate-900">{formatDate(project.startDate)}</span></span></div>
            <div className="flex items-center gap-2 text-slate-600"><Clock size={16} className="text-slate-400" /><span>Hoàn thành: <span className="text-amber-600">{formatDate(project.endDate)}</span></span></div>
            {project.currentStep && (
              <div className="flex items-center gap-2 text-slate-600">
                <Pin size={14} className="text-slate-400" /><span>Bước hiện tại: <span className="text-blue-700">{project.currentStep}</span></span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            {[['bg-emerald-500', 'Hoàn thành'], ['bg-amber-400', 'Đang thực hiện'], ['bg-blue-600', 'Đúng hạn'], ['bg-rose-500', 'Quá hạn'], ['bg-slate-200', 'Chưa bắt đầu']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-2"><div className={`w-4 h-4 rounded-lg ${c}`} /><span>{l}</span></div>
            ))}
          </div>
        </div>
      </div>

      <MilestoneGanttBoard {...props} />
    </div>
  );
}
