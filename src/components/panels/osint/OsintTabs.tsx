'use client';

import { memo } from 'react';

interface TabDef {
  id: string;
  label: string;
  icon: any;
  placeholder: string;
  color: string;
  mode: 'active' | 'passive';
}

interface OsintTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: TabDef[];
}

function OsintTabsInner({ activeTab, onTabChange, tabs }: OsintTabsProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Sweep - Main Action */}
      {tabs.filter(t => t.id === 'sweep').map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)}
          className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[12px] font-mono tracking-widest font-bold transition-all border ${activeTab === tab.id ? 'border-opacity-60 bg-opacity-20' : 'border-[var(--border-secondary)] hover:bg-[var(--hover-accent)]'}`}
          style={{
            borderColor: activeTab === tab.id ? tab.color : 'rgba(255,61,61,0.3)',
            backgroundColor: activeTab === tab.id ? `${tab.color}20` : 'rgba(255,61,61,0.05)',
            color: tab.color,
            boxShadow: activeTab === tab.id ? `0 0 15px ${tab.color}30` : 'none'
          }}>
          <tab.icon className="w-5 h-5" />
          <span>GLOBAL {tab.label}</span>
        </button>
      ))}
      {/* Other Tools */}
      <div className="grid grid-cols-5 gap-1 mt-1">
        {tabs.filter(t => t.id !== 'sweep').map(tab => (
          <button key={tab.id} onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[8px] font-mono tracking-wider transition-all border ${activeTab === tab.id ? 'border-opacity-40 bg-opacity-15' : 'border-transparent hover:bg-[var(--hover-accent)]'}`}
            style={{ borderColor: activeTab === tab.id ? tab.color : 'transparent', backgroundColor: activeTab === tab.id ? `${tab.color}15` : undefined, color: activeTab === tab.id ? tab.color : 'var(--text-muted)' }}>
            <tab.icon className="w-3.5 h-3.5" />
            <span className="leading-none text-center truncate w-full">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const OsintTabs = memo(OsintTabsInner);
export default OsintTabs;
