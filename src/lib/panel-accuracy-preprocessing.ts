// ============================================================
// Comparative Measurement Accuracy Assessment — Preprocessing
// Explicit Opt-In Data Cleaning & Complete-Case vs Available-Case Pairing
// ============================================================

import {
  AccuracyPreprocessingOptions,
  CleanedPanelObservation,
  MeasurementSource,
  PanelDataset
} from './panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  parseNumericCell,
  quantileSorted
} from './panel-accuracy-validation';

export interface PreparedPanelAccuracyData {
  allCleanedObservations: CleanedPanelObservation[];
  completeCaseObservations: CleanedPanelObservation[];
  availableCaseBySourceId: Record<string, CleanedPanelObservation[]>;
  cities: string[];
  years: number[];
  referenceSource: MeasurementSource;
  comparisonSources: MeasurementSource[];
  workingUnitNote: string;
}

export function preparePanelAccuracyObservations(
  dataset: PanelDataset,
  options: AccuracyPreprocessingOptions = DEFAULT_ACCURACY_PREPROCESSING
): PreparedPanelAccuracyData {
  const { cityIdColumn, yearColumn, sources, observations } = dataset;

  if (sources.length < 2) {
    throw new Error('Minimal diperlukan 2 sumber pengukuran (disarankan >= 3 untuk model laten tanpa referensi).');
  }

  const unitLabel = sources[0]?.unit || 'kt CO₂';
  const consensusBenchmarkSource: MeasurementSource = {
    id: 'latent_consensus',
    name: 'θ̂',
    label: 'Consensus Latent Benchmark (θ̂)',
    columnKey: 'latent_consensus',
    unit: unitLabel,
    role: 'evaluated',
    methodDescription: 'Estimasi nilai kebenaran laten berbasis model hierarkis Bayesian & triangulasi seluruh sumber.'
  };

  const seenKeys = new Set<string>();
  const prelim: Array<{
    rowIndex: number;
    city: string;
    year: number;
    pairKey: string;
    rawValues: Record<string, number | null>;
    workValues: Record<string, number | null>;
    uncertainties: Record<string, number>;
  }> = [];

  observations.forEach((row, idx) => {
    const city = String(row[cityIdColumn] ?? '').trim();
    const yr = parseNumericCell(row[yearColumn]);
    if (!city || yr === null) return;

    const pairKey = `${city}::${yr}`;
    if (seenKeys.has(pairKey) && options.dropDuplicateCityYear) {
      return;
    }
    seenKeys.add(pairKey);

    const rawValues: Record<string, number | null> = {};
    const workValues: Record<string, number | null> = {};
    const uncertainties: Record<string, number> = {};
    let hasAnyValid = false;

    sources.forEach(src => {
      const parsed = parseNumericCell(row[src.columnKey]);
      rawValues[src.id] = parsed;
      if (parsed === null) {
        workValues[src.id] = null;
      } else {
        const mult =
          options.applyUnitMultiplier && Number.isFinite(options.unitMultipliers[src.id])
            ? options.unitMultipliers[src.id]
            : 1;
        workValues[src.id] = parsed * mult;
        hasAnyValid = true;
      }

      const seVal = src.uncertaintyColumn ? parseNumericCell(row[src.uncertaintyColumn]) : null;
      uncertainties[src.id] = seVal !== null && seVal >= 0 ? seVal : 0;
    });

    if (hasAnyValid) {
      prelim.push({
        rowIndex: idx,
        city,
        year: yr,
        pairKey,
        rawValues,
        workValues,
        uncertainties
      });
    }
  });

  // Sort chronologically within each city
  prelim.sort((a, b) => (a.city === b.city ? a.year - b.year : a.city.localeCompare(b.city)));

  const cities = Array.from(new Set(prelim.map(p => p.city))).sort();
  const years = Array.from(new Set(prelim.map(p => p.year))).sort((a, b) => a - b);
  const cityIndexMap = new Map(cities.map((c, i) => [c, i]));
  const yearIndexMap = new Map(years.map((y, i) => [y, i]));

  // Optional log1p transformation
  if (options.applyLog1p) {
    sources.forEach(src => {
      prelim.forEach(p => {
        const v = p.workValues[src.id];
        if (v !== null && v >= 0) {
          p.workValues[src.id] = Math.log1p(v);
        }
      });
    });
  }

  // Optional Winsorization per source
  if (options.applyWinsorize) {
    const q = Math.min(0.15, Math.max(0.005, options.winsorQuantile || 0.025));
    sources.forEach(src => {
      const valid = prelim
        .map(p => p.workValues[src.id])
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      if (valid.length < 5) return;
      const lo = quantileSorted(valid, q);
      const hi = quantileSorted(valid, 1 - q);
      prelim.forEach(p => {
        const v = p.workValues[src.id];
        if (v !== null) {
          p.workValues[src.id] = Math.min(hi, Math.max(lo, v));
        }
      });
    });
  }

  const allCleanedObservations: CleanedPanelObservation[] = prelim.map(p => ({
    rowIndex: p.rowIndex,
    city: p.city,
    cityIdx: cityIndexMap.get(p.city)!,
    year: p.year,
    yearIdx: yearIndexMap.get(p.year)!,
    pairKey: p.pairKey,
    values: { ...p.workValues },
    rawValues: { ...p.rawValues },
    uncertainties: { ...p.uncertainties }
  }));

  // Complete-case: ALL J evaluated sources present on the same City-Year cell
  const completeCaseObservations = allCleanedObservations.filter(obs =>
    sources.every(s => obs.values[s.id] !== null && Number.isFinite(obs.values[s.id]))
  );

  // Source-specific available-case: source j AND at least minPeers other sources present
  const minPeers = sources.length >= 3 ? 2 : 1;
  const availableCaseBySourceId: Record<string, CleanedPanelObservation[]> = {};
  sources.forEach(src => {
    availableCaseBySourceId[src.id] = allCleanedObservations.filter(obs => {
      const targetVal = obs.values[src.id];
      if (targetVal === null || !Number.isFinite(targetVal)) return false;
      const peerCount = sources.filter(
        peer => peer.id !== src.id && obs.values[peer.id] !== null && Number.isFinite(obs.values[peer.id])
      ).length;
      return peerCount >= minPeers;
    });
  });

  const workingUnitNote = options.applyLog1p
    ? `log(1 + ${unitLabel})`
    : unitLabel;

  return {
    allCleanedObservations,
    completeCaseObservations,
    availableCaseBySourceId,
    cities,
    years,
    referenceSource: consensusBenchmarkSource,
    comparisonSources: sources, // All J evaluated sources equally!
    workingUnitNote
  };
}
