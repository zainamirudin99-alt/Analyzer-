// ============================================================
// Reference-Free All-Source Latent & Consensus Measurement Assessment
// Dynamic R Script Generator (Stan/rstan + lavaan + fixest + DescTools)
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

  const renamePairs = sources
    .map(s => `    \`${s.name}\` = \`${s.columnKey}\``)
    .join(',\n');
  const sourceNamesVec = sources.map(s => `"${s.name}"`).join(', ');
  const factorFormula = sources.map(s => s.name).join(' + ');

  const lines: string[] = [
    '# ============================================================================',
    '# R SCRIPT: REFERENCE-FREE ALL-SOURCE LATENT & CONSENSUS ACCURACY (PANEL)',
    `# Evaluated Sources (J = ${sources.length}): ${sources.map(s => `${s.name} (${s.label})`).join(', ')}`,
    '# Required packages : readr, dplyr, tidyr, lavaan, DescTools, fixest',
    '# ============================================================================',
    '',
    'library(readr)',
    'library(dplyr)',
    'library(tidyr)',
    'library(lavaan)           # Congeneric latent measurement model across all J sources',
    'library(DescTools)        # For Lin\'s CCC()',
    'library(fixest)           # For Pair Fixed Effects feols()',
    '',
    '# --- 1. Load Dataset & Map All Sources Equally ---',
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
  lines.push(`source_cols <- c(${sourceNamesVec})`);
  lines.push('df_cc <- df %>% filter(if_all(all_of(source_cols), ~ !is.na(.)))');
  lines.push('cat("Complete-case City-Year pairs:", nrow(df_cc), "\\n")');
  lines.push('');
  lines.push('# --- 2. Congeneric Latent Factor Model Across All Sources (J >= 3 Identified) ---');
  lines.push(`model_spec <- "L_true =~ NA*${factorFormula}; L_true ~~ 1*L_true"`);
  lines.push('cfa_fit <- lavaan::cfa(model_spec, data = df_cc, std.lv = TRUE)');
  lines.push('summary(cfa_fit, fit.measures = TRUE, standardized = TRUE, rsquare = TRUE)');
  lines.push('');
  lines.push('# Calibrate latent score theta_hat to cross-source consensus median');
  lines.push('theta_z <- as.numeric(lavPredict(cfa_fit))');
  lines.push('med_cross <- apply(df_cc[, source_cols], 1, median)');
  lines.push('theta_hat <- predict(lm(med_cross ~ theta_z))');
  lines.push('df_cc$theta_hat <- theta_hat');
  lines.push('');
  lines.push('# --- 3. Error & Concordance Summary for ALL Evaluated Sources ---');
  lines.push('metrics_list <- lapply(source_cols, function(sc) {');
  lines.push('  xs <- df_cc[[sc]]');
  lines.push('  err <- xs - theta_hat');
  lines.push('  ccc_res <- DescTools::CCC(xs, theta_hat, ci = "z-transform", conf.level = 0.95)');
  lines.push('  tibble(');
  lines.push('    Source = sc,');
  lines.push('    N_Complete = length(err),');
  lines.push('    MAE_vs_Latent = mean(abs(err)),');
  lines.push('    RMSE_vs_Latent = sqrt(mean(err^2)),');
  lines.push('    MBE_vs_Latent = mean(err),');
  lines.push('    Pearson_r = cor(xs, theta_hat),');
  lines.push('    Lins_CCC = ccc_res$rho.c$est');
  lines.push('  )');
  lines.push('})');
  lines.push('print(bind_rows(metrics_list) %>% arrange(RMSE_vs_Latent))');
  lines.push('');
  lines.push('# --- 4. Pair Fixed Effects Over All Sources Simultaneously ---');
  lines.push('df_long <- df_cc %>%');
  lines.push('  mutate(pair_id = paste0(city, "_", year)) %>%');
  lines.push('  pivot_longer(cols = all_of(source_cols), names_to = "source", values_to = "x_val") %>%');
  lines.push('  mutate(abs_error = abs(x_val - theta_hat), source = factor(source, levels = source_cols))');
  lines.push('fe_fit <- feols(abs_error ~ i(source) | pair_id, data = df_long, cluster = ~city)');
  lines.push('summary(fe_fit)');
  lines.push('wald(fe_fit, "source")');

  return lines.join('\n');
}
