import {
  MsmaConstructClassificationResult,
  MsmaConversionRecommendationTier,
  MsmaRawSheet,
  MsmaSourceConfig,
  MsmaStep4ConversionAdvisor,
  MsmaStep4SourceRecommendation
} from '../types';
import {
  covarianceMatrixFromColumns,
  mean,
  median,
  parseSafeNumber,
  pearsonCorrAndP,
  sanitizeCellText,
  simpleLinearRegression
} from '../utils/numerical';

function roundSig(val: number, digits = 5): number {
  if (!Number.isFinite(val) || val === 0) return 0;
  return Number(val.toPrecision(digits));
}

export function detectPollutantSpecies(src: MsmaSourceConfig): string {
  const text = `${src.columnKey} ${src.displayName} ${src.constructDefinition} ${src.unit} ${src.sourceOriginInfo}`.toLowerCase();
  if (/pm2[._]?5|\bspku\b/i.test(text)) return 'PM2.5';
  if (/pm10/i.test(text)) return 'PM10';
  if (/(^|[_\s-])(no2|tropomi|sentinel[\s_-]*5p)([_\s-]|$)|molec/i.test(text)) return 'NO2 (Kolom Atmosfer)';
  if (/(^|[_\s-])so2([_\s-]|$)/i.test(text)) return 'SO2';
  if (/(^|[_\s-])(ispu|aqi)([_\s-]|$)/i.test(text) || src.physicalDimension === 'INDEX_SCORE') {
    return 'Indeks Kualitas (ISPU/AQI)';
  }
  if (/co2|co₂|xco2|emisi|emission|pemkot|inventaris|satelit|sensor/i.test(text)) return 'CO2';
  return 'Lainnya';
}

function resolveExactMetricSlope(fromUnit: string, toUnit: string): number | null {
  const f = fromUnit.trim().toLowerCase();
  const t = toUnit.trim().toLowerCase();
  if (!f || !t || f === t) return 1;

  const massFactorToKt = (u: string): number | null => {
    if (/^(mt|tg|megaton|teragram)/i.test(u)) return 1000;
    if (/^(kt|gg|kiloton|gigagram)/i.test(u)) return 1;
    if (/^(t|ton|tonne|mg)(\s|\/|$)/i.test(u)) return 0.001;
    if (/^(kg)(\s|\/|$)/i.test(u)) return 1e-6;
    return null;
  };
  const fMass = massFactorToKt(f);
  const tMass = massFactorToKt(t);
  if (fMass !== null && tMass !== null) return fMass / tMass;

  const concFactorToPpm = (u: string): number | null => {
    if (/\bppm\b/.test(u)) return 1;
    if (/\bppb\b/.test(u)) return 0.001;
    return null;
  };
  const fConc = concFactorToPpm(f);
  const tConc = concFactorToPpm(t);
  if (fConc !== null && tConc !== null) return fConc / tConc;

  const partFactorToUg = (u: string): number | null => {
    if (/mg\/m3|mg\/m³/.test(u)) return 1000;
    if (/ug\/m3|µg\/m³|µg\/m3/.test(u)) return 1;
    return null;
  };
  const fPart = partFactorToUg(f);
  const tPart = partFactorToUg(t);
  if (fPart !== null && tPart !== null) return fPart / tPart;

  return null;
}

function extractRawUnitScaledSeries(
  sheet: MsmaRawSheet,
  entityColumn: string,
  timeColumn: string,
  sources: MsmaSourceConfig[]
): Array<Record<string, number | null>> {
  const rows: Array<Record<string, number | null>> = [];
  for (const r of sheet.rows) {
    const ent = sanitizeCellText(r[entityColumn]);
    if (!ent) continue;
    const tVal = parseSafeNumber(r[timeColumn]);
    if (tVal === null && !/(19|20)\d{2}/.test(String(r[timeColumn] ?? ''))) continue;

    const record: Record<string, number | null> = {};
    for (const s of sources) {
      const raw = parseSafeNumber(r[s.columnKey]);
      const mult = Number.isFinite(s.unitScaleMultiplier) && s.unitScaleMultiplier !== 0 ? s.unitScaleMultiplier : 1;
      record[s.id] = raw === null ? null : raw * mult;
    }
    rows.push(record);
  }
  return rows;
}

