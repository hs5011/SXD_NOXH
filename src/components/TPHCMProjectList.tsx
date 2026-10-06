import React, { useState } from 'react';
import { 
  ChevronLeft, Building2, MapPin, Building, Search, X, Filter, ArrowUpRight, 
  Clock, CheckCircle2, AlertCircle, BarChart2, Layers
} from 'lucide-react';

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  location: string;
  progress: number;
  status: string;
  currentStep: string;
  deadline: string;
  stage: string;
  apartmentCount?: number;
  totalArea?: number;
}

interface TPHCMProjectListProps {
  title: string;
  projects: Project[];
  onBack: () => void;
  onProjectClick: (project: Project) => void;
}

const TPHCMProjectList: React.FC<TPHCMProjectListProps> = ({ title, projects, onBack, onProjectClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Project; direction: 'asc' | 'desc' } | null>(null);

  const formatNum = (num: number) => new Intl.NumberFormat('vi-VN').format(Math.floor(num));

  const filteredProjects = projects.filter(p => 
    (p.name || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.code || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.investor || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.location || '').toString().toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    
    if (key === 'code' || key === 'id') {
      const getNum = (p: any, k: string) => {
        const val = p[k];
        if (!val) return 999;
        const match = val.toString().match(/\d+/);
        return match ? parseInt(match[0], 10) : 999;
      };
      const numA = getNum(a, key);
      const numB = getNum(b, key);
      if (numA !== numB) {
        return direction === 'asc' ? numA - numB : numB - numA;
      }
    }
    
    if (a[key]! < b[key]!) return direction === 'asc' ? -1 : 1;
    if (a[key]! > b[key]!) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'ontime': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'delayed': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-[#1e40af] text-white p-6 pb-20 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 transition-all active:scale-95 group"
            >
              <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase leading-none">{title}</h1>
              <div className="flex items-center gap-2 mt-2 opacity-60">
                <p className="text-[11px] font-black tracking-[0.2em] uppercase">Danh sách chi tiết</p>
                <span className="w-1 h-1 bg-white rounded-full"></span>
                <p className="text-[11px] font-black uppercase text-blue-200">{projects.length} dự án</p>
              </div>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
            <input 
              type="text"
              placeholder="Tìm kiếm dự án..."
              className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/10 rounded-2xl text-white placeholder:text-white/30 focus:bg-white/20 focus:ring-2 focus:ring-white/20 outline-none transition-all text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 -mt-10 px-6 pb-8 overflow-hidden">
        <div className="max-w-7xl mx-auto bg-white rounded-[32px] shadow-2xl border border-slate-100 flex flex-col h-full overflow-hidden">
          
          {/* Quick Stats Bar */}
          <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Tổng số căn:</span>
              <span className="text-sm font-black text-slate-800">{formatNum(projects.reduce((acc, p) => acc + (p.apartmentCount || 0), 0))}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Tiến độ TB:</span>
              <span className="text-sm font-black text-blue-600">
                {(projects.length > 0 ? projects.reduce((acc, p) => acc + p.progress, 0) / projects.length : 0).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-4 bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <div className="col-span-5">Thông tin dự án</div>
            <div className="col-span-4">Chủ đầu tư / Địa điểm</div>
            <div className="col-span-2 text-center">Số căn / Diện tích</div>
            <div className="col-span-1 text-center">Thao tác</div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto px-4 py-2 md:px-0 md:py-0">
            {sortedProjects.length > 0 ? (
              sortedProjects.map((project, idx) => (
                <div 
                  key={project.id}
                  onClick={() => onProjectClick(project)}
                  className={`group grid grid-cols-1 md:grid-cols-12 gap-4 px-4 py-6 md:px-8 hover:bg-blue-50/30 transition-all cursor-pointer border-b border-slate-50 last:border-0`}
                >
                  {/* Info */}
                  <div className="col-span-1 md:col-span-5 flex gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 group-hover:shadow-sm transition-all shrink-0">
                      <Building size={24} />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-[10px] font-black text-blue-700 rounded-md uppercase tracking-tighter">
                          {project.code}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-black text-slate-600 rounded-md uppercase tracking-tighter">
                          {project.stage}
                        </span>
                      </div>
                      <h3 className="font-black text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                        {project.name}
                      </h3>
                    </div>
                  </div>

                  {/* Investor / Location */}
                  <div className="col-span-1 md:col-span-4 flex flex-col justify-center text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-1">
                      <Building2 size={14} className="text-slate-300" />
                      <span className="truncate">{project.investor}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 italic">
                      <MapPin size={14} className="text-slate-300 shrink-0" />
                      <span className="line-clamp-1">{project.location}</span>
                    </div>
                  </div>

                  {/* Units / Area */}
                  <div className="col-span-1 md:col-span-2 flex md:flex-col items-center justify-between md:justify-center gap-2 text-center">
                    <div className="text-center">
                      <p className="text-[10px] md:hidden font-black text-slate-400 uppercase mb-1">Số căn</p>
                      <span className="text-sm font-black text-slate-800">{formatNum(project.apartmentCount || 0)}</span>
                    </div>
                    <div className="h-4 w-px bg-slate-100 hidden md:block"></div>
                    <div className="text-center">
                      <p className="text-[10px] md:hidden font-black text-slate-400 uppercase mb-1">Diện tích</p>
                      <span className="text-xs font-bold text-slate-400">{project.totalArea?.toFixed(2) || '0.00'} ha</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-center">
                    <div className="p-2 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:scale-110">
                      <ArrowUpRight size={20} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 h-full">
                <Search size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-sm opacity-50">Không tìm thấy dự án nào</p>
                <button 
                  onClick={() => setSearchTerm('')}
                  className="mt-4 text-blue-600 font-bold text-[11px] uppercase tracking-widest hover:underline"
                >
                  Xóa tìm kiếm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TPHCMProjectList;
