// ============================================================
// Comparative Measurement Accuracy Assessment — EDA & Correlations
// Overall Pearson, Spearman, Within-City Demeaned & First-Difference
// ============================================================

import {
  CleanedPanelObservation,
  CorrelationMatricesBundle,
  MeasurementSource,
  SourceDescriptiveSummary
} from './panel-accuracy-types';
import { quantileSorted } from './panel-accuracy-validation';

export function computePearsonR(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? Math.max(-1, Math.min(1, num / den)) : 0;
}

function rankArray(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(vals.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function computeSpearmanRho(xs: number[], ys: number[]): number {
  if (xs.length < 2 || ys.length < 2) return 0;
  return computePearsonR(rankArray(xs), rankArray(ys));
}

export function computeWithinCityPearsonR(
  observations: CleanedPanelObservation[],
  srcAId: string,
  srcBId: string
): number {
  if (srcAId === srcBId) return 1;
  const byCity = new Map<string, Array<{ a: number; b: number }>>();
  observations.forEach(obs => {
    const va = obs.values[srcAId];
    const vb = obs.values[srcBId];
    if (va === null || vb === null || !Number.isFinite(va) || !Number.isFinite(vb)) return;
    if (!byCity.has(obs.city)) byCity.set(obs.city, []);
    byCity.get(obs.city)!.push({ a: va, b: vb });
  });

  const demA: number[] = [];
  const demB: number[] = [];
  byCity.forEach(list => {
    if (list.length < 2) return;
    const ma = list.reduce((s, p) => s + p.a, 0) / list.length;
    const mb = list.reduce((s, p) => s + p.b, 0) / list.length;
    list.forEach(p => {
      demA.push(p.a - ma);
      demB.push(p.b - mb);
    });
  });

  return computePearsonR(demA, demB);
}

export function computeFirstDifferencePearsonR(
  observations: CleanedPanelObservation[],
  srcAId: string,
  srcBId: string
): number {
  if (srcAId === srcBId) return 1;
  const byCity = new Map<string, Array<{ year: number; a: number; b: number }>>();
  observations.forEach(obs => {
    const va = obs.values[srcAId];
    const vb = obs.values[srcBId];
    if (va === null || vb === null || !Number.isFinite(va) || !Number.isFinite(vb)) return;
    if (!byCity.has(obs.city)) byCity.set(obs.city, []);
    byCity.get(obs.city)!.push({ year: obs.year, a: va, b: vb });
  });

  const diffA: number[] = [];
  const diffB: number[] = [];
  byCity.forEach(list => {
    list.sort((x, y) => x.year - y.year);
    for (let i = 1; i < list.length; i++) {
      diffA.push(list[i].a - list[i - 1].a);
      diffB.push(list[i].b - list[i - 1].b);
    }
  });

  return computePearsonR(diffA, diffB);
}

export function computeWithinCityPearsonRVec(
  observations: CleanedPanelObservation[],
  valsA: number[],
  valsB: number[]
): number {
  const byCity = new Map<string, Array<{ a: number; b: number }>>();
  observations.forEach((obs, i) => {
    const va = valsA[i];
    const vb = valsB[i];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return;
    if (!byCity.has(obs.city)) byCity.set(obs.city, []);
    byCity.get(obs.city)!.push({ a: va, b: vb });
  });

  const demA: number[] = [];
  const demB: number[] = [];
  byCity.forEach(list => {
    if (list.length < 2) return;
    const ma = list.reduce((s, p) => s + p.a, 0) / list.length;
    const mb = list.reduce((s, p) => s + p.b, 0) / list.length;
    list.forEach(p => {
      demA.push(p.a - ma);
      demB.push(p.b - mb);
    });
  });
  return computePearsonR(demA, demB);
}

export function computeFirstDifferencePearsonRVec(
  observations: CleanedPanelObservation[],
  valsA: number[],
  valsB: number[]
): number {
  const byCity = new Map<string, Array<{ year: number; a: number; b: number }>>();
  observations.forEach((obs, i) => {
    const va = valsA[i];
    const vb = valsB[i];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return;
    if (!byCity.has(obs.city)) byCity.set(obs.city, []);
    byCity.get(obs.city)!.push({ year: obs.year, a: va, b: vb });
  });

  const diffA: number[] = [];
  const diffB: number[] = [];
  byCity.forEach(list => {
    list.sort((x, y) => x.year - y.year);
    for (let i = 1; i < list.length; i++) {
      diffA.push(list[i].a - list[i - 1].a);
      diffB.push(list[i].b - list[i - 1].b);
    }
  });
  return computePearsonR(diffA, diffB);
}

export function computeAccuracyEDA(
  observations: CleanedPanelObservation[],
  sources: MeasurementSource[]
): CorrelationMatricesBundle {
  const totalObs = observations.length;

  const descriptives: SourceDescriptiveSummary[] = sources.map(src => {
    const vals = observations
      .map(o => o.values[src.id])
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);

    const n = vals.length;
    const missing = Math.max(0, totalObs - n);
    if (n === 0) {
      return {
        sourceId: src.id,
        sourceName: src.name,
        sourceLabel: src.label,
        role: src.role,
        unit: src.unit,
        n: 0,
        missing,
        mean: 0,
        sd: 0,
        median: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        min: 0,
        max: 0,
        cv: 0,
        skewness: 0,
        kurtosisExcess: 0
      };
    }

    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(Math.max(0, variance));
    const q1 = quantileSorted(vals, 0.25);
    const median = quantileSorted(vals, 0.5);
    const q3 = quantileSorted(vals, 0.75);
    const iqr = q3 - q1;
    const cv = Math.abs(mean) > 1e-12 ? sd / Math.abs(mean) : 0;
    const skewness =
      sd > 1e-12 && n >= 3
        ? vals.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / n
        : 0;
    const kurtosisExcess =
      sd > 1e-12 && n >= 4
        ? vals.reduce((s, v) => s + ((v - mean) / sd) ** 4, 0) / n - 3
        : 0;

    return {
      sourceId: src.id,
      sourceName: src.name,
      sourceLabel: src.label,
      role: src.role,
      unit: src.unit,
      n,
      missing,
      mean,
      sd,
      median,
      q1,
      q3,
      iqr,
      min: vals[0],
      max: vals[n - 1],
      cv,
      skewness,
      kurtosisExcess
    };
  });

  const J = sources.length;
  const overallPearson: number[][] = Array.from({ length: J }, () => new Array(J).fill(1));
  const overallSpearman: number[][] = Array.from({ length: J }, () => new Array(J).fill(1));
  const withinCityPearson: number[][] = Array.from({ length: J }, () => new Array(J).fill(1));
  const firstDiffPearson: number[][] = Array.from({ length: J }, () => new Array(J).fill(1));

  for (let a = 0; a < J; a++) {
    for (let b = a + 1; b < J; b++) {
      const idA = sources[a].id;
      const idB = sources[b].id;
      const xs: number[] = [];
      const ys: number[] = [];
      observations.forEach(o => {
        const va = o.values[idA];
        const vb = o.values[idB];
        if (va !== null && vb !== null && Number.isFinite(va) && Number.isFinite(vb)) {
          xs.push(va);
          ys.push(vb);
        }
      });

      const rP = computePearsonR(xs, ys);
      const rS = computeSpearmanRho(xs, ys);
      const rW = computeWithinCityPearsonR(observations, idA, idB);
      const rFD = computeFirstDifferencePearsonR(observations, idA, idB);

      overallPearson[a][b] = overallPearson[b][a] = rP;
      overallSpearman[a][b] = overallSpearman[b][a] = rS;
      withinCityPearson[a][b] = withinCityPearson[b][a] = rW;
      firstDiffPearson[a][b] = firstDiffPearson[b][a] = rFD;
    }
  }

  const byYear = new Map<number, Record<string, number[]>>();
  const byCity = new Map<string, Array<{ year: number; values: Record<string, number | null> }>>();

  observations.forEach(o => {
    if (!byYear.has(o.year)) {
      const init: Record<string, number[]> = {};
      sources.forEach(s => {
        init[s.id] = [];
      });
      byYear.set(o.year, init);
    }
    const yrBucket = byYear.get(o.year)!;
    sources.forEach(s => {
      const v = o.values[s.id];
      if (v !== null && Number.isFinite(v)) yrBucket[s.id].push(v);
    });

    if (!byCity.has(o.city)) byCity.set(o.city, []);
    byCity.get(o.city)!.push({ year: o.year, values: { ...o.values } });
  });

  const yearlyAverages = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, bucket]) => {
      const values: Record<string, number | null> = {};
      sources.forEach(s => {
        const arr = bucket[s.id];
        values[s.id] = arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
      });
      return { year, values };
    });

  const cityTrends = Array.from(byCity.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([city, pts]) => ({
      city,
      points: pts.sort((x, y) => x.year - y.year)
    }));

  return {
    sourceIds: sources.map(s => s.id),
    sourceNames: sources.map(s => s.name),
    sourceLabels: sources.map(s => `${s.name} (${s.label})`),
    descriptives,
    overallPearson,
    overallSpearman,
    withinCityPearson,
    firstDiffPearson,
    yearlyAverages,
    cityTrends
  };
}