function probeConvertedCollocationIdentifiable(
  rawSeries: Array<Record<string, number | null>>,
  sources: MsmaSourceConfig[],
  recBySourceId: Map<string, MsmaStep4SourceRecommendation>
): { identifiable: boolean; hasHeywood: boolean; topSourceName: string | null } {
  const complete = rawSeries.filter(r =>
    sources.every(s => r[s.id] !== null && Number.isFinite(r[s.id]))
  );
  const J = sources.length;
  if (complete.length < (J === 2 ? 6 : 12)) {
    return { identifiable: false, hasHeywood: false, topSourceName: null };
  }

  const cols = sources.map((s, idx) =>
    complete.map(r => {
      const v = r[s.id] as number;
      if (idx === 0) return v;
      const rec = recBySourceId.get(s.id);
      if (!rec) return v;
      return rec.recommendedIntercept + rec.recommendedSlope * v;
    })
  );

  if (J === 2) {
    return { identifiable: true, hasHeywood: false, topSourceName: null };
  }

  const C = covarianceMatrixFromColumns(cols);
  if (J === 3) {
    const [c12, c13, c23] = [C[0][1], C[0][2], C[1][2]];
    if (Math.abs(c12) <= 1e-12 || Math.abs(c13) <= 1e-12 || Math.abs(c23) <= 1e-12) {
      return { identifiable: false, hasHeywood: false, topSourceName: null };
    }
    const sigT1 = (c12 * c13) / c23;
    const sigT2 = (c12 * c23) / c13;
    const sigT3 = (c13 * c23) / c12;
    if (sigT1 <= 0 || sigT2 <= 0 || sigT3 <= 0) {
      return { identifiable: false, hasHeywood: true, topSourceName: null };
    }
    const e1 = C[0][0] - sigT1;
    const e2 = C[1][1] - sigT2;
    const e3 = C[2][2] - sigT3;
    const hasHeywood = e1 < 0 || e2 < 0 || e3 < 0;
    if (hasHeywood) return { identifiable: false, hasHeywood: true, topSourceName: null };

    const b2 = c23 / c13;
    const b3 = c23 / c12;
    const g = Math.cbrt(Math.abs(b2 * b3));
    const cal = [e1 * g * g, (e2 * g * g) / (b2 * b2), (e3 * g * g) / (b3 * b3)].map((ev, idx) => {
      const convSd = recBySourceId.get(sources[idx].id)?.recommendedUncertaintySd ?? 0;
      return ev + convSd * convSd;
    });
    let best = 0;
    if (cal[1] < cal[best]) best = 1;
    if (cal[2] < cal[best]) best = 2;
    return { identifiable: true, hasHeywood: false, topSourceName: sources[best].displayName };
  }

  // J >= 4 median-triplet check
  const errs: number[] = [];
  let hasHeywood = false;
  for (let k = 0; k < J; k++) {
    const ests: number[] = [];
    for (let a = 0; a < J; a++) {
      if (a === k) continue;
      for (let b = a + 1; b < J; b++) {
        if (b !== k && Math.abs(C[a][b]) > 1e-10 && C[k][a] * C[k][b] * C[a][b] > 0) {
          ests.push(C[k][k] - (C[k][a] * C[k][b]) / C[a][b]);
        }
      }
    }
    if (ests.length === 0) return { identifiable: false, hasHeywood: true, topSourceName: null };
    const med = median(ests);
    if (med < 0) hasHeywood = true;
    const convSd = recBySourceId.get(sources[k].id)?.recommendedUncertaintySd ?? 0;
    errs.push(Math.max(0, med) + convSd * convSd);
  }
  let best = 0;
  for (let k = 1; k < J; k++) if (errs[k] < errs[best]) best = k;
  return { identifiable: !hasHeywood, hasHeywood, topSourceName: sources[best].displayName };
}

