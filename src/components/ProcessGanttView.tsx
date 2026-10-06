import React, { useState, useEffect } from 'react';
import { 
  Filter, CheckCircle2, Clock, AlertCircle, Building2,
  ChevronDown, Search, ArrowRight, Info
} from 'lucide-react';
import { PROJECT_STEPS_DTC, PROJECT_STEPS_DN } from '../constants';
import { isProjectOverdue } from '../lib/phaseLogic';

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  status: string;
  currentStep: string;
  isPublicInvestment: boolean;
  stage: string;
  progress: number;
}

interface ProcessGanttViewProps {
  projects?: Project[];
  actualProgress?: Record<string, any>;
}

export default function ProcessGanttView({ projects: initialProjects = [], actualProgress = {} }: ProcessGanttViewProps) {
  // Same "quá hạn" rule as the dashboards (src/lib/phaseLogic), not the stored status
  const isLate = (p: any) => isProjectOverdue(p, actualProgress[p.id]);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);


  const getSteps = (isPublic: boolean) => isPublic ? PROJECT_STEPS_DTC : PROJECT_STEPS_DN;

  const getStepStatus = (project: Project, stepName: string, stepIndex: number) => {
    const steps = getSteps(project.isPublicInvestment);
    const currentIndex = steps.indexOf(project.currentStep);
    
    if (project.stage === 'Hoàn thành' || project.progress === 100) {
      return 'completed';
    }

    if (currentIndex === -1) return 'pending';
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) {
      return isLate(project) ? 'delayed' : 'processing';
    }
    return 'pending';
  };

  const dtcProjects = projects.filter(p => p.isPublicInvestment);
  const dnProjects = projects.filter(p => !p.isPublicInvestment);

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải dữ liệu...</div>;

  const GanttTable = ({ title, projectsList, isPublic }: { title: string, projectsList: Project[], isPublic: boolean }) => {
    const [localSearch, setLocalSearch] = useState('');
    const steps = getSteps(isPublic);
    
    const filteredList = projectsList.filter(p => 
      p.name.toLowerCase().includes(localSearch.toLowerCase()) || 
      p.code.toLowerCase().includes(localSearch.toLowerCase())
    );
    
    const stepCount = steps.length;

    return (
      <div className="space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 gap-3">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className={`w-2 h-6 rounded-full ${isPublic ? 'bg-blue-600' : 'bg-emerald-600'}`} />
            {title}
            <span className="text-sm font-semibold text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredList.length} dự án
            </span>
          </h3>
          
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Tìm nhanh trong danh sách..." 
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 w-full sm:w-64 shadow-sm transition-all font-medium"
            />
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-30">
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="sticky left-0 z-40 bg-slate-50 p-4 text-left min-w-[220px] max-w-[220px] border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dự án & Chủ đầu tư</span>
                  </th>
                  {steps.map((step, i) => (
                    <th key={i} className="p-3 min-w-[130px] border-r border-slate-100 last:border-0 bg-slate-50">
                      <div className="flex flex-col items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shadow-sm">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter text-center leading-tight">
                          Bước {i + 1}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={stepCount + 1} className="p-12 text-center text-slate-400 font-medium italic">
                      Không tìm thấy dự án nào trong danh mục này
                    </td>
                  </tr>
                ) : (
                  filteredList.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50/80 p-4 border-r border-slate-100 border-b border-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug mb-1" title={project.name}>
                            {project.name}
                          </p>
                          <p className="text-xs text-slate-400 font-semibold truncate mb-2">{project.investor}</p>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-widest ${
                              isLate(project) ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {isLate(project) ? 'Quá hạn' : 'Đang xử lý'}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">{project.code}</span>
                          </div>
                        </div>
                      </td>
                      {steps.map((stepName, i) => {
                        const status = getStepStatus(project, stepName, i);
                        return (
                          <td key={i} className="p-3 min-w-[130px] border-r border-slate-50 border-b border-slate-50 last:border-r-0 relative">
                            <div className="flex flex-col items-center gap-2">
                              <div 
                                className={`w-full h-1.5 rounded-full relative overflow-hidden ${
                                  status === 'completed' ? 'bg-emerald-500' :
                                  status === 'processing' ? 'bg-amber-400' :
                                  status === 'delayed' ? 'bg-rose-500' :
                                  'bg-slate-100'
                                }`}
                              >
                                {status === 'processing' && (
                                  <div className="absolute inset-0 bg-white/30 animate-shimmer" />
                                )}
                              </div>
                              <p className={`text-xs text-center leading-[1.2] font-semibold px-1 line-clamp-2 h-8 flex items-center justify-center ${
                                status === 'completed' ? 'text-emerald-600' :
                                status === 'processing' ? 'text-blue-600' :
                                status === 'delayed' ? 'text-rose-600' :
                                'text-slate-300'
                              }`}>
                                {stepName}
                              </p>
                              <div className="h-3">
                                {status === 'processing' && (
                                  <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 uppercase tracking-tighter">
                                    <Clock size={8} />
                                    <span>Đang xử lý</span>
                                  </div>
                                )}
                                {status === 'delayed' && (
                                  <div className="flex items-center gap-1 text-[9px] font-bold text-rose-600 uppercase tracking-tighter">
                                    <AlertCircle size={8} />
                                    <span>Quá hạn</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Sơ đồ Gantt theo quy trình</h2>
          <p className="text-slate-500 text-base font-medium">Theo dõi tiến độ dự án qua các bước chuẩn hóa (7 bước & 8 bước)</p>
        </div>
      </div>

      {/* Legend & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex items-center gap-8 px-8 py-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Info size={18} className="text-slate-400" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Chú giải trạng thái:</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-slate-600">Đã hoàn thành</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-sm font-bold text-slate-600">Đang thực hiện</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-sm font-bold text-slate-600">Quá hạn</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-100" />
              <span className="text-sm font-bold text-slate-600">Chưa bắt đầu</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 text-white flex items-center justify-between shadow-lg shadow-slate-200">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Tổng số dự án</p>
            <p className="text-5xl font-black">{projects.length}</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <p className="text-xs font-black text-rose-500 uppercase tracking-widest mb-1">Quá hạn</p>
              <p className="text-3xl font-black text-rose-500">{projects.filter(p => isLate(p)).length}</p>
            </div>
            <div className="text-center border-l border-slate-800 pl-8">
              <p className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-1">Đúng hạn</p>
              <p className="text-3xl font-black text-emerald-500">{projects.filter(p => !isLate(p)).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* DTC Projects Section */}
      <GanttTable 
        title="Dự án sử dụng vốn Đầu tư công (DTC)" 
        projectsList={dtcProjects} 
        isPublic={true} 
      />

      {/* DN Projects Section */}
      <GanttTable 
        title="Dự án không sử dụng vốn Đầu tư công (DN)" 
        projectsList={dnProjects} 
        isPublic={false} 
      />
    </div>
  );
}
