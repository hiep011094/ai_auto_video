import path from 'path';
import { readJsonStrict, updateJson } from './storage';
import type { HistoryItem } from '../types';
export const historyPath = () => path.join(process.cwd(), 'database', 'history.json');
type HistoryData = HistoryItem[] | { topics: HistoryItem[] };
export function historyEntries(value: HistoryData): HistoryItem[] {
  const rows = Array.isArray(value) ? value : value.topics;
  if (!Array.isArray(rows)) throw new Error('history.json phải chứa danh sách hợp lệ.');
  return rows;
}
export function readHistory(): HistoryItem[] { return historyEntries(readJsonStrict<HistoryData>(historyPath(), [])); }
export async function updateHistory(mutate: (rows: HistoryItem[]) => HistoryItem[]): Promise<void> {
  await updateJson<HistoryData>(historyPath(), [], value => mutate(historyEntries(value)));
}