export function evaluateStep4ConversionAdvisor(
  sheet: MsmaRawSheet,
  entityColumn: string,
  timeColumn: string,
  sources: MsmaSourceConfig[],
  classification: MsmaConstructClassificationResult
): MsmaStep4ConversionAdvisor {
  const ref = sources[0];
  if (!ref || sources.length < 2) {
    return {
      referenceSourceId: ref?.id ?? '',
      referenceSourceName: ref?.displayName ?? '-',
      referenceUnit: ref?.unit ?? '',
      overallTier: 'SAME_CONSTRUCT',
      headlineRecommendation: 'Pilih minimal 2 sumber pengukuran terlebih dahulu pada Step 3.',
      scientificExplanation: 'Evaluasi konversi membutuhkan sumber referensi target.',
      probeIdentifiableIfApplied: false,
      probeHasHeywoodIfApplied: false,
      probeTopSourceIfApplied: null,
      sourceRecommendations: []
    };
  }

  const refSpecies = detectPollutantSpecies(ref);
  const rawSeries = extractRawUnitScaledSeries(sheet, entityColumn, timeColumn, sources);
  const recs: MsmaStep4SourceRecommendation[] = [];

  for (let k = 1; k < sources.length; k++) {
    const src = sources[k];
    const srcSpecies = detectPollutantSpecies(src);
    const sameSpecies = srcSpecies === refSpecies;
    const exactRatio =
      src.physicalDimension === ref.physicalDimension && sameSpecies
        ? resolveExactMetricSlope(src.unit, ref.unit)
        : null;

    const paired = rawSeries
      .map(row => ({ x: row[src.id], y: row[ref.id] }))
      .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y));

    const xs = paired.map(p => p.x);
    const ys = paired.map(p => p.y);
    const { r } = pearsonCorrAndP(xs, ys);
    const reg = simpleLinearRegression(xs, ys);
    const rSq = Math.max(0, Math.min(1, r * r));

    let sse = 0;
    for (let i = 0; i < paired.length; i++) {
      const err = ys[i] - (reg.intercept + reg.slope * xs[i]);
      sse += err * err;
    }
    const rmse = paired.length > 2 ? Math.sqrt(sse / (paired.length - 2)) : 0;

    if (exactRatio !== null) {
      const slopeOut = roundSig(exactRatio, 6);
      recs.push({
        sourceId: src.id,
        displayName: src.displayName,
        sourceUnit: src.unit,
        targetUnit: ref.unit,
        sourceSpecies: srcSpecies,
        targetSpecies: refSpecies,
        tier: 'EXACT_METRIC',
        shouldApplyConversion: src.unit.trim().toLowerCase() !== ref.unit.trim().toLowerCase(),
        nPairedObs: paired.length,
        pearsonR: r,
        rSquared: rSq,
        recommendedSlope: slopeOut,
        recommendedIntercept: 0,
        recommendedUncertaintySd: 0,
        recommendedFormulaNote: `Konversi metrik SI eksak: ${ref.unit} = ${slopeOut} * ${src.unit}`,
        recommendedLiteratureRef: 'SI Metric Unit Definition (IPCC 2006)',
        rationale: `Dimensi fisik identik (${src.physicalDimension}); rasio satuan metrik ${src.unit} ke ${ref.unit} bersifat deterministik tanpa kesalahan model konversi (σ_conv = 0).`,
        caveatWarning: 'Aman dan direkomendasikan langsung karena hanya mengubah faktor skala metrik eksak.'
      });
      continue;
    }

    const slopeRec = Math.abs(reg.slope) > 1e-12 ? roundSig(reg.slope, 5) : 1;
    const intRec = roundSig(reg.intercept, 5);
    const sigConvRec = rmse > 0 ? roundSig(rmse, 4) : roundSig(Math.max(1e-3, Math.abs(mean(ys)) * 0.1), 4);

    if (sameSpecies && r >= 0.4) {
      const tier: MsmaConversionRecommendationTier = 'EMPIRICAL_SAME_GAS_BRIDGE';
      const litRef =
        /ppm|xco2|mole/i.test(src.unit)
          ? 'Yang et al. (2023) JGR: Atmospheres (doi:10.1029/2022JD037736); Lian et al. (2023) ACP'
          : 'Che et al. (2024) JGR: Atmospheres; Fu et al. (2019) Earths Future';
      recs.push({
        sourceId: src.id,
        displayName: src.displayName,
        sourceUnit: src.unit,
        targetUnit: ref.unit,
        sourceSpecies: srcSpecies,
        targetSpecies: refSpecies,
        tier,
        shouldApplyConversion: true,
        nPairedObs: paired.length,
        pearsonR: r,
        rSquared: rSq,
        recommendedSlope: slopeRec,
        recommendedIntercept: intRec,
        recommendedUncertaintySd: sigConvRec,
        recommendedFormulaNote: `Jembatan Kalibrasi Empiris (Eksploratori): ${ref.unit} ≈ ${intRec} + ${slopeRec} * ${src.columnKey} (r=${r.toFixed(3)}, R²=${rSq.toFixed(3)})`,
        recommendedLiteratureRef: litRef,
        rationale: `Mengukur spesies gas sama (${srcSpecies}) dengan korelasi positif (r = ${r.toFixed(3)}, R² = ${(rSq * 100).toFixed(1)}%). Jika Anda belum memiliki parameter inversi STILT eksternal, sistem mengestimasi persamaan jembatan linear beserta penalti ketidakpastian σ_conv = ${sigConvRec} (RMSE residu) agar sumber tidak menang semu tanpa biaya konversi.`,
        caveatWarning: 'Berlabel Eksploratori: hasil akurasi bergantung pada stabilitas rasio inversi lokal dan wajib dilaporkan sebagai estimasi jembatan terkalibrasi (bukan observasi langsung).'
      });
    } else {
      const reasonPrefix = !sameSpecies
        ? `Polutan/target berbeda (${srcSpecies} [${src.unit}] vs ${refSpecies} [${ref.unit}])`
        : `Korelasi empiris antarsumber terlalu lemah atau negatif (r = ${r.toFixed(3)})`;

      recs.push({
        sourceId: src.id,
        displayName: src.displayName,
        sourceUnit: src.unit,
        targetUnit: ref.unit,
        sourceSpecies: srcSpecies,
        targetSpecies: refSpecies,
        tier: 'CROSS_POLLUTANT_OR_WEAK',
        shouldApplyConversion: false,
        nPairedObs: paired.length,
        pearsonR: r,
        rSquared: rSq,
        recommendedSlope: slopeRec,
        recommendedIntercept: intRec,
        recommendedUncertaintySd: sigConvRec,
        recommendedFormulaNote: `Jembatan Empiris Lintas-Polutan (Eksploratori — Non-Fisik): ${ref.unit} ≈ ${intRec} + ${slopeRec} * ${src.columnKey} (r=${r.toFixed(3)}, R²=${rSq.toFixed(3)})`,
        recommendedLiteratureRef: 'Yang et al. (2023) JGR: Atmospheres; Balasubramaniam & Ruf (2025) Remote Sensing',
        rationale: `${reasonPrefix}. Secara ilmiah TIDAK disarankan memaksakan penyamaan ke ${ref.unit}; namun apabila Anda tetap ingin menguji sensitivitas mode eksploratori, parameter jembatan regresi panel telah dihitung otomatis di samping dengan σ_conv = ${sigConvRec} (RMSE residu).`,
        caveatWarning: `${reasonPrefix}: pemaksaan konversi linear hanya menghasilkan proyeksi eksploratori berisiko bias ko-emisi dan tidak sah untuk klaim akurasi fisik absolut.`
      });
    }
  }

  const recMap = new Map(recs.map(r => [r.sourceId, r]));
  const probe = probeConvertedCollocationIdentifiable(rawSeries, sources, recMap);

  const hasCrossPollutant = recs.some(r => r.tier === 'CROSS_POLLUTANT_OR_WEAK');
  const hasSameGasBridge = recs.some(r => r.tier === 'EMPIRICAL_SAME_GAS_BRIDGE');
  const hasExactOnly = recs.every(r => r.tier === 'EXACT_METRIC');

  const buildResult = (
    overallTier: MsmaStep4ConversionAdvisor['overallTier'],
    headlineRecommendation: string,
    scientificExplanation: string
  ): MsmaStep4ConversionAdvisor => ({
    referenceSourceId: ref.id,
    referenceSourceName: ref.displayName,
    referenceUnit: ref.unit,
    overallTier,
    headlineRecommendation,
    scientificExplanation,
    probeIdentifiableIfApplied: probe.identifiable,
    probeHasHeywoodIfApplied: probe.hasHeywood,
    probeTopSourceIfApplied: probe.topSourceName,
    sourceRecommendations: recs
  });

  if (classification.finalClassification === 'CONTOH_A') {
    return buildResult(
      'SAME_CONSTRUCT',
      'Seluruh sumber sudah berkonstruk sepadan (Contoh A) — tidak memerlukan konversi lintas besaran.',
      'Lanjutkan konfirmasi dan lanjut ke Step 5 untuk statistik deskriptif panel.'
    );
  }
  if (hasExactOnly) {
    return buildResult(
      'EXACT_METRIC_READY',
      'Konversi Metrik SI Eksak Tersedia — Aman Diterapkan 1-Klik',
      'Perbedaan sumber hanya terletak pada skala satuan SI dalam dimensi fisik yang identik. Sistem merekomendasikan penerapan pengali metrik eksak dengan σ_conv = 0.'
    );
  }
  if (!hasCrossPollutant && hasSameGasBridge) {
    return buildResult(
      'EXPLORATORY_SAME_GAS',
      'Rekomendasi Terbaik Step 4: Terapkan Jembatan Kalibrasi Empiris + Propagasi Uncertainty (Eksploratori)',
      'Sumber mengukur spesies gas yang sama pada dimensi berbeda (mis. konsentrasi XCO₂ ppm vs fluks emisi kt/tahun). Untuk hasil terbaik tanpa menuliskan angka tebakan (1, 0, 0), sistem menghitung Slope, Intercept, dan simpangan galat konversi (σ_conv = RMSE residu) langsung dari pasangan data panel Anda disertai sitasi Crossref terverifikasi.'
    );
  }
  return buildResult(
    'CROSS_POLLUTANT_NOT_RECOMMENDED',
    'Rekomendasi Terbaik Secara Ilmiah: Jangan Paksa Konversi Fisik Lintas-Polutan (Atau Gunakan Draf Eksploratori Berlabel Ketat)',
    'Terdeteksi campuran spesies polutan/dimensi berbeda (mis. inventaris CO₂ vs kolom NO₂ Sentinel-5P vs PM2.5 SPKU) atau korelasi sangat lemah/negatif. Mengisi angka konversi acak (Slope=1, σ_conv=0) tidak sah. Pilihan terbaik adalah memisahkan polutan sejenis di Step 3/Rekomendasi Alternatif; namun jika Anda tetap ingin mengisi form di atas untuk uji eksploratori, sistem telah menyiapkan estimasi empiris Slope, Intercept, σ_conv (RMSE), Persamaan, dan Referensi Crossref.'
  );
}
