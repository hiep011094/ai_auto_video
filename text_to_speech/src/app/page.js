'use client';

import { useState, useEffect, useRef } from 'react';
import voicesData from '../config/voices.json';

const VOICE_OPTIONS = voicesData.voices;

const FAVORITE_IDS = [
  'multi_female_tianmeijieshuo_uranus_bigtts',
  'multi_female_linjianv_uranus_bigtts',
  'multi_female_daqi_uranus_bigtts'
];

const FAVORITE_VOICES = VOICE_OPTIONS.filter(v => FAVORITE_IDS.includes(v.id));
const MALE_VOICES = VOICE_OPTIONS.filter(v => !FAVORITE_IDS.includes(v.id) && v.language === 'vi' && v.gender === 'male');
const FEMALE_VOICES = VOICE_OPTIONS.filter(v => !FAVORITE_IDS.includes(v.id) && v.language === 'vi' && (v.gender === 'female' || v.gender === 'child'));
const FOREIGN_MALE_VOICES = VOICE_OPTIONS.filter(v => !FAVORITE_IDS.includes(v.id) && v.language !== 'vi' && v.gender === 'male');
const FOREIGN_FEMALE_VOICES = VOICE_OPTIONS.filter(v => !FAVORITE_IDS.includes(v.id) && v.language !== 'vi' && v.gender === 'female');

const getVoiceGroup = (voiceId) => {
  if (FAVORITE_IDS.includes(voiceId)) return 'favorite';
  const v = VOICE_OPTIONS.find(x => x.id === voiceId);
  if (!v) return 'none';
  if (v.language === 'vi') {
    return v.gender === 'male' ? 'male' : 'female';
  } else {
    return v.gender === 'male' ? 'foreign_male' : 'foreign_female';
  }
};

