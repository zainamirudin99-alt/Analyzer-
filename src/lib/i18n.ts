'use client';

import { useState, useEffect } from 'react';
import {
  AppLanguage,
  CEDIndicatorKey,
  INDICATOR_DESCRIPTIONS,
  IndicatorItem,
  IndicatorPreset
} from './types';

export const LANGUAGE_STORAGE_KEY = 'analyzer_language';

export function getStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'id';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === 'en' ? 'en' : 'id';
}

export function setStoredLanguage(lang: AppLanguage): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  window.dispatchEvent(new Event('analyzer_language_changed'));
}

export function useLanguage() {
  const [lang, setLangState] = useState<AppLanguage>('id');

  useEffect(() => {
    setLangState(getStoredLanguage());
    const handleLangChange = () => {
      setLangState(getStoredLanguage());
    };
    window.addEventListener('analyzer_language_changed', handleLangChange);
    return () => {
      window.removeEventListener('analyzer_language_changed', handleLangChange);
    };
  }, []);

  const setLang = (nextLang: AppLanguage) => {
    setStoredLanguage(nextLang);
    setLangState(nextLang);
  };

  return { lang, setLang };
}

const GROUP_TRANSLATIONS_ID_TO_EN: Record<string, string> = {
  'Umum': 'General',
  'Lingkungan': 'Environmental',
  'Sosial': 'Social',
  'Tata Kelola': 'Governance',
  'Climate Change (CC)': 'Climate Change (CC)',
  'Greenhouse Gas (GHG)': 'Greenhouse Gas (GHG)',
  'Energy Consumption (EC)': 'Energy Consumption (EC)',
  'Reduction Commitment (RC)': 'Reduction Commitment (RC)',
  'Accountability (ACC)': 'Accountability (ACC)'
};

const GROUP_TRANSLATIONS_EN_TO_ID: Record<string, string> = {
  'General': 'Umum',
  'Environmental': 'Lingkungan',
  'Social': 'Sosial',
  'Governance': 'Tata Kelola',
  'Climate Change (CC)': 'Climate Change (CC)',
  'Greenhouse Gas (GHG)': 'Greenhouse Gas (GHG)',
  'Energy Consumption (EC)': 'Energy Consumption (EC)',
  'Reduction Commitment (RC)': 'Reduction Commitment (RC)',
  'Accountability (ACC)': 'Accountability (ACC)'
};

export function getPresetName(preset: IndicatorPreset, lang: AppLanguage): string {
  if (preset.isDefault || preset.id === 'default_ced_18') {
    return lang === 'en'
      ? '18 Carbon Emission Disclosure Indicators (CED Standard)'
      : '18 Indikator Carbon Emission Disclosure (Standar CED)';
  }
  if (lang === 'en') {
    return preset.name_en || preset.name;
  }
  return preset.name_id || preset.name;
}

export function getPresetDescription(preset: IndicatorPreset, lang: AppLanguage): string {
  if (preset.isDefault || preset.id === 'default_ced_18') {
    return lang === 'en'
      ? 'Standard 18 CED indicators (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) with 0–5 scoring scale.'
      : 'Standar baku 18 indikator CED (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) skala skor 0–5.';
  }
  if (lang === 'en') {
    return preset.description_en || preset.description || 'Custom sustainability & disclosure indicator collection.';
  }
  return preset.description_id || preset.description || 'Kumpulan indikator evaluasi keberlanjutan & pengungkapan.';
}

export function getIndicatorTitle(ind: IndicatorItem, lang: AppLanguage): string {
  const stdKey = ind.code.toLowerCase() as CEDIndicatorKey;
  const stdEntry = INDICATOR_DESCRIPTIONS[stdKey];

  if (lang === 'en') {
    if (ind.title_en) return ind.title_en;
    if (stdEntry && ind.title === stdEntry.title) return stdEntry.title_en;
    return ind.title;
  } else {
    if (ind.title_id) return ind.title_id;
    if (stdEntry && ind.title === stdEntry.title_en) return stdEntry.title;
    return ind.title;
  }
}

