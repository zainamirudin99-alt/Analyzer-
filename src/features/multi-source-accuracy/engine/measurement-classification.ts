
import {
  MsmaConstructClass,
  MsmaConstructClassificationResult,
  MsmaConstructDimensionCheck,
  MsmaSourceConfig
} from '../types';

function normalizeToken(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalUnitGroup(unit: string): {
  group: 'MASS_RATE' | 'MOLE_FRACTION' | 'CONCENTRATION_DENSITY' | 'UNKNOWN_OR_CUSTOM';
  deterministicMultiplierToKt: number | null;
} {
  const u = normalizeToken(unit);
  if (!u || u === 'satuan asli') {
    return { group: 'UNKNOWN_OR_CUSTOM', deterministicMultiplierToKt: null };
  }
  if (/^(kt|gg|kiloton|kilo\s*ton|gigagram)/i.test(u)) {
    return { group: 'MASS_RATE', deterministicMultiplierToKt: 1 };
  }
  if (/^(mt|tg|megaton|teragram|juta\s*ton)/i.test(u)) {
    return { group: 'MASS_RATE', deterministicMultiplierToKt: 1000 };
  }
  if (/^(t|ton|tonne|mg)(\s|\/|$)/i.test(u)) {
    return { group: 'MASS_RATE', deterministicMultiplierToKt: 0.001 };
  }
  if (/^(kg)(\s|\/|$)/i.test(u)) {
    return { group: 'MASS_RATE', deterministicMultiplierToKt: 1e-6 };
  }
  if (/molec|cm2|cm²/i.test(u)) {
    return { group: 'MOLE_FRACTION', deterministicMultiplierToKt: null };
  }
  if (/ppm|ppb|xco2/i.test(u)) {
    return { group: 'MOLE_FRACTION', deterministicMultiplierToKt: null };
  }
  if (/ug\/m3|mg\/m3|µg\/m³|µg\/m3/i.test(u)) {
    return { group: 'CONCENTRATION_DENSITY', deterministicMultiplierToKt: null };
  }
  return { group: 'UNKNOWN_OR_CUSTOM', deterministicMultiplierToKt: null };
}

export function classifyMeasurementConstructs(
  sources: MsmaSourceConfig[],
  overrideClass: MsmaConstructClass | null,
  userConfirmed: boolean
): MsmaConstructClassificationResult {
  if (sources.length < 2) {
    return {
      autoClassification: 'BELUM_DITENTUKAN',
      finalClassification: overrideClass ?? 'BELUM_DITENTUKAN',
      isUserOverridden: overrideClass !== null,
      userConfirmed,
      checks: [],
      primaryWarning: 'Pilih minimal 2 sumber pengukuran terlebih dahulu pada Step 3.',
      harmonizationPossible: false,
      isExploratoryEmpiricalBridge: false,
      harmonizationMethodSummary: 'Belum cukup sumber pengukuran untuk dievaluasi.',
      propagatedConversionVarianceBySource: {},
      allowsJointCollocationRanking: false,
      classificationReasons: ['Jumlah sumber aktif kurang dari 2.'],
      alternativeResearchRecommendations: []
    };
  }

  const dims = new Set(sources.map(s => s.physicalDimension));
  const defs = new Set(sources.map(s => normalizeToken(s.constructDefinition)).filter(Boolean));
  const units = sources.map(s => normalizeToken(s.unit));
  const uniqueUnits = new Set(units.filter(Boolean));
  const unitGroups = new Set(sources.map(s => canonicalUnitGroup(s.unit).group));
  const scopes = new Set(sources.map(s => normalizeToken(s.spatialScope)).filter(Boolean));
  const periods = new Set(sources.map(s => normalizeToken(s.temporalPeriod)).filter(Boolean));

  const metadataIncomplete = sources.some(
    s => !s.unit.trim() || !s.constructDefinition.trim() || !s.spatialScope.trim() || !s.temporalPeriod.trim()
  );

  const sameDimension = dims.size === 1;
  const sameUnitExact = uniqueUnits.size === 1 && !units.includes('');
  const sameUnitFamilyScalar =
    unitGroups.size === 1 && !unitGroups.has('UNKNOWN_OR_CUSTOM') && sameDimension;

  // Check if mismatched sources all have documented physical conversion models
  const referenceDim = sources[0].physicalDimension;
  const discordantSources = sources.filter(s => s.physicalDimension !== referenceDim);
  const allDiscordantHavePhysicalModel =
    discordantSources.length > 0 &&
    discordantSources.every(
      s =>
        s.conversionModelEnabled &&
        Number.isFinite(s.conversionSlope) &&
        Math.abs(s.conversionSlope) > 0 &&
        s.conversionFormulaNote.trim().length >= 5 &&
        s.conversionLiteratureRef.trim().length >= 4
    );

  const checks: MsmaConstructDimensionCheck[] = [
    {
      aspect: '1. Definisi Variabel & Target Fisik',
      passed: sameDimension && defs.size <= 2,
      statusLabel: sameDimension
        ? 'Sama / Sebanding'
        : allDiscordantHavePhysicalModel
          ? 'Dapat Dikonversi Fisik'
          : 'Berbeda Konstruk',
      detail: sameDimension
        ? `Seluruh ${sources.length} sumber mengukur dimensi fisik yang sama (${referenceDim}).`
        : `Terdeteksi dimensi fisik berbeda antarsumber (${Array.from(dims).join(' vs ')}).`
    },
    {
      aspect: '2. Satuan Pengukuran (Units)',
      passed: sameUnitExact || sameUnitFamilyScalar,
      statusLabel: sameUnitExact
        ? 'Sama / Sebanding'
        : sameUnitFamilyScalar || allDiscordantHavePhysicalModel
          ? 'Dapat Dikonversi Fisik'
          : metadataIncomplete
            ? 'Belum Lengkap'
            : 'Berbeda Konstruk',
      detail: sameUnitExact
        ? `Seluruh sumber menggunakan satuan identik (${sources[0].unit}).`
        : sameUnitFamilyScalar
          ? `Satuan berada pada dimensi massa/waktu yang sama (${Array.from(uniqueUnits).join(', ')}) dan dapat disetarakan faktor skalar eksak.`
          : `Satuan berbeda secara fisik (${Array.from(uniqueUnits).join(' vs ')}). Penyamaan angka via Z-score atau Min-Max TIDAK menyamakan konstruk fisik.`
    },
    {
      aspect: '3. Cakupan Spasial (Spatial Footprint)',
      passed: scopes.size <= 1 || !Array.from(scopes).some(sc => /titik|radius 500|lokal/i.test(sc)),
      statusLabel:
        scopes.size <= 1
          ? 'Sama / Sebanding'
          : Array.from(scopes).some(sc => /kolom atmosfer|titik|radius/i.test(sc))
            ? 'Berbeda Konstruk'
            : 'Sama / Sebanding',
      detail:
        scopes.size <= 1
          ? `Cakupan wilayah seragam (${sources[0].spatialScope}).`
          : `Terdapat variasi cakupan spasial (${Array.from(scopes).join(' | ')}) yang berpotensi menimbulkan representativeness error.`
    },
    {
      aspect: '4. Periode Temporal',
      passed: periods.size === 1,
      statusLabel: periods.size === 1 ? 'Sama / Sebanding' : 'Berbeda Konstruk',
      detail:
        periods.size === 1
          ? `Resolusi temporal seragam (${sources[0].temporalPeriod}).`
          : `Resolusi periode berbeda (${Array.from(periods).join(' vs ')}); wajib diagregasi ke periode panel yang sama.`
    },
    {
      aspect: '5. Ketersediaan Model Konversi Fisik',
      passed: sameDimension || allDiscordantHavePhysicalModel,
      statusLabel: sameDimension
        ? 'Sama / Sebanding'
        : allDiscordantHavePhysicalModel
          ? 'Dapat Dikonversi Fisik'
          : 'Berbeda Konstruk',
      detail: sameDimension
        ? 'Tidak memerlukan model inversi/konversi lintas-besaran fisik.'
        : allDiscordantHavePhysicalModel
          ? 'Model konversi fisik terdokumentasi beserta referensi ilmiah dan uncertainty konversi.'
          : 'Belum tersedia model konversi fisik terverifikasi (mis. model inversi transpor atmosfer / mass-balance).'
    }
  ];

  let autoClassification: MsmaConstructClass = 'CONTOH_A';
  if (metadataIncomplete) {
    autoClassification = 'BELUM_DITENTUKAN';
  } else if (!sameDimension || (!sameUnitExact && !sameUnitFamilyScalar)) {
    autoClassification = 'CONTOH_B';
  } else if (periods.size > 1) {
    autoClassification = 'CONTOH_B';
  }

  const finalClassification = overrideClass ?? autoClassification;
  const reasons: string[] = [];

  if (finalClassification === 'CONTOH_A') {
    reasons.push(
      `Seluruh ${sources.length} sumber mengukur konstruk fisik yang sama (${referenceDim}) pada periode ${sources[0].temporalPeriod}.`
    );
    if (!sameUnitExact && sameUnitFamilyScalar) {
      reasons.push(
        'Perbedaan satuan hanya berupa kelipatan metrik deterministik pada dimensi fisik yang sama (mis. ton ↔ kiloton), sehingga dapat disetarakan secara eksak.'
      );
    }
    if (scopes.size > 1) {
      reasons.push(
        'Catatan keterwakilan spasial: perbedaan resolusi jejak wilayah akan dievaluasi sebagai potensi representativeness error pada Step 6.'
      );
    }
  } else if (finalClassification === 'CONTOH_B') {
    reasons.push(
      `Sumber mengukur besaran fisik berbeda (${sources.map(s => `${s.displayName}: ${s.unit} [${s.physicalDimension}]`).join('; ')}).`
    );
    reasons.push(
      'Standardisasi Z-score, Min-Max, maupun normalisasi persentil ditolak secara metodologis karena hanya menyamakan skala tanpa menyamakan proses pembangkit fisik.'
    );
  } else {
    reasons.push('Metadata definisi, satuan, atau cakupan sumber belum terisi lengkap sehingga kesamaan konstruk belum dapat dipastikan.');
  }

  const propagatedConversionVarianceBySource: Record<string, number> = {};
  for (const s of sources) {
    if (s.conversionModelEnabled && s.conversionUncertaintySd > 0) {
      propagatedConversionVarianceBySource[s.id] = s.conversionUncertaintySd * s.conversionUncertaintySd;
    } else {
      propagatedConversionVarianceBySource[s.id] = 0;
    }
  }

  const harmonizationPossible =
    finalClassification === 'CONTOH_A' ||
    (finalClassification === 'CONTOH_B' &&
      sources.every(
        s =>
          s.physicalDimension === referenceDim ||
          (s.conversionModelEnabled &&
            Math.abs(s.conversionSlope) > 0 &&
            s.conversionFormulaNote.trim().length >= 5 &&
            s.conversionLiteratureRef.trim().length >= 4)
      ));

  const isExploratoryEmpiricalBridge =
    harmonizationPossible &&
    finalClassification === 'CONTOH_B' &&
    sources.some(
      s =>
        s.conversionModelEnabled &&
        /eksploratori|jembatan kalibrasi empiris|lintas-polutan/i.test(s.conversionFormulaNote)
    );

  const allowsJointCollocationRanking =
    finalClassification === 'CONTOH_A' || (finalClassification === 'CONTOH_B' && harmonizationPossible);

  const countWord =
    sources.length === 3 ? 'Ketiga' : sources.length === 2 ? 'Kedua' : `Ke-${sources.length}`;

  const primaryWarning =
    finalClassification === 'CONTOH_B'
      ? `${countWord} sumber belum tentu mengukur besaran fisik yang sama. TCA klasik tidak dapat diterapkan secara langsung hanya dengan menyamakan satuan atau menormalisasi angka.`
      : finalClassification === 'BELUM_DITENTUKAN'
        ? 'Lengkapi definisi variabel, satuan, dan cakupan wilayah setiap sumber serta konfirmasi hasil klasifikasi sebelum melanjutkan ke pemeringkatan.'
        : null;

  const harmonizationMethodSummary =
    finalClassification === 'CONTOH_A'
      ? sameUnitExact
        ? 'Konstruk dan satuan sudah sepadan; tidak diperlukan konversi lintas-besaran fisik.'
        : 'Penyetaraan faktor skalar metrik deterministik (unitScaleMultiplier) diterapkan sebelum evaluasi collocation.'
      : isExploratoryEmpiricalBridge
        ? 'Mode Eksploratori Aktif: Harmonisasi menggunakan Jembatan Kalibrasi Empiris (bukan model inversi fisika murni) dengan propagasi penuh RMSE ketidakpastian konversi (σ²_total = σ²_ε + σ²_conv).'
        : harmonizationPossible
          ? 'Harmonisasi menggunakan model konversi fisik terdokumentasi dengan propagasi varians ketidakpastian konversi (σ²_total = σ²_ε + σ²_konversi).'
          : 'Harmonisasi langsung TIDAK valid tanpa model inversi transpor atmosfer / keseimbangan massa fisik. Pemeringkatan akurasi bersama diblokir.';

  const alternativeResearchRecommendations =
    finalClassification === 'CONTOH_B' && !harmonizationPossible
      ? [
          '1. Gunakan produk fluks emisi hasil inversi transpor atmosfer (mis. Lagrangian STILT/X-STILT sesuai Yang et al., 2020; Lian et al., 2023) agar data satelit/sensor berada pada konstruk fluks massa (ton CO₂/tahun) yang sama dengan inventaris Pemkot.',
          '2. Pisahkan evaluasi akurasi ke dalam klaster konstruk sejenis: misalnya analisis kesepakatan khusus antarinstrumen konsentrasi atmosfer (ppm) secara terpisah dari evaluasi antar-inventaris emisi (ton/tahun).',
          '3. Gunakan model ekonometrika panel variabel penjelas / elastisitas tren untuk menguji koherensi arah perubahan antar-tahun tanpa mengklaim peringkat varians galat langsung pada satu variabel laten tunggal.'
        ]
      : [];

  return {
    autoClassification,
    finalClassification,
    isUserOverridden: overrideClass !== null && overrideClass !== autoClassification,
    userConfirmed,
    checks,
    primaryWarning,
    harmonizationPossible,
    isExploratoryEmpiricalBridge,
    harmonizationMethodSummary,
    propagatedConversionVarianceBySource,
    allowsJointCollocationRanking,
    classificationReasons: reasons,
    alternativeResearchRecommendations
  };
}
