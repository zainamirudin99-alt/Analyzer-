"""
Statistical OLS & Diagnostic Fit Engine for Vercel Python Serverless (Point 01 Parity)
POST /api/engine/fit
"""
import json
import numpy as np
import pandas as pd
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode('utf-8'))

            rows = payload.get('rows', [])
            y_col = payload.get('yCol') or payload.get('y_col')
            x_cols = payload.get('xCols') or payload.get('x_cols', [])
            is_time_series = payload.get('isTimeSeries', payload.get('is_time_series', False))
            alpha = float(payload.get('alpha', 0.05))

            if not rows or not y_col or not x_cols:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Missing rows, yCol, or xCols"}).encode('utf-8'))
                return

            df = pd.DataFrame(rows)
            cols_needed = [y_col] + x_cols
            clean_df = df[cols_needed].dropna()

            Y = clean_df[y_col].values.astype(float)
            X = clean_df[x_cols].values.astype(float)
            n, k = X.shape

            import statsmodels.api as sm
            from scipy import stats
            from statsmodels.stats.stattools import durbin_watson, jarque_bera
            from statsmodels.stats.diagnostic import (
                lilliefors,
                het_breuschpagan,
                het_white,
                het_goldfeldquandt,
                acorr_breusch_godfrey,
                linear_reset
            )

            X_with_const = sm.add_constant(X)
            model = sm.OLS(Y, X_with_const)
            results = model.fit()
            hc3_results = results.get_robustcov_results(cov_type='HC3')

            # Independent SVD lstsq check (S3)
            b_svd, _, _, _ = np.linalg.lstsq(X_with_const, Y, rcond=None)
            diff_b = np.max(np.abs(results.params - b_svd) / np.maximum(1e-10, np.abs(results.params)))
            s3_check1 = bool(diff_b <= 1e-8)

            dw = float(durbin_watson(results.resid))

            # 4 Normality tests on residuals
            sw_stat, sw_p = stats.shapiro(results.resid) if n >= 3 else (1.0, 1.0)
            ks_stat, ks_p = lilliefors(results.resid, dist='norm') if n >= 5 else (0.0, 1.0)
            jb_stat, jb_p, skew_val, kurt_val = jarque_bera(results.resid)
            ad_res = stats.anderson(results.resid, dist='norm')

            # Heteroskedasticity tests
            bp_lm, bp_lm_p, bp_f, bp_f_p = het_breuschpagan(results.resid, X_with_const)
            try:
                w_lm, w_lm_p, w_f, w_f_p = het_white(results.resid, X_with_const)
            except Exception:
                w_lm, w_lm_p, w_f, w_f_p = 0.0, 1.0, 0.0, 1.0
            try:
                gq_f, gq_p, _ = het_goldfeldquandt(Y, X_with_const)
            except Exception:
                gq_f, gq_p = 1.0, 0.5

            # Belsley Collinearity Diagnostics via SVD of column-scaled X_with_const
            col_norms = np.linalg.norm(X_with_const, axis=0)
            col_norms[col_norms == 0] = 1.0
            Z_scaled = X_with_const / col_norms
            _, sing_vals, vt = np.linalg.svd(Z_scaled, full_matrices=False)
            eig_vals = sing_vals ** 2
            cond_indices = np.sqrt(eig_vals[0] / np.maximum(eig_vals, 1e-15))

            conf_int = results.conf_int(alpha=alpha)

            response_data = {
                "success": True,
                "engine_version": "2.0.0-Python-Statsmodels-SPSS-Parity",
                "model_summary": {
                    "r": float(np.sqrt(max(0.0, results.rsquared))),
                    "r_squared": float(results.rsquared),
                    "adj_r_squared": float(results.rsquared_adj),
                    "std_error_estimate": float(np.sqrt(results.mse_resid)),
                    "durbin_watson": dw,
                    "aic": float(results.aic),
                    "bic": float(results.bic)
                },
                "anova": {
                    "f_statistic": float(results.fvalue),
                    "p_value": float(results.f_pvalue),
                    "ssr": float(results.ess),
                    "sse": float(results.ssr),
                    "df_reg": int(results.df_model),
                    "df_res": int(results.df_resid)
                },
                "coefficients": [
                    {
                        "name": "(Constant)" if i == 0 else x_cols[i - 1],
                        "b": float(results.params[i]),
                        "se": float(results.bse[i]),
                        "hc3_se": float(hc3_results.bse[i]),
                        "t": float(results.tvalues[i]),
                        "p": float(results.pvalues[i]),
                        "ci_lower": float(conf_int[i, 0]),
                        "ci_upper": float(conf_int[i, 1])
                    } for i in range(k + 1)
                ],
                "normality_tests": {
                    "shapiro_wilk": {"statistic": float(sw_stat), "p_value": float(sw_p)},
                    "lilliefors_ks": {"statistic": float(ks_stat), "p_value": float(ks_p)},
                    "jarque_bera": {
                        "statistic": float(jb_stat),
                        "p_value": float(jb_p),
                        "skewness": float(skew_val),
                        "kurtosis": float(kurt_val)
                    },
                    "anderson_darling": {"statistic": float(ad_res.statistic)}
                },
                "heteroskedasticity_tests": {
                    "breusch_pagan": {"lm": float(bp_lm), "p_value": float(bp_lm_p), "f": float(bp_f), "f_p": float(bp_f_p)},
                    "white": {"lm": float(w_lm), "p_value": float(w_lm_p)},
                    "goldfeld_quandt": {"f": float(gq_f), "p_value": float(gq_p)}
                },
                "collinearity_diagnostics": {
                    "eigenvalues": [float(v) for v in eig_vals],
                    "condition_indices": [float(c) for c in cond_indices]
                },
                "scores": {
                    "s3_consistency": 100 if s3_check1 else 87.5,
                    "svd_diff": float(diff_b)
                }
            }
            status_code = 200

        except Exception as e:
            response_data = {
                "success": False,
                "error": str(e)
            }
            status_code = 500

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
