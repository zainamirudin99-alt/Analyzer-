# ==============================================================================
# R Script for Generating Reference Regression and Classical Assumption Fixtures
# Repo: CED & Statistical Regression Analyzer
# Date: 2026-10-04
# ==============================================================================

# Required libraries (run: install.packages(c("jsonlite", "lmtest", "car", "tseries", "nortest")))
suppressPackageStartupMessages({
  if (!require("jsonlite")) install.packages("jsonlite", repos="https://cloud.r-project.org")
  if (!require("lmtest")) install.packages("lmtest", repos="https://cloud.r-project.org")
  if (!require("car")) install.packages("car", repos="https://cloud.r-project.org")
  if (!require("tseries")) install.packages("tseries", repos="https://cloud.r-project.org")
  if (!require("nortest")) install.packages("nortest", repos="https://cloud.r-project.org")
})

generate_fixtures <- function() {
  cat("Memulai komputasi fixture benchmark regresi dengan R...\n")
  
  # Dataset 1: SLR n=20
  slr_data <- data.frame(
    Y = c(5.4, 7.8, 9.9, 12.1, 13.8, 16.2, 18.0, 20.4, 22.3, 24.6, 26.5, 28.8, 30.7, 33.1, 35.0, 37.2, 39.4, 41.5, 43.6, 45.7),
    X1 = 1:20
  )
  fit_slr <- lm(Y ~ X1, data=slr_data)
  s_slr <- summary(fit_slr)
  
  slr_output <- list(
    id = "slr_n20",
    engine = "R 4.x base::lm",
    coefficients = as.list(coef(fit_slr)),
    std_errors = as.list(coef(s_slr)[, "Std. Error"]),
    t_values = as.list(coef(s_slr)[, "t value"]),
    p_values = as.list(coef(s_slr)[, "Pr(>|t|)"]),
    r_squared = s_slr$r.squared,
    adj_r_squared = s_slr$adj.r.squared,
    f_statistic = s_slr$fstatistic[1],
    f_p_value = pf(s_slr$fstatistic[1], s_slr$fstatistic[2], s_slr$fstatistic[3], lower.tail = FALSE),
    residual_std_error = s_slr$sigma,
    dw_statistic = as.numeric(lmtest::dwtest(fit_slr)$statistic),
    bp_p_value = as.numeric(lmtest::bptest(fit_slr)$p.value),
    shapiro_p_value = as.numeric(shapiro.test(residuals(fit_slr))$p.value)
  )
  
  cat("Menyimpan fixture slr_n20_r_reference.json...\n")
  write_json(slr_output, "tests/fixtures/slr_n20_r_reference.json", auto_unbox = TRUE, pretty = TRUE)
  
  cat("Generasi fixture R selesai dengan sukses.\n")
}

if (!interactive()) {
  generate_fixtures()
}
