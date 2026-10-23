/** Custom presets saved in this browser (localStorage). Project files remain the portable format. */
import { parseProject, serializeProject, type Project } from '../core/schema';

const KEY = 'stagecraft.userPresets.v1';
export interface UserPreset { id: string; name: string; json: string; savedAt: string }

export function listUserPresets(): UserPreset[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveUserPreset(p: Project): UserPreset[] {
  const list = listUserPresets().filter((x) => x.name !== p.name);
  const project = { ...p, presetId: undefined };
  list.push({ id: `u${Date.now().toString(36)}`, name: p.name, json: serializeProject(project), savedAt: new Date().toISOString() });
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  return list;
}
export function deleteUserPreset(id: string): UserPreset[] {
  const list = listUserPresets().filter((x) => x.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  return list;
}
export const loadUserPreset = (u: UserPreset) => parseProject(u.json);
