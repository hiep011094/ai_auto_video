import profile from '../../config/channel_config.json';
import { InputError } from './security';
import type { QueueTask } from '../types';
export const CHANNEL_NAME = profile.channel_name;
export const CHANNEL_INSTRUCTION = 'Create Vietnamese Buddhist content for ĐƯỜNG VỀ TỈNH THỨC only. The two pillars are Phật pháp sống (buddhist_life) and Trí tuệ Phật giáo (buddhist_wisdom). Narration, titles, descriptions and subtitles are Vietnamese with a contemplative voice. Veo visual prompts remain English according to the canonical schema. Never turn the task into astronomy, general science, finance or unrelated entertainment. Distinguish canonical teachings, tradition-specific interpretation, history and illustrative stories. Never invent a Buddha quotation, scripture reference, supernatural guarantee or medical promise. Verify material claims and cite evidence in runtime ledgers.';
function normalized(text: string): string { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd'); }
export function isBuddhistTopic(topic: string): boolean {
  const value = normalized(topic);
  return profile.topic_signals.some(signal => (` ${value.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${normalized(signal)} `));
}
export function validateTaskInput(body: Record<string, unknown>): Pick<QueueTask, 'topic'|'mode'|'videoType'|'generationMethod'|'language'|'voiceStyle'|'aiModel'|'category'> {
  if (!['short','long'].includes(String(body.videoType))) throw new InputError('Loại video không hợp lệ.');
  if (!['auto','manual'].includes(String(body.generationMethod))) throw new InputError('Phương pháp tạo không hợp lệ.');
  if (!['1','2'].includes(String(body.mode))) throw new InputError('Chế độ nội dung không hợp lệ.');
  if (body.language !== 'vi' || body.voiceStyle !== 'contemplative') throw new InputError('Kênh chỉ tạo tiếng Việt, giọng chiêm nghiệm.');
  if (!['agy','codex'].includes(String(body.aiModel))) throw new InputError('Công cụ AI phải là agy hoặc codex.');
  if (body.category !== undefined && body.category !== '' && !['buddhist_life','buddhist_wisdom'].includes(String(body.category))) throw new InputError('Nhóm chủ đề phải thuộc Phật giáo.');
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (topic.length > 500) throw new InputError('Chủ đề không được vượt quá 500 ký tự.');
  if (body.generationMethod === 'manual' && (!topic || !isBuddhistTopic(topic))) throw new InputError('Hãy nêu rõ góc nhìn Phật giáo của chủ đề, ví dụ chánh niệm, từ bi, vô thường hoặc buông bỏ.');
  return { topic: body.generationMethod === 'auto' ? '[Tự động chọn chủ đề Phật giáo]' : topic, videoType: body.videoType as QueueTask['videoType'], mode: body.mode as QueueTask['mode'], generationMethod: body.generationMethod as QueueTask['generationMethod'], language: 'vi', voiceStyle: 'contemplative', aiModel: body.aiModel as 'agy'|'codex', ...(body.category ? {category: body.category as QueueTask['category']} : {}) };
}
