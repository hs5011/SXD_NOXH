import React, { useState } from 'react';
import { X, CheckCircle2, Clock, AlertCircle, Save, Building2 } from 'lucide-react';

interface UpdateProgressProps {
  project: any;
  onClose: () => void;
  onSuccess: (updatedProject: any) => void;
}

export default function UpdateProgress({ project, onClose, onSuccess }: UpdateProgressProps) {
  const [steps, setSteps] = useState(project.processSteps || []);
  const [saving, setSaving] = useState(false);

  const handleStatusChange = (stepId: string, newStatus: string) => {
    setSteps(steps.map((s: any) => s.id === stepId ? { ...s, status: newStatus } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const updatedProject = {
      ...project,
      processSteps: steps
    };

    setSaving(false);
    onSuccess(updatedProject);
  };


  const statusOptions = [
    { value: 'pending', label: 'Chưa bắt đầu', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-50' },
    { value: 'in_progress', label: 'Đang xử lý', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
    { value: 'completed', label: 'Hoàn tất', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { value: 'delayed', label: 'Quá hạn', icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50' },
  ];

  const groupedSteps = steps.reduce((acc: any, step: any) => {
    const stage = step.stage || 'Chưa phân loại';
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(step);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest">Cập nhật tiến độ</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
            {Object.entries(groupedSteps).length > 0 ? Object.entries(groupedSteps).map(([stage, stageSteps]: any) => (
              <div key={stage} className="space-y-3">
                <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg">
                  {stage} ({stageSteps.length} thủ tục)
                </h4>
                {stageSteps.map((step: any) => (
                  <div key={step.id} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-100 transition-all">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm mb-1">
                            <span className="font-black text-slate-900">{step.name}</span>
                            <span className="text-blue-600 font-semibold ml-2">({step.agency || 'N/A'}{step.department ? ` - ${step.department}` : ''})</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {statusOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => handleStatusChange(step.id, opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border ${
                                step.status === opt.value 
                                  ? `${opt.bg} ${opt.color} border-current shadow-sm` 
                                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <opt.icon size={12} />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Display child steps if they exist */}
                      {step.childSteps && step.childSteps.length > 0 && (
                        <div className="pl-6 border-l-2 border-slate-100 space-y-2 mt-2">
                          {step.childSteps.map((child: any) => (
                            <div key={child.id} className="text-xs text-slate-600">
                              <span className="font-semibold">• {child.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )) : (
              <div className="py-12 text-center text-slate-400 italic text-sm">
                Dự án này chưa có các bước quy trình chi tiết...
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 text-sm font-black uppercase tracking-widest hover:bg-slate-200 rounded-xl transition-all"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : <><Save size={16} /> Lưu thay đổi</>}
          </button>
        </div>
      </div>
    </div>
  );
}
