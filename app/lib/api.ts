// ============================================================
//  TINH_THUC_AI — Centralized API Client
//  All fetch calls go through here for consistent error handling.
// ============================================================

import type {
  QueueTask,
  FormState,
  VideoType,
  HistoryItem,
  ProjectContent,
  ScannedFolder,
  ApiResponse,
  BrowseResponse,
} from '../types';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || data.message || 'Unknown error', res.status);
  }

  return data as T;
}

// ---- Queue ----

export async function fetchQueue(): Promise<QueueTask[]> {
  const data = await request<QueueTask[]>('/api/queue');
  return Array.isArray(data)
    ? data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    : [];
}

export async function submitTask(
  formState: FormState,
  videoType: VideoType,
  aiModel?: string
): Promise<QueueTask> {
  const finalTopic =
    formState.generationMethod === 'auto'
      ? '[Tự động chọn chủ đề]'
      : formState.topic;

  return request<QueueTask>('/api/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: finalTopic,
      mode: formState.mode,
      videoType,
      generationMethod: formState.generationMethod,
      language: formState.language,
      voiceStyle: formState.voiceStyle,
      ...(formState.category ? {category:formState.category}:{}),
      aiModel: aiModel ?? 'agy',
    }),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await request(`/api/queue?id=${taskId}`, { method: 'DELETE' });
}

export async function clearAllTasks(): Promise<void> {
  await request('/api/queue?id=all', { method: 'DELETE' });
}

// ---- History ----

export async function fetchHistory(
  type: VideoType
): Promise<HistoryItem[]> {
  const data = await request<{ topics: HistoryItem[] }>(
    `/api/history?type=${type}`
  );
  return data.topics || [];
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await request(`/api/history?id=${id}`, { method: 'DELETE' });
}

export async function deleteAllHistory(type: VideoType): Promise<void> {
  await request(`/api/history?id=all&type=${type}`, { method: 'DELETE' });
}

// ---- Content ----

export async function fetchContent(
  folder: string,
  type: VideoType
): Promise<ProjectContent> {
  return request<ProjectContent>(
    `/api/content?folder=${encodeURIComponent(folder)}&type=${type}`
  );
}

// ---- CapCut ----

export async function makeCapcut(
  folderPath: string,
  bgmPath?: string
): Promise<ApiResponse> {
  return request<ApiResponse>('/api/capcut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath.trim(),
      bgm_path: bgmPath?.trim() || '',
    }),
  });
}

// ---- Scan Folders ----

export async function scanVideoFolders(): Promise<ScannedFolder[]> {
  const data = await request<{
    status: string;
    folders: ScannedFolder[];
  }>('/api/scan-folders');
  return data.status === 'success' ? data.folders : [];
}

// ---- Browse ----

export async function browsePath(
  dirPath?: string
): Promise<BrowseResponse> {
  const params = new URLSearchParams();
  if (dirPath && dirPath !== 'root') {
    params.set('path', dirPath);
  }
  return request<BrowseResponse>(`/api/browse?${params}`);
}
