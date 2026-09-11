'use client';

import { useState, useEffect } from 'react';
import { useToast } from './Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  driveFolders: { id: string, name: string }[];
  onFoldersChanged: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  driveFolders,
  onFoldersChanged
}: SettingsModalProps) {
  const toast = useToast();
  const [webAppUrl, setWebAppUrl] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  // New folder input state
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderId, setNewFolderId] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);

  // Fetch Sheets URL
  useEffect(() => {
    if (!isOpen) return;
    const fetchConfig = async () => {
      setIsLoadingUrl(true);
      try {
        const res = await fetch('/api/google-sheets-config');
        if (res.ok) {
          const data = await res.json();
          setWebAppUrl(data.webAppUrl || '');
        }
      } catch (err) {
        console.error(err);
      }
      setIsLoadingUrl(false);
    };
    fetchConfig();
  }, [isOpen]);

  const handleSaveUrl = async () => {
    if (!webAppUrl.trim()) {
      toast.error('Vui lòng nhập Web App URL');
      return;
    }
    setIsSavingUrl(true);
    try {
      const res = await fetch('/api/google-sheets-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: webAppUrl.trim() })
      });
      if (res.ok) {
        toast.success('Lưu cấu hình Google Sheets URL thành công!');
      } else {
        toast.error('Lỗi khi lưu cấu hình URL.');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
    setIsSavingUrl(false);
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !newFolderId.trim()) {
      toast.error('Vui lòng nhập đầy đủ tên và ID thư mục');
      return;
    }
    setIsSavingFolder(true);
    try {
      const updated = [...driveFolders, { id: newFolderId.trim(), name: newFolderName.trim() }];
      const res = await fetch('/api/google-drive-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        toast.success('Đã thêm thư mục mới thành công!');
        setNewFolderName('');
        setNewFolderId('');
        onFoldersChanged();
      } else {
        toast.error('Lỗi khi thêm thư mục.');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
    setIsSavingFolder(false);
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa thư mục "${name}" khỏi danh sách?`)) return;
    try {
      const updated = driveFolders.filter(f => f.id !== id);
      const res = await fetch('/api/google-drive-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        toast.success('Đã xóa thư mục khỏi danh sách!');
        onFoldersChanged();
      } else {
        toast.error('Lỗi khi xóa thư mục.');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      padding: '24px'
    }}>
      <div style={{
        background: '#1e1b4b',
        color: '#f8fafc',
        borderRadius: '16px',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        width: '100%',
        maxWidth: '750px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ Cài Đặt Chung Hệ Thống
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
              Quản lý tài nguyên, Google Sheets và lưu trữ thư mục Google Drive
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Content Area */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', maxHeight: '70vh' }}>
          
          {/* Section 1: Sheets Config */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: '0 0 12px 0', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📊 Cấu hình Google Sheets URL
            </h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={webAppUrl}
                onChange={(e) => setWebAppUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'white',
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSaveUrl}
                disabled={isSavingUrl || isLoadingUrl}
                style={{
                  background: '#c084fc',
                  color: '#1e1b4b',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: (isSavingUrl || isLoadingUrl) ? 0.6 : 1
                }}
              >
                {isSavingUrl ? 'Đang lưu...' : 'Lưu URL'}
              </button>
            </div>
          </div>

          {/* Section 2: Drive Folders Config */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: '0 0 12px 0', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📁 Quản lý thư mục lưu trữ Google Drive
            </h3>

            {/* List of current folders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {driveFolders.map((folder, index) => (
                <div key={folder.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '10px 14px',
                  borderRadius: '8px'
                }}>
                  <div>
                    <span style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>{index + 1}. {folder.name}</span>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', wordBreak: 'break-all' }}>ID: {folder.id}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>

            {/* Add new folder form */}
            <div style={{
              background: 'rgba(255,255,255,0.01)',
              border: '1px dotted rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '12px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.875rem', color: '#cbd5e1' }}>Thêm thư mục mới:</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Tên hiển thị (ví dụ: email/tên drive)"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none',
                    borderWidth: '1px',
                    borderColor: 'rgba(255,255,255,0.1)'
                  }}
                />
                <input
                  type="text"
                  placeholder="Google Drive Folder ID"
                  value={newFolderId}
                  onChange={(e) => setNewFolderId(e.target.value)}
                  style={{
                    flex: 1.5,
                    minWidth: '250px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none',
                    borderWidth: '1px',
                    borderColor: 'rgba(255,255,255,0.1)'
                  }}
                />
                <button
                  onClick={handleAddFolder}
                  disabled={isSavingFolder}
                  style={{
                    background: '#a78bfa',
                    color: '#1e1b4b',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {isSavingFolder ? 'Đang thêm...' : 'Thêm'}
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '8px 24px',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
