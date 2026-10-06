import React, { useState, useEffect, useRef } from 'react';
import { X, Save, FileText, Building2, Calendar } from 'lucide-react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { vi } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { Process } from './StepManagementView';
import { parseDate, syncDetailedToRoot, formatLocalDate, getAgencyWithDepartment, toDisplayDate } from '../lib/projectUtils';
import { isDateBefore, isDateAfter, laterDate } from '../lib/dateCompare';

registerLocale('vi', vi);

interface UpdatePlanModalProps {
  project: any;
  processes: Process[];
  onClose: () => void;
  onSuccess: (updatedProject: any) => void | boolean | Promise<void | boolean>;
  projectStages?: any[];
}

export default function UpdatePlanModal({ project, processes, onClose, onSuccess, projectStages = [] }: UpdatePlanModalProps) {
  const [milestones, setMilestones] = useState(project.milestones || {});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const stageObjects = (projectStages || []).map(s => {
    if (typeof s === 'string') {
      return { name: s, milestones: [] };
    }
    return {
      name: s.name || '',
      milestones: Array.isArray(s.milestones) ? s.milestones : []
    };
  });

  const stageNames = stageObjects.map(s => s.name);
  const defaultStage = stageNames[0] || 'CHUẨN BỊ ĐẦU TƯ';
  const [activeStageTab, setActiveStageTab] = useState<string>(defaultStage);

  useEffect(() => {
    if (stageNames && stageNames.length > 0) {
      if (!stageNames.includes(activeStageTab)) {
        setActiveStageTab(stageNames[0]);
      }
    }
  }, [projectStages, activeStageTab]);

  const selectedProcess = processes.find(p => p.id === project.processId);

  const formatDateStr = (ymd: string) => toDisplayDate(ymd);

  const handleMilestoneChange = (key: string, type: 'investor' | 'agency', value: string) => {
    if (value !== '') {
      if (type === 'agency') {
        const investorVal = milestones[key]?.investor;
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`
          );
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = milestones[key]?.agency;
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`
          );
          return;
        }
      }
    }

    setMilestones({
      ...milestones,
      [key]: {
        ...milestones[key],
        [type]: value
      }
    });
  };

  // Same rule as the server (src/lib/stepProgress): CĐT plan of a milestone = HXL CĐT of its first step,
  // CQNN plan = the latest HXL CQNN of its steps
  const getAutoParentDate = (parent: any, type: 'investor' | 'agency') => {
    if (type === 'investor') {
      const first = (parent.childSteps || [])[0];
      const firstVal = first ? milestones[first.id]?.investor : '';
      if (firstVal) return firstVal;
    }
    let maxDateStr = '';
    if (parent.childSteps && parent.childSteps.length > 0) {
      parent.childSteps.forEach((child: any) => {
        const dStr = milestones[child.id]?.[type];
        if (dStr) {
          if (!maxDateStr || isDateAfter(dStr, maxDateStr)) {
            maxDateStr = dStr;
          }
        }
      });
    }
    return maxDateStr;
  };

  const getParentDisplayDate = (parent: any, type: 'investor' | 'agency') => {
    const customVal = milestones[parent.id]?.[type];
    const autoVal = getAutoParentDate(parent, type);
    if (customVal && autoVal) {
      return laterDate(customVal, autoVal);
    }
    return customVal || autoVal;
  };

  const handleParentMilestoneChange = (parent: any, type: 'investor' | 'agency', value: string) => {
    const autoVal = getAutoParentDate(parent, type);
    if (value && autoVal && isDateBefore(value, autoVal)) {
      alert(
        `Cảnh báo: Ngày được chọn cho mốc quy trình "${parent.name}" (${formatDateStr(value)}) không được nhỏ hơn ngày lớn nhất của các bước con (${formatDateStr(autoVal)}).`
      );
      return;
    }

    if (value !== '') {
      if (type === 'agency') {
        const investorVal = getParentDisplayDate(parent, 'investor');
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`
          );
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = getParentDisplayDate(parent, 'agency');
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(
            `Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`
          );
          return;
        }
      }
    }

    const updatedParentMilestone = { ...(milestones[parent.id] || {}) };
    if (value === '') {
      delete updatedParentMilestone[type];
    } else {
      updatedParentMilestone[type] = value;
    }

    setMilestones({
      ...milestones,
      [parent.id]: updatedParentMilestone
    });
  };

  const getMilestoneDisplayDate = (milestoneName: string, linkedParent: any, type: 'investor' | 'agency') => {
    if (linkedParent) {
      return getParentDisplayDate(linkedParent, type);
    }
    return milestones[milestoneName]?.[type] || '';
  };

  const handleMilestoneDateChange = (milestoneName: string, linkedParent: any, type: 'investor' | 'agency', value: string) => {
    if (linkedParent) {
      handleParentMilestoneChange(linkedParent, type, value);
      return;
    }

    if (value !== '') {
      if (type === 'agency') {
        const investorVal = milestones[milestoneName]?.investor;
        if (investorVal && isDateBefore(value, investorVal)) {
          alert(`Cảnh báo: Ngày Hạn của Cơ quan Nhà nước (${formatDateStr(value)}) không được nhỏ hơn ngày Hạn của Chủ đầu tư (${formatDateStr(investorVal)}).`);
          return;
        }
      } else if (type === 'investor') {
        const agencyVal = milestones[milestoneName]?.agency;
        if (agencyVal && isDateAfter(value, agencyVal)) {
          alert(`Cảnh báo: Ngày Hạn của Chủ đầu tư (${formatDateStr(value)}) không được lớn hơn ngày Hạn của Cơ quan Nhà nước (${formatDateStr(agencyVal)}).`);
          return;
        }
      }
    }

    setMilestones({
      ...milestones,
      [milestoneName]: {
        ...(milestones[milestoneName] || {}),
        [type]: value
      }
    });
  };

  const handleSave = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Materialize all parent milestones (either override or auto-calculated)
    const finalMilestones = { ...milestones };
    if (selectedProcess) {
      selectedProcess.parentSteps.forEach((parent) => {
        const invDate = getParentDisplayDate(parent, 'investor');
        const agDate = getParentDisplayDate(parent, 'agency');
        
        if (invDate || agDate) {
          finalMilestones[parent.id] = {
            ...(finalMilestones[parent.id] || {}),
            ...(invDate ? { investor: invDate } : {}),
            ...(agDate ? { agency: agDate } : {})
          };
        }
      });
    }

    const updatedProject = {
      ...project,
      milestones: finalMilestones
    };

    const synchronizedProject = syncDetailedToRoot(updatedProject, processes);

    try {
      await onSuccess(synchronizedProject);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 my-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-orange-100">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Cập nhật kế hoạch thực hiện</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          {!selectedProcess ? (
            <div className="p-12 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-bold italic">Dự án này chưa được gán quy trình thực hiện.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stage Sub-tabs */}
              <div className="flex p-1 bg-slate-100 rounded-2xl flex-wrap gap-1">
                {(stageNames.length > 0 ? stageNames : ['CHUẨN BỊ ĐẦU TƯ', 'THỰC HIỆN ĐẦU TƯ', 'KẾT THÚC ĐẦU TƯ']).map((stage) => {
                  const isActive = activeStageTab === stage;
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setActiveStageTab(stage)}
                      className={`flex-1 min-w-[120px] py-2 px-3 text-xs font-black rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-white text-blue-700 shadow-md shadow-slate-200/50'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      }`}
                    >
                      {stage}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-12 gap-4 px-4 pt-2">
                <div className="col-span-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bước quy trình / Cơ quan xử lý</div>
                <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">HXL CĐT</div>
                <div className="col-span-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">HXL Cơ quan NN</div>
              </div>

              {(() => {
                const activeStageObj = stageObjects.find(s => s.name === activeStageTab);
                const stageMilestones = activeStageObj ? activeStageObj.milestones : [];

                const parentStepsInStage = selectedProcess.parentSteps.filter(step => {
                  const stage = step.stage || (stageNames[0] || 'CHUẨN BỊ ĐẦU TƯ');
                  return stage === activeStageTab;
                });

                const renderedMilestones = stageMilestones.map(milestone => {
                  const linkedParent = selectedProcess.parentSteps.find(p => p.milestoneName === milestone);
                  return {
                    milestone,
                    linkedParent,
                  };
                });

                const standardProcedures = parentStepsInStage.filter(p => !p.milestoneName || !stageMilestones.includes(p.milestoneName));

                const getStageHeaderStyles = (stage: string) => {
                  switch (stage.toUpperCase()) {
                    case 'CHUẨN BỊ ĐẦU TƯ':
                      return {
                        bg: 'bg-blue-50/70 text-blue-800 border-blue-100',
                        dot: 'bg-blue-500'
                      };
                    case 'THỰC HIỆN ĐẦU TƯ':
                      return {
                        bg: 'bg-emerald-50/70 text-emerald-800 border-emerald-100',
                        dot: 'bg-emerald-500'
                      };
                    case 'KẾT THÚC ĐẦU TƯ':
                      return {
                        bg: 'bg-purple-50/70 text-purple-800 border-purple-100',
                        dot: 'bg-purple-500'
                      };
                    default:
                      return {
                        bg: 'bg-slate-50 text-slate-800 border-slate-200',
                        dot: 'bg-slate-500'
                      };
                  }
                };

                if (renderedMilestones.length === 0 && standardProcedures.length === 0) {
                  return (
                    <div className="p-8 text-center bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-slate-400 text-xs font-bold italic">Không có mốc milestone hoặc thủ tục nào thuộc giai đoạn này.</p>
                    </div>
                  );
                }

                const styles = getStageHeaderStyles(activeStageTab);

                return (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Stage Header Banner */}
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border ${styles.bg} font-black text-xs uppercase tracking-wider`}>
                      <span className={`w-2 h-2 rounded-full ${styles.dot} animate-pulse`} />
                      Giai đoạn: {activeStageTab}
                    </div>

                    <div className="space-y-6 pl-4 border-l border-slate-100">
                      {/* Render Configured Milestones First */}
                      {renderedMilestones.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest pl-2">Mốc Tiến độ (Milestones)</h4>
                          {renderedMilestones.map(({ milestone, linkedParent }) => (
                            <React.Fragment key={milestone}>
                              {/* Milestone Row */}
                              <div className="grid grid-cols-12 gap-4 items-center p-4 bg-orange-50/50 rounded-2xl border border-orange-100/70">
                                <div className="col-span-6">
                                  {linkedParent ? (
                                    <>
                                      <p className="text-sm font-black text-slate-900 leading-snug">
                                        {linkedParent.name}
                                      </p>
                                      <div className="mt-1.5 flex">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          MỐC: {milestone.toUpperCase()}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-sm font-black text-slate-900 leading-snug">
                                        {milestone}
                                      </p>
                                      <span className="text-[10px] block text-slate-400 italic font-medium mt-1">
                                        Chưa liên kết bước thủ tục trong quy trình
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div className="col-span-3">
                                  <DatePicker 
                                    selected={parseDate(getMilestoneDisplayDate(milestone, linkedParent, 'investor'))}
                                    onChange={(date) => handleMilestoneDateChange(milestone, linkedParent, 'investor', date ? formatLocalDate(date) : '')}
                                    dateFormat="dd/MM/yyyy"
                                    placeholderText={linkedParent ? "Tự động tính" : "Chọn ngày"}
                                    locale="vi"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800"
                                  />
                                </div>
                                <div className="col-span-3">
                                  <DatePicker 
                                    selected={parseDate(getMilestoneDisplayDate(milestone, linkedParent, 'agency'))}
                                    onChange={(date) => handleMilestoneDateChange(milestone, linkedParent, 'agency', date ? formatLocalDate(date) : '')}
                                    dateFormat="dd/MM/yyyy"
                                    placeholderText={linkedParent ? "Tự động tính" : "Chọn ngày"}
                                    locale="vi"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800"
                                  />
                                </div>
                              </div>

                              {/* Child Steps of Linked Procedure */}
                              {linkedParent && linkedParent.childSteps.map((child: any) => (
                                <div key={child.id} className="grid grid-cols-12 gap-4 items-center p-4 bg-white rounded-2xl border border-slate-100 ml-8 hover:border-blue-200 transition-all group">
                                  <div className="col-span-6">
                                    <p className="text-xs font-bold text-slate-700">{child.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                      <Building2 size={10} /> {getAgencyWithDepartment(child.agency, child.department, child.name)}
                                    </p>
                                  </div>
                                  <div className="col-span-3">
                                    <DatePicker 
                                      selected={parseDate(milestones[child.id]?.investor)}
                                      onChange={(date) => handleMilestoneChange(child.id, 'investor', date ? formatLocalDate(date) : '')}
                                      dateFormat="dd/MM/yyyy"
                                      placeholderText="Chọn ngày"
                                      locale="vi"
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <DatePicker 
                                      selected={parseDate(milestones[child.id]?.agency)}
                                      onChange={(date) => handleMilestoneChange(child.id, 'agency', date ? formatLocalDate(date) : '')}
                                      dateFormat="dd/MM/yyyy"
                                      placeholderText="Chọn ngày"
                                      locale="vi"
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                  </div>
                                </div>
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {/* Render Non-milestone Procedures Below */}
                      {standardProcedures.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Thủ tục khác trong giai đoạn</h4>
                          {standardProcedures.map((parent) => (
                            <React.Fragment key={parent.id}>
                              <div className="grid grid-cols-12 gap-4 items-center p-4 bg-slate-50/70 rounded-2xl border border-slate-150">
                                <div className="col-span-12">
                                  <span className="text-sm font-bold text-slate-700">{parent.name}</span>
                                </div>
                              </div>
                              {parent.childSteps.map((child: any) => (
                                <div key={child.id} className="grid grid-cols-12 gap-4 items-center p-4 bg-white rounded-2xl border border-slate-100 ml-8 hover:border-blue-200 transition-all group">
                                  <div className="col-span-6">
                                    <p className="text-xs font-bold text-slate-700">{child.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                      <Building2 size={10} /> {getAgencyWithDepartment(child.agency, child.department, child.name)}
                                    </p>
                                  </div>
                                  <div className="col-span-3">
                                    <DatePicker 
                                      selected={parseDate(milestones[child.id]?.investor)}
                                      onChange={(date) => handleMilestoneChange(child.id, 'investor', date ? formatLocalDate(date) : '')}
                                      dateFormat="dd/MM/yyyy"
                                      placeholderText="Chọn ngày"
                                      locale="vi"
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <DatePicker 
                                      selected={parseDate(milestones[child.id]?.agency)}
                                      onChange={(date) => handleMilestoneChange(child.id, 'agency', date ? formatLocalDate(date) : '')}
                                      dateFormat="dd/MM/yyyy"
                                      placeholderText="Chọn ngày"
                                      locale="vi"
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                                    />
                                  </div>
                                </div>
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 flex justify-end gap-4 bg-white shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-10 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleSave}
            disabled={submitting}
            className="px-14 py-4 bg-blue-600 text-white rounded-2xl text-sm font-bold shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            <Save size={20} />
            {submitting ? 'Đang xử lý...' : 'Lưu kế hoạch'}
          </button>
        </div>
      </div>
    </div>
  );
}
