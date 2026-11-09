import {
  CED_GROUPS,
  INDICATOR_DESCRIPTIONS,
  IndicatorItem,
  IndicatorPreset,
  CustomAISkill,
  SCORING_RUBRIC,
  DEFAULT_QUANTITATIVE_RUBRIC
} from './types';

export const DEFAULT_PRESET_ID = 'default_ced_18';

// Bangun preset default dari 18 Indikator CED (Dwibahasa ID & EN)
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
        group: group.name,
        title_id: desc?.title || key.toUpperCase(),
        title_en: desc?.title_en || desc?.title || key.toUpperCase(),
        fullDesc_id: desc?.fullDesc || '',
        fullDesc_en: desc?.fullDesc_en || desc?.fullDesc || '',
        group_id: group.name,
        group_en: group.name
      });
    }
  }

  return {
    id: DEFAULT_PRESET_ID,
    name: '18 Indikator Carbon Emission Disclosure (Standar CED)',
    description: 'Standar baku 18 indikator CED (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) skala skor 0–5.',
    name_id: '18 Indikator Carbon Emission Disclosure (Standar CED)',
    name_en: '18 Carbon Emission Disclosure Indicators (CED Standard)',
    description_id: 'Standar baku 18 indikator CED (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) skala skor 0–5.',
    description_en: 'Standard 18 CED indicators (CC1–CC2, GHG1–GHG7, EC1–EC3, RC1–RC4, ACC1–ACC2) with 0–5 scoring scale.',
    isDefault: true,
    rubricType: 'weighted',
    rubric: SCORING_RUBRIC.map(item => ({ ...item })),
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
    const defaultFresh = createDefaultCEDPreset();

    const defaultIndex = parsed.findIndex(p => p.id === DEFAULT_PRESET_ID);
    if (defaultIndex === -1) {
      parsed.unshift(defaultFresh);
      localStorage.setItem('analyzer_indicator_presets', JSON.stringify(parsed));
    } else {
      let updated = false;
      if (!parsed[defaultIndex].name_en) {
        parsed[defaultIndex].name_id = defaultFresh.name_id;
        parsed[defaultIndex].name_en = defaultFresh.name_en;
        parsed[defaultIndex].description_id = defaultFresh.description_id;
        parsed[defaultIndex].description_en = defaultFresh.description_en;
        updated = true;
      }
      if (!parsed[defaultIndex].rubric || !parsed[defaultIndex].rubricType) {
        parsed[defaultIndex].rubricType = 'weighted';
        parsed[defaultIndex].rubric = defaultFresh.rubric;
        updated = true;
      }
      if (updated) {
        localStorage.setItem('analyzer_indicator_presets', JSON.stringify(parsed));
      }
    }

    // Migrasi otomatis label rubrik kuantitatif lama ("0: 0 Liter") menjadi "0: Tidak Ada Pengungkapan"
    let migratedRubric = false;
    for (const preset of parsed) {
      if (
        (preset.rubricType === 'quantitative_count' || preset.rubricType === 'binary_count') &&
        Array.isArray(preset.rubric)
      ) {
        const hasLegacyZeroLiter = preset.rubric.some(
          r => typeof r.label === 'string' && r.label.toLowerCase().includes('0 liter')
        );
        if (hasLegacyZeroLiter) {
          preset.rubric = DEFAULT_QUANTITATIVE_RUBRIC.map(item => ({ ...item }));
          migratedRubric = true;
        }
      }
    }
    if (migratedRubric) {
      localStorage.setItem('analyzer_indicator_presets', JSON.stringify(parsed));
    }

    return parsed;
  } catch (e) {
    console.warn('Gagal membaca indicator presets dari localStorage:', e);
    return [createDefaultCEDPreset()];
  }
}

export function syncPresetsToCloud(): void {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('analyzer_auth_token');
  if (!token) return;
  import('./account-sync').then(({ pushAccountSettings, readLocalSnapshot }) => {
    pushAccountSettings(readLocalSnapshot()).catch(err => {
      console.warn('[syncPresetsToCloud] Gagal sync ke Supabase:', err);
    });
  });
}

export function saveStoredPresets(presets: IndicatorPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('analyzer_indicator_presets', JSON.stringify(presets));
    window.dispatchEvent(new Event('analyzer_presets_changed'));
    syncPresetsToCloud();
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
  syncPresetsToCloud();
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
    syncPresetsToCloud();
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
  if (id === 'none' || !id) {
    localStorage.setItem('analyzer_active_skill_ids', JSON.stringify([]));
  } else {
    localStorage.setItem('analyzer_active_skill_ids', JSON.stringify([id]));
  }
  window.dispatchEvent(new Event('analyzer_active_skill_changed'));
  syncPresetsToCloud();
}

