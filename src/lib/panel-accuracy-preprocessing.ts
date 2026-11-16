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

  const refSource = sources.find(s => s.role === 'reference');
  const compSources = sources.filter(s => s.role === 'comparison');
  if (!refSource || compSources.length === 0) {
    throw new Error('Wajib memiliki tepat 1 Reference Source dan minimal 1 Comparison Source.');
  }

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

  // Complete-case: reference source AND all comparison sources present
  const completeCaseObservations = allCleanedObservations.filter(obs =>
    sources.every(s => obs.values[s.id] !== null && Number.isFinite(obs.values[s.id]))
  );

  // Source-specific available-case: reference source AND specific comparison source j present
  const availableCaseBySourceId: Record<string, CleanedPanelObservation[]> = {};
  compSources.forEach(cs => {
    availableCaseBySourceId[cs.id] = allCleanedObservations.filter(
      obs =>
        obs.values[refSource.id] !== null &&
        Number.isFinite(obs.values[refSource.id]) &&
        obs.values[cs.id] !== null &&
        Number.isFinite(obs.values[cs.id])
    );
  });

  const workingUnitNote = options.applyLog1p
    ? `log(1 + ${refSource.unit || 'unit'})`
    : refSource.unit || 'kt CO₂';

  return {
    allCleanedObservations,
    completeCaseObservations,
    availableCaseBySourceId,
    cities,
    years,
    referenceSource: refSource,
    comparisonSources: compSources,
    workingUnitNote
  };
}
