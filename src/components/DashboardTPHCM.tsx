import React, { useState } from 'react';
import { 
  ChevronLeft, Building2, MapPin, TrendingUp, Layers, Clock, X, Search, Building, ArrowRight
} from 'lucide-react';
import { PieChart, Pie, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface Project {
  id: string;
  code: string;
  name: string;
  investor: string;
  location: string;
  progress: number;
  status: string;
  currentStep: string;
  parentStep?: string;
  childStep?: string;
  stepDeadline?: string;
  currentAgency: string;
  currentDepartment?: string;
  deadline: string;
  stage: string;
  delayDays?: number;
  processId?: string;
  chutruong_nn_date?: string;
  chutruong_cdt_date?: string;
  gpxaydung_nn_date?: string;
  gpxaydung_cdt_date?: string;
  milestones?: Record<string, { investor: string; agency: string }>;
  implementationPlan?: Record<string, { agencyActualDate: string }>;
  isPublicInvestment?: boolean;
  totalArea?: number;
  apartmentCount?: number;
  projectGroup?: string;
}

interface DashboardTPHCMProps {
  projects: Project[];
  onBack: () => void;
  onSeeProjects: (title: string, projects: Project[]) => void;
}

const DashboardTPHCM: React.FC<DashboardTPHCMProps> = ({ projects, onBack, onSeeProjects }) => {
  const [statsCategory, setStatsCategory] = useState<'stage' | 'group'>('stage');

  const statsGroups = (() => {
    const isChutruongDone = (p: Project) => p.chutruong_nn_date === 'X' || p.chutruong_cdt_date === 'X';
    const isLicensed = (p: Project) => p.gpxaydung_nn_date === 'X' || p.gpxaydung_cdt_date === 'X';

    const completed = projects.filter(p => p.stage === 'Hoàn thành' || p.progress === 100);
    
    // Licensed: Đã được cấp phép xây dựng (có dấu X) và đang ở giai đoạn Chuẩn bị đầu tư
    const licensed = projects.filter(p => p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isLicensed(p));
    
    // Approved: Đã xong chủ trương (có dấu X) nhưng chưa được cấp phép, và ở giai đoạn Chuẩn bị đầu tư
    const approved = projects.filter(p => p.stage === 'CHUẨN BỊ ĐẦU TƯ' && isChutruongDone(p) && !isLicensed(p));
    
    // Preparing: Các dự án còn lại trong giai đoạn Chuẩn bị đầu tư (chưa xong chủ trương)
    const preparing = projects.filter(p => p.stage === 'CHUẨN BỊ ĐẦU TƯ' && !isChutruongDone(p));

    // Announced: Dự án đã công bố (Giai đoạn Thực hiện đầu tư)
    const announced = projects.filter(p => p.stage === 'THỰC HIỆN ĐẦU TƯ');

    // Grouping by projectGroup (Nhóm A, B, C...)
    const groups: Record<string, Project[]> = {};
    projects.forEach(p => {
      const g = p.projectGroup || 'Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });

    return { completed, licensed, approved, preparing, announced, byGroup: groups };
  })();

  const stats = (() => {
    const { completed, licensed, approved, preparing, announced } = statsGroups;
    const sumUnits = (list: Project[]) => list.reduce((acc, p) => acc + (Number(p.apartmentCount) || 0), 0);
    const sumArea = (list: Project[]) => list.reduce((acc, p) => acc + (Number(p.totalArea) || 0), 0);

    return {
      preparing: { projects: preparing.length, units: sumUnits(preparing), area: sumArea(preparing) },
      approved: { projects: approved.length, units: sumUnits(approved), area: sumArea(approved) },
      licensed: { projects: licensed.length, units: sumUnits(licensed), area: sumArea(licensed) },
      announced: { projects: announced.length, units: sumUnits(announced), area: sumArea(announced) },
      completed: { projects: completed.length, units: sumUnits(completed), area: sumArea(completed) },
      total: { projects: projects.length, units: sumUnits(projects), area: sumArea(projects) }
    };
  })();

  const handleShowProjects = (title: string, list: Project[]) => {
    onSeeProjects(title, list);
  };

  const formatNum = (num: number) => num === undefined ? '0' : new Intl.NumberFormat('vi-VN').format(Math.floor(num));
  const formatArea = (num: number) => num === undefined ? '0' : new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  
  const completionRate = stats.total.projects > 0 ? (stats.completed.projects / stats.total.projects) * 100 : 0;
  const licensedRate = stats.total.projects > 0 ? (stats.licensed.projects / stats.total.projects) * 100 : 0;
  const approvedRate = stats.total.projects > 0 ? (stats.approved.projects / stats.total.projects) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto pb-24">
      <div className="bg-[#1e40af] text-white p-6 pb-12 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase">DASHBOARD TPHCM</h1>
            <p className="text-blue-100/60 text-[11px] font-black tracking-[0.2em] uppercase">Thống kê quy hoạch & phát triển NOXH</p>
          </div>
        </div>
      </div>

      <div className="flex-1 -mt-8 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Top Row: Main Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* 1. Total NOXH - GREEN CARD */}
            <div 
              onClick={() => handleShowProjects("Tất cả dự án NOXH", projects)}
              className="bg-emerald-800 rounded-2xl shadow-lg shadow-emerald-200/50 p-4 flex flex-col text-white relative overflow-hidden group cursor-pointer hover:bg-emerald-900 transition-colors h-full"
            >
              <div className="absolute right-2 bottom-2 text-white/5 group-hover:scale-125 transition-transform">
                <Building2 size={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 text-center flex flex-col h-full justify-center">
                <h4 className="text-[12px] font-black uppercase tracking-widest mb-1">Tổng dự án NOXH</h4>
                <div className="h-px bg-white/20 w-full my-2"></div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black leading-none">{formatNum(stats.total.projects)}</span>
                    <span className="text-[11px] font-bold opacity-70 uppercase">dự án</span>
                  </div>
                  <div className="w-full flex flex-col gap-1.5 px-4 py-2 bg-white/10 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-100 uppercase">Quy mô</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black leading-none">{formatNum(stats.total.units)}</span>
                        <span className="text-[10px] font-bold opacity-70 uppercase">căn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                      <span className="text-[10px] font-bold text-emerald-100 uppercase">Quỹ đất</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black leading-none">{formatArea(stats.total.area)}</span>
                        <span className="text-[10px] font-bold opacity-70 uppercase">ha</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Preparing - PASTEL TEAL CARD */}
            <div 
              onClick={() => handleShowProjects("Dự án đang chuẩn bị hồ sơ", statsGroups.preparing)}
              className="bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm p-4 flex flex-col relative overflow-hidden group cursor-pointer hover:border-emerald-300 transition-colors h-full"
            >
              <div className="absolute right-2 bottom-2 text-emerald-200/50 group-hover:scale-125 transition-transform">
                <MapPin size={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 text-center flex flex-col h-full justify-center">
                <h4 className="text-[12px] font-black text-emerald-900 uppercase tracking-widest mb-1">Đang chuẩn bị hồ sơ</h4>
                <div className="h-px bg-emerald-200/50 w-full my-2"></div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-emerald-700 leading-none">{formatNum(stats.preparing.projects)}</span>
                    <span className="text-[11px] font-bold text-emerald-600 uppercase">dự án</span>
                  </div>
                  <div className="w-full flex flex-col gap-1.5 px-4 py-2 bg-white rounded-xl border border-emerald-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">Quy mô</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-emerald-700 leading-none">{formatNum(stats.preparing.units)}</span>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">căn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-emerald-50 pt-1.5">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">Quỹ đất</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-emerald-700 leading-none">{formatArea(stats.preparing.area)}</span>
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">ha</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Approved - PASTEL BLUE CARD */}
            <div 
              onClick={() => handleShowProjects("Dự án Chuẩn bị đầu tư (Chấp thuận CTĐT)", statsGroups.approved)}
              className="bg-blue-50 border border-blue-100 rounded-2xl shadow-sm p-4 flex flex-col relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-colors h-full"
            >
              <div className="absolute right-2 bottom-2 text-blue-200/50 group-hover:scale-125 transition-transform">
                <TrendingUp size={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 text-center flex flex-col h-full justify-center">
                <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-1 leading-tight">Chấp thuận chủ trương ĐT</h4>
                <div className="h-px bg-blue-200/50 w-full my-2"></div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-blue-700 leading-none">{formatNum(stats.approved.projects)}</span>
                    <span className="text-[11px] font-bold text-blue-600 uppercase">dự án</span>
                  </div>
                  <div className="w-full flex flex-col gap-1.5 px-4 py-2 bg-white rounded-xl border border-blue-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-500 uppercase">Quy mô</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-blue-700 leading-none">{formatNum(stats.approved.units)}</span>
                        <span className="text-[10px] font-bold text-blue-600 uppercase">căn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-blue-50 pt-1.5">
                      <span className="text-[10px] font-bold text-blue-500 uppercase">Quỹ đất</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-blue-700 leading-none">{formatArea(stats.approved.area)}</span>
                        <span className="text-[10px] font-bold text-blue-600 uppercase">ha</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Licensed - PASTEL SKY CARD */}
            <div 
              onClick={() => handleShowProjects("Dự án được cấp phép xây dựng", statsGroups.licensed)}
              className="bg-sky-50 border border-sky-100 rounded-2xl shadow-sm p-4 flex flex-col relative overflow-hidden group cursor-pointer hover:border-sky-300 transition-colors h-full"
            >
              <div className="absolute right-2 bottom-2 text-sky-200/50 group-hover:scale-125 transition-transform">
                <Layers size={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 text-center flex flex-col h-full justify-center">
                <h4 className="text-[11px] font-black text-sky-900 uppercase tracking-widest mb-1 leading-tight">Được cấp phép xây dựng</h4>
                <div className="h-px bg-sky-200/50 w-full my-2"></div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-sky-700 leading-none">{formatNum(stats.licensed.projects)}</span>
                    <span className="text-[11px] font-bold text-sky-600 uppercase">dự án</span>
                  </div>
                  <div className="w-full flex flex-col gap-1.5 px-4 py-2 bg-white rounded-xl border border-sky-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-sky-500 uppercase">Quy mô</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-sky-700 leading-none">{formatNum(stats.licensed.units)}</span>
                        <span className="text-[10px] font-bold text-sky-600 uppercase">căn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-sky-50 pt-1.5">
                      <span className="text-[10px] font-bold text-sky-500 uppercase">Quỹ đất</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-sky-700 leading-none">{formatArea(stats.licensed.area)}</span>
                        <span className="text-[10px] font-bold text-sky-600 uppercase">ha</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Completed - PASTEL AMBER CARD */}
            <div 
              onClick={() => handleShowProjects("Dự án Đã hoàn thành", statsGroups.completed)}
              className="bg-amber-50 border border-amber-100 rounded-2xl shadow-sm p-4 flex flex-col relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-colors h-full"
            >
              <div className="absolute right-2 bottom-2 text-amber-200/50 group-hover:scale-125 transition-transform">
                <Building size={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 text-center flex flex-col h-full justify-center">
                <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest mb-1 leading-tight">Hoàn thành, một phần</h4>
                <div className="h-px bg-amber-200/50 w-full my-2"></div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-amber-700 leading-none">{formatNum(stats.completed.projects)}</span>
                    <span className="text-[11px] font-bold text-amber-600 uppercase">dự án</span>
                  </div>
                  <div className="w-full flex flex-col gap-1.5 px-4 py-2 bg-white rounded-xl border border-amber-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-500 uppercase">Quy mô</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-amber-700 leading-none">{formatNum(stats.completed.units)}</span>
                        <span className="text-[10px] font-bold text-amber-600 uppercase">căn</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-amber-50 pt-1.5">
                      <span className="text-[10px] font-bold text-amber-500 uppercase">Quỹ đất</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-amber-700 leading-none">{formatArea(stats.completed.area)}</span>
                        <span className="text-[10px] font-bold text-amber-600 uppercase">ha</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Rates and Progress Classification */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* 1. Tỷ lệ cluster (Left) */}
            <div className="flex flex-col gap-4">
              <div 
                onClick={() => handleShowProjects("Dự án đã hoàn thành", statsGroups.completed)}
                className="bg-white rounded-[32px] border border-slate-100 p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-blue-200 cursor-pointer group"
              >
                <div className="relative w-16 h-16 shrink-0">
                  <PieChart width={64} height={64}>
                    <Pie
                      data={[
                        { value: completionRate, fill: '#3b82f6' },
                        { value: 100 - completionRate, fill: '#f1f5f9' }
                      ]}
                      cx="50%" cy="50%" innerRadius={22} outerRadius={30} paddingAngle={0} dataKey="value" startAngle={90} endAngle={-270}
                    />
                  </PieChart>
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-blue-600">
                    {completionRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tỷ lệ hoàn thành</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">{completionRate.toFixed(2)}%</span>
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">({stats.completed.projects}/{stats.total.projects} dự án)</span>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => handleShowProjects("Dự án được cấp phép xây dựng", statsGroups.licensed)}
                className="bg-white rounded-[32px] border border-slate-100 p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-orange-200 text-left cursor-pointer group"
              >
                <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 shrink-0 group-hover:bg-orange-600 group-hover:text-white transition-all">
                  <Layers size={28} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tỷ lệ xây dựng</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-800 leading-tight group-hover:text-orange-600 transition-colors">{licensedRate.toFixed(2)}%</span>
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">({stats.licensed.projects}/{stats.total.projects} dự án)</span>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => handleShowProjects("Dự án đang chuẩn bị hồ sơ", statsGroups.preparing)}
                className="bg-white rounded-[32px] border border-slate-100 p-6 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-slate-300 text-left cursor-pointer group"
              >
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 shrink-0 group-hover:bg-slate-500 group-hover:text-white transition-all">
                  <Clock size={28} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Đang chuẩn bị hồ sơ</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-slate-800 leading-tight group-hover:text-slate-500 transition-colors">{(stats.preparing.projects / stats.total.projects * 100).toFixed(2)}%</span>
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">({stats.preparing.projects}/{stats.total.projects} dự án)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. THỐNG KÊ CHI TIẾT - Pie Chart */}
            <div className="lg:col-span-3 bg-white rounded-[32px] border border-slate-100 shadow-sm flex flex-col overflow-hidden h-full">
              <div className="px-8 py-5 flex items-center justify-between border-b border-slate-50 shrink-0">
                <div className="flex flex-col">
                  <span className="text-[12px] font-black text-slate-500 uppercase tracking-[0.2em]">Thống kê dự án</span>
                  <div className="flex gap-4 mt-2">
                    <button 
                      onClick={() => setStatsCategory('stage')}
                      className={`text-[10px] font-bold uppercase tracking-wider pb-1 border-b-2 transition-all ${statsCategory === 'stage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                      Theo tiến độ
                    </button>
                    <button 
                      onClick={() => setStatsCategory('group')}
                      className={`text-[10px] font-bold uppercase tracking-wider pb-1 border-b-2 transition-all ${statsCategory === 'group' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                      Theo nhóm
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
                </div>
              </div>
              
              <div className="flex-1 p-8 flex flex-col md:flex-row items-center justify-center gap-10">
                <div className="w-full md:w-1/2 h-[260px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statsCategory === 'stage' ? [
                          { name: 'Hoàn thành', value: stats.completed.projects, color: '#10b981' },
                          { name: 'Đã công bố', value: stats.announced.projects, color: '#059669' },
                          { name: 'Đã cấp phép', value: stats.licensed.projects, color: '#ea580c' },
                          { name: 'Chấp thuận CT', value: stats.approved.projects, color: '#2563eb' },
                          { name: 'Đang chuẩn bị', value: stats.preparing.projects, color: '#64748b' }
                        ].filter(d => d.value > 0) : Object.entries(statsGroups.byGroup).map(([name, list], index) => ({
                          name,
                          value: list.length,
                          color: index === 0 ? '#10b981' : index === 1 ? '#ea580c' : index === 2 ? '#2563eb' : '#64748b'
                        }))}
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {(statsCategory === 'stage' ? [
                          '#10b981', '#059669', '#ea580c', '#2563eb', '#64748b'
                        ] : Object.entries(statsGroups.byGroup).map((_, index) => 
                          index === 0 ? '#10b981' : index === 1 ? '#ea580c' : index === 2 ? '#2563eb' : '#64748b'
                        )).map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontWeight: '800', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-slate-800 leading-none">{stats.total.projects}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Dự án</span>
                  </div>
                </div>
                
                <div className="flex-1 w-full flex flex-col gap-2">
                  {(statsCategory === 'stage' ? [
                    { label: 'Hoàn thành', count: stats.completed.projects, rate: (stats.completed.projects / stats.total.projects) * 100, color: 'bg-emerald-500', group: statsGroups.completed },
                    { label: 'Đã công bố', count: stats.announced.projects, rate: (stats.announced.projects / stats.total.projects) * 100, color: 'bg-emerald-600', group: statsGroups.announced },
                    { label: 'Đã cấp phép', count: stats.licensed.projects, rate: (stats.licensed.projects / stats.total.projects) * 100, color: 'bg-orange-600', group: statsGroups.licensed },
                    { label: 'Chấp thuận CT', count: stats.approved.projects, rate: (stats.approved.projects / stats.total.projects) * 100, color: 'bg-blue-600', group: statsGroups.approved },
                    { label: 'Đang chuẩn bị', count: stats.preparing.projects, rate: (stats.preparing.projects / stats.total.projects) * 100, color: 'bg-slate-500', group: statsGroups.preparing }
                  ] : Object.entries(statsGroups.byGroup).map(([name, list], index) => ({
                    label: name,
                    count: list.length,
                    rate: stats.total.projects > 0 ? (list.length / stats.total.projects) * 100 : 0,
                    color: index === 0 ? 'bg-emerald-500' : index === 1 ? 'bg-orange-600' : index === 2 ? 'bg-blue-600' : 'bg-slate-500',
                    group: list
                  }))).filter(item => item.count > 0 || statsCategory !== 'stage').map((item, idx) => (
                    <div 
                      key={idx}
                      onClick={() => handleShowProjects(item.label, item.group)}
                      className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer border border-transparent hover:border-slate-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                        <span className="text-[13px] font-black text-slate-600 uppercase tracking-tight">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-lg font-black text-slate-800">{item.count}</span>
                          <span className="text-[10px] font-bold text-slate-400 ml-1">DA</span>
                        </div>
                        <div className="w-12 text-right">
                          <span className="text-[13px] font-black text-slate-400">{item.rate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardTPHCM;
