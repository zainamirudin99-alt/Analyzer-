from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    """Vercel Serverless Function for independent statistical verification via statsmodels/scipy."""

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length) if content_length > 0 else b'{}'
            payload = json.loads(raw_body.decode('utf-8'))

            # Lazy-import heavy scientific libraries to reduce cold-start overhead
            import numpy as np
            import pandas as pd
            import scipy.stats as stats
            import statsmodels.api as sm
            from statsmodels.stats.diagnostic import het_breuschpagan, het_white, lilliefors
            from statsmodels.stats.stattools import durbin_watson, jarque_bera

            mode = payload.get('mode', 'ols')

            if mode == 'contingency':
                table = payload.get('table', [])
                arr = np.asarray(table, dtype=float)
                if arr.ndim != 2 or arr.shape[0] < 2 or arr.shape[1] < 2:
                    raise ValueError('Tabel kontingensi minimal berukuran 2x2.')
                chi2_val, p_val, dof, expected = stats.chi2_contingency(arr, correction=False)
                g_stat, g_p, _, _ = stats.chi2_contingency(arr, correction=False, lambda_='log-likelihood')
                fisher_p = None
                if arr.shape == (2, 2):
                    _, fisher_p = stats.fisher_exact(arr)
                response_data = {
                    'success': True,
                    'engine': 'scipy.stats',
                    'pearson_chi2': float(chi2_val),
                    'pearson_p': float(p_val),
                    'df': int(dof),
                    'likelihood_ratio_g2': float(g_stat),
                    'likelihood_ratio_p': float(g_p),
                    'fisher_exact_p': float(fisher_p) if fisher_p is not None else None,
                    'expected_min': float(np.min(expected))
                }
            else:
                rows = payload.get('rows', [])
                y_col = payload.get('yCol') or payload.get('y_col')
                x_cols = payload.get('xCols') or payload.get('x_cols') or []
                is_ts = bool(payload.get('isTimeSeries', False))
                time_col = payload.get('timeCol')
                ref_cats = payload.get('refCategories') or {}

                if not rows or not y_col or not x_cols:
                    raise ValueError('Payload wajib menyertakan rows, yCol, dan xCols.')

                df = pd.DataFrame(rows)
                if is_ts and time_col and time_col in df.columns:
                    df = df.sort_values(by=time_col, kind='mergesort')

                df[y_col] = pd.to_numeric(df[y_col], errors='coerce')
                x_frames = []
                for col in x_cols:
                    num_series = pd.to_numeric(df[col], errors='coerce')
                    if num_series.notna().sum() >= max(1, int(0.99 * df[col].notna().sum())):
                        x_frames.append(num_series.rename(col))
                    else:
                        cats = sorted(df[col].dropna().astype(str).str.strip().unique().tolist())
                        if len(cats) <= 1:
                            raise ValueError(f"Variabel kategorik '{col}' konstan.")
                        ref = ref_cats.get(col) if ref_cats.get(col) in cats else cats[0]
                        for c_val in cats:
                            if c_val == ref:
                                continue
                            dummy_col = (df[col].astype(str).str.strip() == c_val).astype(float)
                            dummy_col[df[col].isna()] = np.nan
                            x_frames.append(dummy_col.rename(f'{col}[{c_val}]'))

                model_df = pd.concat([df[[y_col]], *x_frames], axis=1).dropna()
                y_arr = model_df[y_col].to_numpy(dtype=float)
                active_x_names = [s.name for s in x_frames]
                x_arr = model_df[active_x_names].to_numpy(dtype=float)
                x_const = sm.add_constant(x_arr, has_constant='add')

                ols_fit = sm.OLS(y_arr, x_const).fit()
                hc3_fit = ols_fit.get_robustcov_results(cov_type='HC3')
                resid = ols_fit.resid

                # Normality diagnostics matching SPSS split rule (Shapiro n<=50, Lilliefors n>50)
                n_obs = len(resid)
                sw_stat, sw_p = stats.shapiro(resid) if 3 <= n_obs <= 5000 else (0.0, 1.0)
                ks_stat, ks_p = lilliefors(resid, dist='norm')
                jb_stat, jb_p, skew, kurt = jarque_bera(resid)
                ad_res = stats.anderson(resid, dist='norm')

                # Heteroskedasticity & Autocorrelation
                bp_lm, bp_p, bp_f, bp_fp = het_breuschpagan(resid, x_const)
                try:
                    w_lm, w_p, w_f, w_fp = het_white(resid, x_const)
                except Exception:
                    w_lm, w_p = 0.0, 1.0
                dw_val = durbin_watson(resid)

                # Belsley Condition Index via unit-length column scaling SVD
                col_norms = np.maximum(np.linalg.norm(x_const, axis=0), 1e-14)
                z_mat = x_const / col_norms
                _, s_vals, _ = np.linalg.svd(z_mat, full_matrices=False)
                cond_idx = float(s_vals[0] / max(s_vals[-1], 1e-14))

                response_data = {
                    'success': True,
                    'engine': 'statsmodels-0.14-scipy',
                    'nUsed': int(n_obs),
                    'xNames': ['(Constant)'] + active_x_names,
                    'coefficients': [float(v) for v in ols_fit.params],
                    'stdErrorsOLS': [float(v) for v in ols_fit.bse],
                    'stdErrorsHC3': [float(v) for v in hc3_fit.bse],
                    'tStatsHC3': [float(v) for v in hc3_fit.tvalues],
                    'pValuesHC3': [float(v) for v in hc3_fit.pvalues],
                    'rSquared': float(ols_fit.rsquared),
                    'adjRSquared': float(ols_fit.rsquared_adj),
                    'fStat': float(ols_fit.fvalue) if ols_fit.fvalue is not None else 0.0,
                    'fSig': float(ols_fit.f_pvalue) if ols_fit.f_pvalue is not None else 1.0,
                    'durbinWatson': float(dw_val),
                    'belsleyConditionIndex': cond_idx,
                    'diagnostics': {
                        'shapiroWilk': {'statistic': float(sw_stat), 'pValue': float(sw_p)},
                        'lilliefors': {'statistic': float(ks_stat), 'pValue': float(ks_p)},
                        'jarqueBera': {'statistic': float(jb_stat), 'pValue': float(jb_p), 'skew': float(skew), 'kurtosis': float(kurt)},
                        'andersonDarling': {'statistic': float(ad_res.statistic)},
                        'breuschPagan': {'lm': float(bp_lm), 'pValue': float(bp_p)},
                        'whiteTest': {'lm': float(w_lm), 'pValue': float(w_p)}
                    }
                }

            status_code = 200
        except Exception as exc:
            response_data = {
                'success': False,
                'error': str(exc)
            }
            status_code = 400 if isinstance(exc, ValueError) else 500

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