export function getActiveSkillIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('analyzer_active_skill_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const validIds = new Set(getStoredSkills().map(s => s.id));
        return parsed.filter(id => typeof id === 'string' && validIds.has(id));
      }
    }
    const legacy = localStorage.getItem('analyzer_active_skill_id');
    if (legacy && legacy !== 'none') {
      const validIds = new Set(getStoredSkills().map(s => s.id));
      return validIds.has(legacy) ? [legacy] : [];
    }
    return [];
  } catch {
    return [];
  }
}

export function setActiveSkillIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  localStorage.setItem('analyzer_active_skill_ids', JSON.stringify(uniqueIds));
  localStorage.setItem('analyzer_active_skill_id', uniqueIds[0] || 'none');
  window.dispatchEvent(new Event('analyzer_active_skill_changed'));
  syncPresetsToCloud();
}

export function getActiveSkills(): CustomAISkill[] {
  const activeIds = new Set(getActiveSkillIds());
  if (activeIds.size === 0) return [];
  return getStoredSkills().filter(s => activeIds.has(s.id));
}

export function getCombinedActiveSkillContent(): string {
  const activeList = getActiveSkills();
  if (activeList.length === 0) return '';
  return activeList
    .map((s, idx) => `### [SKILL ${idx + 1}: ${s.name}]\n${s.content}`)
    .join('\n\n---\n\n');
}

export function getActiveSkill(): CustomAISkill | null {
  const activeList = getActiveSkills();
  return activeList[0] || null;
}

// Ekstraksi YAML Frontmatter dari konten SKILL.md / .skill
function parseSkillMarkdownMetadata(rawText: string, fallbackName: string): {
  name: string;
  description?: string;
  content: string;
} {
  const trimmed = rawText.trim();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { name: fallbackName, content: trimmed };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
  const descMatch = frontmatter.match(/^description:\s*["']?([^"'\r\n]+)["']?/m);

  return {
    name: nameMatch?.[1]?.trim() || fallbackName,
    description: descMatch?.[1]?.trim(),
    content: body || trimmed
  };
}

// Ekstraksi SKILL.md dari arsip ZIP (.skill package) menggunakan Web API bawaan
async function extractSkillFromZipBuffer(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');

  // Cari End of Central Directory (0x06054b50) dari belakang
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  const candidateFiles: Array<{ name: string; method: number; compSize: number; localOffset: number }> = [];

  if (eocdOffset !== -1) {
    const cdCount = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    let ptr = cdOffset;

    for (let idx = 0; idx < cdCount && ptr + 46 <= bytes.length; idx++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

      if (!fileName.endsWith('/') && (fileName.toLowerCase().endsWith('.md') || fileName.toLowerCase().endsWith('.txt') || fileName.toLowerCase().endsWith('.skill'))) {
        candidateFiles.push({ name: fileName, method, compSize, localOffset });
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }

  // Prioritaskan SKILL.md
  candidateFiles.sort((a, b) => {
    const aIsSkill = a.name.toLowerCase().endsWith('skill.md') ? 0 : 1;
    const bIsSkill = b.name.toLowerCase().endsWith('skill.md') ? 0 : 1;
    return aIsSkill - bIsSkill;
  });

  for (const entry of candidateFiles) {
    const lh = entry.localOffset;
    if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50) continue;
    const lhNameLen = view.getUint16(lh + 26, true);
    const lhExtraLen = view.getUint16(lh + 28, true);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + entry.compSize;
    if (dataEnd > bytes.length) continue;

    const compressedSlice = bytes.subarray(dataStart, dataEnd);
    if (entry.method === 0) {
      return decoder.decode(compressedSlice);
    } else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressedSlice);
        writer.close();
        const decompressedResp = new Response(ds.readable);
        const ab = await decompressedResp.arrayBuffer();
        return decoder.decode(ab);
      } catch {
        continue;
      }
    }
  }

  return null;
}

// Parser utama file Skill (.skill, .md, .txt, .json, .yaml)
export async function parseUploadedSkillFile(file: File): Promise<{
  name: string;
  description?: string;
  content: string;
}> {
  const cleanFallbackName = file.name.replace(/\.(skill|md|txt|json|yaml|yml)$/i, '');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Cek apakah file adalah paket ZIP (.skill berbasis ZIP diawali PK\x03\x04)
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const extracted = await extractSkillFromZipBuffer(buffer);
    if (extracted && extracted.trim()) {
      return parseSkillMarkdownMetadata(extracted, cleanFallbackName);
    }
    throw new Error('Tidak ditemukan berkas SKILL.md atau instruksi teks di dalam paket .skill ini.');
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  if (!text || !text.trim()) {
    throw new Error('File kosong atau tidak dapat dibaca.');
  }

  return parseSkillMarkdownMetadata(text, cleanFallbackName);
}
