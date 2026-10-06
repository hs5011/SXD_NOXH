import React, { useState } from 'react';
import { UserCheck, Building } from 'lucide-react';
import ListManagement from './ListManagement';
import AgencyManagement, { Agency } from './AgencyManagement';

interface InvestorAgencyTabsManagementProps {
  investors: string[];
  setInvestors: (investors: string[]) => void;
  onAddUser?: (investor: string) => void;
  agencies: Agency[];
  setAgencies: (agencies: Agency[]) => void;
}

export default function InvestorAgencyTabsManagement({
  investors,
  setInvestors,
  onAddUser,
  agencies,
  setAgencies
}: InvestorAgencyTabsManagementProps) {
  const [activeTab, setActiveTab] = useState<'investors' | 'agencies'>('investors');

  const tabs = [
    { id: 'investors', label: 'Danh mục Chủ đầu tư', icon: UserCheck, count: investors.length },
    { id: 'agencies', label: 'Cơ quan & Phòng ban xử lý', icon: Building, count: agencies.length }
  ] as const;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">CĐT & Cơ quan xử lý</h2>
        <p className="text-slate-500 text-sm mt-1">Quản lý danh sách các chủ đầu tư dự án và các cơ quan, phòng ban trực thuộc xử lý thủ tục hành chính.</p>
      </div>

      {/* Tabs list styled exactly like the design guidelines */}
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

      {/* Tab content rendering ListManagement or AgencyManagement as embedded components */}
      <div className="pt-2">
        {activeTab === 'investors' && (
          <ListManagement
            items={investors}
            setItems={setInvestors}
            title="Chủ đầu tư"
            onAddUser={onAddUser}
            isEmbedded
          />
        )}
        {activeTab === 'agencies' && (
          <AgencyManagement
            agencies={agencies}
            setAgencies={setAgencies}
            isEmbedded
          />
        )}
      </div>
    </div>
  );
}
