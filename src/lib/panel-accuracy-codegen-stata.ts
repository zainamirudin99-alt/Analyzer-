// ============================================================
// Comparative Measurement Accuracy Assessment — Stata .do Generator
// Dynamically adapts to N sources, Reference Source & Preprocessing
// ============================================================

import {
  AccuracyPreprocessingOptions,
  MeasurementSource
} from './panel-accuracy-types';

function safeStataVar(name: string, idx: number): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, 'v_$1')
    .slice(0, 24);
  return cleaned || `src_${idx + 1}`;
}

export function generateAccuracyStataDoFile(params: {
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
  preprocessing: AccuracyPreprocessingOptions;
}): string {
  const { cityIdColumn, yearColumn, sources, preprocessing } = params;
  const refSource = sources.find(s => s.role === 'reference') || sources[0];
  const compSources = sources.filter(s => s.role === 'comparison');

  const varMap = new Map<string, string>();
  sources.forEach((s, i) => {
    varMap.set(s.id, safeStataVar(s.name || s.label, i));
  });
  const refVar = varMap.get(refSource.id)!;
  const allVars = sources.map(s => varMap.get(s.id)!).join(' ');

  const lines: string[] = [
    '* ============================================================================',
    '* STATA DO-FILE: COMPARATIVE MEASUREMENT ACCURACY ASSESSMENT (PANEL DATA)',
    `* Reference Source : ${refSource.name} (${refSource.label}) [Col: ${refSource.columnKey}]`,
    `* Comparison Count : ${compSources.length} source(s) (${compSources.map(c => c.name).join(', ')})`,
    '* ============================================================================',
    'version 17.0',
    'clear all',
    'set more off',
    '',
    '* --- 1. Import Dataset & Map Panel Identifiers ---',
    'import delimited "dataset_co2_panel.csv", clear varnames(1)',
    `encode ${cityIdColumn}, gen(city_id)`,
    `destring ${yearColumn}, replace force`,
    `rename ${yearColumn} year_id`,
    ''
  ];

  sources.forEach(s => {
    const v = varMap.get(s.id)!;
    lines.push(`* Source ${s.name} (${s.label}) [${s.role.toUpperCase()}]`);
    lines.push(`destring ${s.columnKey}, gen(${v}) force`);
    if (
      preprocessing.applyUnitMultiplier &&
      Number.isFinite(preprocessing.unitMultipliers[s.id]) &&
      preprocessing.unitMultipliers[s.id] !== 1
    ) {
      lines.push(`replace ${v} = ${v} * ${preprocessing.unitMultipliers[s.id]}`);
    }
  });

  lines.push('');
  lines.push('* --- 2. Explicit Preprocessing & Panel Declaration ---');
  if (preprocessing.dropDuplicateCityYear) {
    lines.push('bysort city_id year_id: keep if _n == 1');
  }
  if (preprocessing.applyLog1p) {
    lines.push(`foreach v of varlist ${allVars} {`);
    lines.push('    replace `v\' = ln(1 + `v\') if `v\' >= 0 & !missing(`v\')');
    lines.push('}');
  }
  if (preprocessing.applyWinsorize) {
    const pLo = ((preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);
    const pHi = (100 - (preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);
    lines.push(`foreach v of varlist ${allVars} {`);
    lines.push(`    _pctile \`v', p(${pLo} ${pHi})`);
    lines.push('    replace `v\' = r(r1) if `v\' < r(r1) & !missing(`v\')');
    lines.push('    replace `v\' = r(r2) if `v\' > r(r2) & !missing(`v\')');
    lines.push('}');
  }

  lines.push('xtset city_id year_id');
  lines.push(`egen byte complete_case = rownonmiss(${allVars})`);
  lines.push(`replace complete_case = (complete_case == ${sources.length})`);
  lines.push('');
  lines.push('* --- 3. Exploratory Data Analysis & Panel Correlations ---');
  lines.push(`summarize ${allVars} if complete_case`);
  lines.push(`pwcorr ${allVars} if complete_case, sig`);
  lines.push(`spearman ${allVars} if complete_case`);
  lines.push('');
  lines.push('* Within-City Demeaned & First-Difference Correlations');
  lines.push(`foreach v of varlist ${allVars} {`);
  lines.push('    bysort city_id: egen mean_`v\' = mean(`v\') if complete_case');
  lines.push('    gen within_`v\' = `v\' - mean_`v\' if complete_case');
  lines.push('    bysort city_id (year_id): gen fd_`v\' = `v\' - `v\'[_n-1] if complete_case');
  lines.push('}');
  lines.push(`pwcorr ${sources.map(s => `within_${varMap.get(s.id)!}`).join(' ')} if complete_case`);
  lines.push(`pwcorr ${sources.map(s => `fd_${varMap.get(s.id)!}`).join(' ')} if complete_case`);
  lines.push('');
  lines.push('* --- 4. Pairwise Error, MAE, RMSE, MBE, Lin CCC & Bland-Altman ---');

  compSources.forEach((cs, idx) => {
    const cv = varMap.get(cs.id)!;
    const j = idx + 1;
    lines.push(`* Evaluation for Comparison Source #${j}: ${cs.name} (${cs.label}) vs Reference ${refSource.name}`);
    lines.push(`gen err_${j} = ${cv} - ${refVar} if complete_case`);
    lines.push(`gen ae_${j}  = abs(err_${j}) if complete_case`);
    lines.push(`gen se_${j}  = err_${j}^2 if complete_case`);
    lines.push(`mean ae_${j} err_${j} if complete_case, vce(cluster city_id)`);
    lines.push(`quietly summarize se_${j} if complete_case`);
    lines.push(`display "RMSE (${cs.name}) = " sqrt(r(mean))`);
    lines.push(`* Lin's CCC & Bland-Altman LoA (requires: ssc install concord)`);
    lines.push(`capture noisily concord ${cv} ${refVar} if complete_case`);
    lines.push('');
  });

  if (compSources.length >= 2) {
    lines.push('* --- 5. Pair Fixed Effects Inferential Model (Long Panel Format) ---');
    lines.push('preserve');
    lines.push('keep if complete_case');
    lines.push('egen long pair_id = group(city_id year_id)');
    lines.push(`keep pair_id city_id year_id ${compSources.map((_, i) => `ae_${i + 1} err_${i + 1}`).join(' ')}`);
    lines.push('reshape long ae_ err_, i(pair_id) j(source_idx)');
    lines.push('rename ae_ ae');
    lines.push('rename err_ signed_err');
    lines.push('');
    lines.push('* Pair Fixed Effects Regression with City Cluster-Robust SE');
    lines.push('areg ae i.source_idx, absorb(pair_id) vce(cluster city_id)');
    lines.push('testparm i.source_idx');
    lines.push('');
    lines.push('* Pairwise Contrasts Across All Comparison Sources');
    lines.push('pwcompare i.source_idx, effects cimeans');
    lines.push('');
    lines.push('* Optional Wild Cluster Bootstrap for Small Cluster Count G < 30 (ssc install boottest)');
    for (let m = 2; m <= compSources.length; m++) {
      lines.push(`capture noisily boottest ${m}.source_idx, cluster(city_id) weight(rademacher) reps(999) seed(20261116)`);
    }
    lines.push('restore');
  }

  return lines.join('\n');
}
