'use client';

import { useState, useEffect } from 'react';
import type { FormState, ActiveTab, ViewMode } from './types';
import { useQueue } from './hooks/useQueue';
import { useCapcut } from './hooks/useCapcut';
import { useToast } from './components/Toast';
import dynamic from 'next/dynamic';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import QueueSidebar from './components/QueueSidebar';
import ScriptForm from './components/ScriptForm';
import CapCutPanel from './components/CapCutPanel';
import ContentViewer from './components/ContentViewer';

// Lazy-load YouTubePanel — component nặng, chỉ cần khi user vào tab YouTube
const YouTubePanel = dynamic(() => import('./components/YouTubePanel'), { ssr: false });

const DEFAULT_FORM: FormState = {
  generationMethod: 'auto',
  topic: '',
  language: 'vi',
  mode: '2',
  voiceStyle: 'contemplative',
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('short');
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  // Lazy-mount: ContentViewer is only mounted once the user first opens it,
  // then kept mounted (hidden via CSS) to preserve loaded data across view switches.
  const [contentViewerMounted, setContentViewerMounted] = useState(false);
  const [shortState, setShortState] = useState<FormState>(DEFAULT_FORM);
  const [longState, setLongState] = useState<FormState>(DEFAULT_FORM);

  const { error: queueError, isSubmitting, submitTask } = useQueue();
  const [isSubmittingCodex, setIsSubmittingCodex] = useState(false);
  const capcut = useCapcut();
  const toast = useToast();

  // Scan folders when CapCut tab opens
  useEffect(() => {
    if (activeTab === 'capcut') capcut.scanFolders();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Derived state ----
  const currentState = activeTab === 'short' ? shortState : longState;
  const updateState = (key: string, value: string) => {
    if (activeTab === 'short') {
      setShortState(prev => ({ ...prev, [key]: value }));
    } else {
      setLongState(prev => ({ ...prev, [key]: value }));
    }
  };

  // ---- Handlers ----
  const handleGlobalRefreshData = () => {
    toast.info('⏳ Đang làm mới dữ liệu hệ thống...');
    if (activeTab === 'capcut') capcut.scanFolders();
    window.dispatchEvent(new Event('refresh-content'));

  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const videoType = activeTab === 'short' ? 'short' as const : 'long' as const;
    const ok = await submitTask(currentState, videoType, 'agy');
    if (ok) {
      toast.success('Đã thêm kịch bản', 'Kịch bản đang được xếp vào hàng đợi xử lý.');
      if (activeTab === 'short') setShortState(prev => ({ ...prev, topic: '' }));
      else setLongState(prev => ({ ...prev, topic: '' }));
    } else {
      toast.error('Lỗi', 'Không thể thêm kịch bản. Vui lòng thử lại.');
    }
  };

  const handleSubmitCodex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentState.generationMethod === 'manual' && !currentState.topic.trim()) return;
    const videoType = activeTab === 'short' ? 'short' as const : 'long' as const;
    setIsSubmittingCodex(true);
    try {
      const ok = await submitTask(currentState, videoType, 'codex');
      if (ok) {
        toast.success('Đã thêm kịch bản (Codex)', 'Kịch bản đang được xử lý bởi Codex.');
        if (activeTab === 'short') setShortState(prev => ({ ...prev, topic: '' }));
        else setLongState(prev => ({ ...prev, topic: '' }));
      } else {
        toast.error('Lỗi', 'Không thể thêm kịch bản Codex. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmittingCodex(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="main-content">
        <div className="content-container">
          {queueError && <p role="alert" style={{color:"#b42318"}}>{queueError}</p>}
          <div className="panel">
            {activeTab === 'capcut' ? (
              <CapCutPanel {...capcut} />
            ) : activeTab === 'youtube' ? (
              <ErrorBoundary label="YouTube Panel">
                <YouTubePanel isActive={activeTab === 'youtube'} />
              </ErrorBoundary>
            ) : (
              <div>
                {/* View mode toggle with Global Refresh Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="view-toggle" style={{ marginBottom: 0 }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('create')}
                      className={`btn btn-pill ${viewMode === 'create' ? '' : 'btn-secondary'}`}
                    >
                      ✨ Tạo Dự Án Mới
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContentViewerMounted(true); // lazy-mount on first use
                        setViewMode('content');
                      }}
                      className={`btn btn-pill ${viewMode === 'content' ? '' : 'btn-secondary'}`}
                    >
                      📂 Lịch sử &amp; Nội dung
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleGlobalRefreshData}
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                      borderRadius: '8px',
                      fontWeight: '600',
                      background: '#fdf6e3',
                      color: '#b8860b',
                      border: '1px solid #e6cc8a',
                      cursor: 'pointer'
                    }}
                    title="Bấm để làm mới dữ liệu cho tất cả các tab"
                  >
                    🔄 Làm mới dữ liệu
                  </button>
                </div>

                {/* ContentViewer: lazy-mount + CSS hide/show to preserve state across view switches */}
                {contentViewerMounted && (
                  <div style={{ display: viewMode === 'content' ? 'block' : 'none' }}>
                    <ErrorBoundary label="Trình xem nội dung">
                      <ContentViewer type={activeTab as 'short' | 'long'} />
                    </ErrorBoundary>
                  </div>
                )}
                {/* ScriptForm: conditional render is fine (no heavy initial load) */}
                {viewMode === 'create' && (
                  <ScriptForm
                    activeTab={activeTab as 'short' | 'long'}
                    formState={currentState}
                    onUpdateState={updateState}
                    onSubmit={handleSubmit}
                    onSubmitCodex={handleSubmitCodex}
                    isSubmitting={isSubmitting}
                    isSubmittingCodex={isSubmittingCodex}
                  />
                )}
              </div>
            )}
          </div>
          <QueueSidebar />
        </div>
      </div>
    </div>
  );
}
