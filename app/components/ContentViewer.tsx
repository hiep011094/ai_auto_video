'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useToast } from './Toast';
import AudioEditorModal from './AudioEditorModal';
import SettingsModal from './SettingsModal';
import FolderBrowser from './FolderBrowser';



import React, { memo } from 'react';

function parseInlineMarkdown(text: string) {
    const parts = text.split(/(\*{2}.*?\*{2}|`.*?`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} style={{ color: '#92400e' }}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={i} style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.82rem', fontFamily: 'monospace', color: '#92400e' }}>
                    {part.slice(1, -1)}
                </code>
            );
        }
        return part;
    });
}

// Memoized: only re-renders when markdown text changes (e.g. remediation plan edit)
const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
            elements.push(<div key={idx} style={{ height: '8px' }} />);
            return;
        }

        if (trimmed.startsWith('# ')) {
            elements.push(
                <h3 key={idx} style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#78350f', marginTop: '12px', marginBottom: '6px', borderBottom: '1px solid #fde68a', paddingBottom: '4px' }}>
                    {parseInlineMarkdown(trimmed.slice(2))}
                </h3>
            );
        } else if (trimmed.startsWith('## ')) {
            elements.push(
                <h4 key={idx} style={{ fontSize: '0.98rem', fontWeight: 'bold', color: '#92400e', marginTop: '10px', marginBottom: '4px' }}>
                    {parseInlineMarkdown(trimmed.slice(3))}
                </h4>
            );
        } else if (trimmed.startsWith('### ')) {
            elements.push(
                <h5 key={idx} style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#b45309', marginTop: '8px', marginBottom: '4px' }}>
                    {parseInlineMarkdown(trimmed.slice(4))}
                </h5>
            );
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            elements.push(
                <div key={idx} style={{ display: 'flex', gap: '6px', marginLeft: '12px', margin: '2px 0', fontSize: '0.88rem', color: '#78350f' }}>
                    <span>•</span>
                    <div>{parseInlineMarkdown(trimmed.slice(2))}</div>
                </div>
            );
        } else if (trimmed.startsWith('---')) {
            elements.push(
                <hr key={idx} style={{ border: 'none', borderTop: '1px solid #fde68a', margin: '12px 0' }} />
            );
        } else {
            elements.push(
                <p key={idx} style={{ margin: '4px 0', fontSize: '0.88rem', color: '#78350f', lineHeight: '1.5' }}>
                    {parseInlineMarkdown(trimmed)}
                </p>
            );
        }
    });

    return <div style={{ fontFamily: 'sans-serif' }}>{elements}</div>;
});

// ─── Memoized SceneCard ───────────────────────────────────────────────────────
// Prevents re-rendering scenes that haven't changed (e.g. audio state of one
// scene changes, others should NOT re-render).
interface SceneCardProps {
    scene: any;
    hasAudio: (f: string) => boolean;
    playingFile: string | null;
    onGenSaydiTTS: (opts: { scene: number }) => void;
    onPlay: (f: string) => void;
    onDelete: (f: string) => void;
    onCopy: (text: string) => void;
}
const SceneCard = memo(function SceneCard({
    scene,
    hasAudio,
    playingFile,
    onGenSaydiTTS,
    onPlay,
    onDelete,
    onCopy,
}: SceneCardProps) {
    const sceneNum = scene.scene;
    const hasSceneWav = hasAudio(`scene_${sceneNum}.wav`);
    const hasSceneMp3 = hasAudio(`scene_${sceneNum}.mp3`);
    const hasSceneAudio = hasSceneWav || hasSceneMp3;
    // Ưu tiên .wav (Saydi output) rồi mới .mp3 (Vbee/CapCut)
    const sceneAudioFile = hasSceneWav ? `scene_${sceneNum}.wav` : `scene_${sceneNum}.mp3`;
    const isPlaying = playingFile === `scene_${sceneNum}.wav` || playingFile === `scene_${sceneNum}.mp3`;

    return (
        <div style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--accent-color)', fontSize: '1.1rem' }}>Cảnh {sceneNum}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => onGenSaydiTTS({ scene: sceneNum })} className="btn" style={{ background: '#6366f1', color: 'white', padding: '4px 8px', fontSize: '0.75rem' }}>🎙️ Saydi</button>
                        {hasSceneAudio && (
                            <>
                                <button onClick={() => onPlay(sceneAudioFile)} className="btn" style={{ background: isPlaying ? '#ef4444' : '#f59e0b', color: 'white', padding: '4px 8px', fontSize: '0.75rem', border: 'none' }}>
                                    {isPlaying ? '⏸️ Tạm Dừng' : '▶️ Nghe Thử'}
                                </button>
                                <button onClick={() => onDelete(sceneAudioFile)} className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444', border: '1px solid #fecaca', background: '#fef2f2' }}>
                                    🗑️ Xóa
                                </button>
                            </>
                        )}
                        <button onClick={() => onCopy(scene.voiceover)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>📋 Copy</button>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '12px', fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>💬 Lời thoại:</span>
                <span style={{ color: 'var(--text-primary)' }}>{scene.voiceover}</span>
            </div>

            {scene.timeline && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '3px 8px', marginBottom: '10px', fontSize: '0.8rem', color: '#047857', fontWeight: '600' }}>
                    <span>⏱️ Timeline ({scene.timeline.speed}x):</span>
                    <span>{scene.timeline.start_formatted} → {scene.timeline.end_formatted}</span>
                    <span style={{ background: '#d1fae5', padding: '1px 5px', borderRadius: '4px', fontSize: '0.75rem' }}>{scene.timeline.duration}s</span>
                </div>
            )}

            {scene.main_ideas && (
                <div style={{ marginBottom: '12px', fontSize: '0.95rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500', display: 'block', marginBottom: '4px' }}>💡 Ý chính:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{scene.main_ideas}</span>
                </div>
            )}

            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #22c55e', border: '1px solid #dcfce7', borderLeftWidth: '4px' }}>
                <div style={{ color: '#166534', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>🎬 VEO Prompt:</div>
                <div style={{ fontSize: '0.9rem', color: '#14532d', fontFamily: 'monospace' }}>{scene.veo_prompt}</div>
            </div>
        </div>
    );
});

