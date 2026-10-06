import React, { useState } from 'react';
import { Trash2, Plus, Edit2, Save, X, Building2, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface Agency {
  id: string;
  name: string;
  departments: string[];
  displayOrder: number;
}

interface AgencyManagementProps {
  agencies: Agency[];
  setAgencies: (agencies: Agency[]) => void;
  isEmbedded?: boolean;
}

export default function AgencyManagement({ agencies, setAgencies, isEmbedded }: AgencyManagementProps) {
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyDisplayOrder, setNewAgencyDisplayOrder] = useState('');
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [editAgencyValue, setEditAgencyValue] = useState('');
  const [editAgencyDisplayOrder, setEditAgencyDisplayOrder] = useState('');
  const [expandedAgencyId, setExpandedAgencyId] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDept, setEditingDept] = useState<{ agencyId: string, index: number, value: string } | null>(null);

  const handleAddAgency = () => {
    if (newAgencyName.trim()) {
      const newAgency: Agency = {
        id: Date.now().toString(),
        name: newAgencyName.trim(),
        departments: [],
        displayOrder: parseInt(newAgencyDisplayOrder) || 0
      };
      setAgencies([...agencies, newAgency]);
      setNewAgencyName('');
      setNewAgencyDisplayOrder('');
    }
  };

  const handleDeleteAgency = (id: string) => {
    setAgencies(agencies.filter(a => a.id !== id));
  };

  const startEditAgency = (agency: Agency) => {
    setEditingAgencyId(agency.id);
    setEditAgencyValue(agency.name);
    setEditAgencyDisplayOrder(agency.displayOrder.toString());
  };

  const saveEditAgency = (id: string) => {
    setAgencies(agencies.map(a => a.id === id ? { ...a, name: editAgencyValue, displayOrder: parseInt(editAgencyDisplayOrder) || 0 } : a));
    setEditingAgencyId(null);
  };

  const handleAddDept = (agencyId: string) => {
    if (newDeptName.trim()) {
      setAgencies(agencies.map(a => 
        a.id === agencyId 
          ? { ...a, departments: [...a.departments, newDeptName.trim()] } 
          : a
      ));
      setNewDeptName('');
    }
  };

  const handleDeleteDept = (agencyId: string, deptIndex: number) => {
    setAgencies(agencies.map(a => 
      a.id === agencyId 
        ? { ...a, departments: a.departments.filter((_, i) => i !== deptIndex) } 
        : a
    ));
  };

  const startEditDept = (agencyId: string, index: number, value: string) => {
    setEditingDept({ agencyId, index, value });
  };

  const saveEditDept = () => {
    if (editingDept && editingDept.value.trim()) {
      setAgencies(agencies.map(a => 
        a.id === editingDept.agencyId 
          ? { 
              ...a, 
              departments: a.departments.map((d, i) => i === editingDept.index ? editingDept.value.trim() : d) 
            } 
          : a
      ));
      setEditingDept(null);
    }
  };

  const innerContent = (
    <>
      {!isEmbedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Quản lý Cơ quan & Phòng ban</h2>
            <p className="text-slate-500 text-sm mt-1">Định nghĩa danh mục các cơ quan ban ngành và các phòng ban trực thuộc xử lý thủ tục.</p>
          </div>
          <div className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-sm font-bold shrink-0 self-start sm:self-center">
            {agencies.length} Cơ quan
          </div>
        </div>
      )}
      
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            value={newAgencyName}
            onChange={(e) => setNewAgencyName(e.target.value)}
            placeholder="Thêm cơ quan mới..." 
            className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" 
          />
        </div>
        <div className="relative w-full sm:w-32">
          <input 
            type="number" 
            value={newAgencyDisplayOrder}
            onChange={(e) => setNewAgencyDisplayOrder(e.target.value)}
            placeholder="Thứ tự..." 
            className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" 
          />
        </div>
        <button 
          onClick={handleAddAgency}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0 text-sm cursor-pointer shadow-md"
        >
          <Plus size={18} /> Thêm Cơ quan
        </button>
      </div>

      <div className="space-y-3">
        {agencies.map((agency) => (
          <div key={agency.id} className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
            <div className="flex items-center justify-between p-4 bg-white border-b border-slate-100">
              <div className="flex items-center gap-3 flex-1">
                <button 
                  onClick={() => setExpandedAgencyId(expandedAgencyId === agency.id ? null : agency.id)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {expandedAgencyId === agency.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                
                {editingAgencyId === agency.id ? (
                  <div className="flex gap-2 flex-1">
                    <input 
                      type="text" 
                      value={editAgencyValue}
                      onChange={(e) => setEditAgencyValue(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg outline-none text-lg"
                      autoFocus
                    />
                    <input 
                      type="number" 
                      value={editAgencyDisplayOrder}
                      onChange={(e) => setEditAgencyDisplayOrder(e.target.value)}
                      className="w-20 px-3 py-1.5 border border-blue-300 rounded-lg outline-none text-lg"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-lg">{agency.name}</span>
                    <span className="text-sm text-slate-400 uppercase tracking-wider font-bold">
                      {agency.departments.length} phòng ban
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                {editingAgencyId === agency.id ? (
                  <>
                    <button onClick={() => saveEditAgency(agency.id)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors">
                      <Save size={18} />
                    </button>
                    <button onClick={() => setEditingAgencyId(null)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-lg transition-colors">
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEditAgency(agency)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDeleteAgency(agency.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <AnimatePresence>
              {expandedAgencyId === agency.id && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 space-y-3 bg-slate-50/50">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        placeholder="Thêm phòng ban mới..." 
                        className="flex-1 px-4 py-2 text-base border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 bg-white" 
                      />
                      <button 
                        onClick={() => handleAddDept(agency.id)}
                        className="px-4 py-2 bg-slate-800 text-white rounded-xl text-base font-bold flex items-center gap-2 hover:bg-slate-900 transition-colors"
                      >
                        <Plus size={18} /> Thêm
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {agency.departments.map((dept, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 group">
                          {editingDept?.agencyId === agency.id && editingDept?.index === idx ? (
                            <div className="flex items-center gap-2 w-full">
                              <input 
                                type="text" 
                                value={editingDept.value}
                                onChange={(e) => setEditingDept({ ...editingDept, value: e.target.value })}
                                className="flex-1 px-2 py-1 text-base border border-blue-300 rounded-lg outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEditDept();
                                  if (e.key === 'Escape') setEditingDept(null);
                                }}
                              />
                              <button onClick={saveEditDept} className="text-emerald-600 p-1 hover:bg-emerald-50 rounded-lg">
                                <Save size={18} />
                              </button>
                              <button onClick={() => setEditingDept(null)} className="text-slate-400 p-1 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-base text-slate-600 font-medium">{dept}</span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={() => startEditDept(agency.id, idx, dept)}
                                  className="text-slate-400 hover:text-blue-600 p-1 rounded-lg transition-colors"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteDept(agency.id, idx)}
                                  className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                      {agency.departments.length === 0 && (
                        <div className="col-span-full py-4 text-center text-slate-400 text-sm italic">
                          Chưa có phòng ban nào được thêm
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {agencies.length === 0 && (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <Building2 size={48} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-400 font-medium">Chưa có cơ quan nào trong danh sách</p>
          </div>
        )}
      </div>
    </>
  );

  if (isEmbedded) {
    return <div className="space-y-6">{innerContent}</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
      {innerContent}
    </div>
  );
}
