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
export function getDefaultSkills(): CustomAISkill[] {
  return [
    {
      id: 'skill_pdfreader_default',
      name: 'pdfreader',
      description: 'PDF Deep Reader & Quantitative Extractor (Auditor Tabel Laporan & Ekstraksi Metrik Kuantitatif)',
      createdAt: '2026-01-01T00:00:00.000Z',
      content: `---
name: pdfreader
description: PDF Deep Reader & Quantitative Extractor untuk laporan tahunan dan keberlanjutan
---

# PDF Deep Reader & Quantitative Metric Extractor

## Peran & Tanggung Jawab Utama
Anda bertindak sebagai auditor data kuantitatif PDF tingkat lanjut. Tugas Anda adalah memindai seluruh teks, tabel, catatan kaki, dan lampiran dari laporan keberlanjutan / laporan tahunan perusahaan untuk menemukan angka kuantitatif riil yang berhubungan dengan indikator evaluasi.

## Aturan Analisis Dokumen & Ekstraksi Kuantitatif
1. **Navigasi Tabel & Metrik Kuantitatif**:
   - Cari data kuantitatif dalam tabel kinerja lingkungan, tabel emisi GRK (Scope 1, Scope 2, Scope 3), konsumsi energi, pengelolaan air, limbah (B3 & Non-B3), belanja modal (Green CapEx), dan indikator terkait.
   - Pindai variasi istilah dwi-bahasa: "Ton CO2e", "tCO2e", "Liter", "m3", "kWh", "GJ", "TJ", "Rupiah/IDR/USD", "%", "Hektar", "Orang/Karyawan".
2. **Kesesuaian Tahun Fiskal**:
   - Pastikan angka metrik yang diambil sesuai dengan tahun fiskal (FY) yang sedang dianalisis. Jika terdapat tabel perbandingan multi-tahun (misal 2023, 2024, 2025), prioritaskan angka pada kolom tahun fiskal target.
3. **Format Nilai Riil & Zero Non-Disclosure**:
   - Jika indikator diungkapkan secara kuantitatif: tuliskan angka nominal lengkap beserta satuannya (contoh: "1500000 ton CO2e", "250000 liter", "85 %", "Rp 50 Miliar").
   - Jika indikator TIDAK diungkapkan secara kuantitatif atau hanya berupa narasi kualitatif/komitmen tanpa angka nominal riil: kembalikan HANYA nilai "0" (tanpa satuan, tanpa kata tambahan).
4. **Anti-Halusinasi & Ketelitian**:
   - Dilarang mengarang angka yang tidak tertulis dalam laporan.
   - Jangan menyalin judul atau kalimat panjang sebagai pengganti angka.`
    },
    {
      id: 'skill_esg_auditor_default',
      name: 'esg-auditor',
      description: 'Rigorous ESG & Sustainability Disclosure Auditor (Standar GRI, TCFD, & POJK 51)',
      createdAt: '2026-01-01T00:00:00.000Z',
      content: `---
name: esg-auditor
description: Rigorous ESG & Sustainability Disclosure Auditor
---

# Rigorous ESG & Sustainability Disclosure Auditor

## Peran & Metodologi
Bertindak sebagai auditor independen kepatuhan pengungkapan ESG berbasis standar global (GRI Standards, TCFD, SASB, ISO 14064, dan POJK 51/POJK.03/2017).

## Panduan Penilaian Indikator
1. Evaluasi kedalaman pengungkapan berdasarkan bukti objektif dalam teks laporan.
2. Nilai apakah pengungkapan mencakup tata kelola (governance), strategi (strategy), manajemen risiko (risk management), serta target dan metrik (metrics & targets).
3. Jika evaluasi menggunakan skala skor (weighted): tetapkan skor secara adil dan objektif sesuai kriteria rubrik yang ditentukan.
4. Jika evaluasi menggunakan ekstraksi kuantitatif: cari angka riil dan satuan terverifikasi dalam dokumen.`
    }
  ];
}

export function getStoredSkills(): CustomAISkill[] {
  const defaults = getDefaultSkills();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem('analyzer_custom_skills');
    if (!raw) {
      localStorage.setItem('analyzer_custom_skills', JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const hasPdfReader = parsed.some(s => s.name === 'pdfreader' || s.id === 'skill_pdfreader_default');
      if (!hasPdfReader) {
        const merged = [...defaults, ...parsed];
        localStorage.setItem('analyzer_custom_skills', JSON.stringify(merged));
        return merged;
      }
      return parsed;
    }
    return defaults;
  } catch (e) {
    console.warn('Gagal membaca custom AI skills dari localStorage:', e);
    return defaults;
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
  if (typeof window === 'undefined') return ['skill_pdfreader_default'];
  try {
    const raw = localStorage.getItem('analyzer_active_skill_ids');
    const allSkills = getStoredSkills();
    const validIds = new Set(allSkills.map(s => s.id));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(id => typeof id === 'string' && validIds.has(id));
      }
    }
    const legacy = localStorage.getItem('analyzer_active_skill_id');
    if (legacy && legacy !== 'none') {
      if (validIds.has(legacy)) return [legacy];
      const matchByName = allSkills.find(s => s.name === legacy);
      if (matchByName) return [matchByName.id];
    }
    const pdfReader = allSkills.find(s => s.name === 'pdfreader' || s.id === 'skill_pdfreader_default');
    return pdfReader ? [pdfReader.id] : [];
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

// Ekstraksi YAML Frontmatter dari konten SKILL.md / .skill / JSON
function parseSkillMarkdownMetadata(rawText: string, fallbackName: string): {
  name: string;
  description?: string;
  content: string;
} {
  const trimmed = rawText.trim();

  // 1. Coba parse jika format file berupa JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const name = parsed.name || cleanSkillName(fallbackName);
        const description = parsed.description || undefined;
        const content = parsed.content || parsed.instructions || parsed.prompt || trimmed;
        return { name, description, content };
      }
    } catch {}
  }

  // 2. Coba parse format Markdown Frontmatter (---)
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { name: cleanSkillName(fallbackName), content: trimmed };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
  let description: string | undefined = undefined;

  const descMultilineMatch = frontmatter.match(/^description:\s*[>|]?\s*\r?\n((?:[ \t]+[^\r\n]*\r?\n?)+)/m);
  if (descMultilineMatch) {
    description = descMultilineMatch[1]
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ');
  } else {
    const descMatch = frontmatter.match(/^description:\s*["']?([^"'\r\n]+)["']?/m);
    description = descMatch?.[1]?.trim();
  }

  return {
    name: cleanSkillName(nameMatch?.[1]?.trim() || fallbackName),
    description,
    content: body || trimmed
  };
}