export default function ContentViewer({ type }: { type: 'short' | 'long' }) {
    const toast = useToast();
    const [history, setHistory] = useState<any[]>([]);
    const [contentLanguage, setContentLanguage] = useState<'vi' | 'en'>('vi');
    const contentLangRef = useRef<'vi' | 'en'>('vi');
    const setContentLanguageSync = (lang: 'vi' | 'en') => {
        contentLangRef.current = lang;
        setContentLanguage(lang);
    };

    const [selectedFolderVi, setSelectedFolderVi] = useState<string | null>(null);
    const [selectedFolderEn, setSelectedFolderEn] = useState<string | null>(null);
    const [contentVi, setContentVi] = useState<any>(null);
    const [contentEn, setContentEn] = useState<any>(null);

    // Badge: track unseen new items on the inactive language tab
    const [unseenEnCount, setUnseenEnCount] = useState(0);
    const [unseenViCount, setUnseenViCount] = useState(0);
    // Track the last-seen top folder per language (to detect new items)
    const lastSeenEnFolder = useRef<string | null>(null);
    const lastSeenViFolder = useRef<string | null>(null);

    const selectedFolder = contentLanguage === 'vi' ? selectedFolderVi : selectedFolderEn;
    const content = contentLanguage === 'vi' ? contentVi : contentEn;

    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editorFilename, setEditorFilename] = useState('');
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Accordion state
    const [openSections, setOpenSections] = useState({
        seo: true,
        scenes: true,
        combined: true
    });

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [driveFolders, setDriveFolders] = useState<{ id: string, name: string }[]>([]);
    const [selectedDriveFolderId, setSelectedDriveFolderId] = useState<string>('16opy1ZPxDFFSauAbkqctKUhx9N2Zrp8F');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // SEO Optimization states and handlers
    const [isOptimizingSeo, setIsOptimizingSeo] = useState(false);
    const [isDeletingSeo, setIsDeletingSeo] = useState(false);
    const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
    const [isGeneratingVeoPrompts, setIsGeneratingVeoPrompts] = useState(false);
    const [isMergingVeoPrompts, setIsMergingVeoPrompts] = useState(false);
    const [isGeneratingAudioSrt, setIsGeneratingAudioSrt] = useState(false);
    const [isGeneratingSceneSrt, setIsGeneratingSceneSrt] = useState(false);
    // keep legacy alias so any remaining refs don't break
    const isGeneratingSrt = isGeneratingAudioSrt || isGeneratingSceneSrt;

    // SRT QR modals — one per type
    type SrtQrModalState = {
        open: boolean;
        qrUrl: string;
        downloadUrl: string;
        lanUrl: string;
        segmentCount: number;
        isCloud: boolean;
        blobUrl: string | null;
        fileName: string;
        label: string; // 'AUDIO' | 'SCENE'
    };
    const [audioSrtQrModal, setAudioSrtQrModal] = useState<SrtQrModalState | null>(null);
    const [sceneSrtQrModal, setSceneSrtQrModal] = useState<SrtQrModalState | null>(null);
    // legacy alias so old setSrtQrModal calls in modal JSX still compile
    const srtQrModal = audioSrtQrModal ?? sceneSrtQrModal;
    const setSrtQrModal = (v: any) => { setAudioSrtQrModal(v); };

    // CapCut Audio Extract states
    const [isExtractingCapcutAudio, setIsExtractingCapcutAudio] = useState(false);
    const [isCapcutFolderBrowserOpen, setIsCapcutFolderBrowserOpen] = useState(false);
    const [capcutDefaultPath, setCapcutDefaultPath] = useState<string>('root');

    // CapCut Scene Audio (tảo audio cảnh) states
    const [isExtractingSceneAudio, setIsExtractingSceneAudio] = useState(false);
    const [isSceneAudioFolderBrowserOpen, setIsSceneAudioFolderBrowserOpen] = useState(false);
    const [sceneAudioDefaultPath, setSceneAudioDefaultPath] = useState<string>('root');

    // Audio Timeline Aligner state
    const [isAligningTimeline, setIsAligningTimeline] = useState(false);


    /**
     * Kiểm tra xem veo_prompts trong content có bị template bypass không.
     * Trả về true nếu phát hiện pattern: "aspect N", "element N", "step N",
     * "section N", "documentary scene N", "scientific documentary scene N",
     * "displaying [word] N".
     */
    const hasTemplateVeoPrompts = useCallback((projectContent: any): boolean => {
        if (!projectContent?.chapters) return false;
        const TEMPLATE_PATTERNS = [
            /\baspect\s+\d+\b/i,
            /\belement\s+\d+\b/i,
            /\bstep\s+\d+\b/i,
            /\bsection\s+\d+\b/i,
            /\bdocumentary scene\s+\d+\b/i,
            /\bscientific documentary scene\s+\d+\b/i,
            /\bdisplaying\s+\w+\s+\d+\b/i,
        ];
        let templateCount = 0;
        let totalScenes = 0;
        for (const ch of projectContent.chapters) {
            if (!Array.isArray(ch.data)) continue;
            for (const scene of ch.data) {
                totalScenes++;
                const mainIdea = (scene?.main_idea || scene?.main_ideas || '').toLowerCase();
                if (TEMPLATE_PATTERNS.some(p => p.test(mainIdea))) {
                    templateCount++;
                }
            }
        }
        // Coi là template nếu >20% số scenes bị detect
        return totalScenes > 0 && (templateCount / totalScenes) > 0.2;
    }, []);

    const handleGenerateVeoPrompts = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder || !content) return;
        setIsGeneratingVeoPrompts(true);
        try {
            const parentFolder = type === 'short' ? 'video_short' : 'video_long';
            const outputFolder = `data/${parentFolder}/${selectedFolder}`;
            const res = await fetch('/api/veo-queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: content?.metadata?.title || selectedFolder,
                    videoType: type,
                    language: (content?.metadata?.language || contentLanguage) as 'vi' | 'en',
                    voiceStyle: content?.metadata?.voiceStyle || 'contemplative',
                    aiModel: 'agy',
                    outputFolder,
                    targetAspectRatio: type === 'long' ? '16:9' : '9:16',
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('🎬 Đã thêm task Tạo Veo Prompts vào hàng chờ!', 'Cửa sổ Agent sẽ mở và xử lý trong nền.');
            } else if (res.status === 409) {
                toast.info('⏳ Đã có task đang chờ cho dự án này', `Task ID: ${data.taskId}`);
            } else {
                toast.error(data.error || 'Lỗi khi thêm task vào hàng chờ');
            }
        } catch (err: any) {
            toast.error('Lỗi kết nối API veo-queue');
        } finally {
            setIsGeneratingVeoPrompts(false);
        }
    };

    const handleMergeVeoPrompts = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        if (type !== 'long') {
            toast.error('Chức năng này chỉ áp dụng cho video dài');
            return;
        }
        setIsMergingVeoPrompts(true);
        try {
            const res = await fetch('/api/merge-veo-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder: selectedFolder,
                    type: type
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`✅ ${data.message}`, `Đã gộp ${data.totalScenes} scenes từ ${data.totalChapters} chapters`);
                // Tải lại content để refresh
                await loadContent(selectedFolder, true);
            } else {
                toast.error(data.error || 'Lỗi khi gộp veo prompts');
            }
        } catch (err: any) {
            toast.error('Lỗi kết nối API merge-veo-prompts');
        } finally {
            setIsMergingVeoPrompts(false);
        }
    };



    // ─── Handler: Lấy Audio từ CapCut ───────────────────────────────────────────
    const handleExtractCapcutAudio = async (capcutFolderPath: string) => {
        if (!selectedFolder) return;
        if (!capcutFolderPath.trim()) {
            toast.error('Vui lòng chọn thư mục CapCut project!');
            return;
        }
        setIsExtractingCapcutAudio(true);
        toast.info('⏳ Đang đọc dự án CapCut và ghép audio...', 'Vui lòng đợi trong giây lát...');
        try {
            const res = await fetch('/api/capcut-extract-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    capcut_folder: capcutFolderPath.trim(),
                    project_folder: selectedFolder,
                    type,
                }),
            });
            const data = await res.json();
            if (res.ok && (data.success || data.status === 'success')) {
                toast.success(
                    `✅ ${data.message}`,
                    `Đã ghép ${data.segmentCount} file audio · Kích thước: ${data.fileSizeKB} KB`
                );
                loadContent(selectedFolder, true);
            } else {
                toast.error(`❌ Lỗi: ${data.error || data.message || 'Có lỗi xảy ra'}`);
            }
        } catch (err: any) {
            toast.error(`❌ Lỗi kết nối: ${err.message}`);
        } finally {
            setIsExtractingCapcutAudio(false);
        }
    };

    // ─── Handler: Tảo Audio Cảnh từ CapCut (copy scene_N.wav riêng lẻ) ──────────
    const handleExtractSceneAudio = async (capcutFolderPath: string) => {
        if (!selectedFolder) return;
        if (!capcutFolderPath.trim()) {
            toast.error('Vui lòng chọn thư mục CapCut project!');
            return;
        }
        setIsExtractingSceneAudio(true);
        toast.info('⏳ Đang sao chép audio theo từng cảnh...', 'Vui lòng đợi trong giây lát...');
        try {
            const res = await fetch('/api/capcut-scene-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    capcut_folder: capcutFolderPath.trim(),
                    project_folder: selectedFolder,
                    type,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(
                    `✅ ${data.message}`,
                    `Đã tạo ${data.sceneCount} file: ${data.copiedFiles?.slice(0, 3).join(', ')}${data.sceneCount > 3 ? '...' : ''}`
                );
                if (data.errors?.length) {
                    toast.error(`⚠️ Một số lỗi: ${data.errors.join('; ')}`);
                }
                loadContent(selectedFolder, true);
            } else {
                toast.error(`❌ Lỗi: ${data.error || data.message || 'Có lỗi xảy ra'}`);
            }
        } catch (err: any) {
            toast.error(`❌ Lỗi kết nối: ${err.message}`);
        } finally {
            setIsExtractingSceneAudio(false);
        }
    };

    // ─── Helper: build QR modal state ────────────────────────────────────────────
    // Chỉ dùng LAN URL — điện thoại quét QR tải về, PC không tự download
    const buildSrtQrModal = async (
        fileName: string,
        segmentCount: number,
        label: 'AUDIO' | 'SCENE',
    ): Promise<SrtQrModalState> => {
        let lanIp = window.location.hostname;
        try {
            const ipRes = await fetch('/api/local-ip');
            const ipData = await ipRes.json();
            if (ipData.ip && ipData.ip !== '127.0.0.1') lanIp = ipData.ip;
        } catch { /* fallback to current hostname */ }
        const port = window.location.port || '3000';
        const srtType = label === 'SCENE' ? 'scene' : 'audio';
        const qrTargetUrl = `http://${lanIp}:${port}/api/generate-srt?folder=${encodeURIComponent(selectedFolder || '')}&type=${type}&srtType=${srtType}&download=1`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=png&data=${encodeURIComponent(qrTargetUrl)}`;
        return { open: true, qrUrl, downloadUrl: qrTargetUrl, lanUrl: qrTargetUrl, segmentCount, isCloud: false, blobUrl: null, fileName, label };
    };

    // ─── AUDIO SRT handler ────────────────────────────────────────────────────────
    const handleGenerateAudioSrt = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        setIsGeneratingAudioSrt(true);
        try {
            const res = await fetch('/api/generate-srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: selectedFolder, type, mode: 'audio' }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const fileName = data.audioSrtFileName || `AUDIO_${selectedFolder}.srt`;
                // Không auto-download PC — chỉ show QR để điện thoại quét
                const modal = await buildSrtQrModal(fileName, data.masterSegmentCount || 0, 'AUDIO');
                setAudioSrtQrModal(modal);
                loadContent(selectedFolder, true);
                toast.success(`✅ AUDIO SRT: ${data.masterSegmentCount || 0} đoạn`, '📱 Quét QR bằng điện thoại để tải về');
            } else {
                toast.error(data.error || 'Lỗi khi tạo AUDIO SRT');
            }
        } catch (err: any) {
            toast.error(`Lỗi kết nối: ${err.message}`);
        } finally {
            setIsGeneratingAudioSrt(false);
        }
    };

    // ─── SCENE SRT handler ────────────────────────────────────────────────────────
    const handleGenerateSceneSrt = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        setIsGeneratingSceneSrt(true);
        try {
            const res = await fetch('/api/generate-srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: selectedFolder, type, mode: 'scene' }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const fileName = data.sceneSrtFileName || `SCENE_${selectedFolder}.srt`;
                // Không auto-download PC — chỉ show QR để điện thoại quét
                const modal = await buildSrtQrModal(fileName, data.sceneSegmentCount || 0, 'SCENE');
                setSceneSrtQrModal(modal);
                loadContent(selectedFolder, true);
                toast.success(`✅ SCENE SRT: ${data.sceneSegmentCount || 0} cảnh`, '📱 Quét QR bằng điện thoại để tải về');
            } else {
                toast.error(data.error || 'Lỗi khi tạo SCENE SRT');
            }
        } catch (err: any) {
            toast.error(`Lỗi kết nối: ${err.message}`);
        } finally {
            setIsGeneratingSceneSrt(false);
        }
    };

    // ─── QR show handlers (standalone QR button) ─────────────────────────────────
    // Chỉ build URL LAN — không download gì cả lên PC
    const handleShowAudioSrtQr = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        const modal = await buildSrtQrModal(`AUDIO_${selectedFolder}.srt`, 0, 'AUDIO');
        setAudioSrtQrModal(modal);
    };

    const handleShowSceneSrtQr = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        const modal = await buildSrtQrModal(`SCENE_${selectedFolder}.srt`, 0, 'SCENE');
        setSceneSrtQrModal(modal);
    };

    // legacy compat (nút QR cũ vẫn dùng)
    const handleGenerateSrt = handleGenerateAudioSrt;
    const handleShowSrtQr = handleShowAudioSrtQr;


    // Shared audio ref for voice preview (used by Vbee preview)
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);


    // Vbee Preview State
    const [selectedVbeeVoice, setSelectedVbeeVoice] = useState<string>('hn_female_ngochuyen_full_48k-fhg');
    const [isVbeePreviewPlaying, setIsVbeePreviewPlaying] = useState<boolean>(false);
    const [isVbeePreviewLoading, setIsVbeePreviewLoading] = useState<boolean>(false);

    const toggleVbeePreview = async (voiceCode: string) => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            if (isVbeePreviewPlaying && (previewAudioRef.current as any)._voiceId === voiceCode) {
                setIsVbeePreviewPlaying(false);
                return;
            }
        }

        try {
            setIsVbeePreviewLoading(true);

            let audioUrl = '';
            if (voiceCode === 'en-US-BrianNeural' || voiceCode === 'uk_male_brian_full_48k-fhg') {
                audioUrl = 'https://vbee.s3.ap-southeast-1.amazonaws.com/audios/demo/microsoft/en-US-BrianNeural.mp3';
            } else {
                audioUrl = 'https://vbee.s3.ap-southeast-1.amazonaws.com/audios/demo/vbee/hn_female_ngochuyen_fast_news_48k-thg.mp3';
            }

            // Simulate slight delay so UI transitions smoothly
            await new Promise(resolve => setTimeout(resolve, 300));

            setIsVbeePreviewLoading(false);
            setIsVbeePreviewPlaying(true);

            const audio = new Audio(audioUrl);
            (audio as any)._voiceId = voiceCode;
            previewAudioRef.current = audio;

            audio.onended = () => {
                setIsVbeePreviewPlaying(false);
            };

            await audio.play();
        } catch (err: any) {
            console.error('Vbee Audio preview error:', err);
            toast.error('Lỗi khi phát giọng mẫu Vbee');
            setIsVbeePreviewLoading(false);
            setIsVbeePreviewPlaying(false);
        }
    };

    const handleOptimizeSeo = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        setIsOptimizingSeo(true);
        try {
            const res = await fetch('/api/seo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: `data/${type === 'short' ? 'video_short' : 'video_long'}/${selectedFolder}`,
                    video_type: type
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(data.message || 'Đã kích hoạt AI Agent Tối ưu SEO!');
            } else {
                toast.error(data.error || 'Lỗi khi gọi API');
            }
        } catch (err) {
            console.error(err);
            toast.error('Lỗi kết nối');
        }
        setIsOptimizingSeo(false);
    };

    const handleDeleteSeo = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        if (!confirm("Bạn có chắc chắn muốn xóa nội dung SEO tối ưu?")) return;
        setIsDeletingSeo(true);
        try {
            const res = await fetch(`/api/seo?folder=${encodeURIComponent(selectedFolder)}&type=${type}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Đã xóa nội dung SEO tối ưu thành công!');
                loadContent(selectedFolder, true);
            } else {
                toast.error(data.error || 'Lỗi khi xóa nội dung SEO');
            }
        } catch (err) {
            console.error(err);
            toast.error('Lỗi kết nối');
        }
        setIsDeletingSeo(false);
    };

    const handleGenerateThumbnail = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedFolder) return;
        setIsGeneratingThumbnail(true);
        toast.info('⏳ Đang khởi chạy AI Agent tạo Thumbnail...', 'Theo dõi kết quả trong Hàng đợi xử lý.');
        try {
            const res = await fetch('/api/thumbnail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: `data/${type === 'short' ? 'video_short' : 'video_long'}/${selectedFolder}`
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(data.message || 'Đã kích hoạt AI Agent tạo Thumbnail thành công!');
            } else {
                toast.error(data.error || 'Lỗi khi gọi API tạo Thumbnail');
            }
        } catch (err: any) {
            console.error(err);
            toast.error(`Lỗi kết nối: ${err.message}`);
        }
        setIsGeneratingThumbnail(false);
    };

    const loadDriveFolders = async () => {
        try {
            const res = await fetch('/api/google-drive-folders');
            if (res.ok) {
                const data = await res.json();
                setDriveFolders(data);
                if (data.length > 0) {
                    const hasDefault = data.some((f: any) => f.id === '16opy1ZPxDFFSauAbkqctKUhx9N2Zrp8F');
                    if (hasDefault) {
                        setSelectedDriveFolderId('16opy1ZPxDFFSauAbkqctKUhx9N2Zrp8F');
                    } else {
                        setSelectedDriveFolderId(data[0].id);
                    }
                }
            }
        } catch (e) {
            console.error('Error loading Google Drive folders:', e);
        }
    };

    const handleSyncSheets = async () => {
        if (!selectedFolder) return;
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync-sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder: selectedFolder,
                    type,
                    driveFolderId: selectedDriveFolderId
                })
            });
            const data = await res.json();
            if (res.ok && (data.status === 'success' || data.status === 'duplicate')) {
                toast.success(data.message || 'Đồng bộ Sheets thành công!');
                await loadHistory();
            } else {
                toast.error(data.error || 'Lỗi khi đồng bộ Sheets');
            }
        } catch (e: any) {
            toast.error('Lỗi kết nối: ' + e.message);
        }
        setIsSyncing(false);
    };

    const handleSyncSheetsForProject = async (folder: string, projectType: 'short' | 'long') => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/sync-sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder,
                    type: projectType,
                    driveFolderId: selectedDriveFolderId
                })
            });
            const data = await res.json();
            if (res.ok && (data.status === 'success' || data.status === 'duplicate')) {
                toast.success(data.message || 'Đồng bộ Sheets thành công!');
                await loadHistory();
            } else {
                toast.error(data.error || 'Lỗi khi đồng bộ Sheets');
            }
        } catch (e: any) {
            toast.error('Lỗi kết nối: ' + e.message);
        }
        setIsSyncing(false);
    };

    const handleResetSheets = async () => {
        if (!selectedFolder) return;
        if (!confirm('Bạn có chắc muốn Reset trạng thái đồng bộ Sheets của dự án này?')) return;
        setIsResetting(true);
        try {
            const res = await fetch(`/api/sync-sheets?folder=${encodeURIComponent(selectedFolder)}&type=${type}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Đã reset trạng thái đồng bộ!');
                await loadHistory();
            } else {
                toast.error(data.error || 'Lỗi khi reset trạng thái');
            }
        } catch (e: any) {
            toast.error('Lỗi kết nối: ' + e.message);
        }
        setIsResetting(false);
    };

    const handleCopyFolderPath = async (e: React.MouseEvent, folderName?: string | null, projectType?: string) => {
        e.stopPropagation();
        const targetFolder = folderName || selectedFolder;
        const targetType = projectType || type;

        if (!targetFolder) return;

        try {
            const res = await fetch(`/api/open-folder?folder=${encodeURIComponent(targetFolder)}&type=${targetType}`);
            const data = await res.json();
            if (data.path) {
                await safeCopyToClipboard(data.path, `Đã copy đường dẫn: ${data.path}`);
            } else {
                toast.error(data.error || 'Không lấy được đường dẫn thư mục');
            }
        } catch (err: any) {
            console.error('Lỗi khi copy đường dẫn:', err);
            toast.error('Lỗi kết nối khi copy đường dẫn');
        }
    };

    const toggleSection = (sec: string) => {
        setOpenSections(prev => ({ ...prev, [sec]: !(prev as any)[sec] }));
    };

    // TTS Progress state
    const [ttsProgress, setTtsProgress] = useState<{ percent: number, logs: string, show: boolean }>({ percent: 0, logs: '', show: false });
    const [playingFile, setPlayingFile] = useState<string | null>(null);
    const progressInterval = useRef<any>(null);

    const selectedFolderRef = useRef<string | null>(null);
    useEffect(() => {
        selectedFolderRef.current = selectedFolder;
        // Clear pending poll timeout when selected folder changes
        return () => {
            if (progressInterval.current) {
                clearTimeout(progressInterval.current);
                progressInterval.current = null;
            }
        };
    }, [selectedFolder]);

    const startProgressPolling = (logName: string = 'tts.log') => {
        if (progressInterval.current) clearInterval(progressInterval.current);
        setTtsProgress({ percent: 0, logs: 'Đang khởi động lõi AI...', show: true });

        // Exponential back-off: starts at 3s, doubles each idle tick, caps at 10s
        // "idle" = percent hasn't changed since last tick
        let currentInterval = 3000;
        let lastPercent = -1;
        let idleTicks = 0;

        const schedulePoll = () => {
            progressInterval.current = setTimeout(async () => {
                const currentFolder = selectedFolderRef.current;
                if (!currentFolder) return;
                try {
                    const res = await fetch(`/api/tts/progress?folder=${encodeURIComponent(currentFolder)}&type=${type}&logName=${logName}`);
                    const data = await res.json();
                    if (data.status === 'success') {
                        setTtsProgress(prev => ({ ...prev, percent: data.percent || 0, logs: data.logs || '' }));

                        if (data.jobStatus==='error' || data.jobStatus==='cancelled') {toast.error(data.error||'Tác vụ đã dừng.');return;}
                        if (data.jobStatus==='completed' || (!data.jobId && data.logs.includes('TẤT CẢ ĐÃ HOÀN TẤT'))) {
                            if (progressInterval.current) {
                                clearTimeout(progressInterval.current);
                                progressInterval.current = null;
                            }
                            if (currentFolder) loadContent(currentFolder, true);
                            toast.success("Đã tạo giọng nói hoàn tất!");
                            setTimeout(() => setTtsProgress(prev => ({ ...prev, show: false })), 3000);
                            return; // stop scheduling
                        }

                        // Back-off logic: if percent didn't change, it's idle → slow down
                        const pct = data.percent || 0;
                        if (pct === lastPercent) {
                            idleTicks++;
                            // Double interval each idle tick, max 10s
                            currentInterval = Math.min(currentInterval * 2, 10_000);
                        } else {
                            // Progress is moving — reset to base interval
                            idleTicks = 0;
                            currentInterval = 3000;
                        }
                        lastPercent = pct;
                    }
                } catch {
                    // ignore transient errors, keep polling
                }
                schedulePoll(); // schedule next tick with updated interval
            }, currentInterval) as unknown as ReturnType<typeof setInterval>;
        };

        schedulePoll();
    };

    // Memoize loadContent to prevent recreation on every render
    const loadContent = useCallback(async (folder: string, isSilent: boolean = false, targetLang?: 'vi' | 'en') => {
        const lang = targetLang || contentLangRef.current;
        if (!isSilent) setIsLoadingContent(true);

        if (lang === 'vi') {
            setSelectedFolderVi(folder);
        } else {
            setSelectedFolderEn(folder);
        }

        try {
            const res = await fetch(`/api/content?folder=${encodeURIComponent(folder)}&type=${type}`);
            if (!res.ok) {
                console.warn(`Failed to fetch content (${res.status})`);
                if (!isSilent) setIsLoadingContent(false);
                return;
            }
            const data = await res.json();

            if (lang === 'vi') {
                setContentVi(data);
            } else {
                setContentEn(data);
            }

            // Auto-select default voice by language
            const isEnglish = (data?.metadata?.language === 'en') || (lang === 'en');
            if (isEnglish) {
                setSelectedVbeeVoice('uk_male_brian_full_48k-fhg');
            } else {
                setSelectedVbeeVoice('hn_female_ngochuyen_full_48k-fhg');
            }
        } catch (e) {
            console.error("Error loading content", e);
        }
        if (!isSilent) setIsLoadingContent(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);
    useEffect(()=>{
        const refresh=()=>{const folder=selectedFolderRef.current;if(folder)void loadContent(folder,true);};
        window.addEventListener('operation-completed',refresh);
        window.addEventListener('refresh-content',refresh);
        return()=>{window.removeEventListener('operation-completed',refresh);window.removeEventListener('refresh-content',refresh);};
    },[loadContent]);


    // Memoize loadHistory to prevent recreation on every render
    const loadHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`/api/history?type=${type}`);
            if (!res.ok) {
                console.warn(`Failed to fetch history (${res.status})`);
                setIsLoadingHistory(false);
                return;
            }
            const data = await res.json();
            const topics: any[] = data.topics || [];
            setHistory(topics);

            const viList = topics.filter((t: any) => (t.language || 'vi') === 'vi');
            const enList = topics.filter((t: any) => t.language === 'en');

            // ─── Badge: detect new items on inactive tab ────────────────────
            // Compare the most-recent folder with the last-seen ref.
            // If it changed, there's an unseen item on that tab.
            const latestViFolder = viList[0]?.folder ?? null;
            const latestEnFolder = enList[0]?.folder ?? null;

            if (contentLangRef.current !== 'vi' && latestViFolder && latestViFolder !== lastSeenViFolder.current) {
                setUnseenViCount(viList.length > 0 ? 1 : 0);
            }
            if (contentLangRef.current !== 'en' && latestEnFolder && latestEnFolder !== lastSeenEnFolder.current) {
                setUnseenEnCount(enList.length > 0 ? 1 : 0);
            }

            // ─── OPTIMIZATION: Only load ACTIVE language content, not both ──────
            // Old behavior: loaded both VI + EN in parallel on every mount (2x API calls)
            // New behavior: load ONLY the currently active language, lazy load other on tab switch
            const activeLang = contentLangRef.current;

            if (activeLang === 'vi') {
                if (viList.length > 0) {
                    const currentValid = viList.some((t: any) => t.folder === selectedFolderVi);
                    if (!selectedFolderVi || !currentValid) {
                        await loadContent(viList[0].folder, true, 'vi');
                    }
                    // Mark as seen
                    lastSeenViFolder.current = viList[0].folder;
                    setUnseenViCount(0);
                } else if (enList.length > 0) {
                    // ── Auto-switch: VI tab is empty but EN has content ──
                    // Switch to EN so the user immediately sees something
                    setContentLanguageSync('en');
                    setSelectedVbeeVoice('uk_male_brian_full_48k-fhg');
                    const targetFolder = selectedFolderEn || enList[0].folder;
                    await loadContent(targetFolder, true, 'en');
                    lastSeenEnFolder.current = enList[0].folder;
                    setUnseenEnCount(0);
                    setSelectedFolderVi(null);
                    setContentVi(null);
                } else {
                    setSelectedFolderVi(null);
                    setContentVi(null);
                }
                // Clear EN selection if no EN projects (but don't load)
                if (enList.length === 0) {
                    setSelectedFolderEn(null);
                    setContentEn(null);
                }
            } else {
                if (enList.length > 0) {
                    const currentValid = enList.some((t: any) => t.folder === selectedFolderEn);
                    if (!selectedFolderEn || !currentValid) {
                        await loadContent(enList[0].folder, true, 'en');
                    }
                    // Mark as seen
                    lastSeenEnFolder.current = enList[0].folder;
                    setUnseenEnCount(0);
                } else if (viList.length > 0) {
                    // ── Auto-switch: EN tab is empty but VI has content ──
                    setContentLanguageSync('vi');
                    setSelectedVbeeVoice('hn_female_ngochuyen_full_48k-fhg');
                    const targetFolder = selectedFolderVi || viList[0].folder;
                    await loadContent(targetFolder, true, 'vi');
                    lastSeenViFolder.current = viList[0].folder;
                    setUnseenViCount(0);
                    setSelectedFolderEn(null);
                    setContentEn(null);
                } else {
                    setSelectedFolderEn(null);
                    setContentEn(null);
                }
                // Clear VI selection if no VI projects (but don't load)
                if (viList.length === 0) {
                    setSelectedFolderVi(null);
                    setContentVi(null);
                }
            }
        } catch (e) {
            console.error("Error loading history", e);
        }
        setIsLoadingHistory(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, loadContent]);

    useEffect(() => {
        loadHistory();
        loadDriveFolders();
    }, [type, loadHistory]);

    const deleteProject = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Bạn có chắc chắn muốn xóa dự án này? Dữ liệu sẽ không thể khôi phục.")) return;
        setIsLoadingHistory(true);
        try {
            await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
            await loadHistory();
        } catch (e) {
            console.error("Error deleting", e);
        }
        setIsLoadingHistory(false);
    };

    const deleteAllProjects = async () => {
        const langLabel = contentLanguage === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh';
        if (!confirm(`BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ DỰ ÁN ${langLabel.toUpperCase()}?\nHành động này sẽ xóa vĩnh viễn toàn bộ file kịch bản ${langLabel} của tab hiện tại.`)) return;

        setIsLoadingHistory(true);
        try {
            const activeTopics = history.filter((t: any) => (t.language || 'vi') === contentLanguage);
            // Parallel delete — much faster when deleting 10+ projects
            await Promise.all(
                activeTopics.map(topic =>
                    fetch(`/api/history?id=${topic.id}`, { method: 'DELETE' })
                )
            );
            await loadHistory();
        } catch (e) {
            console.error("Error deleting all", e);
        }
        setIsLoadingHistory(false);
    };

    // getCombinedVoiceover is memoized — only recomputes when content or type changes
    const combinedVoiceover = useMemo(() => {
        if (!content) return "";
        if (content.master_script && typeof content.master_script === "string" && content.master_script.trim()) {
            return content.master_script.trim();
        }
        if (!content.chapters) return "";
        let combined = "";

        if (type === 'short') {
            let allScenes: any[] = [];
            content.chapters.forEach((ch: any) => {
                if (Array.isArray(ch.data)) allScenes = allScenes.concat(ch.data);
            });

            let paragraphs = [];
            for (let i = 0; i < allScenes.length; i += 2) {
                let p = allScenes[i]?.voiceover || "";
                if (allScenes[i + 1]) {
                    p += " " + (allScenes[i + 1]?.voiceover || "");
                }
                paragraphs.push(p);
            }
            combined = paragraphs.join("\n");
        } else {
            content.chapters.forEach((ch: any) => {
                let chapterText = "";
                if (Array.isArray(ch.data)) {
                    chapterText = ch.data.map((s: any) => s?.voiceover || "").join("\n");
                }
                combined += `${chapterText}\n\n`;
            });
        }
        return combined.trim();
    }, [content, type]);

    // Compatibility shim — existing JSX calls getCombinedVoiceover()
    const getCombinedVoiceover = () => combinedVoiceover;

    const countChars = (text: string) => text.length;

    const safeCopyToClipboard = async (text: string, successMsg?: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                throw new Error('Clipboard API unavailable');
            }
            if (successMsg) toast.success(successMsg);
        } catch {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successMsg) toast.success(successMsg);
            } catch (err) {
                console.error('Copy fallback error:', err);
                toast.error('Không thể copy vào clipboard');
            }
        }
    };

    const copyToClipboard = useCallback((text: string) => {
        safeCopyToClipboard(text, 'Đã copy vào clipboard!');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const generateTTS = async (options: { mode?: string, scene?: number } = {}) => {
        if (!selectedFolder) return;
        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: selectedFolder, type, ...options })
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(data.message);
                const logName = options.scene ? `tts_scene_${options.scene}.log` : 'tts.log';
                if (!data.jobId) startProgressPolling(logName); // Bắt đầu theo dõi tiến độ
            } else {
                toast.error(data.message || "Lỗi tạo TTS");
            }
        } catch (e) {
            console.error("Error generating TTS", e);
            toast.error("Lỗi khi kết nối đến server");
        }
    };

    const generateSaydiTTS = useCallback(async (options: { mode?: string, scene?: number } = {}) => {
        if (!selectedFolder) return;
        try {
            const res = await fetch('/api/tts-saydi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: selectedFolder, type, ...options })
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(data.message);
                const logName = options.scene !== undefined ? `saydi_tts_scene_${options.scene}.log` : 'saydi_tts.log';
                if (!data.jobId) startProgressPolling(logName);
            } else {
                toast.error(data.message || "Lỗi tạo TTS Saydi");
            }
        } catch (e) {
            console.error("Error generating Saydi TTS", e);
            toast.error("Lỗi khi kết nối đến server");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolder, type]);

    const handleAlignTimeline = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!selectedFolder) return;
        setIsAligningTimeline(true);
        toast.info("⏳ Đang phân tích audio và căn timeline...", "Hệ thống đang chạy Whisper ASR (lần đầu có thể mất 1-3 phút, lần sau sẽ tải từ cache)...");
        try {
            const res = await fetch('/api/align-timeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder: selectedFolder,
                    type,
                    speed: 1.15
                })
            });
            const data = await res.json();
            if (res.ok && data.jobId) {
                toast.info(data.message || "Đã xếp hàng căn thời gian. Theo dõi kết quả trong Hàng đợi xử lý.");
            } else {
                toast.error(`❌ Lỗi: ${data.error || 'Không thể đồng bộ timeline'}`);
            }
        } catch (err: any) {
            toast.error(`❌ Lỗi kết nối: ${err.message}`);
        } finally {
            setIsAligningTimeline(false);
        }
    };


    const generateVbeeTTS = async (options: { mode?: string, scene?: number } = {}) => {
        if (!selectedFolder) return;
        try {
            const res = await fetch('/api/tts-vbee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder: selectedFolder,
                    type,
                    ...options
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(data.message);
                const logName = options.scene !== undefined ? `vbee_tts_scene_${options.scene}.log` : 'vbee_tts.log';
                if (!data.jobId) startProgressPolling(logName); // Bắt đầu theo dõi tiến độ
            } else {
                toast.error(data.message || "Lỗi tạo TTS Vbee");
            }
        } catch (e) {
            console.error("Error generating Vbee TTS", e);
            toast.error("Lỗi khi kết nối đến server");
        }
    };

    const hasAudio = (filename: string) => {
        return content && content.audioFiles && content.audioFiles.includes(filename);
    };

    const playAudio = useCallback((filename: string) => {
        if (!selectedFolder) return;

        let targetFile = filename;
        if (filename === 'tong_hop_loi_thoai_vbee') {
            if (hasAudio('tong_hop_loi_thoai_vbee.wav')) {
                targetFile = 'tong_hop_loi_thoai_vbee.wav';
            } else if (hasAudio('tong_hop_loi_thoai_vbee.mp3')) {
                targetFile = 'tong_hop_loi_thoai_vbee.mp3';
            }
        } else if (filename === 'tong_hop_loi_thoai') {
            if (hasAudio('tong_hop_loi_thoai.wav')) {
                targetFile = 'tong_hop_loi_thoai.wav';
            } else if (hasAudio('tong_hop_loi_thoai.mp3')) {
                targetFile = 'tong_hop_loi_thoai.mp3';
            }
        } else if (filename === 'tong_hop_loi_thoai.mp3') {
            // keep this for legacy or any other parts that might still call it
            if (hasAudio('tong_hop_loi_thoai_vbee.wav')) {
                targetFile = 'tong_hop_loi_thoai_vbee.wav';
            } else if (hasAudio('tong_hop_loi_thoai_vbee.mp3')) {
                targetFile = 'tong_hop_loi_thoai_vbee.mp3';
            } else if (hasAudio('tong_hop_loi_thoai.wav')) {
                targetFile = 'tong_hop_loi_thoai.wav';
            } else if (hasAudio('tong_hop_loi_thoai.mp3')) {
                targetFile = 'tong_hop_loi_thoai.mp3';
            }
        } else if (filename.startsWith('scene_')) {
            const sceneNum = filename.replace('scene_', '').replace('.wav', '').replace('.mp3', '');
            if (hasAudio(`scene_${sceneNum}.wav`)) {
                targetFile = `scene_${sceneNum}.wav`;
            } else if (hasAudio(`scene_${sceneNum}.mp3`)) {
                targetFile = `scene_${sceneNum}.mp3`;
            } else {
                toast.error("Chưa tạo giọng nói cho cảnh này!");
                return;
            }
        } else if (!filename.match(/\.(mp3|wav|m4a)$/i)) {
            // filename has no extension and wasn't handled above — can't play
            toast.error("Chưa tạo giọng nói hoặc không tìm thấy file âm thanh!");
            return;
        }

        // Final guard: make sure resolved file actually exists in audioFiles
        if (!hasAudio(targetFile)) {
            toast.error("Chưa tạo giọng nói hoặc không tìm thấy file âm thanh!");
            return;
        }

        if (playingFile === targetFile) {
            if ((window as any).currentTtsAudio) {
                (window as any).currentTtsAudio.pause();
            }
            setPlayingFile(null);
            return;
        }

        if ((window as any).currentTtsAudio) {
            (window as any).currentTtsAudio.pause();
        }

        const audioUrl = `/api/audio-file?folder=${encodeURIComponent(selectedFolder)}&type=${type}&filename=${targetFile}&t=${Date.now()}`;
        const audio = new Audio(audioUrl);
        (window as any).currentTtsAudio = audio;

        setPlayingFile(targetFile);

        audio.play().then(() => {
            audio.onended = () => {
                setPlayingFile(null);
            };
        }).catch(e => {
            console.error("Audio playback error:", e);
            setPlayingFile(null);
            toast.error("Chưa tạo giọng nói hoặc không thể phát âm thanh!");
        });
    }, [selectedFolder, type, playingFile, content]);

    const deleteAudio = useCallback(async (filename: string) => {
        if (!selectedFolder) return;

        if (!window.confirm("Bạn có chắc chắn muốn xóa file thoại này? Hành động này không thể hoàn tác.")) return;

        let targetFile = filename;
        if (filename === 'tong_hop_loi_thoai_vbee') {
            if (hasAudio('tong_hop_loi_thoai_vbee.mp3')) {
                targetFile = 'tong_hop_loi_thoai_vbee.mp3';
            } else if (hasAudio('tong_hop_loi_thoai_vbee.wav')) {
                targetFile = 'tong_hop_loi_thoai_vbee.wav';
            } else return;
        } else if (filename === 'tong_hop_loi_thoai') {
            if (hasAudio('tong_hop_loi_thoai.mp3')) {
                targetFile = 'tong_hop_loi_thoai.mp3';
            } else if (hasAudio('tong_hop_loi_thoai.wav')) {
                targetFile = 'tong_hop_loi_thoai.wav';
            } else return;
        } else if (filename.startsWith('scene_')) {
            const sceneNum = filename.replace('scene_', '').replace('.wav', '').replace('.mp3', '');
            if (hasAudio(`scene_${sceneNum}.mp3`)) {
                targetFile = `scene_${sceneNum}.mp3`;
            } else if (hasAudio(`scene_${sceneNum}.wav`)) {
                targetFile = `scene_${sceneNum}.wav`;
            }
        }

        // Always stop any playing audio before attempting to delete the file
        // (browser holds a file lock while streaming audio — causes EBUSY on Windows)
        if ((window as any).currentTtsAudio) {
            (window as any).currentTtsAudio.pause();
            (window as any).currentTtsAudio.src = '';
            (window as any).currentTtsAudio = null;
        }
        setPlayingFile(null);

        // Brief pause so browser releases the file handle before server-side delete
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            // Auto-retry up to 3 times if file is still locked (EBUSY on Windows)
            let res: Response | null = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                res = await fetch(`/api/audio-file?folder=${encodeURIComponent(selectedFolder)}&type=${type}&filename=${targetFile}`, {
                    method: 'DELETE'
                });
                if (res.status !== 409) break;
                // File still locked — wait and retry
                await new Promise(resolve => setTimeout(resolve, 600 * attempt));
            }
            if (res!.ok) {
                toast.success("Đã xóa file giọng nói thành công!");
                loadContent(selectedFolder, true);
            } else if (res!.status === 409) {
                toast.error("Không thể xóa file (đang bị khóa). Vui lòng tải lại trang và thử lại.");
            } else {
                const errMsg = await res!.text();
                toast.error(errMsg || "Lỗi khi xóa file");
            }
        } catch (e) {
            console.error("Error deleting audio", e);
            toast.error("Lỗi khi kết nối đến server");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolder, type, content]);

    const deleteAllAudio = async () => {
        if (!selectedFolder) return;

        if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ GIỌNG NÓI CỦA CÁC CẢNH?\n\n(Lưu ý: File thoại tổng hợp master sẽ KHÔNG bị xóa).")) return;

        if (playingFile && playingFile.startsWith('scene_')) {
            if ((window as any).currentTtsAudio) {
                (window as any).currentTtsAudio.pause();
            }
            setPlayingFile(null);
        }

        try {
            const res = await fetch(`/api/audio-file?folder=${encodeURIComponent(selectedFolder)}&type=${type}&filename=all`, {
                method: 'DELETE'
            });
            if (res.ok) {
                toast.success("Đã xóa giọng nói của tất cả các cảnh thành công!");
                loadContent(selectedFolder, true);
            } else {
                const errMsg = await res.text();
                toast.error(errMsg || "Lỗi khi xóa file");
            }
        } catch (e) {
            console.error("Error deleting all audio", e);
            toast.error("Lỗi khi kết nối đến server");
        }
    };

    const handleRefreshAllData = async () => {
        toast.info("⏳ Đang làm mới dữ liệu hệ thống...");
        try {
            await loadHistory();
            if (selectedFolder) {
                await loadContent(selectedFolder, true);
            }
            toast.success("✅ Đã làm mới dữ liệu thành công!");
        } catch (e: any) {
            toast.error("❌ Lỗi khi làm mới dữ liệu: " + e.message);
        }
    };

    const openAudioEditor = async (filename: string) => {
        if (!selectedFolder) return;

        let targetFile = filename;
        if (filename === 'tong_hop_loi_thoai_vbee') {
            if (hasAudio('tong_hop_loi_thoai_vbee.mp3')) {
                targetFile = 'tong_hop_loi_thoai_vbee.mp3';
            } else if (hasAudio('tong_hop_loi_thoai_vbee.wav')) {
                targetFile = 'tong_hop_loi_thoai_vbee.wav';
            } else return;
        } else if (filename === 'tong_hop_loi_thoai') {
            if (hasAudio('tong_hop_loi_thoai.mp3')) {
                targetFile = 'tong_hop_loi_thoai.mp3';
            } else if (hasAudio('tong_hop_loi_thoai.wav')) {
                targetFile = 'tong_hop_loi_thoai.wav';
            } else return;
        } else if (filename.startsWith('scene_')) {
            const sceneNum = filename.replace('scene_', '').replace('.wav', '').replace('.mp3', '');
            if (hasAudio(`scene_${sceneNum}.mp3`)) {
                targetFile = `scene_${sceneNum}.mp3`;
            } else if (hasAudio(`scene_${sceneNum}.wav`)) {
                targetFile = `scene_${sceneNum}.wav`;
            }
        }

        setEditorFilename(targetFile);
        setIsEditorOpen(true);
    }; return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            {/* Header bar with Language Tabs, Settings & Drive Connect */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', gap: '16px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📂 Lịch sử & Chi tiết dự án {type === 'short' ? 'Short' : 'Dài'}
                </h3>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => {
                            setContentLanguageSync('vi');
                            setSelectedVbeeVoice('hn_female_ngochuyen_full_48k-fhg');
                            // Clear unseen badge for VI
                            setUnseenViCount(0);
                            const latestViFolder = history.filter((t: any) => (t.language || 'vi') === 'vi')[0]?.folder ?? null;
                            if (latestViFolder) lastSeenViFolder.current = latestViFolder;
                            const viList = history.filter((t: any) => (t.language || 'vi') === 'vi');
                            if (viList.length > 0) {
                                const targetFolder = selectedFolderVi || viList[0].folder;
                                // Lazy load: only fetch if we don't have content yet
                                if (!contentVi || selectedFolderVi !== targetFolder) {
                                    loadContent(targetFolder, false, 'vi');
                                }
                            }
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 16px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            background: contentLanguage === 'vi' ? 'var(--accent-color)' : '#fff',
                            color: contentLanguage === 'vi' ? '#fff' : 'var(--text-primary)',
                            border: '1px solid ' + (contentLanguage === 'vi' ? 'var(--accent-color)' : 'var(--border-color)'),
                            cursor: 'pointer',
                            boxShadow: contentLanguage === 'vi' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                            transition: 'all 0.2s ease',
                            position: 'relative' as const
                        }}
                    >
                        🇻🇳 Tiếng Việt ({history.filter((t: any) => (t.language || 'vi') === 'vi').length})
                        {unseenViCount > 0 && contentLanguage !== 'vi' && (
                            <span style={{
                                position: 'absolute' as const,
                                top: '-6px',
                                right: '-6px',
                                background: '#ef4444',
                                color: '#fff',
                                borderRadius: '999px',
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                padding: '1px 5px',
                                lineHeight: '1.4',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                minWidth: '16px',
                                textAlign: 'center'
                            }}>🆕</span>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setContentLanguageSync('en');
                            setSelectedVbeeVoice('uk_male_brian_full_48k-fhg');
                            // Clear unseen badge for EN
                            setUnseenEnCount(0);
                            const latestEnFolder = history.filter((t: any) => t.language === 'en')[0]?.folder ?? null;
                            if (latestEnFolder) lastSeenEnFolder.current = latestEnFolder;
                            const enList = history.filter((t: any) => t.language === 'en');
                            if (enList.length > 0) {
                                const targetFolder = selectedFolderEn || enList[0].folder;
                                // Lazy load: only fetch if we don't have content yet
                                if (!contentEn || selectedFolderEn !== targetFolder) {
                                    loadContent(targetFolder, false, 'en');
                                }
                            }
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 16px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            background: contentLanguage === 'en' ? '#2563eb' : '#fff',
                            color: contentLanguage === 'en' ? '#fff' : 'var(--text-primary)',
                            border: '1px solid ' + (contentLanguage === 'en' ? '#2563eb' : 'var(--border-color)'),
                            cursor: 'pointer',
                            boxShadow: contentLanguage === 'en' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                            transition: 'all 0.2s ease',
                            position: 'relative' as const
                        }}
                    >
                        🇬🇧 Tiếng Anh ({history.filter((t: any) => t.language === 'en').length})
                        {unseenEnCount > 0 && contentLanguage !== 'en' && (
                            <span style={{
                                position: 'absolute' as const,
                                top: '-6px',
                                right: '-6px',
                                background: '#ef4444',
                                color: '#fff',
                                borderRadius: '999px',
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                padding: '1px 5px',
                                lineHeight: '1.4',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                minWidth: '16px',
                                textAlign: 'center'
                            }}>🆕</span>
                        )}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <a
                        href="/api/google-auth"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#22c55e',
                            color: 'white',
                            padding: '6px 14px',
                            fontSize: '0.85rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            textDecoration: 'none'
                        }}
                    >
                        🔗 Kết nối Drive
                    </a>
                    <button
                        onClick={handleRefreshAllData}
                        className="btn btn-secondary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.85rem',
                            borderRadius: '8px',
                            fontWeight: '600',
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            cursor: 'pointer'
                        }}
                        title="Tải lại toàn bộ danh sách lịch sử & dự án"
                    >
                        🔄 Làm mới dữ liệu
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="btn btn-secondary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            fontSize: '0.85rem',
                            borderRadius: '8px',
                            fontWeight: '600'
                        }}
                    >
                        ⚙️ Cài đặt chung
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
                {/* LEFT: CONTENT VIEWER */}
                <div style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', paddingRight: '16px' }}>
                    {isLoadingContent ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent-color)', fontWeight: 'bold' }}>Đang tải nội dung...</div>
                    ) : !content ? (
                        <div className="empty-state">Vui lòng chọn một dự án từ danh sách bên phải hoặc chưa có dự án nào.</div>
                    ) : (
                        <div>
                            {/* STANDALONE DEDICATED BLOCK FOR REMEDIATION PLAN */}

                            {/* SEO DROPDOWN - REDESIGNED */}
                            <div style={{ marginBottom: '16px', background: '#fff', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                <div
                                    onClick={() => toggleSection('seo')}
                                    style={{
                                        padding: '18px 20px',
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                        cursor: 'pointer',
                                        borderBottom: openSections.seo ? '1px solid #e5e7eb' : 'none'
                                    }}
                                >
                                    {/* Title Row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <h3 style={{
                                            margin: 0,
                                            fontSize: '1rem',
                                            fontWeight: '700',
                                            color: '#1e293b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            📝 Tiêu đề & Mô tả YouTube
                                        </h3>
                                        <span style={{
                                            color: '#64748b',
                                            fontSize: '1.2rem',
                                            transition: 'transform 0.2s',
                                            transform: openSections.seo ? 'rotate(180deg)' : 'rotate(0deg)',
                                            display: 'inline-block'
                                        }}>
                                            ▼
                                        </span>
                                    </div>

                                    {/* ── Action Buttons: 2-row layout ── */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                                        onClick={(e) => e.stopPropagation()}>

                                        {/* ── ROW 1: Main project buttons ── */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>

                                            {/* Copy path */}
                                            <button
                                                onClick={(e) => handleCopyFolderPath(e, selectedFolder, type)}
                                                className="btn"
                                                style={{
                                                    background: '#f0f9ff', color: '#0369a1',
                                                    padding: '8px 14px', fontSize: '0.8rem',
                                                    border: '1px solid #bae6fd', borderRadius: '8px',
                                                    cursor: 'pointer', fontWeight: '600',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    transition: 'all 0.2s', height: '36px',
                                                }}
                                                title="Copy đường dẫn thư mục dự án"
                                            >
                                                📋 Copy path
                                            </button>

                                            {/* CapCut project */}
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!selectedFolder) return;
                                                    toast.info('⏳ Đang tạo Project CapCut...', 'Vui lòng đợi trong giây lát...');
                                                    try {
                                                        const parentFolder = type === 'long' ? 'video_long' : 'video_short';
                                                        const res = await fetch('/api/capcut', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ folder_path: `data/${parentFolder}/${selectedFolder}` })
                                                        });
                                                        const data = await res.json();
                                                        if (data.status === 'success' || data.success) {
                                                            toast.success(`✅ ${data.message || 'Tạo project thành công'}`);
                                                            loadContent(selectedFolder, true);
                                                            loadHistory();
                                                        } else {
                                                            toast.error(`❌ Lỗi: ${data.message || 'Có lỗi xảy ra'}`);
                                                        }
                                                    } catch (err: any) {
                                                        toast.error(`❌ Lỗi kết nối: ${err.message}`);
                                                    }
                                                }}
                                                className="btn"
                                                style={{
                                                    background: Boolean((content as any)?.hasCapcutProject || (content as any)?.metadata?.capcut_created) ? '#fef3c7' : '#fecaca',
                                                    color: Boolean((content as any)?.hasCapcutProject || (content as any)?.metadata?.capcut_created) ? '#92400e' : '#dc2626',
                                                    padding: '8px 14px', fontSize: '0.8rem',
                                                    border: Boolean((content as any)?.hasCapcutProject || (content as any)?.metadata?.capcut_created) ? '1px solid #fde68a' : '1px solid #fca5a5',
                                                    borderRadius: '8px', cursor: 'pointer', fontWeight: '600',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    transition: 'all 0.2s', height: '36px',
                                                }}
                                            >
                                                {Boolean((content as any)?.hasCapcutProject || (content as any)?.metadata?.capcut_created) ? '✂️ CapCut ✓' : '✂️ Tạo CapCut'}
                                            </button>

                                            {/* Tối ưu SEO */}
                                            <button
                                                onClick={handleOptimizeSeo}
                                                disabled={isOptimizingSeo}
                                                className="btn"
                                                style={{
                                                    background: '#dbeafe', color: '#1e40af',
                                                    padding: '8px 14px', fontSize: '0.8rem',
                                                    border: '1px solid #93c5fd', borderRadius: '8px', fontWeight: '600',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    opacity: isOptimizingSeo ? 0.6 : 1,
                                                    cursor: isOptimizingSeo ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s', height: '36px',
                                                }}
                                            >
                                                {isOptimizingSeo ? '⏳ Đang tối ưu...' : '🚀 Tối ưu SEO'}
                                            </button>

                                            {/* Thumbnail */}
                                            {type === 'long' && (
                                                <button
                                                    onClick={handleGenerateThumbnail}
                                                    disabled={isGeneratingThumbnail}
                                                    className="btn"
                                                    style={{
                                                        background: '#f3e8ff', color: '#7c3aed',
                                                        padding: '8px 14px', fontSize: '0.8rem',
                                                        border: '1px solid #e9d5ff', borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        opacity: isGeneratingThumbnail ? 0.6 : 1,
                                                        cursor: isGeneratingThumbnail ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '36px',
                                                    }}
                                                >
                                                    {isGeneratingThumbnail ? '⏳ Đang tạo...' : '🖼️ Thumbnail'}
                                                </button>
                                            )}

                                            {/* Veo Prompts + Gộp */}
                                            {(() => {
                                                const isTemplate = hasTemplateVeoPrompts(content);
                                                return (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleGenerateVeoPrompts(e); }}
                                                            disabled={isGeneratingVeoPrompts}
                                                            className="btn"
                                                            style={{
                                                                background: isTemplate ? '#fef3c7' : '#fed7aa',
                                                                color: isTemplate ? '#92400e' : '#9a3412',
                                                                padding: '8px 14px', fontSize: '0.8rem',
                                                                border: isTemplate ? '1px solid #fde68a' : '1px solid #fdba74',
                                                                borderRadius: '8px', fontWeight: '600',
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                opacity: isGeneratingVeoPrompts ? 0.6 : 1,
                                                                cursor: isGeneratingVeoPrompts ? 'not-allowed' : 'pointer',
                                                                transition: 'all 0.2s', height: '36px', position: 'relative',
                                                            }}
                                                            title={isTemplate ? 'Veo prompts bị phát hiện là template — click để tạo lại' : 'Tạo veo_prompts'}
                                                        >
                                                            {isGeneratingVeoPrompts ? '⏳' : '🎬'} Veo Prompts
                                                            {isTemplate && (
                                                                <span style={{
                                                                    position: 'absolute', top: '-6px', right: '-6px',
                                                                    background: '#dc2626', color: 'white',
                                                                    borderRadius: '50%', width: '18px', height: '18px',
                                                                    fontSize: '11px', display: 'flex', alignItems: 'center',
                                                                    justifyContent: 'center', fontWeight: 'bold', border: '2px solid white',
                                                                }}>!</span>
                                                            )}
                                                        </button>
                                                        {type === 'long' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleMergeVeoPrompts(e); }}
                                                                disabled={isMergingVeoPrompts}
                                                                className="btn"
                                                                style={{
                                                                    background: '#f3e8ff', color: '#7c3aed',
                                                                    padding: '8px 14px', fontSize: '0.8rem',
                                                                    border: '1px solid #e9d5ff', borderRadius: '8px', fontWeight: '600',
                                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                                    opacity: isMergingVeoPrompts ? 0.6 : 1,
                                                                    cursor: isMergingVeoPrompts ? 'not-allowed' : 'pointer',
                                                                    transition: 'all 0.2s', height: '36px',
                                                                }}
                                                                title="Gộp tất cả veo_prompt thành 1 file"
                                                            >
                                                                {isMergingVeoPrompts ? '⏳' : '📦'} Gộp Prompts
                                                            </button>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {/* ── DIVIDER: CapCut Tools ── */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            marginTop: '2px',
                                        }}>
                                            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, #e2e8f0, transparent)' }} />
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.08em',
                                                color: '#94a3b8', whiteSpace: 'nowrap', userSelect: 'none',
                                                textTransform: 'uppercase',
                                            }}>
                                                🎞️ CapCut Tools
                                            </span>
                                            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, #e2e8f0, transparent)' }} />
                                        </div>

                                        {/* ── ROW 2: AUDIO group + SCENE group ── */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'stretch' }}>

                                            {/* ══ NHÓM AUDIO ══ */}
                                            <div style={{
                                                display: 'flex', gap: '5px', alignItems: 'center',
                                                background: 'linear-gradient(135deg, #fff7ed 0%, #fef9f5 100%)',
                                                border: '1.5px solid #fed7aa',
                                                borderRadius: '12px',
                                                padding: '6px 8px',
                                                boxShadow: '0 1px 3px rgba(234,88,12,0.08)',
                                            }}>
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    justifyContent: 'center', paddingRight: '6px',
                                                    borderRight: '1px solid #fed7aa', marginRight: '2px', minWidth: '36px',
                                                }}>
                                                    <span style={{ fontSize: '0.95rem' }}>🎵</span>
                                                    <span style={{
                                                        fontSize: '0.58rem', fontWeight: '900', color: '#c2410c',
                                                        letterSpacing: '0.06em', marginTop: '1px',
                                                    }}>AUDIO</span>
                                                </div>

                                                {/* Lấy Audio */}
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!selectedFolder) return;
                                                        try {
                                                            const r = await fetch('/api/capcut-extract-audio');
                                                            const d = await r.json();
                                                            if (d.defaultPath) setCapcutDefaultPath(d.defaultPath);
                                                        } catch { }
                                                        setIsCapcutFolderBrowserOpen(true);
                                                    }}
                                                    disabled={isExtractingCapcutAudio}
                                                    className="btn"
                                                    style={{
                                                        background: isExtractingCapcutAudio ? '#f0fdf4' : (hasAudio('tong_hop_loi_thoai.wav') ? '#d1fae5' : 'white'),
                                                        color: isExtractingCapcutAudio ? '#166534' : (hasAudio('tong_hop_loi_thoai.wav') ? '#166534' : '#c2410c'),
                                                        padding: '5px 11px', fontSize: '0.78rem',
                                                        border: hasAudio('tong_hop_loi_thoai.wav') ? '1px solid #34d399' : '1px solid #fed7aa',
                                                        borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: isExtractingCapcutAudio ? 0.7 : 1,
                                                        cursor: isExtractingCapcutAudio ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '32px', whiteSpace: 'nowrap',
                                                    }}
                                                    title={hasAudio('tong_hop_loi_thoai.wav') ? 'Đã có audio ghép — bấm để lấy lại' : 'Chọn thư mục CapCut để ghép audio'}
                                                >
                                                    {isExtractingCapcutAudio ? '⏳' : (hasAudio('tong_hop_loi_thoai.wav') ? '✅ Audio' : '+ Ghép audio')}
                                                </button>

                                                {/* Sub SRT */}
                                                <button
                                                    onClick={handleGenerateAudioSrt}
                                                    disabled={isGeneratingAudioSrt}
                                                    className="btn"
                                                    style={{
                                                        background: (content as any)?.hasSrtFile ? '#d1fae5' : 'white',
                                                        color: (content as any)?.hasSrtFile ? '#065f46' : '#c2410c',
                                                        padding: '5px 11px', fontSize: '0.78rem',
                                                        border: (content as any)?.hasSrtFile ? '1px solid #34d399' : '1px solid #fed7aa',
                                                        borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: isGeneratingAudioSrt ? 0.6 : 1,
                                                        cursor: isGeneratingAudioSrt ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '32px', whiteSpace: 'nowrap',
                                                    }}
                                                    title={(content as any)?.hasSrtFile ? `Đã có AUDIO_${selectedFolder}.srt` : `Tạo AUDIO_${selectedFolder}.srt`}
                                                >
                                                    {isGeneratingAudioSrt ? '⏳' : ((content as any)?.hasSrtFile ? '✅ Sub SRT' : '+ Sub SRT')}
                                                </button>

                                                {/* QR AUDIO - luôn hiện */}
                                                <button
                                                    onClick={handleShowAudioSrtQr}
                                                    className="btn"
                                                    style={{
                                                        background: '#d1fae5', color: '#065f46',
                                                        padding: '5px 7px', fontSize: '0.88rem',
                                                        border: '1px solid #34d399', borderRadius: '8px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                        height: '32px', minWidth: '30px',
                                                    }}
                                                    title="QR tải AUDIO SRT về điện thoại"
                                                >
                                                    📱
                                                </button>

                                                {/* Căn Timeline (1.15x) */}
                                                <button
                                                    onClick={handleAlignTimeline}
                                                    disabled={isAligningTimeline}
                                                    className="btn"
                                                    style={{
                                                        background: isAligningTimeline ? '#fef3c7' : '#ecfdf5',
                                                        color: isAligningTimeline ? '#92400e' : '#047857',
                                                        padding: '5px 11px', fontSize: '0.78rem',
                                                        border: '1px solid #a7f3d0',
                                                        borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: isAligningTimeline ? 0.7 : 1,
                                                        cursor: isAligningTimeline ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '32px', whiteSpace: 'nowrap',
                                                    }}
                                                    title="Phân tích audio (Whisper AI) và tự động ghi timeline từng cảnh (tốc độ 1.15x) vào chapter_[n].json"
                                                >
                                                    {isAligningTimeline ? '⏳ Đang căn...' : '⏱️ Căn Timeline (1.15x)'}
                                                </button>
                                            </div>

                                            {/* ══ NHÓM SCENE ══ */}
                                            <div style={{
                                                display: 'flex', gap: '5px', alignItems: 'center',
                                                background: 'linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)',
                                                border: '1.5px solid #bfdbfe',
                                                borderRadius: '12px',
                                                padding: '6px 8px',
                                                boxShadow: '0 1px 3px rgba(37,99,235,0.08)',
                                            }}>
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                    justifyContent: 'center', paddingRight: '6px',
                                                    borderRight: '1px solid #bfdbfe', marginRight: '2px', minWidth: '36px',
                                                }}>
                                                    <span style={{ fontSize: '0.95rem' }}>🎞️</span>
                                                    <span style={{
                                                        fontSize: '0.58rem', fontWeight: '900', color: '#1d4ed8',
                                                        letterSpacing: '0.06em', marginTop: '1px',
                                                    }}>SCENE</span>
                                                </div>

                                                {/* Tảo audio cảnh */}
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!selectedFolder) return;
                                                        try {
                                                            const r = await fetch('/api/capcut-scene-audio');
                                                            const d = await r.json();
                                                            if (d.defaultPath) setSceneAudioDefaultPath(d.defaultPath);
                                                        } catch { }
                                                        setIsSceneAudioFolderBrowserOpen(true);
                                                    }}
                                                    disabled={isExtractingSceneAudio}
                                                    className="btn"
                                                    style={{
                                                        background: isExtractingSceneAudio ? '#dbeafe' : 'white',
                                                        color: '#1d4ed8',
                                                        padding: '5px 11px', fontSize: '0.78rem',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: isExtractingSceneAudio ? 0.7 : 1,
                                                        cursor: isExtractingSceneAudio ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '32px', whiteSpace: 'nowrap',
                                                    }}
                                                    title="Sao chép từng audio CapCut thành scene_1.wav, scene_2.wav..."
                                                >
                                                    {isExtractingSceneAudio ? '⏳' : '+ Tảo audio'}
                                                </button>

                                                {/* Sub cảnh SRT */}
                                                <button
                                                    onClick={handleGenerateSceneSrt}
                                                    disabled={isGeneratingSceneSrt}
                                                    className="btn"
                                                    style={{
                                                        background: (content as any)?.hasSceneSrtFile ? '#dbeafe' : 'white',
                                                        color: (content as any)?.hasSceneSrtFile ? '#1d4ed8' : '#1d4ed8',
                                                        padding: '5px 11px', fontSize: '0.78rem',
                                                        border: (content as any)?.hasSceneSrtFile ? '1px solid #93c5fd' : '1px solid #bfdbfe',
                                                        borderRadius: '8px', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: isGeneratingSceneSrt ? 0.6 : 1,
                                                        cursor: isGeneratingSceneSrt ? 'not-allowed' : 'pointer',
                                                        transition: 'all 0.2s', height: '32px', whiteSpace: 'nowrap',
                                                    }}
                                                    title={`Tạo SCENE_${selectedFolder}.srt từ voiceover từng cảnh`}
                                                >
                                                    {isGeneratingSceneSrt ? '⏳' : ((content as any)?.hasSceneSrtFile ? '✅ Sub cảnh' : '+ Sub cảnh')}
                                                </button>

                                                {/* QR SCENE - luôn hiện */}
                                                <button
                                                    onClick={handleShowSceneSrtQr}
                                                    className="btn"
                                                    style={{
                                                        background: '#dbeafe', color: '#1d4ed8',
                                                        padding: '5px 7px', fontSize: '0.88rem',
                                                        border: '1px solid #93c5fd', borderRadius: '8px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                        height: '32px', minWidth: '30px',
                                                    }}
                                                    title="QR tải SCENE SRT về điện thoại"
                                                >
                                                    📱
                                                </button>
                                            </div>

                                        </div>{/* end ROW 2 */}
                                    </div>{/* end 2-row layout */}
                                </div>{/* end clickable SEO header */}

                                {openSections.seo && content.metadata && (
                                    <div style={{ padding: '16px' }}>

                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '500' }}>Tiêu đề YouTube (SEO + Hashtags)</div>
                                                <button onClick={() => copyToClipboard(`${content.metadata.title} ${type === 'short' && !content.metadata.title?.includes('#short') ? '#shorts' : ''}`)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>📋 Copy</button>
                                            </div>
                                            <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '6px', border: '1px solid #e5e7eb', color: 'var(--text-primary)', fontWeight: '500' }}>
                                                {content.metadata.title} {type === 'short' && !content.metadata.title?.includes('#short') ? '#shorts' : ''}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '500' }}>Mô tả YouTube</div>
                                                <button onClick={() => copyToClipboard(content.metadata.description)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>📋 Copy</button>
                                            </div>
                                            <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '6px', border: '1px solid #e5e7eb', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                                                {content.metadata.description}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '500' }}>Từ Khóa (Tags)</div>
                                                <button
                                                    onClick={() => copyToClipboard((content.metadata.keywords || []).join(', '))}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                                >
                                                    📋 Copy
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {(content.metadata.keywords || []).map((k: string, i: number) => (
                                                    <span key={i} style={{ padding: '4px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '16px', fontSize: '0.8rem', fontWeight: '500' }}>{k}</span>
                                                ))}
                                            </div>
                                        </div>

                                        {content.seo_optimized && ((type === 'short' && content.seo_optimized.short) || (type === 'long' && content.seo_optimized.long)) && (
                                            <div style={{ marginTop: '24px', borderTop: '1px dashed #ccc', paddingTop: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <h4 style={{ color: '#2563eb', margin: 0 }}>✨ Nội dung đã tối ưu SEO</h4>
                                                    <button
                                                        onClick={handleDeleteSeo}
                                                        disabled={isDeletingSeo}
                                                        className="btn btn-secondary"
                                                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                                                    >
                                                        {isDeletingSeo ? 'Đang xóa...' : '🗑️ Xóa SEO tối ưu'}
                                                    </button>
                                                </div>

                                                {/* SEO Short */}
                                                {type === 'short' && content.seo_optimized.short && (
                                                    <div style={{ marginBottom: '20px', padding: '12px', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#f8fafc' }}>
                                                        <h5 style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>Định dạng Short (#shorts)</h5>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Tiêu đề</div>
                                                                <button onClick={() => copyToClipboard(content.seo_optimized.short.title)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>{content.seo_optimized.short.title}</div>
                                                        </div>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Mô tả</div>
                                                                <button onClick={() => copyToClipboard(content.seo_optimized.short.description)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{content.seo_optimized.short.description}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Từ khóa</div>
                                                                <button onClick={() => copyToClipboard((content.seo_optimized.short.keywords || []).join(', '))} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>{(content.seo_optimized.short.keywords || []).join(', ')}</div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* SEO Long */}
                                                {type === 'long' && content.seo_optimized.long && (
                                                    <div style={{ padding: '12px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4' }}>
                                                        <h5 style={{ fontWeight: 'bold', marginBottom: '8px', color: '#166534' }}>Định dạng Video Dài</h5>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Tiêu đề</div>
                                                                <button onClick={() => copyToClipboard(content.seo_optimized.long.title)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>{content.seo_optimized.long.title}</div>
                                                        </div>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Mô tả</div>
                                                                <button onClick={() => copyToClipboard(content.seo_optimized.long.description)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{content.seo_optimized.long.description}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>Từ khóa</div>
                                                                <button onClick={() => copyToClipboard((content.seo_optimized.long.keywords || []).join(', '))} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>📋 Copy</button>
                                                            </div>
                                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>{(content.seo_optimized.long.keywords || []).join(', ')}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* COMBINED VOICEOVER DROPDOWN (MOVED UP) */}
                            <div style={{ marginBottom: '16px', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div
                                    style={{ padding: '12px 16px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: openSections.combined ? '1px solid var(--border-color)' : 'none' }}
                                >
                                    <div onClick={() => toggleSection('combined')} style={{ cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                        <span>Tổng hợp lời thoại (Cho AI Voice)</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{openSections.combined ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <select
                                            value={selectedVbeeVoice}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                setSelectedVbeeVoice(e.target.value);
                                                if (isVbeePreviewPlaying && previewAudioRef.current) {
                                                    previewAudioRef.current.pause();
                                                    setIsVbeePreviewPlaying(false);
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid #fbcfe8',
                                                fontSize: '0.8rem',
                                                background: '#ffffff',
                                                color: '#be185d',
                                                fontWeight: '500',
                                                maxWidth: '150px'
                                            }}
                                        >
                                            <option value="hn_female_ngochuyen_full_48k-fhg">Ngọc Huyền (VN)</option>
                                            <option value="uk_male_brian_full_48k-fhg">Brian (EN)</option>
                                        </select>
                                        <button
                                            type="button"
                                            disabled={isVbeePreviewLoading}
                                            onClick={(e) => { e.stopPropagation(); toggleVbeePreview(selectedVbeeVoice); }}
                                            className="btn"
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.8rem',
                                                background: isVbeePreviewPlaying ? '#dc2626' : (isVbeePreviewLoading ? '#f472b6' : '#ec4899'),
                                                borderColor: isVbeePreviewPlaying ? '#b91c1c' : '#db2777',
                                                color: 'white',
                                                fontWeight: '500',
                                                cursor: isVbeePreviewLoading ? 'not-allowed' : 'pointer'
                                            }}
                                            title="Nghe thử giọng Vbee"
                                        >
                                            {isVbeePreviewLoading ? '⏳' : (isVbeePreviewPlaying ? '⏸️' : '🔊')}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); generateVbeeTTS({ mode: 'global' }); }} className="btn" style={{ background: '#ec4899', color: 'white', padding: '4px 12px', fontSize: '0.8rem' }}>
                                            🎙️ Tạo (Vbee)
                                        </button>
                                        {(hasAudio('tong_hop_loi_thoai_vbee.wav') || hasAudio('tong_hop_loi_thoai_vbee.mp3')) && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); playAudio('tong_hop_loi_thoai_vbee'); }} className="btn" style={{ background: (playingFile === 'tong_hop_loi_thoai_vbee.wav' || playingFile === 'tong_hop_loi_thoai_vbee.mp3') ? '#ef4444' : '#f59e0b', color: 'white', padding: '4px 12px', fontSize: '0.8rem' }}>
                                                    {(playingFile === 'tong_hop_loi_thoai_vbee.wav' || playingFile === 'tong_hop_loi_thoai_vbee.mp3') ? '⏸️ Tạm Dừng' : '▶️ Nghe Thử'}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteAudio('tong_hop_loi_thoai_vbee'); }} className="btn" style={{ padding: '4px 12px', fontSize: '0.8rem', color: '#ef4444', border: '1px solid #fecaca', background: '#fef2f2' }}>
                                                    🗑️ Xóa Thoại
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {openSections.combined && (
                                    <div style={{ padding: '16px' }}>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', color: '#475569', fontSize: '0.82rem', fontWeight: '500' }}>
                                                    <span>📊 Tổng số ký tự:</span>
                                                    <strong style={{ color: 'var(--accent-color)', fontWeight: '700' }}>{countChars(getCombinedVoiceover())}</strong>
                                                    <span style={{ color: '#94a3b8' }}>{type === 'short' ? '(Yêu cầu: 900–1200)' : '(Yêu cầu: >12000)'}</span>
                                                </div>

                                                <button
                                                    onClick={() => copyToClipboard(getCombinedVoiceover())}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '4px 12px', fontSize: '0.8rem', height: '30px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}
                                                >
                                                    📋 Copy Thoại
                                                </button>
                                            </div>

                                            {/* Dedicated TTS Action Bar */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b', marginRight: '4px' }}>🎙️ Tạo Thoại Tổng Hợp:</span>
                                                <button
                                                    onClick={() => generateSaydiTTS({ mode: 'global' })}
                                                    className="btn"
                                                    style={{ background: '#6366f1', color: 'white', padding: '4px 12px', fontSize: '0.8rem', height: '30px', fontWeight: '600', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                    title="Tạo file thoại tổng hợp bằng Saydi TTS"
                                                >
                                                    🎙️ Saydi TTS
                                                </button>

                                                {(hasAudio('tong_hop_loi_thoai.wav') || hasAudio('tong_hop_loi_thoai.mp3')) && (
                                                    <>
                                                        <div style={{ width: '1px', height: '20px', background: '#cbd5e1', margin: '0 4px' }} />
                                                        <button
                                                            onClick={() => playAudio('tong_hop_loi_thoai')}
                                                            className="btn"
                                                            style={{ background: (playingFile === 'tong_hop_loi_thoai.wav' || playingFile === 'tong_hop_loi_thoai.mp3') ? '#ef4444' : '#f59e0b', color: 'white', padding: '4px 12px', fontSize: '0.8rem', height: '30px', fontWeight: '600', border: 'none', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            {(playingFile === 'tong_hop_loi_thoai.wav' || playingFile === 'tong_hop_loi_thoai.mp3') ? '⏸️ Tạm Dừng' : '▶️ Nghe Thử'}
                                                        </button>
                                                        <button
                                                            onClick={() => deleteAudio('tong_hop_loi_thoai')}
                                                            className="btn"
                                                            style={{ padding: '4px 10px', fontSize: '0.8rem', height: '30px', color: '#ef4444', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            title="Xóa file thoại tổng hợp"
                                                        >
                                                            🗑️ Xóa
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <textarea
                                            readOnly
                                            value={getCombinedVoiceover()}
                                            style={{
                                                width: "100%",
                                                height: "180px",
                                                padding: "12px",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-color)",
                                                fontFamily: "monospace",
                                                fontSize: "0.95rem",
                                                resize: "vertical",
                                                lineHeight: "1.6"
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* SCENES DROPDOWN (MOVED DOWN) */}
                            <div style={{ marginBottom: '16px', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div
                                    style={{ padding: '12px 16px', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: openSections.scenes ? '1px solid var(--border-color)' : 'none' }}
                                >
                                    <div onClick={() => toggleSection('scenes')} style={{ cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                        <span>Kịch bản Từng cảnh ({type === 'short' ? '4s' : '8s'} / cảnh)</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{openSections.scenes ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); generateSaydiTTS({ mode: 'all_scenes' }); }}
                                            className="btn"
                                            style={{ background: '#6366f1', color: 'white', padding: '4px 10px', fontSize: '0.78rem', height: '30px', fontWeight: '600', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                            title="Tạo giọng đọc Saydi cho tất cả các cảnh"
                                        >
                                            🎙️ Saydi All Cảnh
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteAllAudio(); }}
                                            className="btn"
                                            style={{ background: '#ef4444', color: 'white', padding: '6px 14px', fontSize: '0.85rem', fontWeight: '500' }}
                                            title="Xóa toàn bộ các tệp giọng nói âm thanh trong chủ đề này"
                                        >
                                            🗑️ Xóa tất cả giọng nói
                                        </button>
                                    </div>
                                </div>
                                {openSections.scenes && content.chapters && (
                                    <div style={{ padding: '16px' }}>
                                        {content.chapters.map((ch: any, chIdx: number) => (
                                            <div key={chIdx} style={{ marginBottom: '24px' }}>
                                                {content.chapters.length > 1 && <h3 style={{ color: 'var(--accent-color)', marginTop: 0, marginBottom: '12px', fontSize: '1.1rem' }}>{ch.file}</h3>}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    {(Array.isArray(ch.data) ? ch.data : []).map((scene: any, sIdx: number) => (
                                                        <SceneCard
                                                            key={`${chIdx}-${scene.scene ?? sIdx}`}
                                                            scene={scene}
                                                            hasAudio={hasAudio}
                                                            playingFile={playingFile}
                                                            onGenSaydiTTS={generateSaydiTTS}
                                                            onPlay={playAudio}
                                                            onDelete={deleteAudio}
                                                            onCopy={copyToClipboard}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>

                {/* RIGHT: HISTORY SIDEBAR */}
                <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <h3 style={{ margin: '0', fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Lịch sử dự án
                            <button
                                onClick={handleRefreshAllData}
                                className="btn"
                                style={{
                                    padding: '3px 8px',
                                    fontSize: '0.72rem',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="Bấm để tải lại toàn bộ danh sách dự án"
                            >
                                🔄 Làm mới
                            </button>
                        </h3>
                        {history.filter((t: any) => (t.language || 'vi') === contentLanguage).length > 0 && (
                            <button
                                onClick={deleteAllProjects}
                                className="btn btn-danger"
                                style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                                title={`Xóa toàn bộ dự án ${contentLanguage === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}`}
                            >
                                Xóa tất cả ({contentLanguage === 'vi' ? 'VI' : 'EN'})
                            </button>
                        )}
                    </div>

                    <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '8px' }}>
                        {/* Month / Year Header with Prev/Next Week arrows */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <button onClick={() => {
                                const newDate = new Date(selectedDate);
                                newDate.setDate(selectedDate.getDate() - 7);
                                setSelectedDate(newDate);
                            }} style={{ background: 'none', border: '1px solid #e5e7eb', cursor: 'pointer', padding: '6px', color: 'var(--text-secondary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>

                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: '#f9fafb', border: '1px solid #e5e7eb', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent-color)'} onMouseOut={e => e.currentTarget.style.borderColor = '#e5e7eb'}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    Tháng {selectedDate.getMonth() + 1}, {selectedDate.getFullYear()}
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                <input
                                    type="date"
                                    value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            setSelectedDate(new Date(e.target.value));
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        opacity: 0,
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                            <button onClick={() => {
                                const newDate = new Date(selectedDate);
                                newDate.setDate(selectedDate.getDate() + 7);
                                setSelectedDate(newDate);
                            }} style={{ background: 'none', border: '1px solid #e5e7eb', cursor: 'pointer', padding: '6px', color: 'var(--text-secondary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>

                        {/* TABS FOR DAYS OF WEEK */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px' }}>
                            {(() => {
                                const getWeekDays = (date: Date) => {
                                    const days = [];
                                    const current = new Date(date);
                                    const dayOfWeek = current.getDay();
                                    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                                    const monday = new Date(current.setDate(diff));

                                    for (let i = 0; i < 7; i++) {
                                        const nextDate = new Date(monday);
                                        nextDate.setDate(monday.getDate() + i);
                                        days.push(nextDate);
                                    }
                                    return days;
                                };

                                const weekDays = getWeekDays(selectedDate);
                                const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

                                const isSameDate = (d1: Date, d2: Date) => {
                                    return d1.getFullYear() === d2.getFullYear() &&
                                        d1.getMonth() === d2.getMonth() &&
                                        d1.getDate() === d2.getDate();
                                };

                                return weekDays.map((date, index) => {
                                    const isSelected = isSameDate(date, selectedDate);
                                    const isToday = isSameDate(date, new Date()); return (
                                        <div
                                            key={index}
                                            onClick={() => setSelectedDate(date)}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                padding: '8px 4px',
                                                cursor: 'pointer',
                                                borderRadius: '8px',
                                                background: isSelected ? 'var(--accent-color)' : (isToday ? '#eff6ff' : 'transparent'),
                                                color: isSelected ? '#fff' : (isToday ? 'var(--accent-color)' : 'var(--text-secondary)'),
                                                fontWeight: isSelected ? 'bold' : (isToday ? '600' : '500'),
                                                flex: 1,
                                                transition: 'all 0.2s ease',
                                                userSelect: 'none'
                                            }}
                                            onMouseOver={e => {
                                                if (!isSelected) e.currentTarget.style.background = '#f3f4f6';
                                            }}
                                            onMouseOut={e => {
                                                if (!isSelected) e.currentTarget.style.background = isToday ? '#eff6ff' : 'transparent';
                                            }}
                                        >
                                            <span style={{ fontSize: '0.75rem', marginBottom: '4px', opacity: isSelected ? 0.9 : 0.7 }}>{dayNames[index]}</span>
                                            <span style={{ fontSize: '1rem' }}>{date.getDate()}</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {isLoadingHistory ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>Đang tải...</div>
                    ) : (() => {
                        const activeLangTopics = history.filter((t: any) => (t.language || 'vi') === contentLanguage);
                        const sortedHistory = [...activeLangTopics].sort((a, b) => new Date(b.created_at || b.date || 0).getTime() - new Date(a.created_at || a.date || 0).getTime());

                        const isSameDate = (d1: Date, d2: Date) => {
                            // Compare using local date components to avoid timezone shift issues
                            return d1.getFullYear() === d2.getFullYear() &&
                                d1.getMonth() === d2.getMonth() &&
                                d1.getDate() === d2.getDate();
                        };

                        const filteredHistory = sortedHistory.map((item, idx) => ({ item, globalIdx: idx }))
                            .filter(({ item }) => {
                                const itemDate = new Date(item.created_at || item.date);
                                return isSameDate(itemDate, selectedDate);
                            });

                        if (filteredHistory.length === 0) {
                            return (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>
                                    Chưa có dự án {contentLanguage === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'} nào trong ngày {selectedDate.toLocaleDateString('vi-VN')}.
                                </div>
                            );
                        } return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                                {filteredHistory.map(({ item, globalIdx }) => (
                                    <div
                                        key={globalIdx}
                                        onClick={() => loadContent(item.folder, false, contentLanguage)}
                                        style={{
                                            padding: '16px',
                                            background: selectedFolder === item.folder ? '#eff6ff' : '#fff',
                                            border: selectedFolder === item.folder ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => {
                                            if (selectedFolder !== item.folder) {
                                                e.currentTarget.style.borderColor = 'var(--accent-color)';
                                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.05)';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (selectedFolder !== item.folder) {
                                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                                            }
                                        }}
                                    >
                                        {/* TOP ROW: TIME & STATUS BADGES ONLY */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                                {new Date(item.created_at || item.date).toLocaleTimeString('vi-VN')}
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                {item.capcut_created && (
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        fontSize: '0.72rem',
                                                        background: '#f3e8ff',
                                                        color: '#7e22ce',
                                                        borderRadius: '6px',
                                                        fontWeight: 'bold',
                                                        border: '1px solid #e9d5ff',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        ✂️ CapCut
                                                    </span>
                                                )}
                                                {item.sheets_synced ? (
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        fontSize: '0.72rem',
                                                        background: '#dcfce7',
                                                        color: '#15803d',
                                                        borderRadius: '6px',
                                                        fontWeight: 'bold',
                                                        border: '1px solid #bbf7d0',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        ✓ Đã nhập
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            await handleSyncSheetsForProject(item.folder, item.type || type);
                                                        }}
                                                        disabled={isSyncing}
                                                        className="btn"
                                                        style={{
                                                            padding: '3px 8px',
                                                            fontSize: '0.72rem',
                                                            background: '#fef3c7',
                                                            color: '#d97706',
                                                            border: '1px solid #fde68a',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontWeight: '600',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        title="Click để đồng bộ nhanh lên Google Sheets"
                                                    >
                                                        Chưa nhập
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.92rem', marginBottom: '4px', color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.35' }}>
                                            {activeLangTopics.length - globalIdx}. {item.title}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Chủ đề: {item.topic || item.folder}</div>

                                        {/* BOTTOM ROW: COMPLETE ACTION BUTTONS (MỞ THƯ MỤC, COPY PATH, XÓA) */}
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        await fetch('/api/open-folder', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ type: item.type || 'short', folder: item.folder })
                                                        });
                                                    } catch (err) {
                                                        console.error('Lỗi khi mở thư mục:', err);
                                                    }
                                                }}
                                                className="btn btn-secondary"
                                                style={{
                                                    padding: '3px 8px',
                                                    fontSize: '0.72rem',
                                                    background: '#f3f4f6',
                                                    color: '#374151',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontWeight: '500',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title="Mở thư mục dự án trên máy tính"
                                                onMouseOver={(e) => e.currentTarget.style.background = '#e5e7eb'}
                                                onMouseOut={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                            >
                                                📁 Mở thư mục
                                            </button>
                                            <button
                                                onClick={(e) => handleCopyFolderPath(e, item.folder, item.type || type)}
                                                className="btn btn-secondary"
                                                style={{
                                                    padding: '3px 8px',
                                                    fontSize: '0.72rem',
                                                    background: '#e0e7ff',
                                                    color: '#3730a3',
                                                    border: '1px solid #c7d2fe',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title="Copy đường dẫn thư mục chính xác trên máy tính"
                                                onMouseOver={(e) => e.currentTarget.style.background = '#c7d2fe'}
                                                onMouseOut={(e) => e.currentTarget.style.background = '#e0e7ff'}
                                            >
                                                📋 Copy path
                                            </button>
                                            <button
                                                onClick={(e) => deleteProject(e, item.id)}
                                                className="btn btn-danger"
                                                style={{
                                                    padding: '3px 8px',
                                                    fontSize: '0.72rem',
                                                    borderRadius: '6px',
                                                    whiteSpace: 'nowrap',
                                                    background: '#fef2f2',
                                                    color: '#ef4444',
                                                    border: '1px solid #fecaca',
                                                    cursor: 'pointer'
                                                }}
                                                title="Xóa dự án này"
                                            >
                                                🗑️ Xóa
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* LIVE TTS PROGRESS WIDGET */}
                {ttsProgress.show && (
                    <div style={{ position: 'fixed', bottom: '24px', right: '350px', width: '450px', background: '#1e293b', color: '#f8fafc', borderRadius: '12px', padding: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', zIndex: 999, border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ display: 'inline-block', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>🔴</span>
                                Tiến trình Lõi AI Voice
                            </h4>
                            <button onClick={() => setTtsProgress(p => ({ ...p, show: false }))} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}>×</button>
                        </div>
                        <div style={{ background: '#334155', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', height: '100%', width: `${ttsProgress.percent}%`, transition: 'width 0.5s ease' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '12px', fontWeight: 'bold' }}>
                            <span>{ttsProgress.percent === 100 ? 'Đã hoàn tất!' : 'Đang xử lý...'}</span>
                            <span>{ttsProgress.percent}%</span>
                        </div>
                        <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', height: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#10b981', border: '1px solid #020617' }}>
                            {ttsProgress.logs}
                        </div>
                        <style dangerouslySetInnerHTML={{
                            __html: `
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: .5; }
                        }
                    `}} />
                    </div>
                )}

                {/* AUDIO EDITOR MODAL POPUP */}
                {isEditorOpen && selectedFolder && (
                    <AudioEditorModal
                        isOpen={isEditorOpen}
                        onClose={() => setIsEditorOpen(false)}
                        folder={selectedFolder}
                        type={type}
                        filename={editorFilename}
                        onSaved={() => loadContent(selectedFolder, true)}
                    />
                )}

                {/* SETTINGS MODAL POPUP */}
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    driveFolders={driveFolders}
                    onFoldersChanged={loadDriveFolders}
                />

                {/* CAPCUT FOLDER BROWSER — chọn thư mục CapCut project để lấy audio */}
                <FolderBrowser
                    isOpen={isCapcutFolderBrowserOpen}
                    onClose={() => setIsCapcutFolderBrowserOpen(false)}
                    onSelect={(folderPath) => {
                        setIsCapcutFolderBrowserOpen(false);
                        handleExtractCapcutAudio(folderPath);
                    }}
                    title="Chọn thư mục CapCut Project"
                    defaultPath={capcutDefaultPath}
                />

                {/* CAPCUT SCENE AUDIO FOLDER BROWSER — tảo audio cảnh (copy scene_N.wav riêng lẻ) */}
                <FolderBrowser
                    isOpen={isSceneAudioFolderBrowserOpen}
                    onClose={() => setIsSceneAudioFolderBrowserOpen(false)}
                    onSelect={(folderPath) => {
                        setIsSceneAudioFolderBrowserOpen(false);
                        handleExtractSceneAudio(folderPath);
                    }}
                    title="Chọn thư mục CapCut Project (Tảo Audio Cảnh)"
                    defaultPath={sceneAudioDefaultPath}
                />

                {/* SRT QR MODALS — one for AUDIO, one for SCENE */}
                {[
                    { modal: audioSrtQrModal, onClose: () => setAudioSrtQrModal(null), accent: '#065f46', accentBg: '#d1fae5', accentBorder: '#6ee7b7' },
                    { modal: sceneSrtQrModal, onClose: () => setSceneSrtQrModal(null), accent: '#1d4ed8', accentBg: '#dbeafe', accentBorder: '#93c5fd' },
                ].map(({ modal, onClose, accent, accentBg, accentBorder }, idx) => modal?.open ? (
                    <div key={idx}
                        onClick={onClose}
                        style={{
                            position: 'fixed', inset: 0,
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 9999 + idx,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: '#fff',
                                borderRadius: '16px',
                                padding: '28px 32px',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                gap: '16px', maxWidth: '400px', width: '90%',
                            }}
                        >
                            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: accent, textAlign: 'center' }}>
                                📱 Tải {modal.label} SRT về điện thoại
                            </div>

                            {/* Cloud / LAN badge */}
                            <div style={{
                                padding: '5px 14px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: '700',
                                background: modal.isCloud ? '#d1fae5' : '#fef9c3',
                                color: modal.isCloud ? '#065f46' : '#92400e',
                                border: `1px solid ${modal.isCloud ? '#6ee7b7' : '#fde68a'}`,
                            }}>
                                {modal.isCloud ? '☁️ Cloud — Bất kỳ mạng WiFi nào' : '📶 LAN — Cần cùng mạng WiFi'}
                            </div>

                            {/* Segment count */}
                            {modal.segmentCount > 0 && (
                                <div style={{
                                    background: accentBg, border: `1px solid ${accentBorder}`,
                                    borderRadius: '8px', padding: '5px 14px',
                                    fontSize: '0.82rem', color: accent, fontWeight: '600',
                                }}>
                                    {modal.label === 'AUDIO' ? '📝' : '🎬'} {modal.fileName} — {modal.segmentCount} {modal.label === 'AUDIO' ? 'đoạn' : 'cảnh'}
                                </div>
                            )}

                            <div style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', lineHeight: '1.6' }}>
                                📱 Điện thoại cần <strong>cùng mạng WiFi (LAN)</strong>. Quét QR để tải file về điện thoại.
                            </div>

                            {/* QR Code */}
                            <div style={{
                                padding: '12px', background: '#f9fafb',
                                borderRadius: '12px',
                                border: `2px solid ${accentBorder}`,
                            }}>
                                <img
                                    src={modal.qrUrl}
                                    alt={`QR ${modal.label} SRT`}
                                    width={200} height={200}
                                    style={{ display: 'block', borderRadius: '6px' }}
                                />
                            </div>

                            <div style={{
                                fontSize: '0.72rem', color: '#9ca3af', wordBreak: 'break-all',
                                textAlign: 'center', maxWidth: '340px',
                            }}>
                                {modal.lanUrl || modal.downloadUrl}
                            </div>

                            {/* Chỉ có nút Đóng — không download lên PC */}
                            <div style={{ width: '100%' }}>
                                <button
                                    onClick={onClose}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px', background: '#f3f4f6',
                                        color: '#374151', border: '1px solid #e5e7eb',
                                        borderRadius: '8px', fontWeight: '600',
                                        fontSize: '0.9rem', cursor: 'pointer',
                                    }}
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null)}

            </div>
        </div>
    );
}
