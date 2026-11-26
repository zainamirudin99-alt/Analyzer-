
import {
  MsmaConstructClassificationResult,
  MsmaEstimationBundle,
  MsmaRobustnessBundle,
  MsmaRobustnessScenarioResult,
  MsmaSourceConfig,
  MsmaTransformationId
} from '../types';
import { mad, mean, median } from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';
import { runMultiSourceCollocationEngine } from './n-cornered-hat-ec';
import { applySelectedTransformation } from './transformation';
import { runTripleCollocationEngine } from './triple-collocation';

function extractRanksAndSds(
  obsSubset: AlignedPanelObservation[],
  sources: MsmaSourceConfig[],
  convVars: Record<string, number>,
  estimatorPref: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION' | 'AUTO' = 'AUTO'
): {
  identifiable: boolean;
  ranks: Record<string, number | null>;
  sds: Record<string, number | null>;
  topId: string | null;
  topName: string | null;
} {
  const ranks: Record<string, number | null> = {};
  const sds: Record<string, number | null> = {};
  sources.forEach(s => {
    ranks[s.id] = null;
    sds[s.id] = null;
  });

  if (sources.length < 3 || obsSubset.length < 10) {
    return { identifiable: false, ranks, sds, topId: null, topName: null };
  }

  if (sources.length === 3) {
    const { result } = runTripleCollocationEngine(
      obsSubset,
      [sources[0], sources[1], sources[2]],
      convVars,
      80
    );
    if (!result.isIdentifiable || !result.rankingAllowed) {
      return { identifiable: false, ranks, sds, topId: null, topName: null };
    }
    let topId: string | null = null;
    let topName: string | null = null;
    for (const e of result.estimates) {
      ranks[e.sourceId] = e.relativeRank;
      sds[e.sourceId] = e.errorStandardDeviation;
      if (e.relativeRank === 1) {
        topId = e.sourceId;
        topName = e.displayName;
      }
    }
    return { identifiable: true, ranks, sds, topId, topName };
  }

  const { result } = runMultiSourceCollocationEngine(
    obsSubset,
    sources,
    convVars,
    estimatorPref,
    80
  );
  if (!result.isIdentifiable || !result.rankingAllowed) {
    return { identifiable: false, ranks, sds, topId: null, topName: null };
  }
  let topId: string | null = null;
  let topName: string | null = null;
  for (const e of result.estimates) {
    ranks[e.sourceId] = e.relativeRank;
    sds[e.sourceId] = e.errorStandardDeviation;
    if (e.relativeRank === 1) {
      topId = e.sourceId;
      topName = e.displayName;
    }
  }
  return { identifiable: true, ranks, sds, topId, topName };
}

