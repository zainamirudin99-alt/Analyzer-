
import {
  MsmaColumnTypeProfile,
  MsmaEntityObsSummary,
  MsmaPanelStructureResult,
  MsmaPhysicalDimension,
  MsmaRawSheet,
  MsmaSourceConfig
} from '../types';
import { parseSafeNumber, sanitizeCellText } from '../utils/numerical';

export function detectPanelStructure(
  sheet: MsmaRawSheet,
  profiles: MsmaColumnTypeProfile[],
  manualEntityCol?: string,
  manualTimeCol?: string
): MsmaPanelStructureResult {
  const cols = sheet.columns;
  const recommendedEntityColumn =
    profiles.find(p => p.suggestedRole === 'entity_id')?.columnName ??
    profiles.find(p => p.detectedType === 'categorical')?.columnName ??
    cols[0] ??
    '';

  const recommendedTimeColumn =
    profiles.find(p => p.suggestedRole === 'time_id' && p.columnName !== recommendedEntityColumn)?.columnName ??
    profiles.find(
      p =>
        p.columnName !== recommendedEntityColumn &&
        p.detectedType === 'numeric' &&
        p.uniqueCount >= 2 &&
        p.uniqueCount <= Math.max(30, sheet.rowCount / 2)
    )?.columnName ??
    cols.find(c => c !== recommendedEntityColumn) ??
    '';

  const entityColumn =
    manualEntityCol && cols.includes(manualEntityCol) ? manualEntityCol : recommendedEntityColumn;
  const timeColumn =
    manualTimeCol && cols.includes(manualTimeCol) && manualTimeCol !== entityColumn
      ? manualTimeCol
      : recommendedTimeColumn;

  let validPanelRows = 0;
  let missingEntityOrTimeRows = 0;
  let inconsistentTimeRows = 0;

  const pairCounts = new Map<string, number>();
  const periodsSet = new Set<number>();
  const entityPeriods = new Map<string, number[]>();

  for (const r of sheet.rows) {
    const rawEnt = r[entityColumn];
    const rawTime = r[timeColumn];
    const entStr = sanitizeCellText(rawEnt);
    if (!entStr || rawTime === null || rawTime === undefined || String(rawTime).trim() === '') {
      missingEntityOrTimeRows++;
      continue;
    }

    let timeNum = parseSafeNumber(rawTime);
    if (timeNum === null) {
      // Try extracting 4-digit year from string like "2021-Q1" or "FY2022"
      const m = String(rawTime).match(/(19|20)\d{2}/);
      if (m) {
        timeNum = Number(m[0]);
      } else {
        inconsistentTimeRows++;
        continue;
      }
    }

    validPanelRows++;
    periodsSet.add(timeNum);
    const key = `${entStr}|||${timeNum}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);

    const list = entityPeriods.get(entStr) ?? [];
    list.push(timeNum);
    entityPeriods.set(entStr, list);
  }

  const periodsSorted = Array.from(periodsSet).sort((a, b) => a - b);
  let minStep = 1;
  if (periodsSorted.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < periodsSorted.length; i++) {
      const d = periodsSorted[i] - periodsSorted[i - 1];
      if (d > 0) diffs.push(d);
    }
    if (diffs.length > 0) minStep = Math.min(...diffs);
  }

  let duplicatePairsCount = 0;
  const duplicateExamples: string[] = [];
  pairCounts.forEach((cnt, key) => {
    if (cnt > 1) {
      duplicatePairsCount += cnt - 1;
      if (duplicateExamples.length < 5) {
        const [ent, yr] = key.split('|||');
        duplicateExamples.push(`${ent} (${yr}) ×${cnt}`);
      }
    }
  });

  const entityDistribution: MsmaEntityObsSummary[] = [];
  let periodGapEntitiesCount = 0;

  Array.from(entityPeriods.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([entityId, pList]) => {
      const uniqSorted = Array.from(new Set(pList)).sort((a, b) => a - b);
      let hasGap = false;
      for (let i = 1; i < uniqSorted.length; i++) {
        if (uniqSorted[i] - uniqSorted[i - 1] > minStep * 1.05) {
          hasGap = true;
          break;
        }
      }
      if (hasGap) periodGapEntitiesCount++;
      entityDistribution.push({
        entityId,
        obsCount: pList.length,
        minPeriod: uniqSorted[0] ?? 0,
        maxPeriod: uniqSorted[uniqSorted.length - 1] ?? 0,
        hasGap
      });
    });

  const nEntities = entityDistribution.length;
  const nPeriods = periodsSorted.length;
  const expectedBalancedRows = nEntities * nPeriods;
  const uniqueValidPairs = pairCounts.size;
  const missingPanelCells = Math.max(0, expectedBalancedRows - uniqueValidPairs);
  const isBalanced =
    nEntities > 0 &&
    nPeriods > 0 &&
    duplicatePairsCount === 0 &&
    missingPanelCells === 0 &&
    entityDistribution.every(e => e.obsCount === nPeriods && !e.hasGap);

  const missingShare = expectedBalancedRows > 0 ? missingPanelCells / expectedBalancedRows : 0;
  const potentialMissingnessBiasRisk: MsmaPanelStructureResult['potentialMissingnessBiasRisk'] =
    missingShare > 0.25 || periodGapEntitiesCount > nEntities * 0.4
      ? 'TINGGI'
      : missingShare > 0.05 || !isBalanced
        ? 'SEDANG'
        : 'RENDAH';

  const unbalancedEvaluationNote = isBalanced
    ? `Panel seimbang penuh (Balanced Panel): seluruh ${nEntities} entitas memiliki ${nPeriods} periode lengkap (${validPanelRows} observasi).`
    : `Panel tidak seimbang (Unbalanced Panel): tersedia ${uniqueValidPairs} sel unik dari matriks penuh ${expectedBalancedRows} (${missingPanelCells} sel kosong; ${periodGapEntitiesCount} entitas memiliki jeda periode). Metode collocation tetap dapat dijalankan pada observasi irisan lengkap (complete-case) selama hilangnya data tidak berkorelasi ekstrem dengan galat pengukuran; sensitivitas Balanced vs Unbalanced dievaluasi pada Step 9.`;

  return {
    entityColumn,
    timeColumn,
    recommendedEntityColumn,
    recommendedTimeColumn,
    nEntities,
    nPeriods,
    totalRows: sheet.rowCount,
    validPanelRows,
    missingEntityOrTimeRows,
    expectedBalancedRows,
    missingPanelCells,
    isBalanced,
    duplicatePairsCount,
    duplicateExamples,
    periodGapEntitiesCount,
    inconsistentTimeRows,
    periodsSorted,
    entityDistribution,
    unbalancedEvaluationNote,
    potentialMissingnessBiasRisk
  };
}

function inferMetadataFromColumnName(colName: string, idx: number): {
  displayName: string;
  unit: string;
  constructDefinition: string;
  physicalDimension: MsmaPhysicalDimension;
  spatialScope: string;
  sourceOriginInfo: string;
} {
  const lower = colName.toLowerCase();
  if (/ppm|xco2|konsentrasi_sat/i.test(lower)) {
    return {
      displayName: colName.replace(/_/g, ' '),
      unit: 'ppm',
      constructDefinition: 'Fraksi mol / konsentrasi CO₂ atmosfer',
      physicalDimension: /lokal|sensor|surface/i.test(lower)
        ? 'SURFACE_CONCENTRATION'
        : 'ATMOSPHERIC_MOLE_FRACTION',
      spatialScope: /lokal|sensor/i.test(lower) ? 'Titik sensor lokal' : 'Kolom atmosfer grid satelit',
      sourceOriginInfo: 'Pengukuran konsentrasi atmosfer/ambien'
    };
  }
  if (/tonthn|ton_thn|_ton$/i.test(lower)) {
    return {
      displayName: colName.replace(/_/g, ' '),
      unit: 'ton CO₂/tahun',
      constructDefinition: 'Total emisi CO₂ tahunan wilayah',
      physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
      spatialScope: 'Wilayah kota/entitas',
      sourceOriginInfo: 'Inventaris / estimasi fluks emisi tahunan'
    };
  }
  if (/pemkot|mandiri|inventaris|report/i.test(lower)) {
    return {
      displayName: 'Pelaporan Mandiri Pemkot',
      unit: 'kt CO₂/tahun',
      constructDefinition: 'Total emisi CO₂ tahunan wilayah',
      physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
      spatialScope: 'Wilayah kota/entitas',
      sourceOriginInfo: 'Pelaporan inventaris mandiri pemerintah daerah'
    };
  }
  if (/satelit|oco|tropomi|gosat/i.test(lower)) {
    return {
      displayName: colName.replace(/_/g, ' '),
      unit: 'kt CO₂/tahun',
      constructDefinition: 'Total emisi CO₂ tahunan wilayah',
      physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
      spatialScope: 'Wilayah kota/entitas',
      sourceOriginInfo: 'Estimasi berbasis pengamatan satelit'
    };
  }
  if (/sensor|menara|darat|cems|lapangan/i.test(lower)) {
    return {
      displayName: colName.replace(/_/g, ' '),
      unit: 'kt CO₂/tahun',
      constructDefinition: 'Total emisi CO₂ tahunan wilayah',
      physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
      spatialScope: 'Wilayah kota/entitas',
      sourceOriginInfo: 'Pengukuran instrumen / sensor lapangan'
    };
  }
  return {
    displayName: colName.replace(/_/g, ' ') || `Sumber ${idx + 1}`,
    unit: 'satuan asli',
    constructDefinition: 'Pengukuran variabel target panel',
    physicalDimension: 'EMISSION_FLUX_MASS_PER_TIME',
    spatialScope: 'Wilayah kota/entitas',
    sourceOriginInfo: `Kolom dataset: ${colName}`
  };
}

export function autoSuggestMeasurementSources(
  profiles: MsmaColumnTypeProfile[],
  entityColumn: string,
  timeColumn: string
): MsmaSourceConfig[] {
  const excludedControlPattern =
    /^(id|kode|code|city_id|panel_id|tahun|year|periode|pdrb|gdp|populasi|population|luas|area|kontrol|control|lat|lon|provinsi)$/i;

  const candidates = profiles.filter(
    p =>
      p.columnName !== entityColumn &&
      p.columnName !== timeColumn &&
      p.detectedType === 'numeric' &&
      !excludedControlPattern.test(p.columnName) &&
      !/kontrol|control/i.test(p.columnName)
  );

  return candidates.slice(0, 8).map((c, idx) => {
    const meta = inferMetadataFromColumnName(c.columnName, idx);
    return {
      id: `src_${idx + 1}`,
      columnKey: c.columnName,
      displayName: meta.displayName,
      unit: meta.unit,
      constructDefinition: meta.constructDefinition,
      physicalDimension: meta.physicalDimension,
      spatialScope: meta.spatialScope,
      temporalPeriod: 'Tahunan (Annual)',
      dataType: 'continuous_numeric',
      sourceOriginInfo: meta.sourceOriginInfo,
      unitScaleMultiplier: 1,
      conversionModelEnabled: false,
      conversionSlope: 1,
      conversionIntercept: 0,
      conversionUncertaintySd: 0,
      conversionFormulaNote: '',
      conversionLiteratureRef: ''
    };
  });
}

export function createBlankSourceFromColumn(
  columnKey: string,
  index: number
): MsmaSourceConfig {
  const meta = inferMetadataFromColumnName(columnKey, index);
  return {
    id: `src_${Date.now()}_${index}`,
    columnKey,
    displayName: meta.displayName,
    unit: meta.unit,
    constructDefinition: meta.constructDefinition,
    physicalDimension: meta.physicalDimension,
    spatialScope: meta.spatialScope,
    temporalPeriod: 'Tahunan (Annual)',
    dataType: 'continuous_numeric',
    sourceOriginInfo: meta.sourceOriginInfo,
    unitScaleMultiplier: 1,
    conversionModelEnabled: false,
    conversionSlope: 1,
    conversionIntercept: 0,
    conversionUncertaintySd: 0,
    conversionFormulaNote: '',
    conversionLiteratureRef: ''
  };
}
