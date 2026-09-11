import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flow } from 'flow-sdk';
import { ffmpegService } from './services/ffmpegService';
import JSZip from 'jszip';

// --- Constants ---

const VIDEO_MODELS = [
  { label: 'Omni Flash (Video + Audio, Đồng bộ)', value: 'Omni Flash' },
  { label: 'Veo 3.1 - Lite (Rất nhanh, Video only)', value: 'Veo 3.1 - Lite' },
  { label: 'Veo 3.1 - Fast (Nhanh, Cân bằng)', value: 'Veo 3.1 - Fast' },
  { label: 'Veo 3.1 - Quality (Chậm, Chất lượng cao nhất)', value: 'Veo 3.1 - Quality' },
  { label: 'Veo 3.1 - Lite [Lower Priority] (0 Credit - Rất chậm)', value: 'Veo 3.1 - Lite [Lower Priority]' },
];

const QUALITY_OPTIONS = [
  { label: 'HD (720p)', value: '720p' },
  { label: 'Full HD (1080p)', value: '1080p' },
];

const ASPECT_RATIOS = [
  { label: 'Dọc (9:16)', value: '9:16', icon: 'smartphone' },
  { label: 'Ngang (16:9)', value: '16:9', icon: 'tv' },
];

const INITIAL_SCENE_COUNT = 5;
const DEFAULT_MODEL_VALUE = 'Veo 3.1 - Lite [Lower Priority]';
const BATCH_SIZE = 5; // Cập nhật từ 1 lên 5: Chạy 5 cảnh một lượt rồi mới sang lượt tiếp theo

// --- Utilities ---

const sanitizeFilename = (name: string, index: number): string => {
  const clean = name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
  return `${clean || 'scene'}_${String(index + 1).padStart(2, '0')}`;
};

const getDimensions = (ratio: '9:16' | '16:9', quality: '720p' | '1080p') => {
  const is916 = ratio === '9:16';
  if (quality === '1080p') {
    return is916 ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
  }
  return is916 ? { w: 720, h: 1280 } : { w: 1280, h: 720 };
};

