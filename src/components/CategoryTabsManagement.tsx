import React, { useState } from 'react';
import { Layers, Tags, Award, Coins } from 'lucide-react';
import ListManagement from './ListManagement';

interface CategoryTabsManagementProps {
  projectGroups: string[];
  setProjectGroups: (groups: string[]) => void;
  projectCategories: string[];
  setProjectCategories: (categories: string[]) => void;
  buildingGrades: string[];
  setBuildingGrades: (grades: string[]) => void;
  fundingSources: string[];
  setFundingSources: (sources: string[]) => void;
}

export default function CategoryTabsManagement({
  projectGroups,
  setProjectGroups,
  projectCategories,
  setProjectCategories,
  buildingGrades,
  setBuildingGrades,
  fundingSources,
  setFundingSources
}: CategoryTabsManagementProps) {
  const [activeTab, setActiveTab] = useState<'groups' | 'categories' | 'grades' | 'funding'>('groups');

  const tabs = [
    { id: 'groups', label: 'Nhóm dự án', icon: Layers, count: projectGroups.length },
    { id: 'categories', label: 'Phân loại dự án', icon: Tags, count: projectCategories.length },
    { id: 'grades', label: 'Cấp công trình', icon: Award, count: buildingGrades.length },
    { id: 'funding', label: 'Nguồn vốn', icon: Coins, count: fundingSources.length }
  ] as const;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Danh mục dự án</h2>
        <p className="text-slate-500 text-sm mt-1">Quản lý các thông số cấu hình và phân loại hệ thống của dự án nhà ở xã hội.</p>
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

      {/* Tab content rendering ListManagement as embedded component */}
      <div className="pt-2">
        {activeTab === 'groups' && (
          <ListManagement
            items={projectGroups}
            setItems={setProjectGroups}
            title="Nhóm dự án"
            isEmbedded
          />
        )}
        {activeTab === 'categories' && (
          <ListManagement
            items={projectCategories}
            setItems={setProjectCategories}
            title="Phân loại dự án"
            isEmbedded
          />
        )}
        {activeTab === 'grades' && (
          <ListManagement
            items={buildingGrades}
            setItems={setBuildingGrades}
            title="Cấp công trình"
            isEmbedded
          />
        )}
        {activeTab === 'funding' && (
          <ListManagement
            items={fundingSources}
            setItems={setFundingSources}
            title="Nguồn vốn"
            isEmbedded
          />
        )}
      </div>
    </div>
  );
}
