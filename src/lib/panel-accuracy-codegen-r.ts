// ============================================================
// Comparative Measurement Accuracy Assessment — R Script Generator
// Dynamically adapts to N sources, Reference Source & Preprocessing
// ============================================================

import {
  AccuracyPreprocessingOptions,
  MeasurementSource
} from './panel-accuracy-types';

export function generateAccuracyRScript(params: {
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
  preprocessing: AccuracyPreprocessingOptions;
}): string {
  const { cityIdColumn, yearColumn, sources, preprocessing } = params;
  const refSource = sources.find(s => s.role === 'reference') || sources[0];
  const compSources = sources.filter(s => s.role === 'comparison');

  const renamePairs = sources
    .map(s => `    \`${s.name}\` = \`${s.columnKey}\``)
    .join(',\n');
  const sourceNamesVec = sources.map(s => `"${s.name}"`).join(', ');
  const compNamesVec = compSources.map(s => `"${s.name}"`).join(', ');

  const lines: string[] = [
    '# ============================================================================',
    '# R SCRIPT: COMPARATIVE MEASUREMENT ACCURACY ASSESSMENT (PANEL DATA APPROACH)',
    `# Reference Source : ${refSource.name} (${refSource.label})`,
    `# Comparison Sources: ${compSources.map(c => `${c.name} (${c.label})`).join(', ')}`,
    '# Required packages : readr, dplyr, tidyr, DescTools, fixest, fwildclusterboot',
    '# ============================================================================',
    '',
    'library(readr)',
    'library(dplyr)',
    'library(tidyr)',
    'library(DescTools)        # For Lin\'s CCC()',
    'library(fixest)           # For Pair Fixed Effects feols()',
    '',
    '# --- 1. Load Dataset & Map Dynamic Sources ---',
    'raw_df <- read_csv("dataset_co2_panel.csv", show_col_types = FALSE)',
    'df <- raw_df %>%',
    '  rename(',
    `    city = \`${cityIdColumn}\`,`,
    `    year = \`${yearColumn}\`,`,
    renamePairs,
    '  ) %>%',
    '  mutate(city = as.character(city), year = as.numeric(year)) %>%',
    '  arrange(city, year)',
    ''
  ];

  if (preprocessing.applyUnitMultiplier) {
    sources.forEach(s => {
      const m = preprocessing.unitMultipliers[s.id];
      if (Number.isFinite(m) && m !== 1) {
        lines.push(`df$\`${s.name}\` <- df$\`${s.name}\` * ${m}`);
      }
    });
  }
  if (preprocessing.dropDuplicateCityYear) {
    lines.push('df <- df %>% distinct(city, year, .keep_all = TRUE)');
  }
  if (preprocessing.applyLog1p) {
    lines.push(`df <- df %>% mutate(across(all_of(c(${sourceNamesVec})), ~ ifelse(!is.na(.) & . >= 0, log1p(.), .)))`);
  }
  if (preprocessing.applyWinsorize) {
    const q = preprocessing.winsorQuantile || 0.025;
    lines.push(`winsor_vec <- function(x, q = ${q}) {`);
    lines.push('  qs <- quantile(x, probs = c(q, 1 - q), na.rm = TRUE)');
    lines.push('  pmin(pmax(x, qs[1]), qs[2])');
    lines.push('}');
    lines.push(`df <- df %>% mutate(across(all_of(c(${sourceNamesVec})), winsor_vec))`);
  }

  lines.push('');
  lines.push('# --- 2. Complete-Case Paired Sample vs Source-Specific Available-Case ---');
  lines.push(`source_cols <- c(${sourceNamesVec})`);
  lines.push(`comp_cols   <- c(${compNamesVec})`);
  lines.push(`ref_col     <- "${refSource.name}"`);
  lines.push('df_cc <- df %>% filter(if_all(all_of(source_cols), ~ !is.na(.)))');
  lines.push('cat("Complete-case City-Year pairs:", nrow(df_cc), "\\n")');
  lines.push('');
  lines.push('# --- 3. Accuracy Metrics (MAE, RMSE, MBE, Lin CCC & Bland-Altman) ---');
  lines.push('metrics_list <- lapply(comp_cols, function(sc) {');
  lines.push('  xc <- df_cc[[sc]]');
  lines.push('  xr <- df_cc[[ref_col]]');
  lines.push('  err <- xc - xr');
  lines.push('  ae  <- abs(err)');
  lines.push('  ccc_res <- DescTools::CCC(xc, xr, ci = "z-transform", conf.level = 0.95)');
  lines.push('  sd_diff <- sd(err)');
  lines.push('  mean_bias <- mean(err)');
  lines.push('  tibble(');
  lines.push('    Source = sc,');
  lines.push('    N_Complete = length(err),');
  lines.push('    MAE = mean(ae),');
  lines.push('    RMSE = sqrt(mean(err^2)),');
  lines.push('    MBE = mean_bias,');
  lines.push('    Pearson_r = cor(xc, xr, method = "pearson"),');
  lines.push('    Spearman_rho = cor(xc, xr, method = "spearman"),');
  lines.push('    Lins_CCC = ccc_res$rho.c$est,');
  lines.push('    CCC_Lower = ccc_res$rho.c$lwr.ci,');
  lines.push('    CCC_Upper = ccc_res$rho.c$upr.ci,');
  lines.push('    BA_LoA_Lower = mean_bias - 1.96 * sd_diff,');
  lines.push('    BA_LoA_Upper = mean_bias + 1.96 * sd_diff');
  lines.push('  )');
  lines.push('})');
  lines.push('metrics_table <- bind_rows(metrics_list) %>% arrange(MAE)');
  lines.push('print(metrics_table)');

  if (compSources.length >= 2) {
    lines.push('');
    lines.push('# --- 4. Pair Fixed Effects Inferential Model (Long Panel Format) ---');
    lines.push('df_long <- df_cc %>%');
    lines.push('  mutate(pair_id = paste0(city, "_", year)) %>%');
    lines.push('  pivot_longer(cols = all_of(comp_cols), names_to = "source", values_to = "x_comp") %>%');
    lines.push('  mutate(');
    lines.push('    x_ref = .data[[ref_col]],');
    lines.push('    signed_error = x_comp - x_ref,');
    lines.push('    abs_error = abs(signed_error),');
    lines.push(`    source = factor(source, levels = c(${compNamesVec}))`);
    lines.push('  )');
    lines.push('');
    lines.push('# Estimate Pair Fixed Effects with City Cluster-Robust Standard Errors');
    lines.push('fe_fit <- feols(abs_error ~ i(source) | pair_id, data = df_long, cluster = ~city)');
    lines.push('summary(fe_fit)');
    lines.push('wald(fe_fit, "source")');
  }

  return lines.join('\n');
}