export function getIndicatorDesc(ind: IndicatorItem, lang: AppLanguage): string {
  const stdKey = ind.code.toLowerCase() as CEDIndicatorKey;
  const stdEntry = INDICATOR_DESCRIPTIONS[stdKey];

  if (lang === 'en') {
    if (ind.fullDesc_en) return ind.fullDesc_en;
    if (stdEntry && ind.fullDesc === stdEntry.fullDesc) return stdEntry.fullDesc_en;
    return ind.fullDesc;
  } else {
    if (ind.fullDesc_id) return ind.fullDesc_id;
    if (stdEntry && ind.fullDesc === stdEntry.fullDesc_en) return stdEntry.fullDesc;
    return ind.fullDesc;
  }
}

export function getIndicatorGroup(ind: IndicatorItem, lang: AppLanguage): string {
  const rawGroup = ind.group || (lang === 'en' ? 'General' : 'Umum');
  if (lang === 'en') {
    if (ind.group_en) return ind.group_en;
    return GROUP_TRANSLATIONS_ID_TO_EN[rawGroup] || rawGroup;
  } else {
    if (ind.group_id) return ind.group_id;
    return GROUP_TRANSLATIONS_EN_TO_ID[rawGroup] || rawGroup;
  }
}

export async function translateTextsBatch(texts: string[], targetLang: AppLanguage): Promise<string[]> {
  if (!texts.length) return [];
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang })
    });
    if (!res.ok) return texts;
    const data = await res.json();
    return Array.isArray(data?.translations) && data.translations.length === texts.length
      ? data.translations
      : texts;
  } catch {
    return texts;
  }
}

export async function translateSingleIndicator(
  ind: IndicatorItem,
  sourceLang: AppLanguage
): Promise<IndicatorItem> {
  const targetLang: AppLanguage = sourceLang === 'id' ? 'en' : 'id';
  const stdKey = ind.code.toLowerCase() as CEDIndicatorKey;
  const stdEntry = INDICATOR_DESCRIPTIONS[stdKey];

  if (stdEntry && (ind.title === stdEntry.title || ind.title === stdEntry.title_en)) {
    return {
      ...ind,
      title_id: stdEntry.title,
      title_en: stdEntry.title_en,
      fullDesc_id: stdEntry.fullDesc,
      fullDesc_en: stdEntry.fullDesc_en,
      group_id: ind.group_id || ind.group,
      group_en: ind.group_en || GROUP_TRANSLATIONS_ID_TO_EN[ind.group] || ind.group
    };
  }

  const [trTitle, trDesc, trGroup] = await translateTextsBatch(
    [ind.title, ind.fullDesc || '', ind.group || 'Umum'],
    targetLang
  );

  if (sourceLang === 'id') {
    return {
      ...ind,
      title_id: ind.title,
      title_en: trTitle || ind.title,
      fullDesc_id: ind.fullDesc,
      fullDesc_en: trDesc || ind.fullDesc,
      group_id: ind.group,
      group_en: trGroup || ind.group
    };
  } else {
    return {
      ...ind,
      title_en: ind.title,
      title_id: trTitle || ind.title,
      fullDesc_en: ind.fullDesc,
      fullDesc_id: trDesc || ind.fullDesc,
      group_en: ind.group,
      group_id: trGroup || ind.group
    };
  }
}

