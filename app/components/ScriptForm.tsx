'use client';

import type { FormState, ActiveTab } from '../types';

interface ScriptFormProps {
  activeTab: Exclude<ActiveTab, 'capcut'>;
  formState: FormState;
  onUpdateState: (key: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSubmitCodex: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  isSubmittingCodex: boolean;
}

export default function ScriptForm({
  activeTab,
  formState,
  onUpdateState,
  onSubmit,
  onSubmitCodex,
  isSubmitting,
  isSubmittingCodex,
}: ScriptFormProps) {
  const videoLabel = activeTab === 'short' ? 'Short' : 'Dài';
  const isDisabled = formState.generationMethod === 'manual' && !formState.topic.trim();

  return (
    <form onSubmit={onSubmit}>
      {/* Phương pháp tạo kịch bản */}
      <div className="form-group">
        <label>Phương pháp Tạo kịch bản</label>
        <div className="radio-group">
          <label className="radio-card">
            <input type="radio" name="generationMethod" value="auto" checked={formState.generationMethod === 'auto'} onChange={(e) => onUpdateState('generationMethod', e.target.value)} />
            <div className="card-content">Tự động chọn chủ đề Phật giáo</div>
          </label>
          <label className="radio-card">
            <input type="radio" name="generationMethod" value="manual" checked={formState.generationMethod === 'manual'} onChange={(e) => onUpdateState('generationMethod', e.target.value)} />
            <div className="card-content">Tự động theo tiêu đề cung cấp</div>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="category">Nhóm chủ đề Phật giáo</label>
        <select id="category" className="form-control" value={formState.category||''} onChange={e=>onUpdateState('category',e.target.value)}>
          <option value="">Tự động luân phiên</option>
          <option value="buddhist_life">Phật pháp sống · Chánh niệm, từ bi, ứng dụng</option>
          <option value="buddhist_wisdom">Trí tuệ Phật giáo · Giáo lý, kinh điển, lịch sử</option>
        </select>
        <p>Tiếng Việt, giọng chiêm nghiệm. Trích dẫn và kiến thức cần được kiểm chứng; câu chuyện minh họa phải nêu rõ.</p>
      </div>
      {/* Topic input (manual only) */}
      {formState.generationMethod === 'manual' && (
        <div className="form-group">
          <label htmlFor="topic">
            Chủ đề {activeTab === 'short' ? 'Short' : 'Video Dài'}
          </label>
          <input
            type="text"
            id="topic"
            className="form-control"
            maxLength={500}
            placeholder={activeTab === 'short' ? 'Ví dụ: Chánh niệm khi đối diện cơn giận' : 'Ví dụ: Duyên khởi và cách nhìn về khổ đau'}
            value={formState.topic}
            onChange={(e) => onUpdateState('topic', e.target.value)}
            required
          />
        </div>
      )}

      {/* Mode + Language info grid */}
      <div className="form-grid-2">
        <div className="form-group">
          <label>Ngôn ngữ</label>
          <div className="radio-group">
            <label className="radio-card">
              <input type="radio" name="language" value="vi" checked={true} readOnly />
              <div className="card-content">🇻🇳 Tiếng Việt</div>
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>Nội dung</label>
          <div className="radio-group">
            <label className="radio-card">
              <input type="radio" name="mode" value="2" checked={formState.mode === '2'} onChange={(e) => onUpdateState('mode', e.target.value)} />
              <div className="card-content">📖 Kiến thức (Kinh điển, Lịch sử)</div>
            </label>
            <label className="radio-card">
              <input type="radio" name="mode" value="1" checked={formState.mode === '1'} onChange={(e) => onUpdateState('mode', e.target.value)} />
              <div className="card-content">🧘 Chiêm nghiệm (Suy ngẫm, Ứng dụng)</div>
            </label>
          </div>
        </div>
      </div>

      {/* Voice Style */}
      <div className="form-group">
        <label>Phong cách Dẫn truyện (Voice Style)</label>
        <div className="radio-group">
          <label className="radio-card">
            <input type="radio" name="voiceStyle" value="contemplative" checked={true} readOnly />
            <div className="card-content">🪷 Trầm lắng, Sâu sắc (Contemplative)</div>
          </label>
        </div>
      </div>


      {/* Submit buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
        {/* AGY Button */}
        <button
          type="submit"
          className="btn btn-full"
          disabled={isSubmitting || isSubmittingCodex || isDisabled}
          style={{ flex: 1 }}
        >
          {isSubmitting ? (
            <>
              <div className="spinner" />
              Đang nạp yêu cầu...
            </>
          ) : (
            `🚀 Tạo Kịch bản ${videoLabel}`
          )}
        </button>

        {/* Codex Button */}
        <button
          type="button"
          onClick={onSubmitCodex}
          disabled={isSubmitting || isSubmittingCodex || isDisabled}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '14px 24px',
            borderRadius: '10px',
            border: 'none',
            cursor: isSubmitting || isSubmittingCodex || isDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: '1rem',
            fontWeight: '700',
            letterSpacing: '0.01em',
            transition: 'all 0.2s ease',
            background: isSubmitting || isSubmittingCodex || isDisabled
              ? '#6ee7b7'
              : 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
            color: '#ffffff',
            boxShadow: isSubmitting || isSubmittingCodex || isDisabled
              ? 'none'
              : '0 4px 15px rgba(16, 185, 129, 0.4)',
            opacity: isSubmitting || isSubmittingCodex || isDisabled ? 0.65 : 1,
          }}
          onMouseEnter={e => {
            if (!isSubmitting && !isSubmittingCodex && !isDisabled) {
              (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.55)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={e => {
            if (!isSubmitting && !isSubmittingCodex && !isDisabled) {
              (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }
          }}
        >
          {isSubmittingCodex ? (
            <>
              <div className="spinner" />
              Đang nạp yêu cầu...
            </>
          ) : (
            `⚡ Tạo Kịch bản ${videoLabel} (Codex)`
          )}
        </button>
      </div>
    </form>
  );
}