function cleanSkillName(raw: string): string {
  return raw
    .replace(/\.(skill|md|txt|json|yaml|yml|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Skill Bantuan';
}

async function decompressSlice(compressedSlice: Uint8Array, method: number): Promise<string | null> {
  const decoder = new TextDecoder('utf-8');
  if (method === 0) {
    return decoder.decode(compressedSlice);
  }
  if (method === 8 && typeof DecompressionStream !== 'undefined') {
    // 1. Coba deflate-raw (ZIP standard RFC 1951)
    try {
      const stream = new Blob([compressedSlice as any]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const res = new Response(stream);
      const ab = await res.arrayBuffer();
      return decoder.decode(ab);
    } catch {
      // 2. Coba deflate (zlib header RFC 1950)
      try {
        const stream = new Blob([compressedSlice as any]).stream().pipeThrough(new DecompressionStream('deflate'));
        const res = new Response(stream);
        const ab = await res.arrayBuffer();
        return decoder.decode(ab);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Ekstraksi SKILL.md dari arsip ZIP (.skill package) menggunakan Web Streams API bawaan
async function extractSkillFromZipBuffer(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');

  const candidateFiles: Array<{ name: string; method: number; compSize: number; localOffset: number }> = [];

  // 1. Scan Central Directory
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

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

      if (
        !fileName.endsWith('/') &&
        (fileName.toLowerCase().endsWith('.md') ||
          fileName.toLowerCase().endsWith('.txt') ||
          fileName.toLowerCase().endsWith('.skill') ||
          fileName.toLowerCase().endsWith('.yaml') ||
          fileName.toLowerCase().endsWith('.json'))
      ) {
        candidateFiles.push({ name: fileName, method, compSize, localOffset });
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }

  // 2. Scan Local File Headers jika Central Directory kosong
  if (candidateFiles.length === 0) {
    let pos = 0;
    while (pos + 30 <= bytes.length) {
      if (view.getUint32(pos, true) === 0x04034b50) {
        const method = view.getUint16(pos + 8, true);
        let compSize = view.getUint32(pos + 18, true);
        const nameLen = view.getUint16(pos + 26, true);
        const extraLen = view.getUint16(pos + 28, true);
        const fName = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
        const dataStart = pos + 30 + nameLen + extraLen;

        if (compSize === 0) {
          let next = dataStart;
          while (next + 4 <= bytes.length) {
            const sig = view.getUint32(next, true);
            if (sig === 0x04034b50 || sig === 0x02014b50 || sig === 0x08074b50) {
              compSize = next - dataStart;
              break;
            }
            next++;
          }
        }

        if (
          !fName.endsWith('/') &&
          (fName.toLowerCase().endsWith('.md') ||
            fName.toLowerCase().endsWith('.txt') ||
            fName.toLowerCase().endsWith('.skill') ||
            fName.toLowerCase().endsWith('.yaml') ||
            fName.toLowerCase().endsWith('.json'))
        ) {
          candidateFiles.push({ name: fName, method, compSize, localOffset: pos });
        }
        pos = dataStart + compSize;
      } else {
        pos++;
      }
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
    const decompressed = await decompressSlice(compressedSlice, entry.method);
    if (decompressed && decompressed.trim()) {
      return decompressed;
    }
  }

  return null;
}

// Parser utama file Skill (.skill, .zip, .md, .txt, .json, .yaml)
export async function parseUploadedSkillFile(file: File): Promise<{
  name: string;
  description?: string;
  content: string;
}> {
  const cleanFallbackName = cleanSkillName(file.name);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1. Cek apakah file adalah paket ZIP (.skill atau .zip diawali PK\x03\x04)
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    let extracted: string | null = null;
    try {
      extracted = await extractSkillFromZipBuffer(buffer);
    } catch (zipErr) {
      console.warn('[parseUploadedSkillFile] Client-side zip extraction failed:', zipErr);
    }

    if (extracted && extracted.trim()) {
      return parseSkillMarkdownMetadata(extracted, cleanFallbackName);
    }

    // 2. Fallback server route /api/skills/parse jika client-side zip parser tidak berhasil
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/skills/parse', { method: 'POST', body: formData });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch (srvErr) {
      console.warn('[parseUploadedSkillFile] Server fallback failed:', srvErr);
    }

    throw new Error('Tidak ditemukan berkas SKILL.md atau instruksi teks di dalam paket .skill/.zip ini.');
  }

  // 3. File berbasis teks (.md, .txt, .json, .yaml, atau .skill raw text)
  const text = new TextDecoder('utf-8').decode(bytes);
  if (!text || !text.trim()) {
    throw new Error('File kosong atau tidak dapat dibaca.');
  }

  return parseSkillMarkdownMetadata(text, cleanFallbackName);
}
