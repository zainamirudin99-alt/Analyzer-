import { describe, it, expect } from 'vitest';
import { computeAccuracyEDA } from '../../src/lib/panel-accuracy-correlation';
import { computePanelAccuracyDiagnostics } from '../../src/lib/panel-accuracy-diagnostics';
import { generatePanelAccuracyDocx } from '../../src/lib/panel-accuracy-export-docx';
import { generatePanelAccuracyPDF } from '../../src/lib/panel-accuracy-export-pdf';
import {
  generatePanelAccuracyCSV,
  generatePanelAccuracyXLSX
} from '../../src/lib/panel-accuracy-export-xlsx';
import { fitPairFixedEffectsModel } from '../../src/lib/panel-accuracy-fixed-effects';
import { runIntelligentMeasurementSourceEngine } from '../../src/lib/panel-accuracy-intelligent-config';
import { fitBayesianLatentMeasurementModel } from '../../src/lib/panel-accuracy-latent';
import { computeAllSourceAccuracyMetrics } from '../../src/lib/panel-accuracy-metrics';
import {
  evaluateAccuracyPreprocessingRecommendations,
  executePanelAccuracyPipeline
} from '../../src/lib/panel-accuracy-orchestrator';
import { preparePanelAccuracyObservations } from '../../src/lib/panel-accuracy-preprocessing';
import { computeComparativeSourceRanking } from '../../src/lib/panel-accuracy-ranking';
import {
  buildActualStepInterpretationPoints,
  PANEL_ACCURACY_STEP_GUIDES
} from '../../src/lib/panel-accuracy-step-guides';
import {
  buildAllStepStataDocumentation,
  computeLeaveOneCityOutSensitivity
} from '../../src/lib/panel-accuracy-step-stata';
import { ImportedSheetData, MeasurementSource, PanelDataset } from '../../src/lib/panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  evaluateImportedWorkbookSheets,
  generateMultiSourceCO2PresetDataset,
  validatePanelAccuracyDataset
} from '../../src/lib/panel-accuracy-validation';

