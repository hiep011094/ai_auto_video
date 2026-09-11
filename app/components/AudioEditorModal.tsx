'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';

interface AudioEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: string;
  type: string;
  filename: string;
  onSaved: () => void;
}

export default function AudioEditorModal({
  isOpen,
  onClose,
  folder,
  type,
  filename,
  onSaved
}: AudioEditorModalProps) {
  const toast = useToast();
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<any>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  // States
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(10);
  const [speed, setSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  
  // Selection States
  const [startTime, setStartTime] = useState<string>('0.00');
  const [endTime, setEndTime] = useState<string>('0.00');
  
  // History States for Undo/Redo
  const [history, setHistory] = useState<AudioBuffer[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Initialize AudioContext
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioCtx.current) {
        audioCtx.current.close();
      }
    };
  }, []);

  // Initialize WaveSurfer and Load File
  useEffect(() => {
    if (!isOpen || !folder || !filename) return;

    let ws: any = null;

    const loadAudioAndInit = async () => {
      try {
        setIsProcessing(true);
        // 1. Fetch File
        const audioUrl = `/api/audio-file?folder=${encodeURIComponent(folder)}&type=${type}&filename=${filename}&t=${Date.now()}`;
        const resp = await fetch(audioUrl);
        if (!resp.ok) {
          throw new Error('Không thể tải tệp âm thanh');
        }
        const arrayBuffer = await resp.arrayBuffer();

        // 2. Decode File
        if (!audioCtx.current) {
          audioCtx.current = new AudioContext();
        }
        const decodedBuffer = await audioCtx.current.decodeAudioData(arrayBuffer);
        
        // Save initial state to history
        setAudioBuffer(decodedBuffer);
        setDuration(decodedBuffer.duration);
        setStartTime('0.00');
        setEndTime(decodedBuffer.duration.toFixed(2));
        setHistory([decodedBuffer]);
        setHistoryIndex(0);

        // 3. Initialize WaveSurfer
        const WaveSurfer = (await import('wavesurfer.js')).default;
        
        if (waveformRef.current) {
          waveformRef.current.innerHTML = ''; // Clear container
          ws = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: '#a78bfa',
            progressColor: '#7c3aed',
            cursorColor: '#f43f5e',
            barWidth: 2,
            height: 120,
            cursorWidth: 2,
            minPxPerSec: zoom,
          });

          wavesurfer.current = ws;

          // Load audio buffer into wavesurfer
          ws.loadDecodedBuffer(decodedBuffer);

          ws.on('play', () => setIsPlaying(true));
          ws.on('pause', () => setIsPlaying(false));
          
          ws.on('click', () => {
            const time = ws.getCurrentTime();
            // Automatically set selection if user double clicks or sets start/end
          });
        }
        setIsProcessing(false);
      } catch (err: any) {
        console.error('Audio load error:', err);
        toast.error(`Lỗi khi mở trình chỉnh sửa: ${err.message}`);
        setIsProcessing(false);
        onClose();
      }
    };

    loadAudioAndInit();

    return () => {
      if (ws) {
        ws.destroy();
      }
    };
  }, [isOpen, folder, filename]);

  // Update Wavesurfer Zoom
  useEffect(() => {
    if (wavesurfer.current) {
      wavesurfer.current.zoom(Number(zoom));
    }
  }, [zoom]);

  // Playback Controls
  const togglePlay = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  const stopAudio = () => {
    if (wavesurfer.current) {
      wavesurfer.current.stop();
      setIsPlaying(false);
    }
  };

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (wavesurfer.current) {
      wavesurfer.current.setPlaybackRate(newSpeed);
    }
  };

  const changeVolume = (newVol: number) => {
    setVolume(newVol);
    if (wavesurfer.current) {
      wavesurfer.current.setVolume(newVol);
    }
  };

  const setSelectionStart = () => {
    if (wavesurfer.current) {
      const time = wavesurfer.current.getCurrentTime();
      setStartTime(time.toFixed(2));
      toast.success(`Đã đặt điểm đầu tại ${time.toFixed(2)}s`);
    }
  };

  const setSelectionEnd = () => {
    if (wavesurfer.current) {
      const time = wavesurfer.current.getCurrentTime();
      if (time > Number(startTime)) {
        setEndTime(time.toFixed(2));
        toast.success(`Đã đặt điểm cuối tại ${time.toFixed(2)}s`);
      } else {
        toast.error('Điểm cuối phải lớn hơn điểm đầu!');
      }
    }
  };

  // Push new buffer to history stack
  const pushToHistory = (newBuffer: AudioBuffer) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(newBuffer);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    setAudioBuffer(newBuffer);
    setDuration(newBuffer.duration);
    
    // Reload in wavesurfer
    if (wavesurfer.current) {
      wavesurfer.current.loadDecodedBuffer(newBuffer);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevBuffer = history[prevIndex];
      setAudioBuffer(prevBuffer);
      setDuration(prevBuffer.duration);
      if (wavesurfer.current) {
        wavesurfer.current.loadDecodedBuffer(prevBuffer);
      }
      toast.success('Đã hoàn tác (Undo)');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextBuffer = history[nextIndex];
      setAudioBuffer(nextBuffer);
      setDuration(nextBuffer.duration);
      if (wavesurfer.current) {
        wavesurfer.current.loadDecodedBuffer(nextBuffer);
      }
      toast.success('Đã làm lại (Redo)');
    }
  };

  // 1. Cắt đoạn chọn (Crop - Keep only selection)
  const handleCrop = () => {
    if (!audioBuffer || !audioCtx.current) return;
    const start = Number(startTime);
    const end = Number(endTime);
    if (start >= end) {
      toast.error('Vui lòng chọn vùng hợp lệ bằng điểm đầu & điểm cuối!');
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const frameCount = endSample - startSample;

    if (frameCount <= 0) return;

    const newBuffer = audioCtx.current.createBuffer(channels, frameCount, sampleRate);
    
    for (let c = 0; c < channels; c++) {
      const origData = audioBuffer.getChannelData(c);
      const newData = newBuffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) {
        newData[i] = origData[startSample + i];
      }
    }

    pushToHistory(newBuffer);
    setStartTime('0.00');
    setEndTime(newBuffer.duration.toFixed(2));
    toast.success('Đã cắt và giữ lại đoạn được chọn!');
  };

  // 2. Xóa đoạn chọn (Cut - Delete selected region)
  const handleCut = () => {
    if (!audioBuffer || !audioCtx.current) return;
    const start = Number(startTime);
    const end = Number(endTime);
    if (start >= end) {
      toast.error('Vui lòng chọn vùng hợp lệ để xóa!');
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    
    const part1Length = startSample;
    const part2Length = audioBuffer.length - endSample;
    const totalLength = part1Length + part2Length;

    if (totalLength <= 0) {
      toast.error('Không thể xóa toàn bộ âm thanh!');
      return;
    }

    const newBuffer = audioCtx.current.createBuffer(channels, totalLength, sampleRate);

    for (let c = 0; c < channels; c++) {
      const origData = audioBuffer.getChannelData(c);
      const newData = newBuffer.getChannelData(c);
      
      // Copy Part 1
      for (let i = 0; i < part1Length; i++) {
        newData[i] = origData[i];
      }
      // Copy Part 2
      for (let i = 0; i < part2Length; i++) {
        newData[part1Length + i] = origData[endSample + i];
      }
    }

    pushToHistory(newBuffer);
    setStartTime('0.00');
    setEndTime(newBuffer.duration.toFixed(2));
    toast.success('Đã xóa bỏ đoạn được chọn!');
  };

  // 3. Khuyếch đại âm lượng (Gain Adjustment)
  const handleApplyGain = (gainFactor: number) => {
    if (!audioBuffer || !audioCtx.current) return;
    const start = Number(startTime);
    const end = Number(endTime);
    
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);

    // Create duplicate buffer
    const newBuffer = audioCtx.current.createBuffer(channels, audioBuffer.length, sampleRate);

    for (let c = 0; c < channels; c++) {
      const origData = audioBuffer.getChannelData(c);
      const newData = newBuffer.getChannelData(c);
      
      for (let i = 0; i < origData.length; i++) {
        if (i >= startSample && i <= endSample) {
          newData[i] = Math.max(-1.0, Math.min(1.0, origData[i] * gainFactor));
        } else {
          newData[i] = origData[i];
        }
      }
    }

    pushToHistory(newBuffer);
    toast.success(`Đã nhân âm lượng đoạn chọn lên ${gainFactor}x!`);
  };

  // 4. Fade In / Fade Out
  const handleFade = (type: 'in' | 'out') => {
    if (!audioBuffer || !audioCtx.current) return;
    const start = Number(startTime);
    const end = Number(endTime);
    if (start >= end) {
      toast.error('Vui lòng chọn vùng hiệu ứng!');
      return;
    }

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const durationSamples = endSample - startSample;

    const newBuffer = audioCtx.current.createBuffer(channels, audioBuffer.length, sampleRate);

    for (let c = 0; c < channels; c++) {
      const origData = audioBuffer.getChannelData(c);
      const newData = newBuffer.getChannelData(c);
      
      for (let i = 0; i < origData.length; i++) {
        if (i >= startSample && i <= endSample) {
          const progress = (i - startSample) / durationSamples;
          const factor = type === 'in' ? progress : (1 - progress);
          newData[i] = origData[i] * factor;
        } else {
          newData[i] = origData[i];
        }
      }
    }

    pushToHistory(newBuffer);
    toast.success(`Đã áp dụng hiệu ứng Fade ${type === 'in' ? 'In (Lớn dần)' : 'Out (Nhỏ dần)'}!`);
  };

  // 16-bit PCM WAV encoder
  const bufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // 1 = raw PCM
    const bitDepth = 16;
    
    let result;
    if (numOfChan === 2) {
      result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }
    
    const bufferArr = new ArrayBuffer(44 + result.length * 2);
    const view = new DataView(bufferArr);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + result.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM)
    view.setUint16(20, format, true);
    // channel count
    view.setUint16(22, numOfChan, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numOfChan * (bitDepth / 8), true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, result.length * 2, true);
    
    // write PCM data
    floatTo16BitPCM(view, 44, result);
    
    return bufferArr;
  };

  const interleave = (inputL: Float32Array, inputR: Float32Array): Float32Array => {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    
    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  };

  const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Save changes to backend
  const handleSave = async () => {
    if (!audioBuffer) return;
    setIsProcessing(true);

    try {
      // 1. Encode AudioBuffer to WAV ArrayBuffer
      const wavArrayBuffer = bufferToWav(audioBuffer);

      // 2. Upload to Server
      const uploadUrl = `/api/audio-file?folder=${encodeURIComponent(folder)}&type=${type}&filename=${filename}`;
      const resp = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
        },
        body: wavArrayBuffer,
      });

      if (resp.ok) {
        toast.success('Đã lưu các thay đổi âm thanh thành công!');
        onSaved();
        onClose();
      } else {
        const msg = await resp.text();
        throw new Error(msg || 'Lỗi lưu tệp âm thanh');
      }
    } catch (e: any) {
      console.error('Error saving audio:', e);
      toast.error(`Lỗi khi lưu: ${e.message}`);
    } finally {
      setIsProcessing(false);
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
        maxWidth: '850px',
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
              🎚️ Trình Chỉnh Sửa Sóng Âm Trực Quan
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
              Dự án: {folder} | File: {filename}
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

        {/* Workspace */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Waveform Visualization */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '12px',
            position: 'relative'
          }}>
            {isProcessing && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(30, 27, 75, 0.8)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: '8px',
                zIndex: 10
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="spinner" style={{ border: '4px solid rgba(255,255,255,0.1)', borderLeft: '4px solid #c084fc', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                  <div>Đang xử lý âm thanh thô...</div>
                </div>
              </div>
            )}
            <div ref={waveformRef} style={{ width: '100%' }} />
          </div>

          {/* Timeline and Region Selection Display */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>Tổng thời gian: <strong style={{ color: '#c084fc' }}>{duration.toFixed(2)}s</strong></div>
              <div>Vị trí hiện tại: <strong style={{ color: '#f43f5e' }}>{wavesurfer.current ? wavesurfer.current.getCurrentTime().toFixed(2) : '0.00'}s</strong></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>Vùng chọn:</span>
              <strong style={{ color: '#a78bfa' }}>{startTime}s</strong>
              <span>đến</span>
              <strong style={{ color: '#a78bfa' }}>{endTime}s</strong>
              <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>
                ({(Number(endTime) - Number(startTime)).toFixed(2)}s)
              </span>
            </div>
          </div>

          {/* Main Controls Panel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Left: Playback & Zoom Controls */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#a78bfa' }}>⚙️ Điều Khiển & Thu Phóng</h4>
              
              {/* Playback Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={togglePlay}
                  style={{
                    background: isPlaying ? '#ef4444' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    flex: 1
                  }}
                >
                  {isPlaying ? '⏸️ Tạm Dừng' : '▶️ Phát Thử'}
                </button>
                <button 
                  onClick={stopAudio}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ⏹️ Dừng
                </button>
              </div>

              {/* Range Markers Setting */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  onClick={setSelectionStart}
                  style={{
                    background: 'rgba(124, 58, 237, 0.2)',
                    color: '#c084fc',
                    border: '1px solid rgba(124, 58, 237, 0.4)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  🚩 Đặt điểm đầu
                </button>
                <button 
                  onClick={setSelectionEnd}
                  style={{
                    background: 'rgba(124, 58, 237, 0.2)',
                    color: '#c084fc',
                    border: '1px solid rgba(124, 58, 237, 0.4)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  🏁 Đặt điểm cuối
                </button>
              </div>

              {/* Speed & Volume sliders */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>Tốc độ phát:</span>
                  <strong>{speed}x</strong>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={speed}
                  onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                  style={{ accentColor: '#a78bfa' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                  <span>Thu phóng sóng âm (Zoom):</span>
                  <strong>{zoom}px/s</strong>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={zoom}
                  onChange={(e) => setZoom(parseInt(e.target.value))}
                  style={{ accentColor: '#a78bfa' }}
                />
              </div>
            </div>

            {/* Right: Audio FX & Trimming Actions */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#a78bfa' }}>✂️ Công Cụ Chỉnh Sửa</h4>

              {/* Trim/Cut Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handleCrop}
                  title="Giữ lại đoạn chọn, cắt bỏ mọi thứ ở ngoài"
                  style={{
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  ✂️ Giữ đoạn chọn
                </button>
                <button 
                  onClick={handleCut}
                  title="Xóa đoạn chọn, nối đoạn trước và đoạn sau lại"
                  style={{
                    background: '#ec4899',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  🗑️ Xóa đoạn chọn
                </button>
              </div>

              {/* Volume Gain adjustments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.8rem' }}>Điều chỉnh âm lượng đoạn chọn:</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    onClick={() => handleApplyGain(1.5)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', flex: 1, cursor: 'pointer' }}
                  >
                    🔊 +50% (1.5x)
                  </button>
                  <button 
                    onClick={() => handleApplyGain(1.2)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', flex: 1, cursor: 'pointer' }}
                  >
                    🔊 +20% (1.2x)
                  </button>
                  <button 
                    onClick={() => handleApplyGain(0.7)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', flex: 1, cursor: 'pointer' }}
                  >
                    🔉 -30% (0.7x)
                  </button>
                </div>
              </div>

              {/* Fade Effects */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.8rem' }}>Hiệu ứng Fade (Độ lớn tăng/giảm dần):</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => handleFade('in')}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      flex: 1
                    }}
                  >
                    📈 Fade In (Lớn dần)
                  </button>
                  <button 
                    onClick={() => handleFade('out')}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      flex: 1
                    }}
                  >
                    📉 Fade Out (Nhỏ dần)
                  </button>
                </div>
              </div>

              {/* Undo / Redo */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: historyIndex <= 0 ? 'rgba(255,255,255,0.2)' : 'white',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  ↩️ Hoàn tác
                </button>
                <button 
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: historyIndex >= history.length - 1 ? 'rgba(255,255,255,0.2)' : 'white',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    flex: 1
                  }}
                >
                  ↪️ Làm lại
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
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleSave}
            disabled={isProcessing || !audioBuffer}
            style={{
              background: '#c084fc',
              color: '#1e1b4b',
              border: 'none',
              fontWeight: '600',
              borderRadius: '6px',
              padding: '8px 24px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              opacity: (isProcessing || !audioBuffer) ? 0.5 : 1
            }}
          >
            {isProcessing ? 'Đang lưu...' : '💾 Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}
