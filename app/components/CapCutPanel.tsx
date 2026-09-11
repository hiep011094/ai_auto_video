'use client';

import FolderBrowser from './FolderBrowser';
import type { UseCapcutReturn } from '../hooks/useCapcut';

type CapCutPanelProps = Pick<
  UseCapcutReturn,
  'folderPath' | 'setFolderPath' | 'bgmPath' | 'setBgmPath' |
  'isFolderBrowserOpen' | 'setIsFolderBrowserOpen' |
  'isBgmBrowserOpen' | 'setIsBgmBrowserOpen' |
  'capcutStatus' | 'makeCapcut' | 'clearStatus'
>;

// Re-export the return type for consumers
export type { UseCapcutReturn } from '../hooks/useCapcut';

export default function CapCutPanel({
  folderPath, setFolderPath,
  bgmPath, setBgmPath,
  isFolderBrowserOpen, setIsFolderBrowserOpen,
  isBgmBrowserOpen, setIsBgmBrowserOpen,
  capcutStatus, makeCapcut, clearStatus,
}: CapCutPanelProps) {
  return (
    <div>
      <h2 className="panel-title">Tự động ghép nối Project CapCut</h2>
      <p className="panel-description">
        Hệ thống sẽ chạy hoàn toàn nội bộ thông qua Next.js API. Vui lòng cung cấp đường dẫn tuyệt đối tới thư mục chứa các file Video và Audio của bạn.
      </p>

      {/* Folder Picker */}
      <div className="form-group">
        <div className="form-label-row">
          <label>Thư mục Video (*)</label>
        </div>
        <div
          className="drop-zone drop-zone-primary"
          onClick={() => setIsFolderBrowserOpen(true)}
        >
          {folderPath ? (
            <div className="drop-zone-selected">
              <div className="drop-zone-label">Đã chọn:</div>
              <strong className="drop-zone-path">{folderPath}</strong>
              <div className="drop-zone-action">Nhấn để chọn lại</div>
            </div>
          ) : (
            <div className="drop-zone-empty">
              <div className="drop-zone-icon">📁</div>
              <strong className="drop-zone-cta">Bấm vào đây để chọn thư mục</strong>
              <div className="drop-zone-hint">Hộp thoại Windows sẽ tự động hiện lên</div>
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button onClick={makeCapcut} className="btn btn-full btn-submit">
        🚀 Tạo Project CapCut ngay!
      </button>

      {/* BGM Picker */}
      <div className="form-group form-group-spaced">
        <div className="form-label-row">
          <label>Nhạc Nền - Tùy chọn (Bỏ trống để dùng mặc định)</label>
          {bgmPath && (
            <button onClick={() => setBgmPath('')} className="btn btn-danger btn-xs">
              ❌ Xóa
            </button>
          )}
        </div>
        <div
          className="drop-zone drop-zone-secondary"
          onClick={() => setIsBgmBrowserOpen(true)}
        >
          {bgmPath ? (
            <div className="drop-zone-selected">
              <div className="drop-zone-label">Đã chọn:</div>
              <strong className="drop-zone-path">{bgmPath}</strong>
            </div>
          ) : (
            <div className="drop-zone-empty-inline">
              <span className="drop-zone-music-icon">🎵</span>
              <span className="drop-zone-hint">Bấm vào đây để chọn file Nhạc Nền (.mp3)</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Message */}
      {capcutStatus && (
        <div className={`status-banner ${capcutStatus.includes('✅') ? 'status-banner-success' : 'status-banner-error'}`}>
          {capcutStatus}
        </div>
      )}

      {/* Folder Browsers */}
      <FolderBrowser
        isOpen={isFolderBrowserOpen}
        onClose={() => setIsFolderBrowserOpen(false)}
        onSelect={(p) => { setFolderPath(p); clearStatus(); }}
      />
      <FolderBrowser
        isOpen={isBgmBrowserOpen}
        onClose={() => setIsBgmBrowserOpen(false)}
        onSelect={(p) => { setBgmPath(p); clearStatus(); }}
        mode="file"
        allowedExtensions={['.mp3', '.wav', '.m4a']}
        title="Chọn File Nhạc Nền"
      />
    </div>
  );
}
