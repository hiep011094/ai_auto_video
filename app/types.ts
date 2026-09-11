// ============================================================
//  TINH_THUC_AI — Central Type Definitions
//  Eliminates ALL `any` usage across the codebase.
// ============================================================

// ---- Queue System ----

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
export type BuddhistCategory = 'buddhist_life' | 'buddhist_wisdom';
export type VideoType = 'short' | 'long';
export type GenerationMethod = 'auto' | 'manual';
export type ContentMode = '1' | '2';
export type Language = 'vi';
export type VoiceStyle = 'contemplative';
export interface QueueTask {
  id: string;
  topic: string;
  mode: ContentMode;
  videoType: VideoType;
  generationMethod: GenerationMethod;
  language: Language;
  voiceStyle: VoiceStyle;
  aiModel?: 'agy' | 'codex';
  category?: BuddhistCategory;
  status: TaskStatus;
  progress?: number;
  errorMessage?: string;
  retryCount?: number;
  outputFolder?: string;
  lockedAt?: string;
  workerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormState {
  generationMethod: GenerationMethod;
  topic: string;
  language: Language;
  mode: ContentMode;
  voiceStyle: VoiceStyle;
  category?: BuddhistCategory;
}

// ---- History & Content ----

export interface HistoryItem {
  id: string;
  title: string;
  folder: string;
  date: string;
  type: VideoType;
  language?: Language;
  topic?: string;
  voiceStyle?: VoiceStyle;
  last_hook_pattern?: number;
  created_at?: string;
  youtube_status?: 'pending' | 'published' | 'scheduled';
  youtube_video_id?: string;
  isYouTubeNative?: boolean;
  raw_yt_id?: string;
  capcut_created?: boolean;
  capcut_created_at?: string;
  sheets_synced?: boolean;
  // Enriched fields from API (not stored in history.json)
  description?: string;
  hasVideo?: boolean;
  videoFileName?: string;
  topicKey?: string;
  topicLabel?: string;
}

export interface Scene {
  scene: number;
  voiceover: string;
  main_idea?: string;
  main_ideas?: string;
  veo_prompt: string;
}

export interface ChapterData {
  file: string;
  data: Scene[];
}

export interface ProjectMetadata {
  title: string;
  description: string;
  keywords: string[];
  videoType?: VideoType;
  mode?: ContentMode;
  language?: string;
  voiceStyle?: string;
  youtube_title?: string;
  youtube_description?: string;
  capcut_created?: boolean;
  capcut_created_at?: string;
}

export interface ProjectContent {
  metadata: ProjectMetadata;
  chapters: ChapterData[];
}

// ---- CapCut ----

export interface CapCutRequest {
  folder_path: string;
  bgm_path?: string;
}

export interface ScannedFolder {
  path: string;
  name: string;
  mp4Count: number;
  parent: string;
}

// ---- API Responses ----

export interface ApiResponse<T = unknown> {
  status?: 'success' | 'error';
  message?: string;
  error?: string;
  data?: T;
}

export interface BrowseItem {
  name: string;
  path: string;
  isDir: boolean;
  isFile?: boolean;
}

export interface BrowseResponse {
  success: boolean;
  path: string;
  parent: string | null;
  items: BrowseItem[];
}

// ---- Toast Notifications ----

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// ---- UI State ----

export type ActiveTab = 'short' | 'long' | 'capcut' | 'youtube';
export type ViewMode = 'create' | 'content';
