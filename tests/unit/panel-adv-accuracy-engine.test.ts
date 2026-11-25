import { describe, expect, it } from 'vitest';
import { buildOption3AutoDecisions } from '../../src/lib/panel-adv-auto-engine';
import { runOption3LatentEstimation } from '../../src/lib/panel-adv-estimation';
import {
  generateOption3CSV,
  generateOption3Docx,
  generateOption3PDF,
  generateOption3XLSX
} from '../../src/lib/panel-adv-export';
import { runOption3MonteCarloValidation } from '../../src/lib/panel-adv-montecarlo';
import { executeAdvancedPanelAccuracyPipeline } from '../../src/lib/panel-adv-orchestrator';
import { profileAndPreprocessOption3Dataset } from '../../src/lib/panel-adv-preprocessing';
import { applyHolmStepDownCorrection } from '../../src/lib/panel-adv-validation';
import { PanelDataset } from '../../src/lib/panel-adv-types';
import { generateMultiSourceCO2PresetDataset } from '../../src/lib/panel-accuracy-validation';

describe('Option 3: Advanced Latent Measurement Model & Panel Accuracy Validation', () => {
  it('profiles 13 panel dimensions, avoids false pooled-entity outlier flags, and gates 10 transformations by domain & estimand', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    // Inject one negative value into X1 to verify strict domain eligibility gating
    const rowsWithNeg = preset.observations.map((r, idx) =>
      idx === 0 ? { ...r, X1_Self_Reporting: -5.2 } : { ...r }
    );
    const dsNeg: PanelDataset = {
      cityIdColumn: preset.cityIdColumn,
      yearColumn: preset.yearColumn,
      sources: preset.sources,
      observations: rowsWithNeg
    };

    const prep = profileAndPreprocessOption3Dataset({ dataset: dsNeg });
    expect(prep.profile.nEntities).toBe(10);
    expect(prep.profile.nPeriods).toBe(6);
    expect(prep.profile.nSources).toBe(4);
    expect(prep.profile.hasAnyNegatives).toBe(true);
    expect(prep.profile.transformationEvaluations).toHaveLength(10);

    const logEval = prep.profile.transformationEvaluations.find(t => t.method === 'log');
    const boxCoxEval = prep.profile.transformationEvaluations.find(t => t.method === 'box_cox');
    const yjEval = prep.profile.transformationEvaluations.find(t => t.method === 'yeo_johnson');
    expect(logEval?.eligible).toBe(false);
    expect(boxCoxEval?.eligible).toBe(false);
    expect(yjEval?.eligible).toBe(true);
    expect(prep.profile.whyNotDefaultGrubbsNote).toContain('Grubbs');
  });

  it('produces all 12 validity-first automatic decisions, tracks manual overrides, and restores initial config cleanly', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const prep = profileAndPreprocessOption3Dataset({ dataset: preset });

    const initial = buildOption3AutoDecisions({ profile: prep.profile });
    expect(initial.decisions).toHaveLength(12);
    expect(initial.hasManualOverrides).toBe(false);
    expect(initial.overallIdentifiabilityStatus).toBe('IDENTIFIED');

    const overridden = buildOption3AutoDecisions({
      profile: prep.profile,
      overrides: {
        transformation: 'yeo_johnson',
        standardErrorMethod: 'DRISCOLL_KRAAY_HAC',
        priorStrategy: 'SKEPTICAL_BSEM_SHRINKAGE'
      }
    });
    expect(overridden.hasManualOverrides).toBe(true);
    expect(overridden.activeConfig.transformation).toBe('yeo_johnson');
    expect(overridden.activeConfig.standardErrorMethod).toBe('DRISCOLL_KRAAY_HAC');
    expect(overridden.decisions.find(d => d.dimensionKey === 'transformation')?.isOverriddenByUser).toBe(true);
    // Initial auto config must remain preserved inside overridden bundle for 1-click restore
    expect(overridden.initialAutoConfig.transformation).toBe(initial.initialAutoConfig.transformation);
  });

  it('proves scale-adjusted noise ratio R_j = sigma/|lambda| is anchor-invariant (Kendall W = 1) while Total RMSE detects biased marker anchors', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const prep = profileAndPreprocessOption3Dataset({ dataset: preset });
    const auto = buildOption3AutoDecisions({ profile: prep.profile });
    const est = runOption3LatentEstimation({ preprocessed: prep, config: auto.activeConfig });

    expect(est.identified).toBe(true);
    expect(est.mcmcDiagnostics.maxRankNormalizedRhat).toBeLessThanOrEqual(1.08);
    expect(est.mcmcDiagnostics.maxFoldedRhat).toBeLessThanOrEqual(1.12);
    expect(est.mcmcDiagnostics.minBulkEss).toBeGreaterThanOrEqual(60);

    // 4 sources + 2 consensus anchors = 6 evaluated anchor regimes
    expect(est.anchorSensitivity.evaluatedAnchors.length).toBe(6);
    expect(est.anchorSensitivity.kendallWNoiseRatio).toBeCloseTo(1.0, 4);
    expect(est.anchorSensitivity.isAnchorInvariantPrecisionRatio).toBe(true);
    // Because X1 has -46 kt bias, forcing X1 as bias-free marker anchor shifts Total RMSE rankings!
    expect(est.anchorSensitivity.topSourceFlipAcrossAnchors).toBe(true);
  });

  it('enforces algebraic covariance degrees of freedom: blocks M4 correlated residuals at J=3 and permits sparse M4 at J=4', () => {
    const preset4 = generateMultiSourceCO2PresetDataset();
    const fit4 = executeAdvancedPanelAccuracyPipeline({
      dataset: preset4,
      monteCarloReplications: 15
    });
    const m4With4Sources = fit4.estimation.candidateModels.find(
      m => m.modelId === 'M4_SPARSE_CORRELATED_RESIDUAL'
    );
    expect(m4With4Sources?.isIdentifiable).toBe(true);
    expect(m4With4Sources?.degreesOfFreedomCov).toBeGreaterThanOrEqual(1);

    const preset3: PanelDataset = {
      ...preset4,
      sources: preset4.sources.slice(0, 3)
    };
    const fit3 = executeAdvancedPanelAccuracyPipeline({
      dataset: preset3,
      monteCarloReplications: 15
    });
    const m4With3Sources = fit3.estimation.candidateModels.find(
      m => m.modelId === 'M4_SPARSE_CORRELATED_RESIDUAL'
    );
    expect(m4With3Sources?.isIdentifiable).toBe(false);
    expect(m4With3Sources?.degreesOfFreedomCov).toBeLessThan(0);
  });

  it('identifies Field Sensor (X3) as relative #1 on CO2 preset, detects statistical ties on near-identical noise, and runs 10 CMB scenarios', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const res = executeAdvancedPanelAccuracyPipeline({
      dataset: preset,
      monteCarloReplications: 16
    });

    expect(res.ranking.rows[0].sourceLabel).toBe('Field Sensor');
    expect(res.ranking.rows[0].probRank1).toBeGreaterThan(0.75);
    res.ranking.rows.forEach(r => {
      expect(r.cumulativeRankProbs).toHaveLength(4);
      expect(r.cumulativeRankProbs[3]).toBeCloseTo(1.0, 5);
      for (let k = 1; k < r.cumulativeRankProbs.length; k++) {
        expect(r.cumulativeRankProbs[k]).toBeGreaterThanOrEqual(r.cumulativeRankProbs[k - 1] - 1e-9);
      }
    });
    expect(res.ranking.commonModeBiasScenarios).toHaveLength(10);
    expect(res.scientificConclusion.epistemologicalGroundTruthBoundary).toContain('BUKAN');

    // Construct near-identical noise dataset with independent pseudo-random draws to verify honest tie guard
    let seedTie = 424242;
    const nextStdNorm = () => {
      seedTie = (seedTie * 1664525 + 1013904223) >>> 0;
      const u1 = Math.max(1e-7, seedTie / 4294967296);
      seedTie = (seedTie * 1664525 + 1013904223) >>> 0;
      const u2 = Math.max(1e-7, seedTie / 4294967296);
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    const tieObs: Record<string, unknown>[] = [];
    for (let i = 1; i <= 7; i++) {
      for (let t = 2020; t <= 2023; t++) {
        const signal = 100 + i * 10 + (t - 2020) * 4;
        tieObs.push({
          City: `C${i}`,
          Year: t,
          S1: signal + nextStdNorm() * 1.50,
          S2: signal + nextStdNorm() * 1.52,
          S3: signal + nextStdNorm() * 5.20
        });
      }
    }
    const tieDs: PanelDataset = {
      cityIdColumn: 'City',
      yearColumn: 'Year',
      sources: [
        { id: 's1', name: 'X1', label: 'Sensor A', columnKey: 'S1', unit: 'u', role: 'evaluated' },
        { id: 's2', name: 'X2', label: 'Sensor B', columnKey: 'S2', unit: 'u', role: 'evaluated' },
        { id: 's3', name: 'X3', label: 'Sensor C', columnKey: 'S3', unit: 'u', role: 'evaluated' }
      ],
      observations: tieObs
    };
    const tieFit = executeAdvancedPanelAccuracyPipeline({ dataset: tieDs, monteCarloReplications: 15 });
    expect(tieFit.ranking.rows[1].statisticallyIndistinguishableFromTop).toBe(true);
  });

  it('computes exact Holm (1979) step-down adjusted p-values, covariance-audited LOSO, and Repeated-Measures LoA', () => {
    const rawP = [0.008, 0.021, 0.045, 0.2];
    const holmP = applyHolmStepDownCorrection(rawP);
    // m=4: 0.008*4=0.032, max(0.032, 0.021*3=0.063)=0.063, max(0.063, 0.045*2=0.090)=0.090, max(0.090, 0.2*1)=0.200
    expect(holmP[0]).toBeCloseTo(0.032, 5);
    expect(holmP[1]).toBeCloseTo(0.063, 5);
    expect(holmP[2]).toBeCloseTo(0.09, 5);
    expect(holmP[3]).toBeCloseTo(0.2, 5);

    const preset = generateMultiSourceCO2PresetDataset();
    const res = executeAdvancedPanelAccuracyPipeline({ dataset: preset, monteCarloReplications: 15 });
    expect(res.validation.losoEntries).toHaveLength(4);
    expect(res.validation.pairwiseHolmContrasts).toHaveLength(6); // 4*3/2 = 6 pairs
    expect(res.validation.repeatedMeasuresAgreement).toHaveLength(4);
    res.validation.repeatedMeasuresAgreement.forEach(rm => {
      expect(rm.mixedEffectsLoaUpper).toBeGreaterThan(rm.mixedEffectsLoaLower);
      expect(rm.linsCcc).toBeGreaterThan(0.5);
    });
  });

  it('executes 7-family Monte Carlo simulation and exports valid PDF 1.4, DOCX, XLSX, CSV, Stata, R, and 13 DOI references', async () => {
    const mc = runOption3MonteCarloValidation({
      nEntities: 10,
      nPeriods: 6,
      nSources: 4,
      replicationsPerScenario: 25
    });
    const families = new Set(mc.scenarios.map(s => s.family));
    expect(families.size).toBe(7);
    const j2Scenario = mc.scenarios.find(s => s.scenarioId === 'MC_F3_UNDERIDENTIFIED_J2');
    expect(j2Scenario?.identificationFailurePct).toBe(100);
    const cleanScenario = mc.scenarios.find(s => s.scenarioId === 'MC_A1_HETERO_CLEAN');
    expect(cleanScenario?.top1RankingRecoveryPct).toBeGreaterThanOrEqual(75);

    const preset = generateMultiSourceCO2PresetDataset();
    // Test formula injection sanitization on source label
    const safePreset: PanelDataset = {
      ...preset,
      sources: preset.sources.map((s, idx) =>
        idx === 0 ? { ...s, label: '=CMD|" /C calc"!A0 Self-Reporting' } : s
      )
    };
    const res = executeAdvancedPanelAccuracyPipeline({ dataset: safePreset, monteCarloReplications: 15 });
    expect(res.stepStataGuides).toHaveLength(9);
    expect(res.literature).toHaveLength(13);

    const csv = generateOption3CSV(res);
    expect(csv).toContain("'=CMD");

    const pdfBuf = generateOption3PDF(res, 'test.xlsx');
    expect(pdfBuf.subarray(0, 8).toString('utf8')).toContain('%PDF-1.4');
    expect(pdfBuf.toString('utf8')).toContain('%%EOF');

    const xlsxBuf = generateOption3XLSX(res, 'test.xlsx');
    expect(xlsxBuf[0]).toBe(0x50); // 'P'
    expect(xlsxBuf[1]).toBe(0x4b); // 'K'

    const docxBuf = await generateOption3Docx(res, 'test.xlsx');
    expect(docxBuf[0]).toBe(0x50);
    expect(docxBuf[1]).toBe(0x4b);
  });
});
