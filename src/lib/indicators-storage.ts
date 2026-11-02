import {
  CED_GROUPS,
  INDICATOR_DESCRIPTIONS,
  IndicatorItem,
  IndicatorPreset,
  CustomAISkill
} from './types';

export const DEFAULT_PRESET_ID = 'default_ced_18';

// Bangun preset default dari 18 Indikator CED
export function createDefaultCEDPreset(): IndicatorPreset {
  const items: IndicatorItem[] = [];

  for (const group of CED_GROUPS) {
    for (const key of group.keys) {
      const desc = INDICATOR_DESCRIPTIONS[key];
      items.push({
        id: key,
        code: key.toUpperCase(),
        title: desc?.title || key.toUpperCase(),
        fullDesc: desc?.fullDesc || '',
        group: group.name
      });
    }
  }

  return {
    id: DEFAULT_PRESET_ID,
    name: '18 Indikator Carbon Emission Disclosure (Standar CED)',
    description: 'Standar baku 18 indikator CED (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) skala skor 0–5.',
    isDefault: true,
    indicators: items,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

// Preset Helper Functions
export function getStoredPresets(): IndicatorPreset[] {
  if (typeof window === 'undefined') {
    return [createDefaultCEDPreset()];
  }

  try {
    const raw = localStorage.getItem('analyzer_indicator_presets');
    if (!raw) {
      const initial = [createDefaultCEDPreset()];
      localStorage.setItem('analyzer_indicator_presets', JSON.stringify(initial));
      return initial;
    }
    const parsed: IndicatorPreset[] = JSON.parse(raw);
    // Pastikan preset default selalu ada
    if (!parsed.some(p => p.id === DEFAULT_PRESET_ID)) {
      parsed.unshift(createDefaultCEDPreset());
      localStorage.setItem('analyzer_indicator_presets', JSON.stringify(parsed));
    }
    return parsed;
  } catch (e) {
    console.warn('Gagal membaca indicator presets dari localStorage:', e);
    return [createDefaultCEDPreset()];
  }
}

export function saveStoredPresets(presets: IndicatorPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('analyzer_indicator_presets', JSON.stringify(presets));
    // Trigger custom event untuk update antar-komponen instan
    window.dispatchEvent(new Event('analyzer_presets_changed'));
  } catch (e) {
    console.warn('Gagal menyimpan indicator presets ke localStorage:', e);
  }
}

export function getActivePresetId(): string {
  if (typeof window === 'undefined') return DEFAULT_PRESET_ID;
  return localStorage.getItem('analyzer_active_preset_id') || DEFAULT_PRESET_ID;
}

export function setActivePresetId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('analyzer_active_preset_id', id);
  window.dispatchEvent(new Event('analyzer_active_preset_changed'));
}

export function getActivePreset(): IndicatorPreset {
  const presets = getStoredPresets();
  const activeId = getActivePresetId();
  const found = presets.find(p => p.id === activeId);
  return found || presets[0] || createDefaultCEDPreset();
}

// Custom AI Skills Helper Functions
export function getStoredSkills(): CustomAISkill[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('analyzer_custom_skills');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Gagal membaca custom AI skills dari localStorage:', e);
    return [];
  }
}

export function saveStoredSkills(skills: CustomAISkill[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('analyzer_custom_skills', JSON.stringify(skills));
    window.dispatchEvent(new Event('analyzer_skills_changed'));
  } catch (e) {
    console.warn('Gagal menyimpan custom AI skills ke localStorage:', e);
  }
}

export function getActiveSkillId(): string {
  if (typeof window === 'undefined') return 'none';
  return localStorage.getItem('analyzer_active_skill_id') || 'none';
}

export function setActiveSkillId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('analyzer_active_skill_id', id);
  window.dispatchEvent(new Event('analyzer_active_skill_changed'));
}

export function getActiveSkill(): CustomAISkill | null {
  const id = getActiveSkillId();
  if (!id || id === 'none') return null;
  const skills = getStoredSkills();
  return skills.find(s => s.id === id) || null;
}