export function runRobustnessAndSensitivitySuite(params: {
  baseObservations: AlignedPanelObservation[];
  workingObservations: AlignedPanelObservation[];
  sources: MsmaSourceConfig[];
  classification: MsmaConstructClassificationResult;
  activeTransformation: MsmaTransformationId;
  estimation: MsmaEstimationBundle;
}): MsmaRobustnessBundle {
  const {
    baseObservations,
    workingObservations,
    sources,
    classification,
    activeTransformation,
    estimation
  } = params;

  const J = sources.length;
  if (!classification.allowsJointCollocationRanking || J < 3) {
    return {
      evaluated: false,
      rankingStabilityPct: 0,
      isRankingRobust: null,
      stabilityVerdict:
        J === 2
          ? 'Pada J = 2 sumber tanpa Ground Truth, pemeringkatan akurasi individual tidak teridentifikasi sehingga uji stabilitas ranking tidak diklaim.'
          : 'Pemeringkatan diblokir karena ketidaksesuaian konstruk pengukuran (Contoh B tanpa konversi fisik).',
      scenarios: []
    };
  }

  const convVars = classification.propagatedConversionVarianceBySource;
  const scenarios: MsmaRobustnessScenarioResult[] = [];

  // 1. Baseline Full Observations
  const baseRun = extractRanksAndSds(workingObservations, sources, convVars, 'AUTO');
  const baselineTopId = baseRun.topId;

  const pushScenario = (
    id: string,
    label: string,
    cat: MsmaRobustnessScenarioResult['category'],
    nObs: number,
    run: ReturnType<typeof extractRanksAndSds>,
    extraNote?: string
  ) => {
    const changed =
      !run.identifiable ||
      (baselineTopId !== null && run.topId !== baselineTopId) ||
      sources.some(s => baseRun.ranks[s.id] !== null && run.ranks[s.id] !== baseRun.ranks[s.id]);

    scenarios.push({
      scenarioId: id,
      scenarioLabel: label,
      category: cat,
      nObs,
      identifiable: run.identifiable,
      ranksBySourceId: run.ranks,
      errorSdBySourceId: run.sds,
      topSourceId: run.topId,
      topSourceName: run.topName,
      rankChangedFromBaseline: changed,
      conclusionNote: !run.identifiable
        ? `Subsampel (N=${nObs}) tidak teridentifikasi atau mengalami kasus Heywood.`
        : !changed
          ? `Urutan peringkat penuh identik dengan analisis utama (#1 tetap ${run.topName}). ${extraNote ?? ''}`.trim()
          : run.topId === baselineTopId
            ? `Peringkat #1 tetap ${run.topName}, namun terdapat pergeseran urutan pada peringkat bawah. ${extraNote ?? ''}`.trim()
            : `PERUBAHAN KESIMPULAN: Peringkat #1 bergeser ke ${run.topName}. ${extraNote ?? ''}`.trim()
    });
  };

  pushScenario(
    'full_sample',
    '1. Seluruh Observasi Lengkap (Spesifikasi Utama)',
    'FULL_SAMPLE',
    workingObservations.length,
    baseRun
  );

  // 2. Entity Group Split (High vs Low Mean Emission Cities)
  const entityScores = new Map<string, number[]>();
  for (const o of workingObservations) {
    const v = o.valuesBySource[sources[0].id];
    if (v !== null && Number.isFinite(v)) {
      const arr = entityScores.get(o.entity) ?? [];
      arr.push(v);
      entityScores.set(o.entity, arr);
    }
  }
  const entMeanPairs = Array.from(entityScores.entries()).map(([ent, arr]) => ({
    ent,
    m: mean(arr)
  }));
  const medEntScore = median(entMeanPairs.map(x => x.m));
  const highCities = new Set(entMeanPairs.filter(x => x.m >= medEntScore).map(x => x.ent));
  const highObs = workingObservations.filter(o => highCities.has(o.entity));
  const lowObs = workingObservations.filter(o => !highCities.has(o.entity));

  if (highObs.length >= 12) {
    pushScenario(
      'entity_high_group',
      '2a. Kelompok Kota Beremisi Tinggi (≥ Median Kota)',
      'ENTITY_GROUP',
      highObs.length,
      extractRanksAndSds(highObs, sources, convVars)
    );
  }
  if (lowObs.length >= 12) {
    pushScenario(
      'entity_low_group',
      '2b. Kelompok Kota Beremisi Rendah (< Median Kota)',
      'ENTITY_GROUP',
      lowObs.length,
      extractRanksAndSds(lowObs, sources, convVars)
    );
  }

  // 3. Period Split (Early vs Recent Half)
  const periods = Array.from(new Set(workingObservations.map(o => o.period))).sort((a, b) => a - b);
  if (periods.length >= 4) {
    const midIdx = Math.floor(periods.length / 2);
    const earlySet = new Set(periods.slice(0, midIdx));
    const earlyObs = workingObservations.filter(o => earlySet.has(o.period));
    const lateObs = workingObservations.filter(o => !earlySet.has(o.period));
    pushScenario(
      'period_early',
      `3a. Sub-Periode Awal (${periods[0]}–${periods[midIdx - 1]})`,
      'PERIOD_SPLIT',
      earlyObs.length,
      extractRanksAndSds(earlyObs, sources, convVars)
    );
    pushScenario(
      'period_late',
      `3b. Sub-Periode Akhir (${periods[midIdx]}–${periods[periods.length - 1]})`,
      'PERIOD_SPLIT',
      lateObs.length,
      extractRanksAndSds(lateObs, sources, convVars)
    );
  }

  // 4. Without Extreme Outliers (> 3.0 Panel MAD on any source)
  const medBySrc: Record<string, number> = {};
  const madBySrc: Record<string, number> = {};
  for (const s of sources) {
    const vals = workingObservations
      .map(o => o.valuesBySource[s.id])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    medBySrc[s.id] = median(vals);
    madBySrc[s.id] = mad(vals);
  }
  const trimmedObs = workingObservations.filter(o =>
    sources.every(s => {
      const v = o.valuesBySource[s.id];
      if (v === null) return false;
      const sc = madBySrc[s.id];
      return sc <= 1e-12 || Math.abs(v - medBySrc[s.id]) / sc <= 3.0;
    })
  );
  pushScenario(
    'without_outliers',
    '4. Tanpa Observasi Outlier Ekstrem (Trim > 3.0 MAD)',
    'OUTLIER_SENSITIVITY',
    trimmedObs.length,
    extractRanksAndSds(trimmedObs, sources, convVars)
  );

  // 5. Alternative Transformation (Yeo-Johnson if currently NONE, or NONE if currently transformed)
  const altTransform: MsmaTransformationId =
    activeTransformation === 'NONE' ? 'YEO_JOHNSON' : 'NONE';
  const altObs = applySelectedTransformation(baseObservations, sources, altTransform);
  pushScenario(
    'alt_transformation',
    `5. Transformasi Alternatif (${altTransform === 'YEO_JOHNSON' ? 'Yeo-Johnson λ=0.5' : 'Skala Asli Tanpa Transformasi'})`,
    'ALT_TRANSFORMATION',
    altObs.length,
    extractRanksAndSds(altObs, sources, convVars),
    'Membandingkan konsistensi urutan relatif lintas skala.'
  );

  // 6. Strictly Balanced Subpanel (Entities complete across all observed periods)
  const totalP = periods.length;
  const countByEnt = new Map<string, number>();
  for (const o of workingObservations) {
    if (sources.every(s => o.valuesBySource[s.id] !== null)) {
      countByEnt.set(o.entity, (countByEnt.get(o.entity) ?? 0) + 1);
    }
  }
  const balancedEnts = new Set(
    Array.from(countByEnt.entries())
      .filter(([, cnt]) => cnt === totalP)
      .map(([ent]) => ent)
  );
  const balancedObs = workingObservations.filter(o => balancedEnts.has(o.entity));
  if (balancedObs.length >= 12) {
    pushScenario(
      'balanced_subpanel',
      `6. Subsampel Balanced Panel Murni (${balancedEnts.size} Kota Lengkap)`,
      'BALANCED_SUBPANEL',
      balancedObs.length,
      extractRanksAndSds(balancedObs, sources, convVars)
    );
  }

  // 7. Sensitivity to Assumed Error Correlation (González-Gambau et al., 2020: inject rho_12 = +0.25 perturbation on top 2 sources)
  if (J === 3 && estimation.tcaResult?.isIdentifiable) {
    const ests = estimation.tcaResult.estimates;
    const rhoAssumed = 0.25;
    // Under assumed Cov(eps_1, eps_2) = rho * sigma_1 * sigma_2 on calibrated scale, signal variance shifts by -Cov(eps_1, eps_2), increasing sigma_1^2 and sigma_2^2 by +Cov(eps_1, eps_2) and decreasing sigma_3^2 by -Cov(eps_1, eps_2)!
    const sortedByRank = [...ests].sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));
    const sTop = sortedByRank[0];
    const sSecond = sortedByRank[1];
    const deltaCov =
      rhoAssumed * Math.max(0, sTop.errorStandardDeviation) * Math.max(0, sSecond.errorStandardDeviation);

    const adjVars = ests.map(e => {
      const shift =
        e.sourceId === sTop.sourceId || e.sourceId === sSecond.sourceId ? deltaCov : -deltaCov;
      return {
        id: e.sourceId,
        name: e.displayName,
        val: Math.max(1e-6, e.totalComparableErrorVariance + shift)
      };
    });
    adjVars.sort((a, b) => a.val - b.val);
    const pertRanks: Record<string, number | null> = {};
    const pertSds: Record<string, number | null> = {};
    adjVars.forEach((item, idx) => {
      pertRanks[item.id] = idx + 1;
      pertSds[item.id] = Math.sqrt(item.val);
    });

    pushScenario(
      'error_corr_sensitivity',
      `7. Sensitivitas Asumsi Korelasi Galat Positif (ρ_ε = +0.25 antara #1 & #2)`,
      'ERROR_CORRELATION_PERTURBATION',
      estimation.tcaResult.nCompleteTriplets,
      {
        identifiable: true,
        ranks: pertRanks,
        sds: pertSds,
        topId: adjVars[0].id,
        topName: adjVars[0].name
      },
      'Menguji apakah keunggulan sumber #1 bertahan seandainya #1 dan #2 berbagi korelasi galat moderat.'
    );
  }

  // 8. Alternative Feasible Method Comparison (NCH vs EC when J >= 4)
  if (J >= 4 && estimation.multiSourceResult) {
    const altMethod = estimation.multiSourceResult.alternativeEstimator;
    pushScenario(
      'alt_estimator_method',
      `8. Metode Alternatif Layak (${altMethod === 'EXTENDED_COLLOCATION' ? 'Extended Collocation' : 'N-Cornered Hat'})`,
      'ALT_METHOD',
      estimation.multiSourceResult.nCompleteCases,
      extractRanksAndSds(workingObservations, sources, convVars, altMethod),
      'Membandingkan N-Cornered Hat vs Extended Collocation pada matriks data identik.'
    );
  }

  const identifiableScenarios = scenarios.filter(s => s.identifiable);
  const topConsistentCount = identifiableScenarios.filter(s => s.topSourceId === baselineTopId).length;
  const rankingStabilityPct =
    identifiableScenarios.length > 0
      ? (topConsistentCount / identifiableScenarios.length) * 100
      : 0;
  const isRankingRobust = rankingStabilityPct >= 80;

  const stabilityVerdict =
    !baseRun.identifiable || !baselineTopId
      ? 'Spesifikasi dasar tidak menghasilkan peringkat teridentifikasi.'
      : isRankingRobust
        ? `Peringkat #1 (${baseRun.topName}) bersifat ROBUST: bertahan konsisten pada ${topConsistentCount} dari ${identifiableScenarios.length} skenario sensitivitas (${rankingStabilityPct.toFixed(1)}%).`
        : `Peringkat #1 (${baseRun.topName}) SENSITIF terhadap spesifikasi: hanya bertahan pada ${topConsistentCount} dari ${identifiableScenarios.length} skenario (${rankingStabilityPct.toFixed(1)}%). Laporkan ketidakpastian spesifikasi secara transparan.`;

  return {
    evaluated: true,
    rankingStabilityPct,
    isRankingRobust,
    stabilityVerdict,
    scenarios
  };
}