describe('Gerbang Verifikasi — Opsi B Reference-Free All-Source Latent & Consensus Engine', () => {
  it('1. Evaluates & ranks ALL 4 sources equally without a reference source and identifies X3 Field Sensor as #1 on preset', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    // Ensure ALL sources in preset are symmetric 'evaluated' without a privileged reference
    expect(preset.sources).toHaveLength(4);
    expect(preset.sources.every(s => s.role === 'evaluated')).toBe(true);

    const res = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 499
    });

    // All 4 sources evaluated and ranked (#1..#4)
    expect(res.metrics).toHaveLength(4);
    expect(res.ranking.ranks).toHaveLength(4);
    expect(res.pairFixedEffects.nComparisonSources).toBe(4);
    expect(res.pairFixedEffects.pairwiseContrasts).toHaveLength(6); // C(4,2) = 6 contrasts across ALL 4 sources!

    // True data generating precision order in preset: X3 (SD=8, bias=0) < X4 (SD=16, bias=+8) < X2 (SD=28, bias=+26) < X1 (SD=42, bias=-46)
    expect(res.ranking.ranks[0].sourceName).toBe('X3');
    expect(res.ranking.ranks[1].sourceName).toBe('X4');
    expect(res.ranking.ranks[2].sourceName).toBe('X2');
    expect(res.ranking.ranks[3].sourceName).toBe('X1');

    expect(res.latentModel.maxRhat).toBeLessThanOrEqual(1.1);
    expect(res.ranking.conclusivenessStatus).toBe('TERBUKTI_BERBEDA_SIGNIFIKAN');
    expect(res.ranking.isConclusive).toBe(true);
    expect(res.ranking.bestSourceId).toBe('src_3');
    expect(res.latentModel.converged).toBe(true);
    expect(res.metrics.find(m => m.sourceName === 'X3')!.reliabilityR2).toBeGreaterThan(0.99);
    expect(res.metrics.find(m => m.sourceName === 'X3')!.posteriorProbBest).toBeGreaterThan(0.9);
  });

  it('2. Recovers true error ordering from Grubbs analytical triangulation & Bayesian MCMC without knowing which column is truth', () => {
    // Construct 40 panel observations across 8 cities x 5 years where S2 is cleanest (SD=4, bias=0), S1 medium (SD=18, +15), S3 noisy (SD=35, -30)
    let s = 12345;
    const rn = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, s / 4294967296);
      s = (s * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, s / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const obs: Record<string, unknown>[] = [];
    for (let c = 1; c <= 8; c++) {
      for (let t = 2020; t <= 2024; t++) {
        const theta = 400 + c * 90 + (t - 2020) * 25;
        obs.push({
          City: `City_${c}`,
          Year: t,
          S1_Sat: Number((theta + 15 + rn() * 18).toFixed(2)),
          S2_CleanSensor: Number((theta + rn() * 4).toFixed(2)),
          S3_Inventory: Number((theta - 30 + rn() * 35).toFixed(2))
        });
      }
    }

    const sources: MeasurementSource[] = [
      { id: 's1', name: 'S1', label: 'Satellite', columnKey: 'S1_Sat', unit: 'kt CO₂', role: 'evaluated' },
      { id: 's2', name: 'S2', label: 'Sensor', columnKey: 'S2_CleanSensor', unit: 'kt CO₂', role: 'evaluated' },
      { id: 's3', name: 'S3', label: 'Inventory', columnKey: 'S3_Inventory', unit: 'kt CO₂', role: 'evaluated' }
    ];

    const res = executePanelAccuracyPipeline({
      dataset: { cityIdColumn: 'City', yearColumn: 'Year', sources, observations: obs },
      bootstrapReplications: 299
    });

    expect(res.ranking.ranks[0].sourceId).toBe('s2');
    expect(res.ranking.ranks[1].sourceId).toBe('s1');
    expect(res.ranking.ranks[2].sourceId).toBe('s3');
    const estS2 = res.latentModel.sourceEstimates.find(e => e.sourceId === 's2')!;
    const estS3 = res.latentModel.sourceEstimates.find(e => e.sourceId === 's3')!;
    expect(estS2.errorSd).toBeLessThan(10);
    expect(estS3.errorSd).toBeGreaterThan(25);
    expect(estS2.grubbsErrorVariance).toBeLessThan(estS3.grubbsErrorVariance);
  });

  it('3. Properly flags J = 2 sources as MODEL_TIDAK_TERIDENTIFIKASI (underidentified without 3rd source) while handling J = 3, 4, 5', () => {
    const preset = generateMultiSourceCO2PresetDataset();

    // A. J = 2 sources -> underidentified for reference-free ranking!
    const twoSourceDataset: PanelDataset = {
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: [preset.sources[0], preset.sources[2]],
      observations: preset.observations
    };
    const res2 = executePanelAccuracyPipeline({ dataset: twoSourceDataset, bootstrapReplications: 199 });
    expect(res2.metrics).toHaveLength(2);
    expect(res2.ranking.isConclusive).toBe(false);
    expect(res2.ranking.conclusivenessStatus).toBe('MODEL_TIDAK_TERIDENTIFIKASI');
    expect(res2.ranking.bestSourceId).toBeNull();

    // B. J = 3 sources -> identified!
    const res3 = executePanelAccuracyPipeline({
      dataset: { ...preset, sources: preset.sources.slice(0, 3) },
      bootstrapReplications: 199
    });
    expect(res3.metrics).toHaveLength(3);
    expect(res3.pairFixedEffects.pairwiseContrasts).toHaveLength(3); // C(3,2) = 3

    // C. J = 5 sources -> all 5 evaluated & C(5,2) = 10 contrasts!
    const obs5 = preset.observations.map((r, idx) => ({
      ...r,
      Custom_Audit_5: Number(r.X3_Field_Sensor) + (idx % 2 === 0 ? 18 : -14)
    }));
    const sources5: MeasurementSource[] = [
      ...preset.sources,
      {
        id: 'custom_5',
        name: 'S5_Audit',
        label: 'Independent Monitoring',
        columnKey: 'Custom_Audit_5',
        unit: 'kt CO₂',
        role: 'evaluated'
      }
    ];
    const res5 = executePanelAccuracyPipeline({
      dataset: {
        cityIdColumn: preset.cityIdColumn,
        yearColumn: preset.yearColumn,
        sources: sources5,
        observations: obs5
      },
      bootstrapReplications: 199
    });
    expect(res5.metrics).toHaveLength(5);
    expect(res5.ranking.ranks).toHaveLength(5);
    expect(res5.pairFixedEffects.pairwiseContrasts).toHaveLength(10); // C(5,2) = 10
    expect(res5.eda.overallPearson).toHaveLength(5);
  });

  it('4. Separates Complete-Case and Source-Specific Available-Case when missing values differ across sources', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const partialObs = preset.observations.map((r, idx) => ({
      ...r,
      X2_Satellite_Standard: idx < 8 ? null : r.X2_Satellite_Standard
    }));

    const dataset: PanelDataset = {
      ...preset,
      observations: partialObs
    };

    const quality = validatePanelAccuracyDataset(dataset);
    expect(quality.nCompleteCasePairs).toBe(52);
    expect(quality.availablePairsBySource['src_1']).toBe(60);
    expect(quality.availablePairsBySource['src_2']).toBe(52);
    expect(quality.availablePairsBySource['src_3']).toBe(60);
    expect(quality.availablePairsBySource['src_4']).toBe(60);

    const res = executePanelAccuracyPipeline({ dataset, bootstrapReplications: 199 });
    const mX1 = res.metrics.find(m => m.sourceId === 'src_1')!;
    const mX2 = res.metrics.find(m => m.sourceId === 'src_2')!;

    expect(mX1.nCompleteCase).toBe(52);
    expect(mX1.nAvailableCase).toBe(60);
    expect(mX1.missingGapVsComplete).toBe(8);
    expect(mX2.nCompleteCase).toBe(52);
    expect(mX2.nAvailableCase).toBe(52);
    expect(mX2.missingGapVsComplete).toBe(0);
  });

  it('5. Detects inconclusive ranking when top two sources are practically indistinguishable', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const tiedObs = preset.observations.map((r, i) => ({
      ...r,
      X4_Alt_Satellite_HiRes: Number(r.X3_Field_Sensor) + (i % 2 === 0 ? 0.15 : -0.15)
    }));

    const resTied = executePanelAccuracyPipeline({
      dataset: {
        ...preset,
        observations: tiedObs
      },
      bootstrapReplications: 299
    });

    expect(resTied.ranking.isConclusive).toBe(false);
    expect(resTied.ranking.conclusivenessStatus).toBe('PERBEDAAN_TIDAK_SIGNIFIKAN');
    expect(resTied.ranking.bestSourceId).toBeNull();
  });

  it('6. Generates All-Source Stata (.do), R (lavaan+fixest), Stan (.stan), Exports, Step Guides & 5-Point Docs', async () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const res = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 299
    });

    expect(res.generatedCode.stataDoFile).toContain('sem (L_true ->');
    expect(res.generatedCode.stataDoFile).toContain('areg ae i.source_id, absorb(pair_id) vce(cluster city_id)');
    expect(res.generatedCode.rScript).toContain('lavaan::cfa');
    expect(res.generatedCode.rScript).toContain('feols(abs_error ~ i(source) | pair_id');

    const pdfBuf = generatePanelAccuracyPDF(res, 'test_accuracy.xlsx');
    const docxBuf = await generatePanelAccuracyDocx(res, 'test_accuracy.xlsx');
    const xlsxBuf = generatePanelAccuracyXLSX(res, 'test_accuracy.xlsx');
    const csvStr = generatePanelAccuracyCSV(res);

    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(docxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(xlsxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(csvStr).toContain('Total_Latent_RMSE');
    expect(csvStr).toContain('X3 (Field Sensor)');

    const rec = evaluateAccuracyPreprocessingRecommendations({ dataset: preset });
    expect(rec.evaluatedCount).toBeGreaterThanOrEqual(4);
    expect(rec.bestScenario.id).toBe('raw_baseline');

    const intel = runIntelligentMeasurementSourceEngine({
      columns: Object.keys(preset.observations[0]),
      rows: preset.observations,
      currentCityIdColumn: preset.cityIdColumn,
      currentYearColumn: preset.yearColumn,
      currentSources: preset.sources
    });
    expect(intel.fourteenPointAnalyses).toHaveLength(14);
    expect(intel.minimumRequirements.canProceed).toBe(true);
    expect(intel.recommendedMapping.sources.every(s => s.role === 'evaluated')).toBe(true);

    const prepared = preparePanelAccuracyObservations(preset);
    const quality = validatePanelAccuracyDataset(preset);
    const docs = buildAllStepStataDocumentation({
      datasetName: 'panel_co2_multi_source_accuracy.xlsx',
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: preset.sources,
      preprocessing: DEFAULT_ACCURACY_PREPROCESSING,
      qualityReport: quality,
      intelligentConfig: intel,
      preprocBundle: rec,
      cleanedObservations: prepared.completeCaseObservations,
      fitResult: res
    });

    for (let stepId = 1; stepId <= 9; stepId++) {
      const b = docs[stepId];
      expect(b.stepId).toBe(stepId);
      expect(b.stataCode).toContain(preset.cityIdColumn);
      expect(b.structuredInterpretations.length).toBeGreaterThanOrEqual(1);
    }
    expect(docs[5].companionStanCode).toContain('reliability_R2');
    expect(docs[8].robustnessSummary?.leaveOneCityOutRows).toHaveLength(10);

    const actualPts = buildActualStepInterpretationPoints(res);
    expect(actualPts.step2.length).toBeGreaterThanOrEqual(3);
    expect(PANEL_ACCURACY_STEP_GUIDES).toHaveLength(9);

    // Explicitly double-check LOCO helper directly
    const loco = computeLeaveOneCityOutSensitivity({
      observations: prepared.completeCaseObservations,
      sources: preset.sources,
      fullTopSourceId: res.ranking.bestSourceId
    });
    expect(loco.rows).toHaveLength(10);
    expect(loco.consistencyPct).toBe(100);
  });

  it('7. Provides Step 3 & Step 7 Intelligent Recommendations plus 499 vs 1999 Wild Bootstrap transparency', () => {
    const preset = generateMultiSourceCO2PresetDataset();

    // A. Step 3 Scale-Invariant Optimization Recommendation on clean preset
    const cleanRec = evaluateAccuracyPreprocessingRecommendations({ dataset: preset });
    expect(cleanRec.bestScenario.id).toBe('raw_baseline');
    expect(cleanRec.bestScenario.compositeQualityScore).toBeGreaterThan(85);
    expect(cleanRec.bestScenario.meanReliabilityR2).toBeGreaterThan(0.95);
    expect(cleanRec.actionItems[0].actionType).toBe('RESET_RAW_BASELINE');

    // B. Step 3 Extreme Outlier Dataset triggers Winsorization recommendation when rank stability breaks
    const noisyObs = preset.observations.map((row, idx) =>
      idx === 3 || idx === 17
        ? { ...row, X3_Field_Sensor: Number(row.X3_Field_Sensor) + 18500 }
        : { ...row }
    );
    const outlierRec = evaluateAccuracyPreprocessingRecommendations({
      dataset: { ...preset, observations: noisyObs }
    });
    const winsorItem = outlierRec.actionItems.find(a => a.actionType === 'APPLY_WINSORIZE');
    expect(outlierRec.bestScenario.options.applyWinsorize).toBe(true);
    expect(winsorItem).toBeDefined();
    expect(winsorItem?.priority).toBe('TINGGI');

    // C. Step 7 Diagnostic Advisor + 499 Client Live vs 1999 Server Deep Verification
    const live499 = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 499,
      mcmcIterations: 450,
      executionSource: 'client_live'
    });
    expect(live499.executionMeta?.bootstrapReplications).toBe(499);
    expect(live499.diagnostics.diagnosticAdvisor?.actions.some(a => a.id === 'diag_small_cluster_bootstrap')).toBe(true);

    const server1999 = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 1999,
      mcmcIterations: 800,
      executionSource: 'server_verified'
    });
    expect(server1999.executionMeta?.bootstrapReplications).toBe(1999);
    expect(server1999.executionMeta?.mcmcIterations).toBe(800);
    expect(server1999.ranking.bestSourceId).toBe(live499.ranking.bestSourceId);
    expect(server1999.diagnostics.diagnosticAdvisor?.diagnosticScore).toBeGreaterThanOrEqual(85);
    expect(server1999.diagnostics.diagnosticAdvisor?.actions.some(a => a.id === 'diag_small_cluster_ok')).toBe(true);

    // D. Underidentified J = 2 dataset triggers KRITIS ADD_THIRD_SOURCE in Step 7 advisor
    const j2Res = executePanelAccuracyPipeline({
      dataset: {
        ...preset,
        sources: preset.sources.slice(0, 2)
      },
      bootstrapReplications: 499
    });
    expect(j2Res.diagnostics.diagnosticAdvisor?.overallHealthStatus).toBe('PERLU_PERBAIKAN_METODOLOGI');
    expect(j2Res.diagnostics.diagnosticAdvisor?.actions[0].actionType).toBe('ADD_THIRD_SOURCE');
    expect(j2Res.diagnostics.diagnosticAdvisor?.actions[0].priority).toBe('KRITIS');
  });

  it('8. Evaluates multi-sheet Excel & Google Sheets workbooks and auto-skips cover/__EMPTY sheets', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const coverRows = [
      { DASHBOARD_ANALISIS: 'Profil', __EMPTY: 'BBCA', __EMPTY_1: 'BBRI', __EMPTY_2: 'BMRI' },
      { DASHBOARD_ANALISIS: 'Keterangan', __EMPTY: 'BCA', __EMPTY_1: 'BRI', __EMPTY_2: 'Mandiri' },
      { DASHBOARD_ANALISIS: 'Ringkasan', __EMPTY: '-', __EMPTY_1: '-', __EMPTY_2: '-' },
      { DASHBOARD_ANALISIS: 'Catatan', __EMPTY: 'A', __EMPTY_1: 'B', __EMPTY_2: 'C' }
    ];
    const sheets: ImportedSheetData[] = [
      {
        sheetName: 'Dashboard_Ringkasan',
        rowCount: coverRows.length,
        columnCount: 4,
        columns: ['DASHBOARD_ANALISIS', '__EMPTY', '__EMPTY_1', '__EMPTY_2'],
        previewRows: coverRows,
        allRows: coverRows
      },
      {
        sheetName: 'Data_Panel_Utama',
        rowCount: preset.observations.length,
        columnCount: 6,
        columns: Object.keys(preset.observations[0]),
        previewRows: preset.observations.slice(0, 10),
        allRows: preset.observations
      }
    ];

    const evalRes = evaluateImportedWorkbookSheets(sheets);
    expect(evalRes.recommendedSheetName).toBe('Data_Panel_Utama');
    expect(evalRes.autoSwitchedFromFirst).toBe(true);
    expect(evalRes.evaluations[0].isPanelReady).toBe(false);
    expect(evalRes.evaluations[1].isPanelReady).toBe(true);
    expect(evalRes.evaluations[1].isRecommended).toBe(true);

    // When sheet 1 is already a valid tabular panel table, keep sheet 1 selected by default
    const cleanFirst = evaluateImportedWorkbookSheets([sheets[1], sheets[0]]);
    expect(cleanFirst.recommendedSheetName).toBe('Data_Panel_Utama');
    expect(cleanFirst.autoSwitchedFromFirst).toBe(false);
  });

  it('9. Converges cleanly (R-hat <= 1.10) & selects conclusive winner on small-scale J=3 data even when biased source has smaller Error SD', () => {
    let s = 445566;
    const rn = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, s / 4294967296);
      s = (s * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, s / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const obs: Record<string, unknown>[] = [];
    for (let c = 1; c <= 10; c++) {
      for (let t = 2020; t <= 2024; t++) {
        const theta = 1.5 + c * 0.25 + (t - 2020) * 0.12 + rn() * 0.2;
        obs.push({
          City: `Kota_${c}`,
          Year: t,
          X1_Report: Number((theta - 5.16 + rn() * 0.19).toFixed(4)),
          X2_Sat: Number((theta + 1.97 + rn() * 0.01).toFixed(4)),
          X3_Sensor: Number((theta + rn() * 0.05).toFixed(4))
        });
      }
    }

    const smallDataset: PanelDataset = {
      cityIdColumn: 'City',
      yearColumn: 'Year',
      sources: [
        { id: 'x1', name: 'X1', label: 'Self-Reporting', columnKey: 'X1_Report', unit: 'Mt', role: 'evaluated' },
        { id: 'x2', name: 'X2', label: 'Satellite Measurement', columnKey: 'X2_Sat', unit: 'Mt', role: 'evaluated' },
        { id: 'x3', name: 'X3', label: 'Field Sensor', columnKey: 'X3_Sensor', unit: 'Mt', role: 'evaluated' }
      ],
      observations: obs
    };

    const res = executePanelAccuracyPipeline({
      dataset: smallDataset,
      bootstrapReplications: 499,
      mcmcIterations: 450
    });

    expect(res.latentModel.maxRhat).toBeLessThanOrEqual(1.1);
    expect(res.latentModel.converged).toBe(true);
    expect(res.ranking.canonicalStatus).toBe('PEMENANG_TERBUKTI_RELATIF');
    expect(res.ranking.conclusivenessStatus).toBe('TERBUKTI_BERBEDA_SIGNIFIKAN');
    expect(res.ranking.isConclusive).toBe(true);
    expect(res.ranking.bestSourceId).toBe('x3');
    expect(res.ranking.ranks[0].sourceName).toBe('X3');
    expect(res.ranking.ranks[1].sourceName).toBe('X2');
    expect(res.ranking.ranks[2].sourceName).toBe('X1');
    expect(res.ranking.whyBestAnalysis.points).toHaveLength(8);
  });

  it('10. Validates Correlated Measurement Errors, Weak Identification, Scale Distortion, Driscoll-Kraay SE & 6-Part Stata Concepts (Section O)', () => {
    let s = 778899;
    const rn = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, s / 4294967296);
      s = (s * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, s / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    // Simulate 6 small clusters x 6 years = 36 rows where S1 & S2 share a strong common measurement error (+sharedErr),
    // S3 is clean & accurate, and S4 has scale distortion (lambda = 1.35) + pure noise
    const obsCorr: Record<string, unknown>[] = [];
    for (let c = 1; c <= 6; c++) {
      for (let t = 2019; t <= 2024; t++) {
        const theta = 500 + c * 60 + (t - 2019) * 25 + rn() * 20;
        const sharedErr = rn() * 45;
        obsCorr.push({
          City: `Cluster_${c}`,
          Year: t,
          S1_TwinA: Number((theta + 30 + sharedErr + rn() * 5).toFixed(2)),
          S2_TwinB: Number((theta + 32 + sharedErr + rn() * 5).toFixed(2)),
          S3_Clean: Number((theta + rn() * 6).toFixed(2)),
          S4_Scaled: Number((1.35 * theta - 120 + rn() * 35).toFixed(2))
        });
      }
    }

    const corrDataset: PanelDataset = {
      cityIdColumn: 'City',
      yearColumn: 'Year',
      sources: [
        { id: 's1', name: 'S1', label: 'Twin Sensor A', columnKey: 'S1_TwinA', unit: 'kt', role: 'evaluated' },
        { id: 's2', name: 'S2', label: 'Twin Sensor B', columnKey: 'S2_TwinB', unit: 'kt', role: 'evaluated' },
        { id: 's3', name: 'S3', label: 'Clean Ground', columnKey: 'S3_Clean', unit: 'kt', role: 'evaluated' },
        { id: 's4', name: 'S4', label: 'Scaled Proxy', columnKey: 'S4_Scaled', unit: 'kt', role: 'evaluated' }
      ],
      observations: obsCorr
    };

    const corrRes = executePanelAccuracyPipeline({
      dataset: corrDataset,
      bootstrapReplications: 499
    });

    // Detects positive correlated error between S1 and S2
    expect(corrRes.latentModel.residualCorrelationMatrix).toHaveLength(4);
    expect(corrRes.latentModel.correlatedErrorPairs.length).toBeGreaterThanOrEqual(1);
    expect(corrRes.diagnostics.correlatedErrorAudit?.hasCorrelatedErrorRisk).toBe(true);

    // Small cluster warning (G = 6 < 30) & Driscoll-Kraay SE populated
    expect(corrRes.pairFixedEffects.smallClusterWarning).toBe(true);
    expect(corrRes.pairFixedEffects.pairwiseContrasts[0].seDriscollKraay).toBeGreaterThan(0);

    // Scale distortion, Expected Loss, Expected Rank, LOSO Predictive Coverage & MCMC trace draws populated
    const s4Metric = corrRes.metrics.find(m => m.sourceId === 's4')!;
    expect(s4Metric.scaleDistortion).toBeGreaterThan(10);
    expect(s4Metric.posteriorExpectedLoss).toBeGreaterThan(0);
    expect(s4Metric.expectedRank).toBeGreaterThanOrEqual(1);
    expect(s4Metric.losoPredictiveCoverage95).toBeGreaterThanOrEqual(0);
    expect(corrRes.latentModel.sourceEstimates[0].mcmcTraceDraws).toHaveLength(3);
    expect(corrRes.generatedCode.stanCode).toContain('total_latent_rmse');

    // Weak Identification test: source with near-zero loading (pure noise unrelated to theta)
    const obsWeak = obsCorr.map(r => ({
      ...r,
      S4_Scaled: Number((rn() * 5).toFixed(2))
    }));
    const weakRes = executePanelAccuracyPipeline({
      dataset: { ...corrDataset, observations: obsWeak },
      bootstrapReplications: 299
    });
    expect(weakRes.latentModel.weakIdentificationSources.length).toBeGreaterThanOrEqual(1);
  });
});
