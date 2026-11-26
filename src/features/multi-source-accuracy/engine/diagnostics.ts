
import {
  MsmaConstructClassificationResult,
  MsmaDescriptiveBundle,
  MsmaDiagnosticItem,
  MsmaDiagnosticsBundle,
  MsmaEstimationBundle,
  MsmaMethodId,
  MsmaPanelStructureResult,
  MsmaSourceConfig
} from '../types';
import { mean, pearsonCorrAndP, sampleVariance, simpleLinearRegression } from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';

export function runMethodDiagnostics(params: {
  targetMethod: MsmaMethodId;
  observations: AlignedPanelObservation[];
  sources: MsmaSourceConfig[];
  panel: MsmaPanelStructureResult;
  classification: MsmaConstructClassificationResult;
  descriptives: MsmaDescriptiveBundle;
  estimation: MsmaEstimationBundle;
}): MsmaDiagnosticsBundle {
  const {
    targetMethod,
    observations,
    sources,
    panel,
    classification,
    descriptives,
    estimation
  } = params;

  const J = sources.length;
  const items: MsmaDiagnosticItem[] = [];
  const ncc = descriptives.nCompleteCasesAllSources;

  // 0. Construct Equivalence Check (Universal)
  items.push({
    id: 'construct_equivalence',
    testName: 'Kesepadanan Konstruk Pengukuran (Contoh A vs Contoh B)',
    applicableMethods: 'Semua Metode',
    testabilityTier: 'TIDAK_LANGSUNG',
    hypothesis: 'Seluruh sumber mengukur besaran fisik dan domain ruang-waktu yang sepadan',
    statisticLabel: 'Klasifikasi',
    statisticValue: classification.allowsJointCollocationRanking ? 1 : 0,
    pValue: null,
    confidenceInterval: null,
    status: classification.allowsJointCollocationRanking
      ? classification.finalClassification === 'CONTOH_A'
        ? 'Memenuhi'
        : 'Perlu perhatian'
      : 'Tidak memenuhi',
    interpretation: classification.allowsJointCollocationRanking
      ? `Konstruk pengukuran sepadan (${classification.finalClassification}). ${classification.harmonizationMethodSummary}`
      : `Konstruk fisik berbeda tanpa model konversi valid: evaluasi collocation bersama tidak memenuhi syarat.`
  });

  // 1. Sample Adequacy (Empirical)
  const minRecommendedObs = J === 2 ? 30 : J === 3 ? 60 : 80;
  items.push({
    id: 'sample_adequacy',
    testName: 'Kecukupan Sampel & Variasi Panel (Sample Adequacy)',
    applicableMethods: 'Semua Metode',
    testabilityTier: 'EMPIRIS',
    hypothesis: `Observasi irisan lengkap N_CC ≥ ${minRecommendedObs} dan jumlah entitas G ≥ 10`,
    statisticLabel: 'N_CC',
    statisticValue: ncc,
    pValue: null,
    confidenceInterval: null,
    status:
      ncc >= minRecommendedObs && panel.nEntities >= 10
        ? 'Memenuhi'
        : ncc >= 15 && panel.nEntities >= 4
          ? 'Perlu perhatian'
          : 'Tidak memenuhi',
    interpretation:
      ncc >= minRecommendedObs && panel.nEntities >= 10
        ? `Tersedia N = ${ncc} observasi lengkap pada G = ${panel.nEntities} entitas, memadai untuk stabilitas kovarians dan cluster bootstrap.`
        : `Tersedia N = ${ncc} observasi lengkap (G = ${panel.nEntities}). Lebar interval kepercayaan bootstrap akan lebih lebar akibat sampel terbatas (Gruber et al., 2016).`
  });

  // Branch A: Two Sources (Bland-Altman & Deming)
  if (J === 2 && estimation.twoSourceResult) {
    const two = estimation.twoSourceResult;
    const meanAbsBiasRatio =
      Math.abs(two.meanDifference) / Math.max(1e-9, two.repeatedMeasuresSdDifference);

    items.push({
      id: 'ba_mean_diff',
      testName: 'Bias Sistematis Rata-Rata (Mean Difference Bias)',
      applicableMethods: 'Bland-Altman',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'H₀: E[X₁ − X₂] = 0 (tidak ada bias aditif rata-rata)',
      statisticLabel: 'Mean Diff',
      statisticValue: two.meanDifference,
      pValue: null,
      confidenceInterval: two.meanDifferenceCi95,
      status:
        two.meanDifferenceCi95[0] <= 0 && two.meanDifferenceCi95[1] >= 0
          ? 'Memenuhi'
          : meanAbsBiasRatio > 0.5
            ? 'Perlu perhatian'
            : 'Memenuhi',
      interpretation: `Selisih rata-rata = ${two.meanDifference.toFixed(3)} (95% Cluster CI: [${two.meanDifferenceCi95[0].toFixed(3)}, ${two.meanDifferenceCi95[1].toFixed(3)}]). Keputusan didasarkan pada besaran fisik rasio selisih terhadap SD (${meanAbsBiasRatio.toFixed(2)}× SD), bukan p-value semata.`
    });

    items.push({
      id: 'ba_proportional_bias',
      testName: 'Bias Proporsional (Deming Slope & Difference-vs-Mean)',
      applicableMethods: 'Bland-Altman & Deming',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'H₀: β_Deming = 1 dan kemiringan selisih terhadap rerata = 0',
      statisticLabel: 'Deming β̂',
      statisticValue: two.demingSlope,
      pValue: two.proportionalBiasP,
      confidenceInterval: two.demingSlopeCi95,
      status:
        Math.abs(two.demingSlope - 1) <= 0.08 &&
        two.demingSlopeCi95[0] <= 1.05 &&
        two.demingSlopeCi95[1] >= 0.95
          ? 'Memenuhi'
          : 'Perlu perhatian',
      interpretation: `Kemiringan Deming = ${two.demingSlope.toFixed(4)} (95% CI: [${two.demingSlopeCi95[0].toFixed(4)}, ${two.demingSlopeCi95[1].toFixed(4)}]); kemiringan Bland-Altman = ${two.proportionalBiasSlope.toFixed(4)}.`
    });

    items.push({
      id: 'ba_heteroskedasticity',
      testName: 'Homoskedastisitas Selisih Pengukuran',
      applicableMethods: 'Bland-Altman',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'Lebar penyimpangan |D − D̄| konstan di seluruh rentang nilai pengukuran',
      statisticLabel: 'Slope |e|',
      statisticValue: two.heteroskedasticitySlopeAbsDiff,
      pValue: two.heteroskedasticityP,
      confidenceInterval: null,
      status:
        Math.abs(two.heteroskedasticitySlopeAbsDiff) < 0.08 || two.heteroskedasticityP > 0.05
          ? 'Memenuhi'
          : 'Perlu perhatian',
      interpretation:
        Math.abs(two.heteroskedasticitySlopeAbsDiff) < 0.08 || two.heteroskedasticityP > 0.05
          ? 'Lebar penyebaran selisih relatif stabil lintas kota kecil hingga kota besar.'
          : 'Penyebaran selisih membesar seiring kenaikan skala emisi; pertimbangkan transformasi logaritmik untuk kesepakatan rasio pada Step 7.'
    });

    const iccDiff =
      two.betweenEntityDiffVariance /
      Math.max(1e-12, two.betweenEntityDiffVariance + two.withinEntityDiffVariance);

    items.push({
      id: 'ba_cluster_dependence',
      testName: 'Ketergantungan Klaster dalam Kota (Cluster Dependence ICC)',
      applicableMethods: 'Panel Bland-Altman',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'Evaluasi porsi varians selisih antarkota terhadap total varians selisih',
      statisticLabel: 'ICC_diff',
      statisticValue: iccDiff,
      pValue: null,
      confidenceInterval: null,
      status: iccDiff < 0.25 ? 'Memenuhi' : 'Perlu perhatian',
      interpretation: `Proporsi varians selisih antarkota ICC = ${(iccDiff * 100).toFixed(1)}%. Repeated-Measures LoA (Parker et al., 2020) dan Entity-Cluster Bootstrap telah mengoreksi dependensi klaster ini.`
    });

    items.push({
      id: 'deming_individual_id',
      testName: 'Identifikasi Varians Galat Individual pada J = 2',
      applicableMethods: 'Deming Regression',
      testabilityTier: 'TIDAK_DAPAT_DIUJI_TANPA_GT',
      hypothesis: 'Pemisahan σ²_ε1 dan σ²_ε2 secara mandiri tanpa informasi eksternal',
      statisticLabel: 'λ_kerja',
      statisticValue: two.demingErrorVarianceRatioLambda,
      pValue: null,
      confidenceInterval: null,
      status: 'Tidak dapat diuji',
      interpretation:
        'Dengan hanya 2 sumber tanpa Ground Truth, varians galat masing-masing instrumen TIDAK dapat diuji atau diidentifikasi secara terpisah tanpa rasio varians galat kalibrasi eksternal.'
    });
  }

  // Branch B & C: Collocation Family (J = 3 TCA or J >= 4 NCH / EC)
  if (J >= 3) {
    // 1. Linearity check (Empirical via quadratic term R^2 increment across pairs)
    let maxQuadGain = 0;
    for (const sc of descriptives.pairwiseScatters) {
      if (sc.points.length < 8) continue;
      const xs = sc.points.map(p => p.a);
      const ys = sc.points.map(p => p.b);
      const lin = simpleLinearRegression(xs, ys);
      const mX = mean(xs);
      const resLin = sc.points.map(p => p.b - (lin.intercept + lin.slope * p.a));
      const xSq = xs.map(x => (x - mX) * (x - mX));
      const quad = simpleLinearRegression(xSq, resLin);
      if (quad.r2 > maxQuadGain) maxQuadGain = quad.r2;
    }

    items.push({
      id: 'collocation_linearity',
      testName: 'Hubungan Kalibrasi Linear Antarsumber (Linearity)',
      applicableMethods: J === 3 ? 'TCA' : 'N-Cornered Hat & Extended Collocation',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'Relasi antarsumber mengikuti fungsi linear X_k = α_k + β_k T + ε_k tanpa kelengkungan kuadratik kuat',
      statisticLabel: 'Max ΔR²_quad',
      statisticValue: maxQuadGain,
      pValue: null,
      confidenceInterval: null,
      status: maxQuadGain <= 0.05 ? 'Memenuhi' : maxQuadGain <= 0.12 ? 'Perlu perhatian' : 'Tidak memenuhi',
      interpretation:
        maxQuadGain <= 0.05
          ? `Penambahan suku kuadratik hanya menjelaskan maksimal ${(maxQuadGain * 100).toFixed(2)}% varians residual; spesifikasi kalibrasi linear memadai.`
          : `Terdapat indikasi kelengkungan non-linear (ΔR² kuadratik = ${(maxQuadGain * 100).toFixed(1)}%); evaluasi transformasi log/Box-Cox pada Step 7.`
    });

    // 2. Identifiability & Positive Semidefiniteness (Empirical)
    if (J === 3 && estimation.tcaResult) {
      const tca = estimation.tcaResult;
      items.push({
        id: 'tca_identifiability',
        testName: 'Identifiabilitas Kovarians & Bebas Kasus Heywood',
        applicableMethods: 'TCA',
        testabilityTier: 'EMPIRIS',
        hypothesis: 'Kovarians sinyal laten σ̂²_T > 0 dan seluruh varians galat σ̂²_ε,k ≥ 0',
        statisticLabel: 'σ̂²_T',
        statisticValue: tca.estimatedLatentVariance,
        pValue: null,
        confidenceInterval: null,
        status: tca.isIdentifiable ? 'Memenuhi' : 'Tidak memenuhi',
        interpretation: tca.isIdentifiable
          ? `Matriks kovarians 3×3 teridentifikasi penuh (σ̂²_T = ${tca.estimatedLatentVariance.toFixed(3)} > 0) tanpa varians galat negatif.`
          : tca.correlatedTcNote
      });

      // Error independence on J = 3: Indirect / Untestable directly without 4th source or GT!
      items.push({
        id: 'tca_error_independence',
        testName: 'Independensi Galat Antarsumber: Cov(ε_j, ε_k) = 0',
        applicableMethods: 'TCA',
        testabilityTier: 'TIDAK_LANGSUNG',
        hypothesis: 'Kesalahan acak ketiga sumber tidak saling berkorelasi setelah sinyal bersama dikeluarkan',
        statisticLabel: 'Heywood/Asym',
        statisticValue: tca.suspectedErrorCorrelationFlag ? 1 : 0,
        pValue: null,
        confidenceInterval: null,
        status: tca.hasHeywoodCase
          ? 'Tidak memenuhi'
          : tca.suspectedErrorCorrelationFlag
            ? 'Perlu perhatian'
            : 'Perlu perhatian',
        interpretation:
          'PENTING: Korelasi Pearson tinggi/rendah antarsumber BUKAN bukti independensi galat. Pada tepat 3 sumber tanpa Ground Truth, Cov(ε_j, ε_k) = 0 adalah asumsi pengidentifikasi yang hanya dapat dinilai secara tidak langsung (bebas kasus Heywood & desain teknis sumber independen) serta diuji sensitivitasnya pada Step 9.'
      });
    } else if (J >= 4 && estimation.multiSourceResult) {
      const ms = estimation.multiSourceResult;
      items.push({
        id: 'ms_psd_identifiability',
        testName: 'Rank, Kondisi Numerik, & Positive Semidefinite (PSD) Matriks Kovarians',
        applicableMethods: 'N-Cornered Hat & Extended Collocation',
        testabilityTier: 'EMPIRIS',
        hypothesis: 'Matriks kovarians definit positif (λ_min > 0) dan over-identifikasi df ≥ 0',
        statisticLabel: 'Cond(C)',
        statisticValue: ms.matrixConditionNumber,
        pValue: null,
        confidenceInterval: null,
        status:
          ms.isIdentifiable && ms.isPositiveSemidefinite && ms.matrixConditionNumber < 5000
            ? 'Memenuhi'
            : ms.isIdentifiable
              ? 'Perlu perhatian'
              : 'Tidak memenuhi',
        interpretation: `Nilai eigen minimum = ${ms.minEigenvalueRawCov.toFixed(4)}, condition number = ${ms.matrixConditionNumber.toFixed(1)}, derajat bebas over-identifikasi df = ${ms.overidentificationDf}.`
      });

      const maxErrCorr = ms.estimatedErrorCovariances.reduce(
        (mx, p) => Math.max(mx, Math.abs(p.estimatedErrorCorrelation)),
        0
      );
      items.push({
        id: 'ms_error_covariance',
        testName: 'Uji Kovarians Galat Lintas-Sumber (Kuartet Gruber et al., 2016)',
        applicableMethods: 'N-Cornered Hat & Extended Collocation',
        testabilityTier: 'EMPIRIS',
        hypothesis: 'Cov(ε_a, ε_b) = 0 pada pasangan sumber yang diuji melalui kuartet saksi independen',
        statisticLabel: 'Max |r̂_ε|',
        statisticValue: maxErrCorr,
        pValue: null,
        confidenceInterval: null,
        status: maxErrCorr < 0.25 ? 'Memenuhi' : 'Perlu perhatian',
        interpretation:
          maxErrCorr < 0.25
            ? `Korelasi galat lintas-sumber terestimasi rendah (max |r̂_ε| = ${maxErrCorr.toFixed(3)} < 0.25), mendukung asumsi N-Cornered Hat.`
            : `Terdeteksi korelasi galat lintas-sumber (max |r̂_ε| = ${maxErrCorr.toFixed(3)}); Extended Collocation mengakomodasi pasangan berkorelasi yang teridentifikasi.`
      });
    }

    // 3. Error Orthogonality Cov(eps_k, T) = 0 (Untestable directly without GT!)
    items.push({
      id: 'error_orthogonality',
      testName: 'Ortogonalitas Galat terhadap Variabel Laten: Cov(ε_k, T) = 0',
      applicableMethods: 'TCA / NCH / EC',
      testabilityTier: 'TIDAK_DAPAT_DIUJI_TANPA_GT',
      hypothesis: 'Galat pengukuran tidak berkorelasi dengan besaran sebenarnya T setelah kalibrasi linear',
      statisticLabel: 'Indirect Check',
      statisticValue: null,
      pValue: null,
      confidenceInterval: null,
      status: 'Tidak dapat diuji',
      interpretation:
        'Tanpa Ground Truth T, Cov(ε_k, T) = 0 tidak dapat diuji secara empiris langsung karena penyimpangan linear terserap ke parameter skala β_k. Stabilitas tidak langsung dievaluasi melalui konsistensi peringkat antar-kelompok kota (emisi rendah vs tinggi) di Step 9.'
    });

    // 4. Common-Mode Additive Mean Bias (Untestable without GT!)
    items.push({
      id: 'common_mode_bias',
      testName: 'Bias Rata-Rata Absolut Bersama (Zero Common-Mode Bias)',
      applicableMethods: 'TCA / NCH / EC',
      testabilityTier: 'TIDAK_DAPAT_DIUJI_TANPA_GT',
      hypothesis: 'Rata-rata nilai laten memiliki titik nol absolut bebas pergeseran seragam',
      statisticLabel: 'Relatif α_k',
      statisticValue: null,
      pValue: null,
      confidenceInterval: null,
      status: 'Tidak dapat diuji',
      interpretation:
        'Metode tanpa Ground Truth hanya mengidentifikasi bias aditif relatif (α_k terhadap skala acuan), bukan bias seragam apabila seluruh sumber meleset ke arah yang sama.'
    });

    // 5. Temporal Autocorrelation of Panel Residuals (Empirical)
    let maxAr1 = 0;
    for (const s of sources) {
      const list = estimation.residualsBySource[s.id] ?? [];
      const byEnt = new Map<string, Array<{ period: number; val: number }>>();
      for (const r of list) {
        const arr = byEnt.get(r.entity) ?? [];
        arr.push({ period: r.period, val: r.approxResidual });
        byEnt.set(r.entity, arr);
      }
      const cur: number[] = [];
      const lag: number[] = [];
      byEnt.forEach(arr => {
        arr.sort((a, b) => a.period - b.period);
        for (let t = 1; t < arr.length; t++) {
          cur.push(arr[t].val);
          lag.push(arr[t - 1].val);
        }
      });
      const { r } = pearsonCorrAndP(cur, lag);
      if (Math.abs(r) > maxAr1) maxAr1 = Math.abs(r);
    }

    items.push({
      id: 'temporal_autocorrelation',
      testName: 'Autokorelasi Temporal Residual Panel AR(1)',
      applicableMethods: 'Semua Metode Panel',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'Residual deviasi konsensus bebas ketergantungan serial kuat antar-tahun dalam kota',
      statisticLabel: 'Max |ρ_AR1|',
      statisticValue: maxAr1,
      pValue: null,
      confidenceInterval: null,
      status: maxAr1 <= 0.30 ? 'Memenuhi' : maxAr1 <= 0.60 ? 'Perlu perhatian' : 'Tidak memenuhi',
      interpretation:
        maxAr1 <= 0.30
          ? `Autokorelasi serial residual rendah (max |ρ_AR1| = ${maxAr1.toFixed(3)}); informasi temporal per kota relatif segar.`
          : `Terdeteksi ketergantungan temporal dalam kota (max |ρ_AR1| = ${maxAr1.toFixed(3)}; Dong & Crow, 2017). Entity-Cluster Bootstrap wajib digunakan agar interval kepercayaan tidak bias sempit.`
    });

    // 6. Cross-sectional Heterogeneity & Covariance Stability across time (Empirical)
    const periods = Array.from(new Set(observations.map(o => o.period))).sort((a, b) => a - b);
    let covDriftRatio = 0;
    if (periods.length >= 4) {
      const mid = Math.floor(periods.length / 2);
      const earlySet = new Set(periods.slice(0, mid));
      const earlyVals = observations
        .filter(o => earlySet.has(o.period))
        .map(o => o.valuesBySource[sources[0].id])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const lateVals = observations
        .filter(o => !earlySet.has(o.period))
        .map(o => o.valuesBySource[sources[0].id])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const vEarly = sampleVariance(earlyVals);
      const vLate = sampleVariance(lateVals);
      if (vEarly > 1e-12 && vLate > 1e-12) {
        covDriftRatio = Math.abs(Math.log(vLate / vEarly));
      }
    }

    items.push({
      id: 'covariance_stability',
      testName: 'Stabilitas Varians-Kovarians Lintas Periode & Heterogenitas Kota',
      applicableMethods: 'TCA / NCH / EC',
      testabilityTier: 'EMPIRIS',
      hypothesis: 'Struktur dispersi sinyal tidak mengalami patahan rezim ekstrem antara paruh awal dan akhir periode',
      statisticLabel: '|ln(Var₂/Var₁)|',
      statisticValue: covDriftRatio,
      pValue: null,
      confidenceInterval: null,
      status: covDriftRatio <= 0.45 ? 'Memenuhi' : 'Perlu perhatian',
      interpretation:
        covDriftRatio <= 0.45
          ? `Rasio log-varians paruh periode = ${covDriftRatio.toFixed(3)}; asumsi stasioneritas kovarians terjaga baik.`
          : `Terjadi pergeseran skala varians antar-periode (|ln rasio| = ${covDriftRatio.toFixed(3)}); periksa stabilitas sub-periode di Step 9.`
    });

    // 7. Representativeness Error Assessment (Indirect from Spatial Metadata)
    const uniqueScopes = new Set(sources.map(s => s.spatialScope.trim().toLowerCase()));
    items.push({
      id: 'representativeness_error',
      testName: 'Evaluasi Galat Keterwakilan Spasial (Representativeness Error)',
      applicableMethods: 'TCA / NCH / EC',
      testabilityTier: 'TIDAK_LANGSUNG',
      hypothesis: 'Seluruh sumber memiliki resolusi jejak spasial (footprint) kota yang setara',
      statisticLabel: 'Variasi Scope',
      statisticValue: uniqueScopes.size,
      pValue: null,
      confidenceInterval: null,
      status: uniqueScopes.size <= 1 ? 'Memenuhi' : 'Perlu perhatian',
      interpretation:
        uniqueScopes.size <= 1
          ? 'Metadata cakupan wilayah seluruh sumber seragam sehingga risiko representativeness error minimal.'
          : `Terdapat ${uniqueScopes.size} definisi cakupan spasial berbeda (Wu et al., 2019); varians ketidakcocokan skala ruang akan terakumulasi ke dalam estimasi σ²_ε sumber beresolusi berbeda.`
    });
  }

  const hasFail = items.some(i => i.status === 'Tidak memenuhi');
  const hasWarn = items.some(i => i.status === 'Perlu perhatian');

  const overallStatus = hasFail
    ? 'Tidak memenuhi'
    : hasWarn
      ? 'Perlu perhatian'
      : 'Selesai';

  const summaryNote = hasFail
    ? 'Terdapat pelanggaran asumsi kritis atau kegagalan identifikasi yang mengharuskan kehati-hatian penuh / penahanan pemeringkatan.'
    : hasWarn
      ? 'Asumsi empiris utama terpenuhi, namun terdapat aspek tidak langsung atau ketergantungan panel yang memerlukan pemeriksaan sensitivitas pada Step 7 dan Step 9.'
      : 'Seluruh pengujian asumsi empiris memenuhi kriteria kelayakan metodologis.';

  return {
    targetMethod,
    items,
    overallStatus,
    summaryNote
  };
}
