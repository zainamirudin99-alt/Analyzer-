// ============================================================
// Panel Latent Variable Measurement Model — Pipeline Orchestrator
// Coordinates validation, opt-in preprocessing, Bayesian MCMC,
// Stata formatting, academic interpretation, and Stan/R codegen.
// ============================================================

import { generateReproducibleCode } from './panel-latent-codegen';
import {
  DEFAULT_PREPROCESSING_OPTIONS,
  preparePanelLatentObservations,
  validatePanelLatentData
} from './panel-latent-data';
import {
  generateDynamicInterpretations,
  generateStataStyleBundle
} from './panel-latent-interpretation';
import {
  DEFAULT_PANEL_LATENT_SPEC,
  runPanelLatentBayesianAnalysis
} from './panel-latent-mcmc';
import {
  PanelLatentFitResult,
  PanelLatentMapping,
  PanelLatentModelSpec,
  PanelLatentPreprocessingOptions
} from './panel-latent-types';

export function executePanelLatentPipeline(params: {
  rows: Record<string, any>[];
  mapping: PanelLatentMapping;
  preprocessing?: Partial<PanelLatentPreprocessingOptions>;
  spec?: Partial<PanelLatentModelSpec>;
}): PanelLatentFitResult {
  const preprocessing: PanelLatentPreprocessingOptions = {
    ...DEFAULT_PREPROCESSING_OPTIONS,
    ...(params.preprocessing || {})
  };
  const spec: PanelLatentModelSpec = {
    ...DEFAULT_PANEL_LATENT_SPEC,
    ...(params.spec || {})
  };

  const quality = validatePanelLatentData(params.rows, params.mapping, preprocessing);
  if (quality.hasBlockingError) {
    const blockingMsgs = quality.checks
      .filter(c => c.severity === 'error')
      .map(c => c.message)
      .join(' ');
    throw new Error(`Validasi data panel laten gagal: ${blockingMsgs || 'Periksa pemetaan kolom dan kunci City-Year.'}`);
  }

  const prepared = preparePanelLatentObservations(params.rows, params.mapping, preprocessing);
  if (prepared.observations.length < 4) {
    throw new Error('Jumlah observasi valid terlalu sedikit (< 4) untuk estimasi Bayesian hierarkis.');
  }

  const core = runPanelLatentBayesianAnalysis(
    prepared.observations,
    prepared.cities,
    prepared.years,
    params.mapping,
    preprocessing,
    spec,
    {
      wasLog1p: preprocessing.applyLog1p,
      wasStandardized: preprocessing.applyStandardize,
      meansBeforeStd: prepared.meansBeforeStd,
      sdsBeforeStd: prepared.sdsBeforeStd
    }
  );

  const stataOutput = generateStataStyleBundle(core);
  const interpretations = generateDynamicInterpretations(core);
  const generatedCode = generateReproducibleCode(spec, params.mapping, preprocessing);

  return {
    ...core,
    stataOutput,
    interpretations,
    generatedCode
  };
}

