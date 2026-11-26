import { describe, expect, it } from 'vitest';
import {
  buildRawSheetFromMatrix,
  buildRawSheetFromObjects,
  generateMsmaPresetCatalog,
  profileSheetColumns,
  validateWorkbookForMsma
} from '../../src/features/multi-source-accuracy/engine/data-validation';
import { classifyMeasurementConstructs } from '../../src/features/multi-source-accuracy/engine/measurement-classification';
import { autoSuggestMeasurementSources } from '../../src/features/multi-source-accuracy/engine/panel-detection';
import { runFullMsmaPipeline } from '../../src/features/multi-source-accuracy/engine/report-generator';
import {
  applySelectedTransformation,
  extractAlignedBaseObservations
} from '../../src/features/multi-source-accuracy/engine/transformation';
import {
  generateMsmaDocxBuffer,
  generateMsmaExcelBuffer,
  generateMsmaJournalPdfBuffer
} from '../../src/features/multi-source-accuracy/services/export-service';
import { MsmaConfigurableSnapshot, MsmaSourceConfig } from '../../src/features/multi-source-accuracy/types';
import {
  MSMA_BIBLIOGRAPHY_CATEGORIES,
  MSMA_GLOSSARY_ITEMS,
  MSMA_VERIFIED_BIBLIOGRAPHY
} from '../../src/features/multi-source-accuracy/utils/bibliography';
import {
  isGoogleSheetsUrlCandidate,
  parseMsmaGoogleSheetsUrl
} from '../../src/features/multi-source-accuracy/utils/gsheet-url';
import { createSeededRng, randomStandardNormal, sanitizeCellText } from '../../src/features/multi-source-accuracy/utils/numerical';

function makeDefaultConfigFromPreset(
  presetIdx: number
): { workbook: ReturnType<typeof generateMsmaPresetCatalog>[number]['workbook']; config: MsmaConfigurableSnapshot } {
  const catalog = generateMsmaPresetCatalog();
  const preset = catalog[presetIdx];
  return {
    workbook: preset.workbook,
    config: {
      activeSheetName: preset.workbook.activeSheetName,
      headerRowIndex: 0,
      entityColumn: preset.entityColumn,
      timeColumn: preset.timeColumn,
      sources: preset.presetSources.map(s => ({ ...s })),
      classificationOverride: null,
      userConfirmedClassification: true,
      activeTransformation: 'NONE',
      rejectedTransformations: [],
      dropDuplicates: false,
      outlierHandling: 'KEEP_ALL',
      missingHandling: 'COMPLETE_CASE',
      preferredMethodOverride: null,
      demingLambdaRatio: 1,
      demingLambdaExternalKnown: false,
      bootstrapReplications: 160
    }
  };
}