const processImageToRatio = (base64: string, mimeType: string, ratio: '9:16' | '16:9'): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const { w: TARGET_WIDTH, h: TARGET_HEIGHT } = getDimensions(ratio, '1080p');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_WIDTH;
      canvas.height = TARGET_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

      const scale = Math.max(TARGET_WIDTH / img.width, TARGET_HEIGHT / img.height);
      const x = (TARGET_WIDTH / 2) - (img.width / 2) * scale;
      const y = (TARGET_HEIGHT / 2) - (img.height / 2) * scale;
      
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      const outBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      resolve({ base64: outBase64, mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
};

const upscaleVideo = async (base64: string, quality: '720p' | '1080p', ratio: '9:16' | '16:9'): Promise<string> => {
  if (!ffmpegService.isLoaded()) {
    await ffmpegService.load();
  }

  const { w, h } = getDimensions(ratio, quality);
  const inputName = `input_${Date.now()}.mp4`;
  const outputName = `output_${Date.now()}.mp4`;
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  
  await ffmpegService.writeFile(inputName, bytes);

  const scaleStr = `${w}:${h}`;

  await ffmpegService.exec([
    '-i', inputName,
    '-vf', `scale=${scaleStr}:force_original_aspect_ratio=decrease,pad=${scaleStr}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    '-y', outputName
  ]);

  const data = await ffmpegService.readFile(outputName) as Uint8Array;
  const resultBase64 = btoa(Array.from(data).map(b => String.fromCharCode(b)).join(''));

  await ffmpegService.deleteFile(inputName);
  await ffmpegService.deleteFile(outputName);

  return resultBase64;
};

// --- UI Primitives ---

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center px-2">
    <span className="text-[10px] font-bold text-[rgba(218,220,224,0.6)] tracking-[1px] uppercase">
      {children}
    </span>
  </div>
);

const PillButton: React.FC<{
  icon?: React.ReactNode; 
  children: React.ReactNode;
  variant?: 'filled' | 'outline' | 'solid' | 'danger' | 'primary' | 'info'; 
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ icon, children, variant = 'filled', onClick, disabled, className = '' }) => {
  const base = 'flex items-center gap-[6px] justify-center h-[36px] rounded-xl font-medium tracking-[0.1px] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none';
  const variants: Record<string, string> = {
    filled: 'bg-[#333] hover:bg-[#444] active:bg-[#222] text-white text-[12px] px-4',
    outline: 'border border-[#595959] hover:bg-white/5 active:bg-white/10 backdrop-blur-md text-[12px] px-4 text-white',
    solid: 'bg-white hover:bg-gray-200 active:bg-gray-300 text-black text-[12px] px-4',
    primary: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-[12px] px-4 shadow-lg shadow-blue-500/20',
    info: 'bg-white/5 hover:bg-white/10 text-blue-400 text-[11px] px-3 border border-blue-500/20',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[12px] px-3 border border-red-500/20',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="flex items-center justify-center w-5 h-5">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

const SegmentedToggle: React.FC<{
  value: string;
  items: { value: string; label: string; icon?: string }[];
  onChange: (val: any) => void;
  disabled?: boolean;
}> = ({ value, items, onChange, disabled }) => (
  <div className={`flex w-full items-center border border-[#595959]/30 rounded-xl overflow-hidden bg-[#161616] p-0.5 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
    {items.map((item) => (
      <button 
        key={item.value} 
        type="button" 
        onClick={() => !disabled && onChange(item.value)}
        className={`flex-1 flex items-center justify-center gap-1.5 h-[34px] px-2 rounded-lg text-[11px] font-bold tracking-[0.5px] transition-all cursor-pointer ${
          value === item.value ? 'bg-[#333] text-white shadow-sm' : 'text-white/30 hover:text-white/60'
        }`}
        disabled={disabled}
      >
        {item.icon && <span className="material-symbols-outlined text-[16px]">{item.icon}</span>}
        <span className="uppercase">{item.label}</span>
      </button>
    ))}
  </div>
);

const FieldDropdown: React.FC<{
  label?: string; 
  value: string; 
  options: { label: string; value: string }[];
  onChange: (val: string) => void; 
  className?: string;
  disabled?: boolean;
}> = ({ label, value, options, onChange, className = '', disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button 
        type="button" 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full text-left border border-[#595959]/50 hover:border-[#7a7a7a] transition-colors rounded-xl flex flex-col gap-0.5 justify-center px-3 py-1.5 min-h-[44px] focus:outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {label && <p className="text-[10px] font-medium text-white/30 tracking-[0.2px] uppercase">{label}</p>}
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-white/90 truncate">{selectedOption.label}</span>
          <span className={`material-symbols-outlined text-[18px] text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
        </div>
      </button>
      {isOpen && (
        <div className="absolute z-50 bottom-full mb-2 left-0 w-full bg-[#1a1a1a] border border-[#595959] rounded-xl overflow-hidden shadow-2xl animate-dropdown origin-bottom">
          <div className="max-h-60 overflow-y-auto dark-scrollbar py-1">
            {options.map((opt) => (
              <button key={opt.value} type="button"
                className={`w-full text-left px-3 py-2.5 text-[12px] font-medium hover:bg-white/5 transition-colors ${value === opt.value ? 'bg-white/10 text-white' : 'text-white/60'}`}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Modal Component ---

const GuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#161616] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-dropdown">
        <div className="p-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-400">help_center</span>
              Hướng dẫn chọn thư mục
            </h2>
            <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div className="flex flex-col gap-4 text-sm text-white/60 leading-relaxed">
            <p>Để chọn được thư mục lưu trên máy tính, bạn cần bật cài đặt này trong trình duyệt của mình:</p>
            
            <div className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3">
              <div className="font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-[10px] flex items-center justify-center text-white">1</span>
                Mở Cài đặt Trình duyệt
              </div>
              <p className="pl-7">Nhấn vào dấu 3 chấm góc phải trên cùng &gt; <strong>Cài đặt (Settings)</strong>.</p>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3">
              <div className="font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-[10px] flex items-center justify-center text-white">2</span>
                Tìm mục Tải về (Downloads)
              </div>
              <p className="pl-7">Tìm từ khóa "Tải về" hoặc "Downloads" trong thanh tìm kiếm cài đặt.</p>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 border border-blue-500/20 flex flex-col gap-3">
              <div className="font-bold text-blue-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-[10px] flex items-center justify-center text-white">3</span>
                Bật "Hỏi vị trí lưu tệp"
              </div>
              <p className="pl-7">Gạt nút <strong>"Hỏi vị trí lưu từng tệp trước khi tải về"</strong> (Ask where to save each file before downloading) sang màu xanh.</p>
            </div>
            
            <p className="text-[11px] italic text-white/30 text-center">Sau khi bật, mỗi khi bạn nhấn tải tệp, máy tính sẽ hiện cửa sổ chọn thư mục cho bạn.</p>
          </div>

          <PillButton variant="primary" onClick={onClose} className="w-full !h-[48px]">Tôi đã hiểu</PillButton>
        </div>
      </div>
    </div>
  );
};

// --- Main Components ---

interface Scene {
  id: string;
  name: string;
  prompt: string;
  model: string;
  imageInput?: { mediaId: string; base64: string; mimeType: string } | null;
  videoResult: { base64: string; mimeType: string; mediaId?: string } | null;
  status: 'idle' | 'generating' | 'done' | 'error' | 'processing';
  errorMsg?: string;
}

const SceneCard: React.FC<{
  scene: Scene;
  quality: '720p' | '1080p';
  aspectRatio: '9:16' | '16:9';
  onUpdate: (id: string, updates: Partial<Scene>) => void;
  onDelete: (id: string) => void;
  isBatchRunning: boolean;
}> = ({ scene, quality, aspectRatio, onUpdate, onDelete, isBatchRunning }) => {
  const handleSelectImage = async () => {
    try {
      const media = await Flow.media.select({ filter: 'image' });
      const processed = await processImageToRatio(media.base64, media.mimeType, aspectRatio);
      const upload = await Flow.upload({
        base64: processed.base64,
        mimeType: processed.mimeType,
        name: `Scene Start Frame ${scene.name}`
      });
      onUpdate(scene.id, { 
        imageInput: { 
          mediaId: upload.mediaId, 
          base64: processed.base64, 
          mimeType: processed.mimeType 
        } 
      });
    } catch (e) {
      console.error('Image selection failed', e);
    }
  };

  const handleGenerate = async () => {
    if (!scene.prompt) return;
    
    onUpdate(scene.id, { status: 'generating', errorMsg: undefined });
    try {
      const result = await Flow.generate.video({
        prompt: scene.prompt,
        modelDisplayName: scene.model,
        aspectRatio: aspectRatio,
        firstFrameImageMediaId: scene.imageInput?.mediaId,
        durationSeconds: scene.model === 'Omni Flash' ? 10 : 8
      });
      onUpdate(scene.id, {
        videoResult: { base64: result.base64, mimeType: result.mimeType, mediaId: result.mediaId },
        status: 'done'
      });
    } catch (e: any) {
      console.error(e);
      let msg = "Lỗi hệ thống";
      if (e.message?.includes("UNSAFE") || e.code?.includes("UNSAFE")) {
        msg = "Nội dung bị chặn bởi quy tắc an toàn. Hãy thay đổi mô tả hoặc ảnh đầu vào.";
      }
      onUpdate(scene.id, { status: 'error', errorMsg: msg });
    }
  };

  const handleDownload = async () => {
    if (!scene.videoResult) return;
    
    const originalStatus = scene.status;
    onUpdate(scene.id, { status: 'processing' });
    
    try {
      const base64ToDownload = await upscaleVideo(scene.videoResult.base64, quality, aspectRatio);
      const filename = sanitizeFilename(scene.name, 0);
      const { w, h } = getDimensions(aspectRatio, quality);
      
      await Flow.download({
        base64: base64ToDownload,
        mimeType: scene.videoResult.mimeType,
        filename: `${filename}_${w}x${h}.mp4`
      });
    } catch (err) {
      console.error('Download error', err);
    } finally {
      onUpdate(scene.id, { status: originalStatus });
    }
  };

  return (
    <div className={`group w-full bg-[#1a1a1a]/60 border rounded-2xl overflow-hidden flex flex-col md:flex-row transition-all duration-300 ${(scene.status === 'generating' || scene.status === 'processing') ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-white/5 hover:border-white/10'}`}>
      <div className={`w-full md:w-[200px] lg:w-[240px] bg-black/40 flex items-center justify-center relative flex-shrink-0 md:aspect-auto border-r border-white/5 overflow-hidden ${aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/9]'}`}>
        {scene.status === 'done' && scene.videoResult ? (
          <video 
            src={`data:${scene.videoResult.mimeType};base64,${scene.videoResult.base64}`} 
            controls 
            className="w-full h-full object-cover"
          />
        ) : scene.imageInput ? (
          <img 
            src={`data:${scene.imageInput.mimeType};base64,${scene.imageInput.base64}`} 
            className="w-full h-full object-cover opacity-60"
            alt="Input"
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/5 p-6 text-center">
            <span className="material-symbols-outlined text-[56px] leading-none">
              {scene.status === 'error' ? 'report' : 'movie_filter'}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[2px] font-black opacity-40">
                {scene.status === 'idle' ? 'Chưa có video' : scene.status === 'error' ? 'Thất bại' : 'Đang xử lý'}
              </span>
            </div>
          </div>
        )}

        {(scene.status === 'generating' || scene.status === 'processing') && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-2 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest animate-pulse text-center px-4">
              {scene.status === 'processing' ? 'Đang nâng cấp...' : 'Đang sáng tạo...'}
            </span>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col gap-2">
            <button 
              onClick={handleSelectImage}
              disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-all shadow-lg"
              title="Thêm ảnh làm mốc bắt đầu (I2V)"
            >
              <span className="material-symbols-outlined text-[20px]">{scene.imageInput ? 'sync' : 'add_photo_alternate'}</span>
            </button>
            {scene.imageInput && (
              <button 
                onClick={() => onUpdate(scene.id, { imageInput: null })}
                disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
                className="w-10 h-10 rounded-full bg-red-500/20 backdrop-blur-md border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/40 transition-all shadow-lg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            )}
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col flex-1 gap-1">
            <input 
              value={scene.name} 
              onChange={(e) => onUpdate(scene.id, { name: e.target.value })}
              placeholder="Tên phân đoạn..."
              className="bg-transparent border-none p-0 m-0 text-white font-bold text-[18px] outline-none placeholder:text-white/10 w-full"
              disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
            />
            <div className="flex items-center gap-2">
               <span className={`w-1.5 h-1.5 rounded-full ${scene.status === 'done' ? 'bg-green-500' : 'bg-blue-500'} shadow-[0_0_8px_rgba(59,130,246,0.5)]`} />
               <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                 {scene.imageInput ? 'Image-to-Video Workflow' : 'Text-to-Video Workflow'}
               </span>
            </div>
          </div>
          <button 
            onClick={() => onDelete(scene.id)} 
            disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all duration-200 disabled:opacity-0"
          >
            <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Scene Configuration</SectionLabel>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            <FieldDropdown 
              value={scene.model} 
              options={VIDEO_MODELS} 
              onChange={(val) => onUpdate(scene.id, { model: val })}
              disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
            />
            
            <textarea 
              value={scene.prompt}
              onChange={(e) => onUpdate(scene.id, { prompt: e.target.value })}
              placeholder="Mô tả nội dung cho phân đoạn này... (Gợi ý: cinematic, highly detailed, 4k)"
              className="w-full h-[90px] bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white/90 outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all resize-none dark-scrollbar placeholder:text-white/10 leading-relaxed"
              disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning}
            />
          </div>
        </div>

        {scene.errorMsg && (
          <div className="flex items-start gap-3 px-4 py-3 bg-red-500/5 border border-red-500/10 rounded-xl text-red-400 text-[12px] animate-dropdown leading-tight">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{scene.errorMsg}</span>
          </div>
        )}

        <div className="mt-auto pt-2 flex items-center gap-3">
          <PillButton 
            variant="solid" 
            className="flex-1 !h-[42px] !rounded-2xl"
            icon={<span className="material-symbols-outlined text-[20px]">{scene.status === 'done' ? 'history' : 'rocket_launch'}</span>}
            onClick={handleGenerate}
            disabled={scene.status === 'generating' || scene.status === 'processing' || isBatchRunning || !scene.prompt}
          >
            {scene.status === 'done' ? 'Tạo lại phân đoạn' : 'Tạo phân đoạn này'}
          </PillButton>
          {scene.status === 'done' && (
            <PillButton 
              variant="outline" 
              className="!h-[42px] !rounded-2xl"
              icon={<span className="material-symbols-outlined text-[20px]">download</span>}
              onClick={handleDownload}
              disabled={scene.status === 'processing'}
            >
              {scene.status === 'processing' ? 'Đang HD...' : 'Tải HD'}
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL_VALUE);
  const [quality, setQuality] = useState<'720p' | '1080p'>('1080p');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isFFmpegReady, setIsFFmpegReady] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<'idle' | 'loading' | 'merging' | 'done' | 'error'>('idle');
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'running' | 'done' | 'zipping'>('idle');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [mergeError, setMergeError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopRequestedRef = useRef(false);
  const scenesRef = useRef<Scene[]>([]);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    const initialScenes: Scene[] = Array.from({ length: INITIAL_SCENE_COUNT }).map((_, i) => ({
      id: String(Date.now() + i),
      name: `Scene ${String(i + 1).padStart(2, '0')}`,
      prompt: '',
      model: DEFAULT_MODEL_VALUE,
      videoResult: null,
      status: 'idle'
    }));
    setScenes(initialScenes);
  }, []);

  useEffect(() => {
    const id = 'vutru-independent-css';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .dark-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
      .dark-scrollbar::-webkit-scrollbar { width: 5px; }
      .dark-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .dark-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
      @keyframes dropdown-enter { from { opacity: 0; transform: scale(0.98) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      .animate-dropdown { animation: dropdown-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    `;
    document.head.appendChild(style);
  }, []);

  const addScene = useCallback(() => {
    const newId = String(Date.now());
    const nextNum = String(scenes.length + 1).padStart(2, '0');
    setScenes(prev => [...prev, {
      id: newId,
      name: `Scene ${nextNum}`,
      prompt: '',
      model: defaultModel,
      videoResult: null,
      status: 'idle'
    }]);
  }, [scenes.length, defaultModel]);

  const updateScene = useCallback((id: string, updates: Partial<Scene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deleteScene = useCallback((id: string) => {
    setScenes(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(s => s.id !== id);
    });
  }, []);

  const clearAllScenes = useCallback(() => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tất cả phân đoạn?")) {
      setScenes([{
        id: String(Date.now()),
        name: 'Scene 01',
        prompt: '',
        model: defaultModel,
        videoResult: null,
        status: 'idle'
      }]);
    }
  }, [defaultModel]);

  const handleBatchGenerate = async () => {
    setBatchStatus('running');
    stopRequestedRef.current = false;

    try {
      const targetScenes = scenesRef.current.filter(s => 
        s.prompt && (s.status === 'idle' || s.status === 'error')
      );
      
      if (targetScenes.length === 0) return;

      setProgress({ current: 0, total: targetScenes.length });
      
      let completedCount = 0;

      // XỬ LÝ THEO CỤM 5 CẢNH (BATCH SIZE = 5)
      // Hệ thống sẽ chạy 5 cảnh đồng thời, đợi cả 5 xong rồi mới sang 5 cảnh kế tiếp
      for (let i = 0; i < targetScenes.length; i += BATCH_SIZE) {
        if (stopRequestedRef.current) break;

        const batch = targetScenes.slice(i, i + BATCH_SIZE);
        
        // Gửi yêu cầu cho toàn bộ các cảnh trong cụm (batch)
        await Promise.allSettled(batch.map(async (scene) => {
          if (stopRequestedRef.current) return;

          updateScene(scene.id, { status: 'generating', errorMsg: undefined });
          
          try {
            const result = await Flow.generate.video({
              prompt: scene.prompt,
              modelDisplayName: scene.model,
              aspectRatio: aspectRatio,
              firstFrameImageMediaId: scene.imageInput?.mediaId,
              durationSeconds: scene.model === 'Omni Flash' ? 10 : 8
            });
            
            updateScene(scene.id, {
              videoResult: { base64: result.base64, mimeType: result.mimeType, mediaId: result.mediaId },
              status: 'done'
            });
          } catch (e: any) {
            console.error(`Generation error for ${scene.name}:`, e);
            let msg = "Lỗi tạo video";
            if (e.message?.includes("UNSAFE") || e.code?.includes("UNSAFE")) {
              msg = "Chặn do an toàn (Safety Block)";
            }
            updateScene(scene.id, { status: 'error', errorMsg: msg });
          } finally {
            completedCount++;
            setProgress(prev => ({ ...prev, current: completedCount }));
          }
        }));

        // Nghỉ một chút giữa các đợt 5 cảnh để tránh quá tải hệ thống
        if (i + BATCH_SIZE < targetScenes.length && !stopRequestedRef.current) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (fatalError) {
      console.error("Batch Execution Error:", fatalError);
    } finally {
      setBatchStatus('idle');
      stopRequestedRef.current = false;
    }
  };

  const handleStopBatch = () => {
    stopRequestedRef.current = true;
    setBatchStatus('idle');
  };

  const handleDownloadAll = async () => {
    const readyScenes = scenes.filter(s => s.status === 'done' && s.videoResult);
    if (readyScenes.length === 0) return;

    setDownloadStatus('running');
    setProgress({ current: 0, total: readyScenes.length });

    for (let i = 0; i < readyScenes.length; i++) {
      const scene = readyScenes[i];
      const filename = sanitizeFilename(scene.name, i);
      const { w, h } = getDimensions(aspectRatio, quality);
      
      const base64ToDownload = await upscaleVideo(scene.videoResult!.base64, quality, aspectRatio);

      await Flow.download({
        base64: base64ToDownload,
        mimeType: scene.videoResult!.mimeType,
        filename: `${filename}_${w}x${h}.mp4`
      });

      setProgress(prev => ({ ...prev, current: i + 1 }));
      await new Promise(r => setTimeout(r, 800));
    }

    setDownloadStatus('done');
    setTimeout(() => setDownloadStatus('idle'), 3000);
  };

  const handleDownloadZip = async () => {
    const readyScenes = scenes.filter(s => s.status === 'done' && s.videoResult);
    if (readyScenes.length === 0) return;

    setDownloadStatus('zipping');
    setProgress({ current: 0, total: readyScenes.length });

    const zip = new JSZip();
    const folder = zip.folder(`vutru_scenes_${quality}_${aspectRatio.replace(':', 'x')}`);

    for (let i = 0; i < readyScenes.length; i++) {
      const scene = readyScenes[i];
      const filename = sanitizeFilename(scene.name, i);
      const base64ToZip = await upscaleVideo(scene.videoResult!.base64, quality, aspectRatio);
      
      folder?.file(`${filename}.mp4`, base64ToZip, { base64: true });
      setProgress(prev => ({ ...prev, current: i + 1 }));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      await Flow.download({
        base64,
        mimeType: 'application/zip',
        filename: `vutru_bundle_${quality}_${aspectRatio.replace(':', 'x')}.zip`
      });
      setDownloadStatus('done');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    };
    reader.readAsDataURL(content);
  };

  const handleMergeAll = async () => {
    const readyScenes = scenes.filter(s => s.status === 'done' && s.videoResult);
    if (readyScenes.length === 0) return;

    setMergeStatus('loading');
    setMergeError(null);

    try {
      if (!ffmpegService.isLoaded()) {
        await ffmpegService.load();
        setIsFFmpegReady(true);
      }

      setMergeStatus('merging');
      
      const fileNames: string[] = [];
      for (let i = 0; i < readyScenes.length; i++) {
        const fileName = `clip_${i}.mp4`;
        fileNames.push(fileName);
        const bytes = Uint8Array.from(atob(readyScenes[i].videoResult!.base64), c => c.charCodeAt(0));
        await ffmpegService.writeFile(fileName, bytes);
      }

      const inputArgs: string[] = [];
      fileNames.forEach(name => inputArgs.push('-i', name));
      
      const filterInputs = fileNames.map((_, i) => `[${i}:v][${i}:a]`).join('');
      const filterComplex = `${filterInputs}concat=n=${fileNames.length}:v=1:a=1[outv][outa]`;

      const { w, h } = getDimensions(aspectRatio, quality);
      const scaleStr = `${w}:${h}`;

      await ffmpegService.exec([
        ...inputArgs,
        '-filter_complex', `${filterComplex};[outv]scale=${scaleStr}:force_original_aspect_ratio=decrease,pad=${scaleStr}:(ow-iw)/2:(oh-ih)/2[vscaled]`,
        '-map', '[vscaled]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-movflags', 'faststart',
        '-y', 'master_output.mp4',
      ]);

      const data = await ffmpegService.readFile('master_output.mp4') as Uint8Array;
      const base64 = btoa(Array.from(data).map(b => String.fromCharCode(b)).join(''));
      
      await Flow.download({
        base64,
        mimeType: 'video/mp4',
        filename: `vutru_master_${w}x${h}.mp4`
      });

      for (const name of fileNames) await ffmpegService.deleteFile(name);
      await ffmpegService.deleteFile('master_output.mp4');
      
      setMergeStatus('done');
      setTimeout(() => setMergeStatus('idle'), 3000);
    } catch (err: any) {
      setMergeStatus('error');
      setMergeError(err.message || 'Ghép nối thất bại');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const rawPrompts = (Array.isArray(json) ? json : (json.prompts || json.scenes || json.data || []));
        
        if (rawPrompts.length === 0) {
          alert("Không tìm thấy danh sách phân đoạn trong file JSON.");
          return;
        }

        const newScenes: Scene[] = rawPrompts.map((p: any, index: number) => {
          const prompt = p.veo_prompt || p.prompt || p.text || p.content || p.description || p.mô_tả || p.prompt_text || '';
          const sceneVal = p.scene ?? p.name ?? p.title ?? p.tên ?? String(index + 1).padStart(2, '0');
          let name = String(sceneVal);
          if (!name.toLowerCase().startsWith('scene')) {
            name = `Scene ${name}`;
          }
          const model = p.model || defaultModel;
          return {
            id: String(Date.now() + index),
            name,
            prompt,
            model,
            videoResult: null,
            status: 'idle'
          };
        });

        setScenes(newScenes);
        setImportStatus(`Đã nhập thành công ${newScenes.length} phân đoạn.`);
        setTimeout(() => setImportStatus(null), 5000);
      } catch (err) { 
        alert("Lỗi đọc tệp JSON. Hãy đảm bảo file của bạn đúng định dạng JSON chuẩn."); 
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const unfinishedCount = scenes.filter(s => s.prompt && s.status !== 'done').length;
  const errorCount = scenes.filter(s => s.status === 'error').length;

  return (
    <div className="flex h-screen w-screen bg-[#080808] text-white/90 overflow-hidden font-sans selection:bg-white/10 selection:text-white">
      <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json" className="hidden" />
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      <aside className="w-[340px] border-r border-white/5 flex flex-col p-5 gap-6 bg-[#0c0c0c]/80 backdrop-blur-xl shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
              <span className="text-[10px] font-black uppercase tracking-[2.5px] text-white/40">Studio Control</span>
            </div>
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{scenes.length} PHÂN ĐOẠN</span>
          </div>

          <div className="flex flex-col gap-3">
             <SectionLabel>Tỉ lệ khung hình</SectionLabel>
             <SegmentedToggle 
                value={aspectRatio} 
                items={ASPECT_RATIOS} 
                onChange={setAspectRatio}
                disabled={batchStatus === 'running'}
             />

             <SectionLabel>Cài đặt Studio</SectionLabel>
             <FieldDropdown 
                label="Chất lượng xuất tập tin" 
                value={quality} 
                options={QUALITY_OPTIONS} 
                onChange={(v) => setQuality(v as any)} 
             />
             <FieldDropdown 
                label="Model mặc định cho scene mới" 
                value={defaultModel} 
                options={VIDEO_MODELS} 
                onChange={setDefaultModel} 
                disabled={batchStatus === 'running'}
             />
             <div className="grid grid-cols-2 gap-2">
               <PillButton variant="outline" icon={<span className="material-symbols-outlined text-[18px]">file_upload</span>} onClick={() => fileInputRef.current?.click()} className="!h-[44px] !rounded-xl">Nhập JSON</PillButton>
               <PillButton variant="outline" icon={<span className="material-symbols-outlined text-[18px]">add_box</span>} onClick={addScene} className="!h-[44px] !rounded-xl">Thêm mới</PillButton>
               <PillButton variant="danger" icon={<span className="material-symbols-outlined text-[18px]">delete_sweep</span>} onClick={clearAllScenes} className="col-span-2 !h-[40px] !rounded-xl opacity-60 hover:opacity-100">Xóa tất cả phân đoạn</PillButton>
             </div>
          </div>
        </div>

        {importStatus && (
          <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-[11px] animate-dropdown flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            {importStatus}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Vị trí lưu tệp</span>
              <button onClick={() => setIsGuideOpen(true)} className="text-[10px] text-white/40 hover:text-white underline font-bold">Cần giúp?</button>
            </div>
            <p className="text-[10px] text-white/30 leading-relaxed italic">
              Để chọn thư mục tải về, hãy bật "Hỏi vị trí lưu từng tệp" trong cài đặt trình duyệt.
            </p>
            <PillButton variant="info" icon={<span className="material-symbols-outlined text-[16px]">settings</span>} onClick={() => setIsGuideOpen(true)} className="!h-[28px] !rounded-lg text-[9px]">Xem hướng dẫn cài đặt</PillButton>
          </div>

          {(batchStatus === 'running' || downloadStatus === 'running' || downloadStatus === 'zipping') && (
            <div className="px-2 py-1">
              <div className="flex items-center justify-between text-[10px] text-white/40 font-bold mb-1.5 uppercase tracking-wider">
                <span className="flex items-center gap-2">
                  {batchStatus === 'running' ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                      Đang tạo theo đợt 5 cảnh...
                    </>
                  ) : downloadStatus === 'zipping' ? 'Đang xử lý/Nén...' : 'Đang xử lý tải xuống...'}
                </span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {batchStatus === 'running' ? (
              <PillButton 
                variant="danger" 
                icon={<span className="material-symbols-outlined text-[20px]">stop_circle</span>}
                onClick={handleStopBatch}
                className="!h-[52px] !rounded-xl"
              >
                Dừng tiến trình
              </PillButton>
            ) : (
              <PillButton 
                variant="primary" 
                icon={<span className="material-symbols-outlined text-[20px]">rocket_launch</span>}
                onClick={handleBatchGenerate}
                disabled={unfinishedCount === 0}
                className="!h-[52px] !rounded-xl shadow-lg shadow-blue-500/20"
              >
                {errorCount > 0 ? `Thử lại & Chạy đợt 5 cảnh (${unfinishedCount})` : `Chạy đợt 5 cảnh (${unfinishedCount})`}
              </PillButton>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <PillButton 
              variant={downloadStatus === 'zipping' ? 'primary' : 'outline'} 
              icon={<span className="material-symbols-outlined text-[20px]">{downloadStatus === 'zipping' ? 'inventory_2' : 'folder_zip'}</span>}
              onClick={handleDownloadZip}
              disabled={downloadStatus !== 'idle' || !scenes.some(s => s.status === 'done')}
              className="!h-[48px] !rounded-xl"
            >
              {downloadStatus === 'zipping' ? 'Đang nén...' : 'ZIP Bundle'}
            </PillButton>
            <PillButton 
              variant="outline" 
              icon={<span className="material-symbols-outlined text-[20px]">download</span>}
              onClick={handleDownloadAll}
              disabled={downloadStatus !== 'idle' || !scenes.some(s => s.status === 'done') || batchStatus === 'running'}
              className="!h-[48px] !rounded-xl"
            >
              {downloadStatus === 'running' ? 'Đang tải...' : 'Tải lẻ file'}
            </PillButton>
          </div>

          <div className="pt-4 mt-1 border-t border-white/5">
            <PillButton 
              variant="solid" 
              icon={<span className="material-symbols-outlined text-[20px]">{mergeStatus === 'merging' ? 'autorenew' : 'movie_edit'}</span>}
              onClick={handleMergeAll}
              disabled={!scenes.some(s => s.status === 'done') || mergeStatus === 'merging' || mergeStatus === 'loading' || batchStatus === 'running'}
              className={`!h-[56px] !rounded-2xl shadow-2xl shadow-blue-500/10 ${mergeStatus === 'merging' ? 'animate-pulse' : ''}`}
            >
              {mergeStatus === 'idle' ? 'Ghép nối & Xuất Master' : 
               mergeStatus === 'loading' ? 'Đang tải Core...' :
               mergeStatus === 'merging' ? 'Đang xử lý Master...' :
               mergeStatus === 'done' ? 'Xuất thành công ✓' : 'Lỗi Render'}
            </PillButton>
            {mergeError && <p className="text-[10px] text-red-500 font-bold mt-2 text-center px-2">{mergeError}</p>}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto dark-scrollbar bg-gradient-to-br from-[#080808] to-[#0c0c0c]">
        <div className="max-w-[1000px] mx-auto px-6 py-12 lg:px-12 flex flex-col gap-10">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
               <h1 className="text-4xl font-black tracking-[-1.5px] text-white">Vũ Trụ</h1>
               <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase">v4.3 - Batch 5 Mode</span>
            </div>
            <p className="text-white/30 text-sm max-w-md font-medium">Hệ thống tạo video đã được đổi lại chạy theo cụm 5 cảnh. Khi xong 5 cảnh này mới tự động chuyển sang 5 cảnh tiếp theo.</p>
          </header>

          <div className="flex flex-col gap-6">
            {scenes.map((scene) => (
              <SceneCard 
                key={scene.id} 
                scene={scene} 
                quality={quality}
                aspectRatio={aspectRatio}
                onUpdate={updateScene}
                onDelete={deleteScene}
                isBatchRunning={batchStatus === 'running'}
              />
            ))}
          </div>

          <div className="flex justify-center pb-20">
            <button 
              onClick={addScene}
              disabled={batchStatus === 'running'}
              className="group relative flex flex-col items-center gap-4 p-12 border border-dashed border-white/10 hover:border-white/20 rounded-[32px] transition-all duration-300 w-full max-w-[500px] bg-white/[0.01] hover:bg-white/[0.02] disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 group-hover:rotate-90 transition-all duration-500 shadow-2xl">
                <span className="material-symbols-outlined text-white/20 group-hover:text-white text-[28px]">add</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[12px] font-black uppercase tracking-[3px] text-white/20 group-hover:text-white transition-colors">Thêm phân đoạn mới</span>
                <span className="text-[10px] font-medium text-white/10">Bắt đầu một cảnh phim mới cho dự án của bạn</span>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}