export async function ensurePresetsTranslated(
  presets: IndicatorPreset[],
  targetLang: AppLanguage
): Promise<{ updatedPresets: IndicatorPreset[]; changed: boolean }> {
  const textsToTranslate: string[] = [];
  const tasks: Array<{
    type: 'preset_name' | 'preset_desc' | 'ind_title' | 'ind_desc' | 'ind_group';
    pIdx: number;
    iIdx?: number;
  }> = [];

  const cloned: IndicatorPreset[] = JSON.parse(JSON.stringify(presets));

  cloned.forEach((p, pIdx) => {
    if (p.isDefault || p.id === 'default_ced_18') return;

    if (targetLang === 'en' && !p.name_en && p.name) {
      textsToTranslate.push(p.name);
      tasks.push({ type: 'preset_name', pIdx });
    } else if (targetLang === 'id' && !p.name_id && p.name) {
      textsToTranslate.push(p.name);
      tasks.push({ type: 'preset_name', pIdx });
    }

    if (targetLang === 'en' && !p.description_en && p.description) {
      textsToTranslate.push(p.description);
      tasks.push({ type: 'preset_desc', pIdx });
    } else if (targetLang === 'id' && !p.description_id && p.description) {
      textsToTranslate.push(p.description);
      tasks.push({ type: 'preset_desc', pIdx });
    }

    p.indicators.forEach((ind, iIdx) => {
      const stdKey = ind.code.toLowerCase() as CEDIndicatorKey;
      const stdEntry = INDICATOR_DESCRIPTIONS[stdKey];
      if (stdEntry && (ind.title === stdEntry.title || ind.title === stdEntry.title_en)) {
        ind.title_id = stdEntry.title;
        ind.title_en = stdEntry.title_en;
        ind.fullDesc_id = stdEntry.fullDesc;
        ind.fullDesc_en = stdEntry.fullDesc_en;
        return;
      }

      if (targetLang === 'en' && !ind.title_en && ind.title) {
        textsToTranslate.push(ind.title);
        tasks.push({ type: 'ind_title', pIdx, iIdx });
      } else if (targetLang === 'id' && !ind.title_id && ind.title) {
        textsToTranslate.push(ind.title);
        tasks.push({ type: 'ind_title', pIdx, iIdx });
      }

      if (targetLang === 'en' && !ind.fullDesc_en && ind.fullDesc) {
        textsToTranslate.push(ind.fullDesc);
        tasks.push({ type: 'ind_desc', pIdx, iIdx });
      } else if (targetLang === 'id' && !ind.fullDesc_id && ind.fullDesc) {
        textsToTranslate.push(ind.fullDesc);
        tasks.push({ type: 'ind_desc', pIdx, iIdx });
      }

      if (targetLang === 'en' && !ind.group_en && ind.group) {
        textsToTranslate.push(ind.group);
        tasks.push({ type: 'ind_group', pIdx, iIdx });
      } else if (targetLang === 'id' && !ind.group_id && ind.group) {
        textsToTranslate.push(ind.group);
        tasks.push({ type: 'ind_group', pIdx, iIdx });
      }
    });
  });

  if (textsToTranslate.length === 0) {
    return { updatedPresets: cloned, changed: false };
  }

  const translatedList = await translateTextsBatch(textsToTranslate, targetLang);

  // Ambil state terkini dari storage untuk mencegah race condition menimpa indikator/preset yang baru ditambah
  const { getStoredPresets } = await import('./indicators-storage');
  const livePresets = getStoredPresets();

  tasks.forEach((task, idx) => {
    const result = translatedList[idx];
    if (!result) return;
    const oldP = cloned[task.pIdx];
    if (!oldP) return;
    const preset = livePresets.find(p => p.id === oldP.id);
    if (!preset) return;

    if (task.type === 'preset_name') {
      if (targetLang === 'en') preset.name_en = result;
      else preset.name_id = result;
    } else if (task.type === 'preset_desc') {
      if (targetLang === 'en') preset.description_en = result;
      else preset.description_id = result;
    } else if (typeof task.iIdx === 'number') {
      const oldInd = oldP.indicators[task.iIdx];
      if (!oldInd) return;
      const ind = preset.indicators.find(i => i.code === oldInd.code || i.id === oldInd.id);
      if (!ind) return;

      if (task.type === 'ind_title') {
        if (targetLang === 'en') ind.title_en = result;
        else ind.title_id = result;
      } else if (task.type === 'ind_desc') {
        if (targetLang === 'en') ind.fullDesc_en = result;
        else ind.fullDesc_id = result;
      } else if (task.type === 'ind_group') {
        if (targetLang === 'en') ind.group_en = result;
        else ind.group_id = result;
      }
    }
  });

  return { updatedPresets: livePresets, changed: true };
}