export default function Home() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('vi-VN-HoaiMyNeural');
  const [activeCategory, setActiveCategory] = useState('favorite');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  // CapCut Projects state variables
  const [activeTab, setActiveTab] = useState('direct-tts');
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [injectTextVal, setInjectTextVal] = useState('');
  const [splitOption, setSplitOption] = useState('paragraph');
  const [extractedAudios, setExtractedAudios] = useState([]);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/drafts');
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
      } else {
        showToast('Không thể tải danh sách dự án: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi tải dự án.', 'error');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleInject = async (e) => {
    e.preventDefault();
    if (!selectedProjectId) {
      showToast('Vui lòng chọn một dự án CapCut.', 'info');
      return;
    }
    if (!injectTextVal.trim()) {
      showToast('Vui lòng nhập văn bản cần chèn.', 'info');
      return;
    }
    
    setIsInjecting(true);
    try {
      const res = await fetch('/api/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, text: injectTextVal, splitOption })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Đã chèn thành công ${data.chunksCount} đoạn phụ đề vào dự án!`, 'success');
        fetchProjects(); // Refresh project list to update text counts
      } else {
        showToast('Lỗi chèn văn bản: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi chèn văn bản.', 'error');
    } finally {
      setIsInjecting(false);
    }
  };

  const handleExtract = async () => {
    if (!selectedProjectId) {
      showToast('Vui lòng chọn một dự án CapCut.', 'info');
      return;
    }
    
    setIsExtracting(true);
    setExtractedAudios([]);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId })
      });
      const data = await res.json();
      if (data.success) {
        setExtractedAudios(data.files || []);
        if (data.files && data.files.length > 0) {
          showToast('Trích xuất tệp âm thanh hoàn tất!', 'success');
        } else {
          showToast('Dự án chưa được tạo audio TTS trên CapCut.', 'warning');
        }
        fetchProjects(); // Refresh project list to update audio counts
      } else {
        showToast('Lỗi trích xuất: ' + (data.message || data.error), 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi trích xuất âm thanh.', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  // Custom Toast notifications state
  const [toasts, setToasts] = useState([]);

  // Custom Confirm Modal state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const requestConfirm = (title, message, onConfirm) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  useEffect(() => {
    // Initialize audio element
    audioRef.current = new Audio();
    audioRef.current.onended = () => {
      setIsPlaying(false);
    };
    fetchHistory();
    fetchProjects(); // Load drafts automatically on mount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    const group = getVoiceGroup(voice);
    if (group && group !== 'none') {
      setActiveCategory(group);
    }
  }, [voice]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success) {
        setHistory(data.files);
      }
    } catch (err) {
      console.error('Lỗi khi tải lịch sử:', err);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/connect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
      } else {
        showToast(`Lỗi kết nối: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Không thể kết nối với server Next.js.', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      showToast('Vui lòng nhập văn bản cần đọc.', 'info');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setIsPlaying(false);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });

      const data = await response.json();
      if (data.success) {
        setResult(data);
        showToast('Chuyển đổi văn bản thành giọng đọc thành công!', 'success');
        fetchHistory(); // Refresh history
      } else {
        showToast(`Lỗi: ${data.error || 'Không thể chuyển đổi.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Đã xảy ra lỗi kết nối hệ thống.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !result?.playUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = result.playUrl;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => showToast('Không thể phát âm thanh xem thử.', 'error'));
    }
  };

  const playHistoryItem = (url) => {
    if (!audioRef.current) return;
    audioRef.current.src = url;
    audioRef.current.play()
      .catch(err => showToast('Không thể phát âm thanh lịch sử.', 'error'));
  };

  const deleteHistoryItem = (filename) => {
    requestConfirm(
      'Xóa Tệp Âm Thanh',
      `Bạn có chắc chắn muốn xóa tệp ${filename}? File âm thanh này sẽ bị xóa vĩnh viễn trên ổ đĩa.`,
      async () => {
        try {
          const res = await fetch(`/api/history?file=${encodeURIComponent(filename)}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showToast(`Đã xóa tệp ${filename} thành công.`, 'success');
            fetchHistory();
          } else {
            showToast('Lỗi xóa file: ' + data.error, 'error');
          }
        } catch (err) {
          showToast('Lỗi hệ thống khi xóa file.', 'error');
        }
      }
    );
  };

  const deleteAllHistory = () => {
    requestConfirm(
      'Xóa Tất Cả Lịch Sử',
      'Bạn có chắc chắn muốn XÓA TẤT CẢ lịch sử và tệp âm thanh không? Hành động này sẽ xóa sạch dữ liệu và không thể hoàn tác!',
      async () => {
        try {
          const res = await fetch(`/api/history?all=true`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showToast('Đã xóa toàn bộ lịch sử và tệp âm thanh thành công.', 'success');
            fetchHistory();
          } else {
            showToast('Lỗi xóa tất cả: ' + data.error, 'error');
          }
        } catch (err) {
          showToast('Lỗi hệ thống khi xóa toàn bộ.', 'error');
        }
      }
    );
  };

  const formatSize = (bytes) => {
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatDate = (ts) => {
    return new Date(ts).toLocaleString('vi-VN');
  };
  return (
    <div className="app-container" style={{
      maxWidth: '100%',
      width: '100vw',
      height: '100vh',
      padding: '1.25rem 2rem',
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <header className="header" style={{ marginBottom: '1.25rem', flexShrink: 0 }}>
        <div className="brand">
          <div className="brand-icon">CC</div>
          <div>
            <h1 className="brand-title">CapCut Text-To-Speech API</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Chuyển văn bản thành giọng đọc CapCut tự động 100% qua API
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            type="button" 
            onClick={handleConnect} 
            disabled={isConnecting}
            className="btn"
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.8rem',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: isConnecting ? 'none' : '0 0 10px rgba(0, 242, 254, 0.15)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              background: 'rgba(0, 242, 254, 0.05)',
              color: '#00f2fe',
              fontWeight: '500'
            }}
          >
            {isConnecting ? (
              <span className="pulse">Đang kết nối...</span>
            ) : (
              <span>⚡ Kết nối CapCut Desktop</span>
            )}
          </button>
          <span className="badge">v2.0 Direct API</span>
        </div>
      </header>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        marginBottom: '1rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.75rem',
        flexShrink: 0
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('direct-tts')}
          className="btn"
          style={{
            padding: '0.55rem 1.1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
            background: activeTab === 'direct-tts' ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(79, 172, 254, 0.15) 100%)' : 'rgba(255,255,255,0.02)',
            border: activeTab === 'direct-tts' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
            color: activeTab === 'direct-tts' ? 'var(--color-primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'direct-tts' ? 'var(--shadow-glow)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <span>🔊</span> Chuyển Đổi Trực Tiếp (Direct TTS)
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('capcut-projects');
            fetchProjects();
          }}
          className="btn"
          style={{
            padding: '0.55rem 1.1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
            background: activeTab === 'capcut-projects' ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(79, 172, 254, 0.15) 100%)' : 'rgba(255,255,255,0.02)',
            border: activeTab === 'capcut-projects' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
            color: activeTab === 'capcut-projects' ? 'var(--color-primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'capcut-projects' ? 'var(--shadow-glow)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <span>🎬</span> Tích Hợp Dự Án CapCut (CapCut Projects)
        </button>
      </div>

      {activeTab === 'direct-tts' ? (
        /* Main Dashboard Workspace Layout */
        <div style={{
          display: 'flex',
          flex: 1,
          gap: '1.5rem',
          minHeight: 0,
          overflow: 'hidden',
          width: '100%',
          marginBottom: '0.5rem'
        }}>
        {/* Left Box (Text to Speech Form & Active Results) */}
        <main className="glass-panel" style={{
          flex: '1.2',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.75rem',
          overflowY: 'auto',
          minWidth: 0,
          height: '100%',
          marginBottom: 0
        }}>
          <form onSubmit={handleConvert} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flexShrink: 0 }}>
            {/* Text input */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Nội dung văn bản</label>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '0.15rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  {text.length} ký tự
                </span>
              </div>
              <textarea
                className="textarea-main"
                style={{ minHeight: '140px' }}
                placeholder="Nhập nội dung bạn muốn chuyển thành giọng nói tại đây..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            {/* Category Tabs */}
            <div className="category-tabs-container">
              {[
                { id: 'favorite', name: 'Giọng yêu thích', icon: '⭐' },
                { id: 'male', name: 'Giọng Nam', icon: '👨' },
                { id: 'female', name: 'Giọng Nữ', icon: '👩' },
                { id: 'foreign_male', name: 'Nước ngoài (Nam)', icon: '🌐' },
                { id: 'foreign_female', name: 'Nước ngoài (Nữ)', icon: '🌐' }
              ].map(cat => {
                const count = (() => {
                  switch (cat.id) {
                    case 'favorite': return FAVORITE_VOICES.length;
                    case 'male': return MALE_VOICES.length;
                    case 'female': return FEMALE_VOICES.length;
                    case 'foreign_male': return FOREIGN_MALE_VOICES.length;
                    case 'foreign_female': return FOREIGN_FEMALE_VOICES.length;
                    default: return 0;
                  }
                })();
                
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-tab ${activeCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      background: activeCategory === cat.id ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255,255,255,0.08)',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '6px',
                      marginLeft: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Voice Cards Grid */}
            <div style={{ marginBottom: '1rem' }}>
              {(() => {
                const getVoicesForCategory = (catId) => {
                  switch (catId) {
                    case 'favorite': return FAVORITE_VOICES;
                    case 'male': return MALE_VOICES;
                    case 'female': return FEMALE_VOICES;
                    case 'foreign_male': return FOREIGN_MALE_VOICES;
                    case 'foreign_female': return FOREIGN_FEMALE_VOICES;
                    default: return [];
                  }
                };
                
                const currentVoices = getVoicesForCategory(activeCategory);
                
                if (currentVoices.length === 0) {
                  return (
                    <div style={{
                      textAlign: 'center',
                      padding: '3rem 1.5rem',
                      color: 'var(--text-muted)',
                      border: '1px dashed var(--border-color)',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.01)',
                      fontSize: '0.9rem'
                    }}>
                      📭 Danh mục này hiện chưa có giọng đọc nào.
                    </div>
                  );
                }
                
                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    {currentVoices.map(opt => {
                      const isSelected = voice === opt.id;
                      return (
                        <div
                          key={opt.id}
                          onClick={() => setVoice(opt.id)}
                          className={`voice-card ${isSelected ? 'selected' : ''}`}
                          style={{
                            padding: '0.45rem 0.75rem',
                            borderRadius: '8px',
                            background: isSelected ? 'rgba(0, 242, 254, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                            border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                            boxShadow: isSelected ? 'var(--shadow-glow)' : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem',
                            position: 'relative'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              color: isSelected ? 'var(--color-primary)' : 'var(--text-main)',
                              lineHeight: '1.2'
                            }}>
                              {opt.name}
                            </span>
                            {isSelected && (
                              <span style={{
                                color: 'var(--color-primary)',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                background: 'rgba(0, 242, 254, 0.1)',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>✓</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: 'auto' }}>
                            <span style={{
                              fontSize: '0.55rem',
                              padding: '0.1rem 0.3rem',
                              background: 'rgba(255,255,255,0.05)',
                              color: 'var(--text-muted)',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              fontWeight: 'bold'
                            }}>
                              {opt.platform}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dimmed)' }}>
                              {opt.gender === 'male' ? 'Giọng Nam' : (opt.gender === 'female' ? 'Giọng Nữ' : 'Trẻ em')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Submit button */}
            <div style={{ textAlign: 'center', marginTop: '0.5rem', flexShrink: 0 }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
                disabled={isLoading || !text.trim()}
              >
                {isLoading ? (
                  <>
                    <span className="pulse">Đang xử lý API CapCut...</span>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Chuyển đổi & Tự động lưu
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Results Panel */}
          {result && (
            <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(0, 242, 254, 0.03)', border: '1px solid var(--border-glow)', borderRadius: '12px', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
                ✓ Chuyển Đổi Thành Công!
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Tệp âm thanh đã được ghi trực tiếp vào thư mục dự án tại:
                <br />
                <code style={{ display: 'block', margin: '0.5rem 0', wordBreak: 'break-all', color: '#ffffff', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}>
                  {result.filePath}
                </code>
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: result.parts && result.parts.length > 0 ? '1rem' : 0 }}>
                <button
                  className="btn btn-accent"
                  onClick={togglePlay}
                  style={{ padding: '0.5rem 1.1rem', fontSize: '0.8rem' }}
                >
                  {isPlaying ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="4" height="16" />
                        <rect x="16" y="4" width="4" height="16" />
                      </svg>
                      Tạm dừng nghe thử
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Nghe thử toàn bộ file ghép
                    </>
                  )}
                </button>
              </div>

              {/* Individual parts rendering */}
              {result.parts && result.parts.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🎧 <span>Nghe thử từng đoạn đơn lẻ (Chưa ghép):</span>
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {result.parts.map((part) => (
                      <div key={part.index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ minWidth: 0, flex: 1, paddingRight: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-secondary)' }}>
                            Đoạn {part.index}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={part.text}>
                            "{part.text}"
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', background: 'rgba(0, 242, 254, 0.1)', color: '#00f2fe', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(0, 242, 254, 0.2)' }}
                          onClick={() => playHistoryItem(part.playUrl)}
                        >
                          ▶ Nghe đoạn {part.index}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Box (History Panel) */}
        <main className="glass-panel" style={{
          flex: '0.8',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.75rem',
          overflowY: 'auto',
          minWidth: 0,
          height: '100%',
          marginBottom: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: 0 }}>Lịch sử tạo</h2>
            {history.length > 0 && (
              <button 
                className="btn btn-danger" 
                onClick={deleteAllHistory}
                style={{ background: 'rgba(255, 59, 48, 0.15)', color: '#ff3b30', padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
              >
                Xóa tất cả
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Chưa có file nào được tạo.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-bright)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-muted)' }}>Tên File</th>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-muted)' }}>Kích thước</th>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((file, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.6rem 0.4rem', wordBreak: 'break-all', maxWidth: '140px' }} title={file.name}>
                        {file.name}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dimmed)', marginTop: '2px' }}>
                          {formatDate(file.createdAt)}
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem 0.4rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatSize(file.size)}</td>
                      <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
                            onClick={() => playHistoryItem(file.playUrl)}
                            title="Nghe"
                          >
                            ▶
                          </button>
                          <a 
                            href={file.playUrl}
                            download={file.name}
                            className="btn"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                            title="Tải xuống"
                          >
                            ↓
                          </a>
                          <button 
                            className="btn"
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,59,48,0.15)', color: '#ff3b30', borderRadius: '6px' }}
                            onClick={() => deleteHistoryItem(file.name)}
                            title="Xóa"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
      ) : (
        /* CapCut Projects Dashboard Workspace Layout */
        <div style={{
          display: 'flex',
          flex: 1,
          gap: '1.5rem',
          minHeight: 0,
          overflow: 'hidden',
          width: '100%',
          marginBottom: '0.5rem'
        }}>
          {/* Left Box (Projects and actions) */}
          <main className="glass-panel" style={{
            flex: '1.2',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.75rem',
            overflowY: 'auto',
            minWidth: 0,
            height: '100%',
            marginBottom: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', margin: 0 }}>Dự án CapCut PC gần đây</h2>
              <button 
                type="button" 
                onClick={fetchProjects}
                disabled={isLoadingProjects}
                className="btn"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.78rem',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                {isLoadingProjects ? 'Đang tải...' : '🔄 Làm mới'}
              </button>
            </div>

            {/* Project Cards Grid */}
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.01)' }}>
                {isLoadingProjects ? 'Đang tìm kiếm dự án CapCut...' : '📭 Không tìm thấy dự án CapCut nào trên máy tính.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem', flexShrink: 0 }}>
                {projects.map(proj => {
                  const isSelected = selectedProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setExtractedAudios([]);
                      }}
                      className={`voice-card ${isSelected ? 'selected' : ''}`}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', color: isSelected ? 'var(--color-primary)' : 'var(--text-main)', lineBreak: 'anywhere' }}>
                        📂 {proj.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dimmed)' }}>
                        Cập nhật: {proj.formattedDate}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '0.65rem', background: 'rgba(0, 242, 254, 0.1)', color: 'var(--color-primary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                          💬 {proj.textCount} texts
                        </span>
                        <span style={{ fontSize: '0.65rem', background: 'rgba(79, 172, 254, 0.1)', color: 'var(--color-secondary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                          🎵 {proj.audioCount} audios
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Inject Form & Extraction controls if selected */}
            {selectedProjectId ? (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Project Name display */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block' }}>Đang thao tác trên dự án:</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                      {projects.find(p => p.id === selectedProjectId)?.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={handleExtract}
                    disabled={isExtracting}
                    style={{ padding: '0.55rem 1.1rem', fontSize: '0.8rem' }}
                  >
                    {isExtracting ? 'Đang trích xuất...' : '⚡ Trích xuất Audio'}
                  </button>
                </div>

                {/* Inject Input form */}
                <form onSubmit={handleInject} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ margin: 0 }}>Nhập văn bản chèn phụ đề</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chia nhỏ:</span>
                      <select
                        value={splitOption}
                        onChange={(e) => setSplitOption(e.target.value)}
                        style={{
                          background: '#0d1527',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '6px'
                        }}
                      >
                        <option value="paragraph">Đoạn văn (Paragraph)</option>
                        <option value="sentence">Câu (Sentence)</option>
                        <option value="line">Dòng (Line)</option>
                        <option value="char">~400 Ký tự (Words)</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    className="textarea-main"
                    style={{ minHeight: '100px' }}
                    placeholder="Viết nội dung chèn phụ đề CapCut..."
                    value={injectTextVal}
                    onChange={(e) => setInjectTextVal(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isInjecting || !injectTextVal.trim()}
                    style={{ width: '100%', padding: '0.7rem', fontSize: '0.85rem' }}
                  >
                    {isInjecting ? 'Đang chèn...' : '📝 Chèn trực tiếp vào Timeline CapCut PC'}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(0,0,0,0.1)', marginTop: '0.5rem', padding: '2rem' }}>
                👈 Chọn một dự án ở trên để chèn text hoặc trích xuất file âm thanh.
              </div>
            )}
          </main>

          {/* Right Box (Extracted files) */}
          <main className="glass-panel" style={{
            flex: '0.8',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.75rem',
            overflowY: 'auto',
            minWidth: 0,
            height: '100%',
            marginBottom: 0
          }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text-bright)', marginBottom: '1.25rem', flexShrink: 0 }}>
              Tệp âm thanh trích xuất
            </h2>

            {!selectedProjectId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Hãy chọn một dự án để xem tệp âm thanh.
              </div>
            ) : isExtracting ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
                <span className="pulse" style={{ fontSize: '2rem' }}>⚡</span>
                <span>Đang kết nối database CapCut và copy file...</span>
              </div>
            ) : extractedAudios.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                <span>⚠️ Chưa trích xuất file nào.</span>
                <span style={{ fontSize: '0.75rem' }}>
                  Nhấn nút <b>"Trích xuất Audio"</b> sau khi bạn đã chạy TTS trên phần mềm CapCut PC.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-bright)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-muted)' }}>Tên File Trích Xuất / Trạng Thái</th>
                      <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedAudios.map((file, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '0.6rem 0.4rem', wordBreak: 'break-all' }}>
                          <div style={{ fontWeight: '500' }}>{file.fileName || `Tệp ${file.index}`}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', lineBreak: 'anywhere' }}>
                            {file.text.slice(0, 45)}{file.text.length > 45 ? '...' : ''}
                          </div>
                          {file.status === 'pending' && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              ⏳ Cần chạy TTS trên CapCut PC
                            </span>
                          )}
                          {file.status === 'error' && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }} title={file.message}>
                              ✕ Lỗi: {file.message}
                            </span>
                          )}
                          {file.status === 'success' && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                              ✓ Sẵn sàng
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>
                          {file.status === 'success' && file.playUrl && (
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn"
                                style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}
                                onClick={() => playHistoryItem(file.playUrl)}
                                title="Nghe"
                              >
                                ▶
                              </button>
                              <a 
                                href={file.playUrl}
                                download={file.fileName}
                                className="btn"
                                style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                                title="Tải xuống"
                              >
                                ↓
                              </a>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            <span className={`toast-${t.type}-icon`} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 className="modal-title">
              <span style={{ marginRight: '6px' }}>⚠️</span>
              {confirmModal.title}
            </h3>
            <p className="modal-body">{confirmModal.message}</p>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn" 
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              >
                Hủy bỏ
              </button>
              <button 
                type="button" 
                className="btn" 
                style={{ 
                  background: confirmModal.title.includes('Xóa') ? 'var(--color-danger)' : 'var(--color-primary)', 
                  color: confirmModal.title.includes('Xóa') ? '#ffffff' : '#050811',
                  fontWeight: '600',
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={confirmModal.onConfirm}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

