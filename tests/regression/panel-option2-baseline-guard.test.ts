import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { executePanelAccuracyPipeline } from '../../src/lib/panel-accuracy-orchestrator';
import { PanelDataset } from '../../src/lib/panel-accuracy-types';
import { generateMultiSourceCO2PresetDataset } from '../../src/lib/panel-accuracy-validation';
import { executeAdvancedPanelAccuracyPipeline } from '../../src/lib/panel-adv-orchestrator';
import { evaluateOption2VsOption3Methodology } from '../../src/lib/panel-methodology-comparison';

const RECORDED_BASELINE_SHA256: Record<string, string> = {
  'src/components/PanelTab.tsx': 'EA2F1B15FA14B68DDC85A4233156FC87D8C94472ACBD8AFAB6ADF22B00FBB47C',
  'src/lib/panel-engine.ts': '5599CCD713103AFFDFB26782A32978760436CC0A312729C61D450104A123137E',
  'src/components/PanelAccuracyTab.tsx': '7CD7812518517BC2DE95621FABF3326106F55246E439B0D9B63EE1809B46BA03',
  'src/components/PanelAccuracyStepStataPanel.tsx': '9472BAE13A8406830269A55382AFDDDEFFC0D02B5F4955A874C6139450FC6788',
  'src/components/PanelAccuracyCharts.tsx': 'DDEC7EBD05302D002E873777068FE92586F64EBF901EB49A10F2164555CA880F',
  'src/lib/panel-accuracy-orchestrator.ts': '0D75EE5AC2F48FBEC6CB320AC8515415F3C5C59258989EA19FC56D8C74309996',
  'src/lib/panel-accuracy-latent.ts': '58DBDD49C68D14471B362A5F17F78A21570F56AE4B3B9543F13F31AD4D0D92F5',
  'src/lib/panel-accuracy-ranking.ts': '41E7B266FBCDEDB3DA0B0C5B2D7DDD3F936B4542ABA683022D0D3BC91522298A',
  'src/lib/panel-accuracy-types.ts': '0AA4BA9B9582A19D430DCD403C7C43B99A0949A21AE6591F22C42392E61E9CCB'
};

describe('Baseline Protection Guard (Option 1 & Option 2 Untouched) & Comparative Methodology Evaluation', () => {
  it('verifies zero byte-level modification on Option 1 and Option 2 source files via SHA-256 checksums', () => {
    const repoRoot = process.cwd();
    for (const [relPath, expectedHash] of Object.entries(RECORDED_BASELINE_SHA256)) {
      const absPath = path.join(repoRoot, relPath);
      const bytes = fs.readFileSync(absPath);
      const actualHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
      expect(actualHash, `Checksum mismatch on protected file ${relPath}`).toBe(expectedHash);
    }
  });

  it('runs Option 2 independently, Option 3 independently, and Both together without mutating input or altering Option 2 outputs', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const snapshotBefore = JSON.stringify(preset);

    const opt2StandaloneBefore = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 499,
      mcmcIterations: 350
    });

    const opt3Standalone = executeAdvancedPanelAccuracyPipeline({
      dataset: preset,
      monteCarloReplications: 15
    });

    const joint = evaluateOption2VsOption3Methodology({
      dataset: preset,
      highPrecision: false
    });

    const opt2StandaloneAfter = executePanelAccuracyPipeline({
      dataset: preset,
      bootstrapReplications: 499,
      mcmcIterations: 350
    });

    // Input dataset must remain 100% unmutated
    expect(JSON.stringify(preset)).toBe(snapshotBefore);

    // Option 2 numerical outputs must be 100% deterministic & identical before vs after Option 3
    expect(opt2StandaloneAfter.ranking.bestSourceId).toBe(opt2StandaloneBefore.ranking.bestSourceId);
    expect(opt2StandaloneAfter.latentModel.maxRhat).toBe(opt2StandaloneBefore.latentModel.maxRhat);
    expect(opt2StandaloneAfter.pairFixedEffects.omnibusFStat).toBe(opt2StandaloneBefore.pairFixedEffects.omnibusFStat);
    expect(opt2StandaloneAfter.ranking.ranks.map(r => r.totalLatentRmse)).toEqual(
      opt2StandaloneBefore.ranking.ranks.map(r => r.totalLatentRmse)
    );

    // Joint comparative bundle checks
    expect(opt3Standalone.ranking.leaderSourceId).toBe('src_3');
    expect(joint.comparison.aspectComparisonTable).toHaveLength(19);
    expect(joint.comparison.diagnosticComparison).toHaveLength(10);
    expect(joint.comparison.rankingComparison.sameTopRankedSource).toBe(true);
    expect(joint.comparison.rankingComparison.spearmanRankConcordance).toBeCloseTo(1.0, 4);
    expect(joint.comparison.conclusion.noGroundTruthDisclaimer).toContain('Ground Truth');
  });

  it('flags BOTH_IDENTIFICATION_LIMITED honestly when J = 2 sources are supplied to comparative evaluator', () => {
    const preset = generateMultiSourceCO2PresetDataset();
    const underidentifiedDs: PanelDataset = {
      ...preset,
      sources: preset.sources.slice(0, 2)
    };

    const comp = evaluateOption2VsOption3Methodology({
      dataset: underidentifiedDs,
      highPrecision: false
    });

    expect(comp.option3.estimation.identified).toBe(false);
    expect(comp.comparison.conclusion.category).toBe('BOTH_IDENTIFICATION_LIMITED');
  });
});
