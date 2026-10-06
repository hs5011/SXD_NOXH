import React, { useState } from 'react';
import { 
  X, Building2, MapPin, Calendar, Info, FileText, 
  DollarSign, Maximize, Users, Clock, CheckCircle2, 
  AlertCircle, ChevronRight, Download, ExternalLink,
  History, Layout, Shield, Briefcase, TrendingUp, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, parseDate, getAgencyWithDepartment, isDateOverdue } from '../lib/projectUtils';
import { apiFetch, openFileOrDownload } from '../utils/apiFetch';

interface ProjectDetailProps {
  project: any;
  onClose: () => void;
  // Processes configured in the database
  processes?: any[];
}

export default function ProjectDetail({ project, onClose, processes = [] }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const today = new Date();

  if (!project) return null;

  const statusColors: any = {
    'On Track': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    'Delayed': 'bg-rose-50 text-rose-600 border-rose-100',
    'Warning': 'bg-amber-50 text-amber-600 border-amber-100'
  };

  const process = processes.find((p: any) => p.id === project.processId) || processes[0] || { parentSteps: [] };

  const handleDownloadFile = (file: any) => {
    openFileOrDownload(file);
  };

  const handleDownloadAll = () => {
    if (!project.files || project.files.length === 0) return;
    project.files.forEach((file: any, index: number) => {
      setTimeout(() => {
        handleDownloadFile(file);
      }, index * 400);
    });
  };

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: Layout },
    { id: 'legal', label: 'Tiến độ thực hiện', icon: Shield },
    { id: 'files', label: 'Hồ sơ dự án', icon: FileText },
    { id: 'history', label: 'Nhật ký', icon: History },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-6xl h-full sm:h-[90vh] rounded-none sm:rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative"
      >
        {/* Header Section */}
        <div className="bg-slate-50/50 border-b border-slate-100 px-4 sm:px-6 py-4 sm:py-6 shrink-0 relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-all z-20"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 shrink-0">
              <Building2 size={24} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">{project.name}</h3>
                <div className="flex gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${statusColors[project.status] || 'bg-slate-50'}`}>
                    {project.status === 'On Track' ? 'Đang xử lý' : project.status === 'Delayed' ? 'Quá hạn' : 'Cảnh báo'}
                  </span>
                  {project.isKeyProject && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                      Trọng điểm
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 font-bold text-[10px] uppercase tracking-widest">
                <div className="flex items-center gap-1">
                  <MapPin size={12} className="text-blue-500" />
                  {project.location}
                </div>
                <div className="flex items-center gap-1">
                  <Briefcase size={12} className="text-blue-500" />
                  {project.investor}
                </div>
                <div className="flex items-center gap-1">
                  <Info size={12} className="text-blue-500" />
                  {project.code}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 mt-8 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-100' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-10"
              >
                <div className="lg:col-span-2 space-y-10">
                  {/* Key Metrics Bento */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Diện tích', value: `${project.totalArea || 'N/A'} ha`, icon: Maximize, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { label: 'Tầng cao', value: `${project.height || 'N/A'} tầng`, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'Căn hộ', value: `${project.apartmentCount || 'N/A'} căn`, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                      { label: 'Vốn đầu tư', value: `${project.totalInvestment || 'N/A'} Tỷ`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
                    ].map((m, i) => (
                      <div key={i} className="p-5 rounded-[32px] bg-slate-50 border border-slate-100 flex flex-col items-center text-center group hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all duration-300">
                        <div className={`w-12 h-12 ${m.bg} ${m.color} rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                          <m.icon size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{m.label}</p>
                        <p className="text-lg font-black text-slate-900">{m.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Current Status Card */}
                  <div className="bg-slate-900 rounded-[40px] p-8 text-white relative overflow-hidden shadow-2xl shadow-slate-200">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                          <Clock className="text-blue-400" size={20} />
                        </div>
                        <h4 className="text-lg font-black uppercase tracking-widest text-blue-400">Trạng thái hiện tại</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Bước đang thực hiện</p>
                            <p className="text-2xl font-black leading-tight">{project.currentStep}</p>
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Cơ quan chủ trì</p>
                            <p className="text-lg font-bold text-blue-100">
                              {getAgencyWithDepartment(project.currentAgency, project.department || project.currentDepartment, project.currentStep)}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-6">
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Thời hạn xử lý</p>
                            <p className="text-2xl font-black text-amber-400">{formatDate(project.deadline)}</p>
                          </div>
                          <div className="pt-2">
                            <button className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl text-base font-black transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2">
                              Đôn đốc xử lý
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description or Additional Info */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Info size={16} className="text-blue-500" /> Ghi chú & Diễn giải
                    </h4>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-slate-600 leading-relaxed font-medium">
                      {project.description || "Dự án đang trong quá trình thẩm định các bước pháp lý quan trọng. Chủ đầu tư đang tích cực phối hợp với các sở ngành để hoàn thiện hồ sơ theo đúng quy định."}
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Progress Summary */}
                  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-50">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8">Tiến độ tổng thể</h4>
                    <div className="flex items-center justify-center mb-8">
                      <div className="relative w-40 h-40">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                          <circle className="text-slate-100 stroke-current" strokeWidth="8" fill="transparent" r="40" cx="50" cy="50" />
                          <circle 
                            className="text-blue-600 stroke-current transition-all duration-1000" 
                            strokeWidth="8" 
                            strokeDasharray={`${project.progress * 2.51}, 251.2`} 
                            strokeLinecap="round" 
                            fill="transparent" r="40" cx="50" cy="50" 
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-4xl font-black text-slate-900">{project.progress}%</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hoàn thành</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Giai đoạn</span>
                        <span className="text-sm font-black text-slate-700">{project.stage}</span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Nguồn vốn</span>
                        <span className="text-sm font-black text-slate-700">{project.fundingSource || 'Vốn doanh nghiệp'}</span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Phân loại dự án</span>
                        <span className="text-sm font-black text-slate-700">{project.projectCategory || 'Chưa xác định'}</span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Cấp công trình</span>
                        <span className="text-sm font-black text-slate-700">{project.buildingGrade || 'Chưa xác định'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-4">Thao tác nhanh</h4>
                    <button className="w-full p-4 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 rounded-2xl flex items-center justify-between group transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:text-blue-600 transition-colors">
                          <Calendar size={20} />
                        </div>
                        <span className="text-sm font-black text-slate-700">Cập nhật kế hoạch</span>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500" />
                    </button>
                    <button className="w-full p-4 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50 rounded-2xl flex items-center justify-between group transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:text-blue-600 transition-colors">
                          <TrendingUp size={20} />
                        </div>
                        <span className="text-sm font-black text-slate-700">Báo cáo tiến độ</span>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'legal' && (
              <motion.div 
                key="legal"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                    <Shield size={24} className="text-blue-600" /> Sơ đồ gantt tiến độ thực hiện
                  </h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-xs font-bold text-slate-500">Kế hoạch CĐT</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-600" />
                      <span className="text-xs font-bold text-slate-500">Kế hoạch cơ quan NN</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Milestones Table for 38ha and similar projects */}
                                {(project.chutruong_cdt_date || project.htkt_dtm_cdt_date) && (
                  <div className="overflow-hidden bg-white border border-slate-100 rounded-[32px] shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nội dung thực hiện</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Kế hoạch CĐT</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Kế hoạch cơ quan NN</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { id: 'chutruong', name: 'Chấp thuận chủ trương', cdt: project.chutruong_cdt_date, nn: project.chutruong_nn_date },
                          { id: 'qh1500', name: 'QH 1/500', cdt: project.qh1500_cdt_date, nn: project.qh1500_nn_date },
                          { id: 'giaodat', name: 'QĐ Giao đất', cdt: project.qdgiaodat_cdt_date, nn: project.qdgiaodat_nn_date },
                          { id: 'htkt', name: 'ĐN HTKT', cdt: project.htkt_dtm_cdt_date, nn: project.htkt_dtm_nn_date },
                          { id: 'bcnckt', name: 'BC NCKT', cdt: project.baocaonckt_cdt_date, nn: project.baocaonckt_nn_date },
                          { id: 'pccc', name: 'TD PCCC', cdt: project.pccc_cdt_date, nn: project.pccc_nn_date },
                          { id: 'gpxd', name: 'GPXD', cdt: project.gpxaydung_cdt_date, nn: project.gpxaydung_nn_date },
                          { id: 'completion', name: 'HOÀN THÀNH DỰ ÁN', cdt: project.completion_date, nn: project.completion_nn_date }
                        ].filter(m => m.cdt || m.nn).map((milestone, idx, filteredArray) => {
                          const isDone = milestone.nn === 'X' || milestone.cdt === 'X';
                          
                          // Find active step logic
                          const activeIndex = filteredArray.findIndex(m => m.nn !== 'X' && m.cdt !== 'X');
                          const isActive = idx === activeIndex;
                          const isFuture = activeIndex !== -1 && idx > activeIndex;
                          
                          const isDelayed = !isDone && isDateOverdue(milestone.nn || milestone.cdt);

                          const getStatus = () => {
                            if (isDone) return { label: 'Hoàn thành', class: 'bg-emerald-100 text-emerald-600 border-emerald-200' };
                            if (isDelayed) return { label: 'Quá hạn', class: 'bg-rose-100 text-rose-600 border-rose-200' };
                            if (isActive) return { label: 'Đang xử lý', class: 'bg-amber-100 text-amber-600 border-amber-200' };
                            if (isFuture) return { label: 'Chưa bắt đầu', class: 'bg-slate-100 text-slate-400 border-slate-200' };
                            return { label: 'Chưa bắt đầu', class: 'bg-slate-100 text-slate-400 border-slate-200' };
                          };

                          const status = getStatus();

                          return (
                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <span className={`text-sm font-black ${isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{milestone.name}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold font-mono">
                                  {milestone.cdt ? (milestone.cdt === 'X' ? 'Đã xong' : formatDate(milestone.cdt)) : '---'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold font-mono">
                                  {milestone.nn ? (milestone.nn === 'X' ? 'Đã xong' : formatDate(milestone.nn)) : '---'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex justify-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${status.class}`}>
                                    {status.label}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Tiến độ quy trình hệ thống</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {process.parentSteps.map((step, idx) => {
                    const isCompleted = project.progress > (idx + 1) * (100 / process.parentSteps.length);
                    const isCurrent = project.parentStep === step.name;
                    
                    return (
                      <div 
                        key={step.id} 
                        className={`p-6 rounded-[32px] border transition-all ${
                          isCompleted 
                            ? 'bg-emerald-50 border-emerald-100' 
                            : isCurrent 
                              ? 'bg-blue-50 border-blue-100 ring-2 ring-blue-500/20' 
                              : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                            isCompleted ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {idx + 1}
                          </div>
                          {isCompleted ? (
                            <CheckCircle2 size={20} className="text-emerald-500" />
                          ) : isCurrent ? (
                            <Clock size={20} className="text-blue-600 animate-pulse" />
                          ) : null}
                        </div>
                        <h5 className={`text-base font-black mb-1 leading-tight ${isCompleted ? 'text-emerald-900' : isCurrent ? 'text-blue-900' : 'text-slate-500'}`}>
                          {step.shortName || step.name}
                        </h5>
                        <p className="text-slate-400 text-xs font-medium leading-normal mb-4">
                          {step.name}
                        </p>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SLA dự kiến</span>
                            <span className="text-xs font-bold text-slate-600">{step.slaDays} ngày</span>
                          </div>
                          {isCurrent && (
                            <div className="pt-2">
                              <div className="w-full h-1 bg-blue-200 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: '60%' }}
                                  className="h-full bg-blue-600"
                                />
                              </div>
                              <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-tighter">Đang xử lý tại {getAgencyWithDepartment(project.currentAgency, project.department || project.currentDepartment, project.currentStep)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === 'files' && (
              <motion.div 
                key="files"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                    <FileText size={24} className="text-blue-600" /> Danh mục hồ sơ pháp lý
                  </h4>
                  <button onClick={handleDownloadAll} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                    <Download size={14} /> Tải tất cả
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.files?.map((file: any) => (
                    <div key={file.id} className="group p-5 bg-white border border-slate-200 rounded-3xl hover:border-blue-500 hover:shadow-xl hover:shadow-slate-100 transition-all cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-4" onClick={() => handleDownloadFile(file)}>
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                          <FileText size={24} />
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-900 mb-1">{file.name}</p>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{file.type} • {file.size} • {formatDate(file.date || '2024-03-15')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleDownloadFile(file)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="Tải về máy">
                          <Download size={18} />
                        </button>
                        <button onClick={() => handleDownloadFile(file)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="Xem tài liệu">
                          <ExternalLink size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!project.files || project.files.length === 0) && (
                    <div className="col-span-2 py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <FileText size={40} />
                      </div>
                      <p className="text-xl font-black">Chưa có hồ sơ đính kèm</p>
                      <p className="text-sm font-medium mt-2">Vui lòng cập nhật hồ sơ pháp lý của dự án</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-8"
              >
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                  <History size={24} className="text-blue-600" /> Nhật ký xử lý hồ sơ
                </h4>

                <div className="relative pl-8 space-y-10 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {[
                    { date: '15/03/2024', time: '14:30', action: 'Phê duyệt Chấp thuận chủ trương đầu tư', user: 'Nguyễn Văn A', agency: 'UBND Thành phố', status: 'completed' },
                    { date: '12/03/2024', time: '09:15', action: 'Trình hồ sơ Chấp thuận chủ trương đầu tư', user: 'Lê Thị B', agency: 'Sở Xây dựng', status: 'completed' },
                    { date: '05/03/2024', time: '16:45', action: 'Tiếp nhận hồ sơ từ Chủ đầu tư', user: 'Trần Văn C', agency: 'Sở Xây dựng', status: 'completed' },
                    { date: '01/03/2024', time: '10:00', action: 'Khởi tạo dự án trên hệ thống', user: 'Hệ thống', agency: 'Admin', status: 'completed' },
                  ].map((log, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[31px] top-1.5 w-6 h-6 rounded-full border-4 border-white shadow-sm ${
                        i === 0 ? 'bg-blue-600 scale-125' : 'bg-slate-300'
                      }`} />
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">{log.date}</span>
                            <span className="text-xs font-bold text-slate-400">{log.time}</span>
                          </div>
                          <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest border border-slate-100">
                            {getAgencyWithDepartment(log.agency, (log as any).department, log.action)}
                          </span>
                        </div>
                        <p className="text-lg font-black text-slate-900 mb-2">{log.action}</p>
                        <div className="flex items-center gap-2 text-sm text-slate-500 font-bold">
                          <User size={14} className="text-slate-400" />
                          Thực hiện bởi: {log.user}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
            <span>Cập nhật lần cuối: 2 giờ trước</span>
            <span className="hidden sm:inline">•</span>
            <span>Người cập nhật: Admin</span>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={onClose}
              className="flex-1 sm:flex-none px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
            >
              Đóng
            </button>
            <button className="flex-1 sm:flex-none px-8 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
              Xuất báo cáo
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
