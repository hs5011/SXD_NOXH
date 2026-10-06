import React, { useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import ListManagement from './ListManagement';

interface StatusTabsManagementProps {
  projectStatuses: string[];
  setProjectStatuses: (statuses: string[]) => void;
  stepStatuses: string[];
  setStepStatuses: (statuses: string[]) => void;
}

export default function StatusTabsManagement({
  projectStatuses,
  setProjectStatuses,
  stepStatuses,
  setStepStatuses
}: StatusTabsManagementProps) {
  const [activeTab, setActiveTab] = useState<'project' | 'step'>('project');

  const tabs = [
    { id: 'project', label: 'Trạng thái dự án', icon: ToggleLeft, count: projectStatuses.length },
    { id: 'step', label: 'Trạng thái bước', icon: ToggleRight, count: stepStatuses.length }
  ] as const;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Trạng thái hệ thống</h2>
        <p className="text-slate-500 text-sm mt-1">Định nghĩa danh mục trạng thái cho vòng đời dự án và các thủ tục thực hiện.</p>
      </div>

      {/* Tabs list styled exactly like the provided screenshot */}
      <div className="flex border-b border-slate-200 w-full gap-8 overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3.5 text-sm font-bold transition-all cursor-pointer border-b-2 relative -mb-[1.5px] whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <TabIcon size={18} />
              <span>{tab.label}</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ml-1 ${isActive ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === 'project' && (
          <ListManagement
            items={projectStatuses}
            setItems={setProjectStatuses}
            title="Trạng thái dự án"
            isEmbedded
          />
        )}
        {activeTab === 'step' && (
          <ListManagement
            items={stepStatuses}
            setItems={setStepStatuses}
            title="Trạng thái bước"
            isEmbedded
          />
        )}
      </div>
    </div>
  );
}