describe('MSMA Option 4 — Statistical Engine & Synthetic Benchmarks (Section Q.1–Q.6)', () => {
  it('Q.2: recovers known TCA error variances and exact #1/#2/#3 ranking on 3-source synthetic panel', () => {
    // Preset 0: Hidden Ground Truth Sensor SD = 18 (#1), Satelit SD = 42 (#2), Pemkot SD = 78 (#3)
    const { workbook, config } = makeDefaultConfigFromPreset(0);
    const res = runFullMsmaPipeline(workbook, config);

    expect(res.classification.finalClassification).toBe('CONTOH_A');
    expect(res.decision.recommendedMethod).toBe('TRIPLE_COLLOCATION');
    expect(res.estimation.tcaResult).not.toBeNull();

    const tca = res.estimation.tcaResult!;
    expect(tca.isIdentifiable).toBe(true);
    expect(tca.rankingAllowed).toBe(true);

    const pemkot = tca.estimates.find(e => e.displayName.includes('Pemkot'))!;
    const satelit = tca.estimates.find(e => e.displayName.includes('Satelit'))!;
    const sensor = tca.estimates.find(e => e.displayName.includes('Sensor'))!;

    expect(sensor.relativeRank).toBe(1);
    expect(satelit.relativeRank).toBe(2);
    expect(pemkot.relativeRank).toBe(3);

    // Calibrated Error SDs should closely match simulated true noise SDs (18, 42, 78) within sampling tolerance
    expect(sensor.errorStandardDeviation).toBeGreaterThan(10);
    expect(sensor.errorStandardDeviation).toBeLessThan(27);
    expect(satelit.errorStandardDeviation).toBeGreaterThan(30);
    expect(satelit.errorStandardDeviation).toBeLessThan(55);
    expect(pemkot.errorStandardDeviation).toBeGreaterThan(60);
    expect(pemkot.errorStandardDeviation).toBeLessThan(98);
    expect(res.robustness.rankingStabilityPct).toBeGreaterThanOrEqual(80);
  });

  it('Q.2: detects Heywood / severe error correlation on 3 sources and refuses blind TCA ranking', () => {
    const rng = createSeededRng(9911);
    const rows: Record<string, unknown>[] = [];
    for (let g = 1; g <= 20; g++) {
      for (let t = 2018; t <= 2023; t++) {
        const T = 300 + g * 12 + randomStandardNormal(rng) * 15;
        const hugeSharedError = randomStandardNormal(rng) * 90;
        rows.push({
          Kota: `City_${g}`,
          Tahun: t,
          S1: T + hugeSharedError + randomStandardNormal(rng) * 5,
          S2: T + hugeSharedError + randomStandardNormal(rng) * 5,
          S3: T + randomStandardNormal(rng) * 20
        });
      }
    }
    const sheet = buildRawSheetFromObjects('Correlated3', rows);
    const wb = validateWorkbookForMsma('Corr3.xlsx', 4096, 'preset', [sheet]);
    const mk = (id: string, col: string): MsmaSourceConfig => ({
      id,
      columnKey: col,
      displayName: col,
      unit: 'kt CO₂/tahun',
      constructDefinition: 'Total emisi kota',
      physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
      spatialScope: 'Kota',
      temporalPeriod: 'Tahunan',
      dataType: 'continuous_numeric',
      sourceOriginInfo: 'Simulasi',
      unitScaleMultiplier: 1,
      conversionModelEnabled: false,
      conversionSlope: 1,
      conversionIntercept: 0,
      conversionUncertaintySd: 0,
      conversionFormulaNote: '',
      conversionLiteratureRef: ''
    });

    const res = runFullMsmaPipeline(wb, {
      activeSheetName: wb.activeSheetName,
      headerRowIndex: 0,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      sources: [mk('s1', 'S1'), mk('s2', 'S2'), mk('s3', 'S3')],
      classificationOverride: null,
      userConfirmedClassification: true,
      activeTransformation: 'NONE',
      rejectedTransformations: [],
      dropDuplicates: false,
      outlierHandling: 'KEEP_ALL',
      missingHandling: 'COMPLETE_CASE',
      preferredMethodOverride: null,
      demingLambdaRatio: 1,
      demingLambdaExternalKnown: false,
      bootstrapReplications: 120
    });

    // Either Heywood negative variance triggers non-identifiability or suspectedErrorCorrelationFlag is raised
    const tca = res.estimation.tcaResult!;
    expect(tca.hasHeywoodCase || tca.suspectedErrorCorrelationFlag).toBe(true);
    if (tca.hasHeywoodCase) {
      expect(tca.rankingAllowed).toBe(false);
      expect(res.decision.recommendedMethod).toBe('CORRELATED_TRIPLE_COLLOCATION_FALLBACK');
    }
  });

  it('Q.3: computes Panel Bland-Altman & Deming Regression for J=2 and strictly refuses individual accuracy ranking', () => {
    const { workbook, config } = makeDefaultConfigFromPreset(4); // Preset 4 = TWO_SOURCE_AGREEMENT
    const res = runFullMsmaPipeline(workbook, config);

    expect(res.decision.recommendedMethod).toBe('BLAND_ALTMAN_DEMING');
    expect(res.estimation.twoSourceResult).not.toBeNull();
    expect(res.estimation.tcaResult).toBeNull();

    const two = res.estimation.twoSourceResult!;
    expect(two.repeatedMeasuresSdDifference).toBeGreaterThan(0);
    expect(two.loaUpperRepeatedMeasures).toBeGreaterThan(two.loaLowerRepeatedMeasures);
    expect(two.demingSlope).toBeGreaterThan(0.8);
    expect(two.demingSlope).toBeLessThan(1.4);
    expect(two.identificationBoundaryWarning).toContain('TIDAK menghasilkan peringkat akurasi absolut');
    expect(res.robustness.evaluated).toBe(false);
  });

  it('Q.4: runs N-Cornered Hat on J=4 independent sources and Extended Collocation on J=5 correlated satellite pair', () => {
    // J = 4 independent -> N-Cornered Hat
    const p4 = makeDefaultConfigFromPreset(2);
    const res4 = runFullMsmaPipeline(p4.workbook, p4.config);
    expect(res4.decision.recommendedMethod).toBe('N_CORNERED_HAT');
    expect(res4.estimation.multiSourceResult?.selectedEstimator).toBe('N_CORNERED_HAT');
    const top4 = res4.estimation.multiSourceResult?.estimates.find(e => e.relativeRank === 1);
    expect(top4?.displayName).toContain('Sensor');

    // J = 5 with correlated Optik A & Optik B -> Extended Collocation detects the pair & recovers Sensor Menara as #1
    const p5 = makeDefaultConfigFromPreset(3);
    const res5 = runFullMsmaPipeline(p5.workbook, p5.config);
    expect(res5.decision.recommendedMethod).toBe('EXTENDED_COLLOCATION');
    const ms5 = res5.estimation.multiSourceResult!;
    expect(ms5.selectedEstimator).toBe('EXTENDED_COLLOCATION');
    expect(ms5.estimatedErrorCovariances.length).toBeGreaterThanOrEqual(1);
    expect(ms5.estimatedErrorCovariances[0].estimatedErrorCorrelation).toBeGreaterThan(0.25);
    const top5 = ms5.estimates.find(e => e.relativeRank === 1);
    expect(top5?.displayName).toContain('Sensor Menara');
  });

  it('Q.5: classifies Contoh B (ton/year vs ppm), blocks unharmonized collocation, and preserves original data on transform', () => {
    const { workbook, config } = makeDefaultConfigFromPreset(1); // CONTOH_B_DIFF_CONSTRUCT
    const resBlocked = runFullMsmaPipeline(workbook, config);

    expect(resBlocked.classification.finalClassification).toBe('CONTOH_B');
    expect(resBlocked.classification.allowsJointCollocationRanking).toBe(false);
    expect(resBlocked.classification.primaryWarning).toContain('belum tentu mengukur besaran fisik yang sama');
    expect(resBlocked.decision.recommendedMethod).toBe('BLOCKED_CONSTRUCT_MISMATCH');
    expect(resBlocked.estimation.tcaResult).toBeNull();

    // Verify log transform domain block when zero/negative exists & immutability of base observations
    const sheet = workbook.sheets[0];
    const origFirstVal = sheet.rows[0]['Emisi_Pemkot_TonThn'];
    const baseObs = extractAlignedBaseObservations(sheet, 'Kota', 'Tahun', config.sources, {
      dropDuplicates: false,
      missingHandling: 'COMPLETE_CASE',
      outlierHandling: 'KEEP_ALL'
    });
    const baseFirstVal = baseObs[0].valuesBySource[config.sources[0].id];
    const transformed = applySelectedTransformation(baseObs, config.sources, 'YEO_JOHNSON');
    expect(transformed[0].valuesBySource[config.sources[0].id]).not.toBe(baseFirstVal);
    expect(baseObs[0].valuesBySource[config.sources[0].id]).toBe(baseFirstVal);
    expect(sheet.rows[0]['Emisi_Pemkot_TonThn']).toBe(origFirstVal);
  });

  it('Q.6: generates executable Stata/Mata syntax without fake built-in tca command and labels replicated outputs honestly', () => {
    const { workbook, config } = makeDefaultConfigFromPreset(0);
    const res = runFullMsmaPipeline(workbook, config);

    expect(res.stepStataCommands).toHaveLength(9);
    expect(res.completeStataDoFile).toContain('program define msma_tca3');
    expect(res.completeStataDoFile).toContain('mata:');
    expect(res.stataCompilation).toHaveLength(9);
    for (const sec of res.stataCompilation) {
      expect(sec.replicatedOutput).toContain('Stata-compatible replicated output');
    }
  });

  it('Integration & Security: propagates physical conversion uncertainty in Contoh B, blocks singular columns, sanitizes formulas, and exports valid PDF/DOCX/XLSX', async () => {
    // 1. Contoh B with documented physical conversion model + conversion uncertainty propagation
    const { workbook: wbB, config: cfgB } = makeDefaultConfigFromPreset(1);
    const harmonizedSources = cfgB.sources.map((s, idx) =>
      idx === 0
        ? s
        : {
            ...s,
            conversionModelEnabled: true,
            conversionSlope: idx === 1 ? 220000 : 82000,
            conversionIntercept: idx === 1 ? -90000000 : -33600000,
            conversionUncertaintySd: 25000,
            conversionFormulaNote: 'Atmospheric box-model inversion (Yang et al., 2023)',
            conversionLiteratureRef: 'Yang et al. (2023) JGR: Atmospheres'
          }
    );
    const resHarm = runFullMsmaPipeline(wbB, {
      ...cfgB,
      sources: harmonizedSources
    });
    expect(resHarm.classification.allowsJointCollocationRanking).toBe(true);
    expect(resHarm.classification.propagatedConversionVarianceBySource[harmonizedSources[1].id]).toBe(25000 * 25000);

    // 2. Header row index & formula injection sanitization
    expect(sanitizeCellText('=SUM(A1:A5)')).toBe("'=SUM(A1:A5)");
    expect(sanitizeCellText('-42.5')).toBe('-42.5');
    const customHeaderSheet = buildRawSheetFromMatrix(
      'CustomHeader',
      [
        ['Judul Laporan Emisi', '', ''],
        ['Catatan Metadata', '', ''],
        ['=Kota', 'Tahun', 'S1'],
        ['=CMD|calc', 2022, 125.4]
      ],
      2
    );
    expect(customHeaderSheet.columns[0]).toBe("'=Kota");
    expect(customHeaderSheet.rows[0]["'=Kota"]).toBe("'=CMD|calc");

    // 3. Bibliography (all 7 categories + 18 Crossref entries) & 20 Glossary Terms
    expect(MSMA_VERIFIED_BIBLIOGRAPHY.length).toBeGreaterThanOrEqual(18);
    for (const cat of MSMA_BIBLIOGRAPHY_CATEGORIES) {
      expect(MSMA_VERIFIED_BIBLIOGRAPHY.some(b => b.category === cat)).toBe(true);
    }
    expect(Object.keys(MSMA_GLOSSARY_ITEMS).length).toBeGreaterThanOrEqual(20);

    // 4. Exports: PDF 1.4, DOCX, and XLSX buffers
    const { workbook: wbA, config: cfgA } = makeDefaultConfigFromPreset(0);
    const fullA = runFullMsmaPipeline(wbA, cfgA);
    const pdfBuf = generateMsmaJournalPdfBuffer(fullA, fullA.journalDefault, wbA.fileName);
    expect(pdfBuf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(pdfBuf.toString('utf8').trimEnd().endsWith('%%EOF')).toBe(true);

    const docxBuf = await generateMsmaDocxBuffer(fullA, fullA.journalDefault, wbA.fileName, true);
    expect(docxBuf[0]).toBe(0x50); // 'P'
    expect(docxBuf[1]).toBe(0x4b); // 'K'

    const xlsxBuf = generateMsmaExcelBuffer(fullA, fullA.journalDefault, wbA.fileName);
    expect(xlsxBuf[0]).toBe(0x50);
    expect(xlsxBuf[1]).toBe(0x4b);
  });

  it('Multi-sheet Google Sheets URL parser preserves full workbook export (strips gid) & blocks SSRF', () => {
    const shareLink =
      'https://docs.google.com/spreadsheets/d/1J2qyaIQn4zFBc_4oy5KYxTkien0xyskhRg_h-44IhYA/edit?usp=sharing#gid=987654';
    const parsed = parseMsmaGoogleSheetsUrl(shareLink);
    expect(parsed.isValid).toBe(true);
    expect(parsed.spreadsheetId).toBe('1J2qyaIQn4zFBc_4oy5KYxTkien0xyskhRg_h-44IhYA');
    expect(parsed.detectedGid).toBe('987654');
    // Must NOT append &gid= so Google returns ALL worksheets for manual sheet selection
    expect(parsed.multiSheetExportUrl).toBe(
      'https://docs.google.com/spreadsheets/d/1J2qyaIQn4zFBc_4oy5KYxTkien0xyskhRg_h-44IhYA/export?format=xlsx'
    );
    expect(isGoogleSheetsUrlCandidate(shareLink)).toBe(true);
    expect(isGoogleSheetsUrlCandidate('Kota,Tahun,S1\nJakarta,2020,100')).toBe(false);

    // SSRF & protocol guards (Invariant I8)
    expect(parseMsmaGoogleSheetsUrl('http://docs.google.com/spreadsheets/d/1234567890ab/edit').isValid).toBe(false);
    expect(parseMsmaGoogleSheetsUrl('https://127.0.0.1/spreadsheets/d/1234567890ab/edit').isValid).toBe(false);
    expect(parseMsmaGoogleSheetsUrl('https://evil.example.com/spreadsheets/d/1234567890ab/edit').isValid).toBe(false);
    expect(parseMsmaGoogleSheetsUrl('https://docs.google.com:8443/spreadsheets/d/1234567890ab/edit').isValid).toBe(false);

    // Multi-sheet workbook preserves distinct sheets with zero automatic merging
    const sheet1 = buildRawSheetFromMatrix(
      'Ringkasan',
      [
        ['Judul', 'Nilai'],
        ['Catatan', 'Cover']
      ],
      0
    );
    const sheet2 = buildRawSheetFromMatrix(
      'Panel_CO2_2020_2025',
      [
        ['Kota', 'Tahun', 'Pemkot', 'Satelit', 'Sensor'],
        ['Jakarta', 2020, 1200, 1240, 1215],
        ['Jakarta', 2021, 1260, 1295, 1272]
      ],
      0
    );
    const wbMulti = validateWorkbookForMsma('Google_Sheets_Multi.xlsx', 4096, 'google_sheets', [sheet1, sheet2], 'Panel_CO2_2020_2025');
    expect(wbMulti.sheets.length).toBe(2);
    expect(wbMulti.activeSheetName).toBe('Panel_CO2_2020_2025');
    expect(wbMulti.sheets[0].rowCount).toBe(1);
    expect(wbMulti.sheets[1].rowCount).toBe(2);
  });

  it('Detects multi-pollutant Contoh B, promotes Heywood-curing transformation in Step 7, and updates Cluster Bootstrap diagnostics/seed', () => {
    // 1. Multi-pollutant column auto-detector (Gg CO2 vs Sentinel-5P molec/cm2 vs SPKU PM2.5 ug/m3)
    const mixedSheet = buildRawSheetFromObjects('Polutan_Campuran', [
      {
        kota: 'Jakarta',
        tahun: 2020,
        pelaporan_mandiri_emisi_gg_c: 120,
        data_satelit_sentinel_5p_10_: 8.5,
        data_sensor_lapangan_spku_pm: 42.1
      },
      {
        kota: 'Surabaya',
        tahun: 2020,
        pelaporan_mandiri_emisi_gg_c: 95,
        data_satelit_sentinel_5p_10_: 6.2,
        data_sensor_lapangan_spku_pm: 35.4
      }
    ]);
    const mixedProfiles = profileSheetColumns(mixedSheet);
    const suggested = autoSuggestMeasurementSources(mixedProfiles, 'kota', 'tahun');
    expect(suggested.length).toBe(3);
    expect(suggested[0].physicalDimension).toBe('EMISSION_FLUX_MASS_PER_TIME');
    expect(suggested[1].physicalDimension).toBe('ATMOSPHERIC_MOLE_FRACTION');
    expect(suggested[2].physicalDimension).toBe('SURFACE_CONCENTRATION');
    const mixedClass = classifyMeasurementConstructs(suggested, null, false);
    expect(mixedClass.finalClassification).toBe('CONTOH_B');
    expect(mixedClass.allowsJointCollocationRanking).toBe(false);

    // 2. Step 7 Multi-Criteria Recommender promotes DEMEANING_WITHIN when entity fixed effects cause Heywood on NONE & LOG
    const rng = createSeededRng(20269911);
    const rowsHeywood: Array<Record<string, unknown>> = [];
    for (let g = 1; g <= 30; g++) {
      // Conflicting city-level fixed effect u_g creates negative cross-covariance on raw levels,
      // while within-city temporal signal w_gt is clean and positive across all 3 sources!
      const cityOffset = (g - 15.5) * 18;
      for (let t = 2019; t <= 2025; t++) {
        const wSignal = randomStandardNormal(rng) * 8;
        const x1 = 500 + cityOffset + wSignal + randomStandardNormal(rng) * 1.6;
        const x2 = 500 - 1.2 * cityOffset + 1.05 * wSignal + randomStandardNormal(rng) * 2.4;
        const x3 = 500 + 0.9 * cityOffset + 0.95 * wSignal + randomStandardNormal(rng) * 1.1;
        rowsHeywood.push({
          city: `City_${g}`,
          year: t,
          emisi_pemkot: x1,
          emisi_satelit: x2,
          emisi_sensor: x3
        });
      }
    }
    const shHey = buildRawSheetFromObjects('Heywood_FE', rowsHeywood);
    const wbHey = validateWorkbookForMsma('Heywood_FE.xlsx', 8192, 'upload', [shHey]);
    const profHey = profileSheetColumns(shHey);
    const srcHey = autoSuggestMeasurementSources(profHey, 'city', 'year');

    const baseSnap: MsmaConfigurableSnapshot = {
      activeSheetName: 'Heywood_FE',
      headerRowIndex: 0,
      entityColumn: 'city',
      timeColumn: 'year',
      sources: srcHey,
      classificationOverride: null,
      userConfirmedClassification: true,
      activeTransformation: 'NONE',
      rejectedTransformations: [],
      dropDuplicates: false,
      outlierHandling: 'KEEP_ALL',
      missingHandling: 'COMPLETE_CASE',
      preferredMethodOverride: null,
      demingLambdaRatio: 1,
      demingLambdaExternalKnown: false,
      bootstrapReplications: 150,
      bootstrapSeed: 20261126
    };

    const rawPipeline = runFullMsmaPipeline(wbHey, baseSnap);
    expect(rawPipeline.estimation.tcaResult?.isIdentifiable).toBe(false);
    expect(rawPipeline.transformation.anyCandidateIdentifiable).toBe(true);
    expect(rawPipeline.transformation.identifiableCandidateIds).toContain('DEMEANING_WITHIN');
    // Best recommended option must NOT be NONE or LOG (both fail Heywood), and applying it cures Step 8!
    const bestId = rawPipeline.transformation.primaryRecommendationId;
    expect(bestId).not.toBe('NONE');
    expect(bestId).not.toBe('LOG');

    const curedPipeline = runFullMsmaPipeline(wbHey, {
      ...baseSnap,
      activeTransformation: bestId
    });
    expect(curedPipeline.estimation.tcaResult?.isIdentifiable).toBe(true);
    expect(curedPipeline.estimation.tcaResult?.rankingAllowed).toBe(true);

    // 3. Entity-Cluster Bootstrap responds to replication count B and bootstrapSeed + syncs Stata seed
    const { workbook: wbA, config: cfgA } = makeDefaultConfigFromPreset(0);
    const runBoot1 = runFullMsmaPipeline(wbA, {
      ...cfgA,
      bootstrapReplications: 120,
      bootstrapSeed: 20261126
    });
    const runBoot2 = runFullMsmaPipeline(wbA, {
      ...cfgA,
      bootstrapReplications: 600,
      bootstrapSeed: 87654321
    });

    expect(runBoot1.estimation.bootstrapDiagnostics.requestedReplications).toBe(120);
    expect(runBoot2.estimation.bootstrapDiagnostics.requestedReplications).toBe(600);
    expect(runBoot2.estimation.bootstrapDiagnostics.bootstrapSeed).toBe(87654321);
    expect(runBoot2.stepStataCommands[7].stataCode).toContain('seed(87654321)');
    expect(runBoot2.stepStataCommands[7].stataCode).toContain('reps(600)');

    const se1 = runBoot1.estimation.tcaResult?.estimates[0].errorSdBootstrapSe ?? 0;
    const se2 = runBoot2.estimation.tcaResult?.estimates[0].errorSdBootstrapSe ?? 0;
    expect(se1).toBeGreaterThan(0);
    expect(se2).toBeGreaterThan(0);
    expect(se1).not.toBe(se2);
  });
});
