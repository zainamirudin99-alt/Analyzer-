"""
Statistical OLS Fit Engine for Vercel Python Serverless
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
            y_col = payload.get('y_col')
            x_cols = payload.get('x_cols', [])
            is_time_series = payload.get('is_time_series', False)
            alpha = float(payload.get('alpha', 0.05))

            if not rows or not y_col or not x_cols:
                self.send_error(400, "Missing rows, y_col, or x_cols")
                return

            df = pd.DataFrame(rows)
            # Listwise deletion
            cols_needed = [y_col] + x_cols
            clean_df = df[cols_needed].dropna()

            Y = clean_df[y_col].values.astype(float)
            X = clean_df[x_cols].values.astype(float)
            n, k = X.shape

            # Add constant
            import statsmodels.api as sm
            X_with_const = sm.add_constant(X)

            # Fit OLS
            model = sm.OLS(Y, X_with_const)
            results = model.fit()

            # Independent SVD lstsq
            b_svd, _, _, _ = np.linalg.lstsq(X_with_const, Y, rcond=None)
            diff_b = np.max(np.abs(results.params - b_svd) / np.maximum(1e-10, np.abs(results.params)))
            s3_check1 = bool(diff_b <= 1e-8)

            # Durbin Watson
            from statsmodels.stats.stattools import durbin_watson
            dw = float(durbin_watson(results.resid))

            response_data = {
                "success": True,
                "engine_version": "1.0.0-Python-Statsmodels",
                "model_summary": {
                    "r": float(np.sqrt(max(0, results.rsquared))),
                    "r_squared": float(results.rsquared),
                    "adj_r_squared": float(results.rsquared_adj),
                    "std_error_estimate": float(np.sqrt(results.mse_resid)),
                    "durbin_watson": dw
                },
                "anova": {
                    "f_statistic": float(results.fvalue),
                    "p_value": float(results.f_pvalue),
                    "ssr": float(results.ess),
                    "sse": float(results.ssr)
                },
                "coefficients": [
                    {
                        "name": "(Constant)",
                        "b": float(results.params[0]),
                        "se": float(results.bse[0]),
                        "t": float(results.tvalues[0]),
                        "p": float(results.pvalues[0])
                    }
                ] + [
                    {
                        "name": x_cols[i],
                        "b": float(results.params[i+1]),
                        "se": float(results.bse[i+1]),
                        "t": float(results.tvalues[i+1]),
                        "p": float(results.pvalues[i+1])
                    } for i in range(k)
                ],
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
