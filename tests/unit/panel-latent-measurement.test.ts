import { describe, it, expect } from 'vitest';
import {
  autoDetectPanelLatentMapping,
  computePearsonCorrelation,
  DEFAULT_PREPROCESSING_OPTIONS,
  generateCO2PresetDataset,
  parsePastedTabularData,
  validatePanelLatentData
} from '../../src/lib/panel-latent-data';
import { generatePanelLatentDocx } from '../../src/lib/panel-latent-export-docx';
import { generatePanelLatentPDF } from '../../src/lib/panel-latent-export-pdf';
import { generatePanelLatentCSV, generatePanelLatentXLSX } from '../../src/lib/panel-latent-export-xlsx';
import { executePanelLatentPipeline } from '../../src/lib/panel-latent-orchestrator';

describe('Panel Latent Variable Measurement Model — Statistical Recovery, Diagnostics & Exports', () => {
  it('1. Recovers known latent Y*, relative biases, loadings, and reliability order on simulated panel data', async () => {
    // Generate synthetic ground truth with known alpha, lambda, sigma_eps
    const cities = ['KotaA', 'KotaB', 'KotaC', 'KotaD', 'KotaE', 'KotaF', 'KotaG', 'KotaH'];
    const years = [2019, 2020, 2021, 2022, 2023, 2024];

    let seed = 7711;
    const randn = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, seed / 4294967296);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, seed / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const rows: Record<string, any>[] = [];
    const trueY: number[] = [];

    cities.forEach((city, ci) => {
      years.forEach((year, ti) => {
        const yStar = 900 + ci * 95 + ti * 25 + randn() * 20;
        trueY.push(yStar);
        // X1: negative bias (-60), loading 0.92, large noise SD=55
        const x1 = -60 + 0.92 * yStar + randn() * 55;
        // X2: positive bias (+45), loading 1.08, medium noise SD=30
        const x2 = 45 + 1.08 * yStar + randn() * 30;
        // X3: anchor (0, 1.0), lowest noise SD=14
        const x3 = yStar + randn() * 14;
        rows.push({ City: city, Year: year, X1: x1, X2: x2, X3: x3 });
      });
    });

    const mapping = autoDetectPanelLatentMapping(['City', 'Year', 'X1', 'X2', 'X3']);
    const result = executePanelLatentPipeline({
      rows,
      mapping,
      spec: {
        identification: 'anchor',
        anchorSource: 'X3',
        likelihood: 'normal',
        chains: 4,
        warmup: 400,
        draws: 400,
        seed: 20261113
      }
    });

    // Latent recovery check
    const estY = result.latentEstimates.map(e => e.latentMean);
    const corr = computePearsonCorrelation(trueY, estY);
    expect(corr).toBeGreaterThan(0.97);

    // Bias & Loading sign/magnitude check
    const s1 = result.sourceComparison.find(s => s.sourceKey === 'X1')!;
    const s2 = result.sourceComparison.find(s => s.sourceKey === 'X2')!;
    const s3 = result.sourceComparison.find(s => s.sourceKey === 'X3')!;

    expect(s3.isAnchor).toBe(true);
    expect(s3.loadingMean).toBeCloseTo(1.0, 5);
    expect(s3.relativeBiasMean).toBeCloseTo(0.0, 5);
    expect(s1.relativeBiasMean).toBeLessThan(0);
    expect(s2.relativeBiasMean).toBeGreaterThan(0);

    // Noise order check: X1 noisier than X3 -> X3 reliability > X1 reliability
    expect(s3.errorSdMean).toBeLessThan(s1.errorSdMean);
    expect(s3.reliability).toBeGreaterThan(s1.reliability);

    // Convergence & sensitivity checks
    expect(result.diagnostics.maxRHat).toBeLessThan(1.05);
    expect(result.diagnostics.isConverged).toBe(true);
    expect(result.sensitivity).toHaveLength(3);
    expect(result.modelComparison.length).toBeGreaterThanOrEqual(2);
    expect(result.identificationAudit.warnings).toBeDefined();

    // Reproducible code generation
    expect(result.generatedCode.stanCode).toContain('anchor_idx');
    expect(result.generatedCode.rScript).toContain('cmdstan_model');
    expect(result.generatedCode.brmsSnippet).toContain('brms');

    // Exports produce valid binary headers
    const pdfBuf = generatePanelLatentPDF(result, 'sim_test.xlsx');
    const docxBuf = await generatePanelLatentDocx(result, 'sim_test.xlsx');
    const xlsxBuf = generatePanelLatentXLSX(result, 'sim_test.xlsx');
    const csvStr = generatePanelLatentCSV(result);

    expect(pdfBuf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(docxBuf.subarray(0, 2).toString()).toBe('PK');
    expect(xlsxBuf.subarray(0, 2).toString()).toBe('PK');
    expect(csvStr).toContain('Estimated_Latent_CO2');
  });

  it('2. Supports Paste parser, 10-point data quality validation, duplicate detection, and formula sanitization', () => {
    const pasted = parsePastedTabularData(
      'City\tYear\tSelf_Reporting\tSatellite\tSensor\n=CMD()\t2020\t1250\t1190\t1210\nJakarta\t2020\t1250\t1190\t1210\nJakarta\t2020\t1260\t1200\t1215\nBandung\t2021\t800\t780\t790'
    );
    expect(pasted.error).toBeUndefined();
    expect(pasted.rows[0].City.startsWith("'")).toBe(true); // Neutralized formula prefix

    const mapping = autoDetectPanelLatentMapping(pasted.columns);
    const reportStrict = validatePanelLatentData(pasted.rows, mapping, DEFAULT_PREPROCESSING_OPTIONS);
    expect(reportStrict.checks).toHaveLength(10);
    expect(reportStrict.duplicateKeys.length).toBeGreaterThan(0);
    expect(reportStrict.hasBlockingError).toBe(true);

    const reportDropDup = validatePanelLatentData(pasted.rows, mapping, {
      ...DEFAULT_PREPROCESSING_OPTIONS,
      dropDuplicateCityYear: true
    });
    expect(reportDropDup.hasBlockingError).toBe(false);
  });

  it('3. Handles Student-t likelihood, Standardized factor identification, and AR(1) T<3 guard cleanly', () => {
    const rows = generateCO2PresetDataset();
    const mapping = autoDetectPanelLatentMapping(Object.keys(rows[0]));

    // Test Student-t + AR(1) + Standardized factor on full 6-year preset
    const resFull = executePanelLatentPipeline({
      rows,
      mapping,
      spec: {
        identification: 'standardized',
        likelihood: 'student_t',
        studentTDf: 5,
        includeAR1: true,
        chains: 2,
        warmup: 250,
        draws: 250
      }
    });
    expect(resFull.parameters.some(p => p.name === 'rho')).toBe(true);
    expect(resFull.interpretations.finalConclusion.length).toBeGreaterThan(40);

    // Test T=2 automatic AR(1) safety guard
    const rowsTwoYears = rows.filter(r => r.Year <= 2020);
    const resShort = executePanelLatentPipeline({
      rows: rowsTwoYears,
      mapping,
      spec: {
        includeAR1: true,
        chains: 2,
        warmup: 200,
        draws: 200
      }
    });
    expect(resShort.diagnostics.ar1SkippedReason).toContain('T = 2 < 3');
  });
});

