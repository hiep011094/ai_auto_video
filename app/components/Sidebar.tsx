'use client';

import type { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const NAV_ITEMS: { tab: ActiveTab; icon: string; label: string }[] = [
  { tab: 'short', icon: '⚡', label: 'Video Short (Nhanh)' },
  { tab: 'long', icon: '🎬', label: 'Video Dài (Chi tiết)' },
  { tab: 'capcut', icon: '✂️', label: 'Tạo Project CapCut' },
  { tab: 'youtube', icon: '📺', label: 'Đăng YouTube' },
];

export default function Sidebar({
  activeTab,
  onTabChange,
}: SidebarProps) {
  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h1 className="sidebar-brand">Tỉnh Thức AI</h1>
        <p className="sidebar-subtitle">ĐƯỜNG VỀ TỈNH THỨC</p>
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ tab, icon, label }) => (
          <div
            key={tab}
            className={`nav-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
