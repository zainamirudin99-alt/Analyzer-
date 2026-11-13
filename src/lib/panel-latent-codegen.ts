// ============================================================
// Panel Latent Variable Measurement Model — Reproducible Code Generator
// Produces exact Stan (.stan) & R (cmdstanr / brms / preprocessing) code
// matching the user's model specification, priors, and preprocessing.
// References: Stan Measurement Error Guide, stan-dev/example-models, mlts.
// ============================================================

import {
  GeneratedReproducibleCode,
  PanelLatentMapping,
  PanelLatentModelSpec,
  PanelLatentPreprocessingOptions
} from './panel-latent-types';

export function generateReproducibleCode(
  spec: PanelLatentModelSpec,
  mapping: PanelLatentMapping,
  preprocessing: PanelLatentPreprocessingOptions
): GeneratedReproducibleCode {
  const anchorNum = spec.anchorSource === 'X1' ? 1 : spec.anchorSource === 'X2' ? 2 : 3;
  const isAnchor = spec.identification === 'anchor';
  const isStudentT = spec.likelihood === 'student_t';

  const priorScale =
    spec.priorRegime === 'skeptical_tight'
      ? { alpha: 0.45, lambda: 0.3, cauchy: 0.5, rho: 0.4 }
      : spec.priorRegime === 'diffuse_wide'
      ? { alpha: 8.0, lambda: 2.5, cauchy: 4.0, rho: 0.95 }
      : { alpha: 2.0, lambda: 0.85, cauchy: 1.0, rho: 0.7 };

  const preprocessingCodeR = [
    '# === 1. Data Loading & Preprocessing (Sesuai Step 1-3 Aplikasi) ===',
    'library(readr)',
    'library(dplyr)',
    '',
    'raw_df <- read_csv("dataset_co2_panel.csv", show_col_types = FALSE)',
    'df <- raw_df %>%',
    `  rename(city = \`${mapping.cityCol}\`, year = \`${mapping.yearCol}\`,`,
    `         X1 = \`${mapping.x1Col}\`, X2 = \`${mapping.x2Col}\`, X3 = \`${mapping.x3Col}\`) %>%`,
    '  mutate(city = as.factor(city), year = as.numeric(year)) %>%',
    '  arrange(city, year)',
    ...(preprocessing.dropDuplicateCityYear
      ? ['df <- df %>% distinct(city, year, .keep_all = TRUE)']
      : []),
    ...(preprocessing.applyLog1p
      ? [
          'df <- df %>% mutate(across(c(X1, X2, X3), ~ ifelse(!is.na(.) & . >= 0, log1p(.), .)))'
        ]
      : []),
    ...(preprocessing.applyWinsorize
      ? [
          `winsor <- function(x, q = ${preprocessing.winsorQuantile || 0.025}) {`,
          '  qs <- quantile(x, probs = c(q, 1 - q), na.rm = TRUE)',
          '  pmin(pmax(x, qs[1]), qs[2])',
          '}',
          'df <- df %>% mutate(across(c(X1, X2, X3), winsor))'
        ]
      : []),
    ...(preprocessing.applyStandardize
      ? ['df <- df %>% mutate(across(c(X1, X2, X3), ~ as.numeric(scale(.))))']
      : []),
    'df$city_id <- as.integer(factor(df$city))',
    'df$year_id <- as.integer(factor(df$year))'
  ].join('\n');

  const stanCode = [
    '// === Stan Model: Bayesian Hierarchical Latent Variable Measurement Model ===',
    '// Referensi: Stan Users Guide (Measurement Error Models) & stan-dev/example-models',
    'data {',
    '  int<lower=1> N;                 // Jumlah observasi panel (city-year)',
    '  int<lower=2> C;                 // Jumlah kota',
    '  int<lower=2> T;                 // Jumlah periode tahun',
    '  array[N] int<lower=1, upper=C> city_id;',
    '  array[N] int<lower=1, upper=T> year_id;',
    '  matrix[N, 3] X_obs;             // Nilai teramati [X1, X2, X3]',
    '  array[N, 3] int<lower=0, upper=1> is_obs; // Indikator missing (1=teramati, 0=NA)',
    '  matrix<lower=0>[N, 3] SE_known; // Measurement SE opsional (0 jika tidak tersedia)',
    `  int<lower=1, upper=3> anchor_idx; // Indeks sumber jangkar (${anchorNum})`,
    ...(isStudentT ? ['  real<lower=2> nu;              // Derajat bebas Student-t'] : []),
    '}',
    'parameters {',
    ...(isAnchor
      ? [
          '  real mu;                      // Grand mean laten',
          '  vector[2] alpha_free;         // Bias relatif sumber non-jangkar',
          '  vector<lower=0.05>[2] lambda_free; // Loading sumber non-jangkar'
        ]
      : [
          '  vector[3] alpha;              // Bias / shift sumber',
          '  vector<lower=0.05>[3] lambda; // Loading positif terstandarisasi'
        ]),
    '  vector<lower=1e-4>[3] sigma_eps; // Error SD tiap sumber',
    '  vector[N] y_star_raw;         // Variabel laten CO2',
    ...(spec.includeCityIntercept ? ['  vector[C] u_raw;', '  real<lower=1e-4> sigma_u;'] : []),
    ...(spec.includeTimeEffect ? ['  vector[T] gamma_raw;', '  real<lower=1e-4> sigma_gamma;'] : []),
    ...(spec.includeAR1 ? ['  real<lower=-0.97, upper=0.97> rho; // Koefisien AR(1)'] : []),
    '  real<lower=1e-4> sigma_eta;',
    '}',
    'transformed parameters {',
    '  vector[N] y_star;',
    ...(isAnchor
      ? [
          '  vector[3] alpha;',
          '  vector[3] lambda;',
          '  {',
          '    int idx = 1;',
          '    for (j in 1:3) {',
          '      if (j == anchor_idx) {',
          '        alpha[j] = 0.0;',
          '        lambda[j] = 1.0;',
          '      } else {',
          `        alpha[j] = ${spec.sourceSpecificBias ? 'alpha_free[idx]' : '0.0'};`,
          `        lambda[j] = ${spec.sourceSpecificLoading ? 'lambda_free[idx]' : '1.0'};`,
          '        idx += 1;',
          '      }',
          '    }',
          '  }',
          '  y_star = y_star_raw;'
        ]
      : ['  // Standardized factor identification (mean 0, SD 1)', '  y_star = (y_star_raw - mean(y_star_raw)) / sd(y_star_raw);']),
    ...(spec.includeCityIntercept ? ['  vector[C] u = u_raw - mean(u_raw);'] : []),
    ...(spec.includeTimeEffect ? ['  vector[T] gamma = gamma_raw - mean(gamma_raw);'] : []),
    '}',
    'model {',
    '  // Priors (skala disesuaikan di R atau unit data)',
    ...(isAnchor
      ? [
          '  mu ~ normal(mean(X_obs[, anchor_idx]), 4.0 * sd(X_obs[, anchor_idx]));',
          `  alpha_free ~ normal(0, ${priorScale.alpha} * sd(X_obs[, anchor_idx]));`,
          `  lambda_free ~ normal(1, ${priorScale.lambda});`
        ]
      : [
          `  alpha ~ normal(0, ${priorScale.alpha} * sd(X_obs[, 1]) + 2.0);`,
          `  lambda ~ normal(1, ${priorScale.lambda});`
        ]),
    `  sigma_eps ~ cauchy(0, ${priorScale.cauchy} * sd(X_obs[, ${anchorNum}]));`,
    `  sigma_eta ~ cauchy(0, ${priorScale.cauchy} * sd(X_obs[, ${anchorNum}]));`,
    ...(spec.includeCityIntercept
      ? ['  u_raw ~ normal(0, sigma_u);', `  sigma_u ~ cauchy(0, ${priorScale.cauchy} * sd(X_obs[, ${anchorNum}]));`]
      : []),
    ...(spec.includeTimeEffect
      ? ['  gamma_raw ~ normal(0, sigma_gamma);', `  sigma_gamma ~ cauchy(0, ${priorScale.cauchy} * sd(X_obs[, ${anchorNum}]));`]
      : []),
    ...(spec.includeAR1 ? [`  rho ~ normal(0, ${priorScale.rho});`] : []),
    '',
    '  // Hierarchical latent panel structure',
    '  for (k in 1:N) {',
    `    real base_k = ${isAnchor ? 'mu' : '0.0'}${spec.includeCityIntercept ? ' + u[city_id[k]]' : ''}${spec.includeTimeEffect ? ' + gamma[year_id[k]]' : ''};`,
    ...(spec.includeAR1
      ? [
          '    if (k == 1 || city_id[k] != city_id[k - 1]) {',
          '      y_star_raw[k] ~ normal(base_k, sigma_eta / sqrt(1 - square(rho)));',
          '    } else {',
          '      real base_prev = ' +
            `${isAnchor ? 'mu' : '0.0'}${spec.includeCityIntercept ? ' + u[city_id[k - 1]]' : ''}${spec.includeTimeEffect ? ' + gamma[year_id[k - 1]]' : ''};`,
          '      y_star_raw[k] ~ normal(base_k + rho * (y_star_raw[k - 1] - base_prev), sigma_eta);',
          '    }'
        ]
      : ['    y_star_raw[k] ~ normal(base_k, sigma_eta);']),
    '  }',
    '',
    '  // Measurement Likelihood (Conditional Independence given y_star)',
    '  for (k in 1:N) {',
    '    for (j in 1:3) {',
    '      if (is_obs[k, j] == 1) {',
    '        real sd_tot = hypot(sigma_eps[j], SE_known[k, j]);',
    isStudentT
      ? '        X_obs[k, j] ~ student_t(nu, alpha[j] + lambda[j] * y_star[k], sd_tot);'
      : '        X_obs[k, j] ~ normal(alpha[j] + lambda[j] * y_star[k], sd_tot);',
    '      }',
    '    }',
    '  }',
    '}',
    'generated quantities {',
    '  matrix[N, 3] X_rep;',
    '  for (k in 1:N) {',
    '    for (j in 1:3) {',
    '      real sd_tot = hypot(sigma_eps[j], SE_known[k, j]);',
    isStudentT
      ? '      X_rep[k, j] = student_t_rng(nu, alpha[j] + lambda[j] * y_star[k], sd_tot);'
      : '      X_rep[k, j] = normal_rng(alpha[j] + lambda[j] * y_star[k], sd_tot);',
    '    }',
    '  }',
    '}'
  ].join('\n');

  const rScript = [
    preprocessingCodeR,
    '',
    '# === 2. Estimasi Bayesian MCMC dengan cmdstanr & Diagnostik ===',
    'library(cmdstanr)',
    'library(posterior)',
    'library(bayesplot)',
    '',
    'X_mat <- as.matrix(df[, c("X1", "X2", "X3")])',
    'is_obs_mat <- ifelse(is.na(X_mat), 0L, 1L)',
    'X_mat[is.na(X_mat)] <- 0',
    'SE_mat <- matrix(0, nrow = nrow(df), ncol = 3)',
    '',
    'stan_data <- list(',
    '  N = nrow(df),',
    '  C = length(unique(df$city_id)),',
    '  T = length(unique(df$year_id)),',
    '  city_id = df$city_id,',
    '  year_id = df$year_id,',
    '  X_obs = X_mat,',
    '  is_obs = is_obs_mat,',
    '  SE_known = SE_mat,',
    `  anchor_idx = ${anchorNum}L${isStudentT ? `,\n  nu = ${spec.studentTDf || 5}` : ''}`,
    ')',
    '',
    'mod <- cmdstan_model("panel_latent_co2.stan")',
    'fit <- mod$sample(',
    '  data = stan_data,',
    `  seed = ${spec.seed || 20261113},`,
    `  chains = ${spec.chains || 4},`,
    '  parallel_chains = min(4, parallel::detectCores()),',
    `  iter_warmup = ${spec.warmup || 500},`,
    `  iter_sampling = ${spec.draws || 500}`,
    ')',
    '',
    '# === 3. Tabel Estimasi, R-hat, ESS & Reliabilitas ===',
    'param_summary <- fit$summary(variables = c("alpha", "lambda", "sigma_eps", "sigma_eta"))',
    'print(param_summary)',
    '',
    'latent_summary <- fit$summary(variables = "y_star")',
    'df_latent <- bind_cols(df[, c("city", "year", "X1", "X2", "X3")], latent_summary[, c("mean", "sd", "q5", "q95", "rhat", "ess_bulk")])',
    'write_csv(df_latent, "latent_co2_estimates.csv")',
    '',
    '# Trace & Posterior Predictive Plots',
    'mcmc_trace(fit$draws(c("lambda", "sigma_eps")))'
  ].join('\n');

  const brmsSnippet = [
    '# === Alternatif Referensi brms (Format Long 3-Sumber) ===',
    '# Referensi: https://github.com/paul-buerkner/brms',
    'library(brms)',
    'library(tidyr)',
    '',
    'df_long <- df %>%',
    '  mutate(obs_id = row_number()) %>%',
    '  pivot_longer(cols = c(X1, X2, X3), names_to = "source", values_to = "emission")',
    '',
    '# brms mendukung measurement-error & nonlinear latent factor:',
    'bform <- bf(',
    '  emission ~ alpha + lambda * ystar,',
    '  alpha ~ 0 + source,',
    '  lambda ~ 0 + source,',
    '  ystar ~ 1 + (1 | city) + (1 | year) + (1 | obs_id),',
    '  nl = TRUE',
    `) + ${isStudentT ? 'student()' : 'gaussian()'}`,
    '',
    '# fit_brms <- brm(bform, data = df_long, chains = 4, iter = 2000)'
  ].join('\n');

  return {
    stanCode,
    rScript,
    brmsSnippet,
    preprocessingCodeR
  };
}

