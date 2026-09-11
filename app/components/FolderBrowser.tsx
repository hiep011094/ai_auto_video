'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './FolderBrowser.module.css';

interface FolderBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  title?: string;
  mode?: 'folder' | 'file';
  allowedExtensions?: string[];
  defaultPath?: string;
}

const DEFAULT_EXTENSIONS: string[] = [];

export default function FolderBrowser({ isOpen, onClose, onSelect, title, mode = 'folder', allowedExtensions = DEFAULT_EXTENSIONS, defaultPath = 'workspace' }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState(defaultPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const browseTo = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dirPath && dirPath !== 'root') {
        params.set('path', dirPath);
      }
      const res = await fetch(`/api/browse?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi không xác định');

      setCurrentPath(data.path);
      setParentPath(data.parent);
      
      let fetchedItems = data.items || [];
      if (mode === 'folder') {
        fetchedItems = fetchedItems.filter((i: any) => i.isDir);
      } else if (allowedExtensions.length > 0) {
        fetchedItems = fetchedItems.filter((i: any) => 
          i.isDir || allowedExtensions.some(ext => i.name.toLowerCase().endsWith(ext.toLowerCase()))
        );
      }
      setItems(fetchedItems);
      setSelectedFile(null);
      
      setManualPath(data.path === 'root' ? '' : data.path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, allowedExtensions]);

  useEffect(() => {
    if (isOpen) {
      browseTo(defaultPath);
    }
  }, [isOpen, browseTo, defaultPath]);

  const handleSelect = () => {
    if (mode === 'folder' && currentPath && currentPath !== 'root') {
      onSelect(currentPath);
      onClose();
    } else if (mode === 'file' && selectedFile) {
      onSelect(selectedFile);
      onClose();
    }
  };

  const handleGoUp = () => {
    if (parentPath !== null) {
      browseTo(parentPath);
    }
  };

  const handleManualGo = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      browseTo(manualPath.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            {mode === 'file' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              </svg>
            )}
            {title || (mode === 'file' ? 'Chọn File' : 'Chọn thư mục')}
          </h3>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Path bar */}
        <form className={styles.pathBar} onSubmit={handleManualGo}>
          <button
            type="button"
            className={styles.upBtn}
            onClick={handleGoUp}
            disabled={parentPath === null}
            title="Lên một cấp"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          </button>
          <input
            type="text"
            className={styles.pathInput}
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="Nhập đường dẫn (VD: D:\Videos)"
          />
          <button type="submit" className={styles.goBtn}>
            Đi
          </button>
        </form>

        {/* Breadcrumb */}
        {currentPath && currentPath !== 'root' && (
          <div className={styles.breadcrumb}>
            <button className={styles.breadcrumbItem} onClick={() => browseTo('root')}>
              💻 Máy tính
            </button>
            {currentPath.replace(/\\/g, '/').split('/').filter(Boolean).map((part, i, arr) => {
              const fullPath = arr.slice(0, i + 1).join('/');
              // Reconstruct proper Windows path
              const reconstructed = fullPath.includes(':') ? fullPath.replace('/', ':\\').replace(/\//g, '\\') : '/' + fullPath;
              return (
                <span key={i} className={styles.breadcrumbSep}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <button className={styles.breadcrumbItem} onClick={() => browseTo(reconstructed)}>
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {loading && (
            <div className={styles.loadingState}>
              <span className={styles.spinner} />
              Đang tải...
            </div>
          )}

          {error && (
            <div className={styles.errorState}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6M9 9l6 6" />
              </svg>
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className={styles.emptyState}>
              Thư mục trống
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className={styles.list}>
              {items.map((item) => (
                <button
                  key={item.path}
                  className={`${styles.item} ${selectedFile === item.path ? styles.itemSelected : ''}`}
                  onClick={() => {
                    if (item.isFile && mode === 'file') {
                      setSelectedFile(item.path);
                    } else {
                      browseTo(item.path);
                    }
                  }}
                  onDoubleClick={() => {
                    if (item.isFile && mode === 'file') {
                      onSelect(item.path);
                      onClose();
                    }
                  }}
                  title={`Nhấp để chọn: ${item.path}`}
                >
                  {item.isFile ? (
                    <svg className={styles.fileIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                      <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
                    </svg>
                  ) : (
                    <svg className={styles.folderIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                    </svg>
                  )}
                  <span className={styles.itemName}>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.selectedPath}>
            {mode === 'folder' ? (
              currentPath !== 'root' ? (
                <span title={currentPath}>📁 {currentPath}</span>
              ) : (
                <span className={styles.noSelect}>Chưa chọn thư mục nào</span>
              )
            ) : (
              selectedFile ? (
                <span title={selectedFile}>🎵 {selectedFile}</span>
              ) : (
                <span className={styles.noSelect}>Chưa chọn file nào</span>
              )
            )}
          </div>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Hủy
            </button>
            <button
              className={styles.selectBtn}
              onClick={handleSelect}
              disabled={mode === 'folder' ? (!currentPath || currentPath === 'root') : !selectedFile}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {mode === 'folder' ? 'Chọn thư mục này' : 'Chọn file này'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
