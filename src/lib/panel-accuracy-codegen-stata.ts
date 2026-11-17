// ============================================================
// Reference-Free All-Source Latent & Consensus Measurement Assessment
// Dynamic Stata .do Generator (Stata 17+ + SEM/Factor + Pair FE)
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
  const varMap = new Map<string, string>();
  sources.forEach((s, i) => {
    varMap.set(s.id, safeStataVar(s.name || s.label, i));
  });
  const allVars = sources.map(s => varMap.get(s.id)!).join(' ');

  const lines: string[] = [
    '* ============================================================================',
    '* STATA DO-FILE: REFERENCE-FREE ALL-SOURCE LATENT & CONSENSUS ACCURACY (PANEL)',
    `* Evaluated Sources (J = ${sources.length}): ${sources.map(c => `${c.name} (${c.label})`).join(', ')}`,
    '* Method: Stata SEM Congeneric Factor Model + Latent Consensus Pair FE (areg)',
    '* Note: Full Bayesian MCMC (R-hat, ESS, Posterior Prob Best) -> see accompanying R/Stan script',
    '* ============================================================================',
    'version 17.0',
    'clear all',
    'set more off',
    '',
    '* --- 1. Import Dataset & Map Panel Identifiers ---',
    'import delimited "dataset_co2_panel.csv", clear varnames(1)',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `destring ${yearColumn}, gen(year_id) force`,
    ''
  ];

  sources.forEach(s => {
    const v = varMap.get(s.id)!;
    lines.push(`* Evaluated Source ${s.name} (${s.label}) [${s.unit}]`);
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
  lines.push('* --- 3. Exploratory Data Analysis & 4 Panel Correlations ---');
  lines.push(`summarize ${allVars} if complete_case, detail`);
  lines.push(`pwcorr ${allVars} if complete_case, sig`);
  lines.push(`spearman ${allVars} if complete_case`);
  lines.push(`foreach v of varlist ${allVars} {`);
  lines.push('    bysort city_id: egen mean_`v\' = mean(`v\') if complete_case');
  lines.push('    gen within_`v\' = `v\' - mean_`v\' if complete_case');
  lines.push('    bysort city_id (year_id): gen fd_`v\' = `v\' - `v\'[_n-1] if complete_case');
  lines.push('}');
  lines.push(`pwcorr ${sources.map(s => `within_${varMap.get(s.id)!}`).join(' ')} if complete_case`);
  lines.push(`pwcorr ${sources.map(s => `fd_${varMap.get(s.id)!}`).join(' ')} if complete_case`);
  lines.push('');
  lines.push('* --- 4. Latent Factor Measurement Model Across ALL J Sources (Sem / Standardized) ---');
  lines.push('* Evaluates ALL sources equally without locking any source as reference (Var(L_true)=1)');
  if (sources.length >= 3) {
    lines.push(`sem (L_true -> ${allVars}) if complete_case, var(L_true@1) vce(cluster city_id) standardized`);
    lines.push('estat gof, stats(all)');
    lines.push('* Predict latent factor score theta_hat and calibrate to cross-source consensus median:');
    lines.push('predict double theta_z if complete_case, latent(L_true)');
    lines.push(`egen double med_cross = rowmedian(${allVars}) if complete_case`);
    lines.push('quietly regress med_cross theta_z if complete_case');
    lines.push('predict double theta_hat if complete_case, xb');
  } else {
    lines.push('* Underidentified for J < 3: fall back to cross-source mean as neutral midpoint');
    lines.push(`egen double theta_hat = rowmean(${allVars}) if complete_case`);
  }
  lines.push('');
  lines.push('* --- 5. Error Deviation, Lin CCC & Bland-Altman for ALL J Sources ---');

  sources.forEach((s, idx) => {
    const sv = varMap.get(s.id)!;
    const j = idx + 1;
    lines.push(`* Evaluation for Source #${j}: ${s.name} (${s.label})`);
    lines.push(`gen double err_${j} = ${sv} - theta_hat if complete_case`);
    lines.push(`gen double ae_${j}  = abs(err_${j}) if complete_case`);
    lines.push(`mean ae_${j} err_${j} if complete_case, vce(cluster city_id)`);
    lines.push(`capture noisily concord ${sv} theta_hat if complete_case`);
  });

  lines.push('');
  lines.push('* --- 6. Pair Fixed Effects Over ALL J Sources Simultaneously ---');
  lines.push('keep if complete_case');
  lines.push('egen long pair_id = group(city_id year_id)');
  lines.push(`reshape long ae_ err_, i(pair_id) j(source_id)`);
  lines.push('rename ae_ ae');
  lines.push('rename err_ signed_err');
  lines.push('areg ae i.source_id, absorb(pair_id) vce(cluster city_id)');
  lines.push('pwcompare source_id, effects cimeans');
  if (sources.length >= 2) {
    lines.push('capture noisily boottest 2.source_id, cluster(city_id) boottype(wild) weighttype(rademacher) reps(999)');
  }

  return lines.join('\n');
}
