/** Project timestamps use Vietnam time (UTC+7). */
export function toVNTime(date = new Date()): string {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().replace('Z', '+07:00');
}
