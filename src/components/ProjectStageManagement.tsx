import React, { useState } from 'react';
import { Trash2, Plus, Edit2, Save, X, ChevronRight, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

interface ProjectStage {
  name: string;
  milestones: string[];
  sortOrder?: number;
}

interface ProjectStageManagementProps {
  projectStages: any[];
  setProjectStages: (stages: any[]) => void;
}

export default function ProjectStageManagement({ projectStages, setProjectStages }: ProjectStageManagementProps) {
  // Normalize and sort incoming list by sortOrder
  const normalizedStages: ProjectStage[] = projectStages.map((stage, idx) => {
    if (typeof stage === 'string') {
      return { name: stage, milestones: [], sortOrder: idx + 1 };
    }
    return {
      name: stage.name || '',
      milestones: Array.isArray(stage.milestones) ? stage.milestones : [],
      sortOrder: stage.sortOrder !== undefined ? Number(stage.sortOrder) : idx + 1
    };
  }).sort((a, b) => {
    const orderA = a.sortOrder !== undefined ? a.sortOrder : 999;
    const orderB = b.sortOrder !== undefined ? b.sortOrder : 999;
    return orderA - orderB;
  });

  const [expandedStage, setExpandedStage] = useState<string | null>(normalizedStages[0]?.name || null);
  const [newStageName, setNewStageName] = useState('');
  const [editingStageIndex, setEditingStageIndex] = useState<number | null>(null);
  const [editingStageValue, setEditingStageValue] = useState('');
  const [newMilestoneTexts, setNewMilestoneTexts] = useState<Record<string, string>>({});

  const handleAddStage = () => {
    if (!newStageName.trim()) return;
    const trimmed = newStageName.trim();
    if (normalizedStages.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Tên giai đoạn này đã tồn tại!');
      return;
    }
    const updated = [...normalizedStages, { name: trimmed, milestones: [] }];
    setProjectStages(updated);
    setNewStageName('');
    setExpandedStage(trimmed);
  };

  const handleDeleteStage = (index: number) => {
    const stageToDelete = normalizedStages[index];
    if (confirm(`Bạn có chắc chắn muốn xóa giai đoạn "${stageToDelete.name}" không?`)) {
      const updated = normalizedStages.filter((_, i) => i !== index);
      setProjectStages(updated);
      if (expandedStage === stageToDelete.name) {
        setExpandedStage(updated[0]?.name || null);
      }
    }
  };

  const startEditStage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStageIndex(index);
    setEditingStageValue(normalizedStages[index].name);
  };

  const saveEditStage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = editingStageValue.trim();
    if (!trimmed) return;
    
    // Check duplication
    const otherStages = normalizedStages.filter((_, i) => i !== index);
    if (otherStages.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Tên giai đoạn này đã tồn tại!');
      return;
    }

    const oldName = normalizedStages[index].name;
    const updated = [...normalizedStages];
    updated[index] = { ...updated[index], name: trimmed };
    setProjectStages(updated);
    setEditingStageIndex(null);
    if (expandedStage === oldName) {
      setExpandedStage(trimmed);
    }
  };

  const handleAddMilestone = (stageName: string) => {
    const text = newMilestoneTexts[stageName]?.trim();
    if (!text) return;

    const updated = normalizedStages.map(stage => {
      if (stage.name === stageName) {
        const currentMilestones = stage.milestones || [];
        if (currentMilestones.includes(text)) {
          alert('Mốc này đã tồn tại trong giai đoạn này!');
          return stage;
        }
        return {
          ...stage,
          milestones: [...currentMilestones, text]
        };
      }
      return stage;
    });

    setProjectStages(updated);
    setNewMilestoneTexts({
      ...newMilestoneTexts,
      [stageName]: ''
    });
  };

  // The server refuses the removal while a procedure links to the milestone or progress was entered on it
  const handleDeleteMilestone = (stageName: string, milestoneIndex: number) => {
    const name = normalizedStages.find(s => s.name === stageName)?.milestones?.[milestoneIndex];
    if (!confirm(`Bạn có chắc chắn muốn xóa mốc "${name}" không?`)) return;
    const updated = normalizedStages.map(stage => {
      if (stage.name === stageName) {
        return {
          ...stage,
          milestones: (stage.milestones || []).filter((_, i) => i !== milestoneIndex)
        };
      }
      return stage;
    });
    setProjectStages(updated);
  };

  const moveMilestone = (stageName: string, milestoneIndex: number, direction: 'up' | 'down') => {
    const updated = normalizedStages.map(stage => {
      if (stage.name === stageName) {
        const milestones = [...(stage.milestones || [])];
        const targetIndex = direction === 'up' ? milestoneIndex - 1 : milestoneIndex + 1;
        
        // Bounds check
        if (targetIndex < 0 || targetIndex >= milestones.length) {
          return stage;
        }
        
        // Swap elements
        const temp = milestones[milestoneIndex];
        milestones[milestoneIndex] = milestones[targetIndex];
        milestones[targetIndex] = temp;
        
        return {
          ...stage,
          milestones
        };
      }
      return stage;
    });
    setProjectStages(updated);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Cấu hình Giai đoạn & Mốc Milestone</h2>
          <p className="text-slate-500 text-sm mt-1">Định nghĩa danh mục các giai đoạn dự án và các mốc milestone chung tương ứng cho từng giai đoạn.</p>
        </div>
      </div>

      {/* Add Stage Form */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          placeholder="Nhập tên giai đoạn dự án mới (ví dụ: GIAI ĐOẠN KHỞI ĐỘNG)..." 
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium" 
        />
        <button 
          onClick={handleAddStage}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0 text-sm"
        >
          <Plus size={18} /> Thêm giai đoạn
        </button>
      </div>

      {/* Stages List */}
      <div className="space-y-4">
        {normalizedStages.map((stage, i) => {
          const isExpanded = expandedStage === stage.name;
          const isEditing = editingStageIndex === i;
          const stageMilestones = stage.milestones || [];

          return (
            <div 
              key={stage.name} 
              className={`border rounded-2xl transition-all duration-200 overflow-hidden ${
                isExpanded 
                  ? 'border-blue-200 shadow-md shadow-blue-50/50 bg-white' 
                  : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              {/* Header */}
              <div 
                onClick={() => !isEditing && setExpandedStage(isExpanded ? null : stage.name)}
                className="flex items-center justify-between p-5 cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <div className={`p-1 rounded-lg ${isExpanded ? 'text-blue-600' : 'text-slate-400'}`}>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                  
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editingStageValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingStageValue(e.target.value)}
                      className="flex-1 max-w-md px-3 py-1.5 border border-blue-400 rounded-lg outline-none text-sm font-bold text-slate-800"
                    />
                  ) : (
                    <div className="flex items-center gap-3 min-w-0 flex-1 justify-between pr-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-bold text-slate-800 text-base truncate">{stage.name}</span>
                        <span className="px-2.5 py-0.5 bg-slate-200/60 text-slate-600 text-xs font-black rounded-full shrink-0">
                          {stageMilestones.length} mốc
                        </span>
                      </div>
                      
                      {/* Sort Order Input */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">STT hiển thị:</span>
                        <input
                          type="number"
                          // Uncontrolled + commit on blur/Enter: one save per edit instead of one request per keystroke
                          key={`order-${stage.name}-${stage.sortOrder}`}
                          defaultValue={stage.sortOrder || 0}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val === (stage.sortOrder || 0)) return;
                            const updated = normalizedStages.map((s, idx) => {
                              if (idx === i) {
                                return { ...s, sortOrder: val };
                              }
                              return s;
                            });
                            setProjectStages(updated);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-14 px-2 py-1 text-center border border-slate-200 rounded-lg outline-none text-xs font-black text-slate-700 bg-white hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                          title="Thay đổi thứ tự hiển thị của giai đoạn này"
                          min="1"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditing ? (
                    <>
                      <button 
                        onClick={(e) => saveEditStage(i, e)} 
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-2 rounded-xl transition-colors"
                        title="Lưu"
                      >
                        <Save size={18} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingStageIndex(null);
                        }} 
                        className="text-slate-500 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors"
                        title="Hủy"
                      >
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={(e) => startEditStage(i, e)} 
                        className="text-slate-500 hover:text-blue-600 hover:bg-white p-2 rounded-xl transition-colors"
                        title="Sửa tên giai đoạn"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStage(i);
                        }} 
                        className="text-slate-500 hover:text-rose-600 hover:bg-white p-2 rounded-xl transition-colors"
                        title="Xóa giai đoạn"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expansion Content (Milestones configuration) */}
              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-white space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Danh sách các mốc Milestone tương ứng
                    </label>
                    
                    {stageMilestones.length === 0 ? (
                      <div className="p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm italic">
                        Chưa có mốc milestone nào được gán cho giai đoạn này. Vui lòng thêm mốc mới ở bên dưới.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {stageMilestones.map((milestone, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100/80 hover:border-slate-200 group transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <CheckCircle size={16} className="text-blue-500 shrink-0" />
                              <span className="text-sm font-semibold text-slate-700 truncate">{milestone}</span>
                            </div>
                            
                            {/* Milestone Controls */}
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button
                                onClick={() => moveMilestone(stage.name, idx, 'up')}
                                disabled={idx === 0}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  idx === 0 
                                    ? 'text-slate-200 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                                title="Di chuyển lên"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                onClick={() => moveMilestone(stage.name, idx, 'down')}
                                disabled={idx === stageMilestones.length - 1}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  idx === stageMilestones.length - 1 
                                    ? 'text-slate-200 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                                title="Di chuyển xuống"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteMilestone(stage.name, idx)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors md:opacity-0 group-hover:opacity-100"
                                title="Xóa mốc"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add Milestone Inline Form */}
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <input 
                      type="text" 
                      value={newMilestoneTexts[stage.name] || ''}
                      onChange={(e) => setNewMilestoneTexts({
                        ...newMilestoneTexts,
                        [stage.name]: e.target.value
                      })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddMilestone(stage.name);
                        }
                      }}
                      placeholder={`Thêm mốc milestone cho ${stage.name}...`} 
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium" 
                    />
                    <button 
                      onClick={() => handleAddMilestone(stage.name)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <Plus size={16} /> Thêm mốc
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
