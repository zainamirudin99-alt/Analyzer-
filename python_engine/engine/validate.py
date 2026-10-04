"""
Regression configuration validator endpoint for Vercel Python Serverless Engine
POST /api/engine/validate
"""
import io
import json
import base64
from http.server import BaseHTTPRequestHandler
import pandas as pd
import numpy as np

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

            file_base64 = payload.get('file_bytes_base64')
            format_type = payload.get('format', 'xlsx').lower()
            sheet_name = payload.get('sheet_name')
            y_col = payload.get('y_col')
            x_cols = payload.get('x_cols', [])
            is_time_series = payload.get('is_time_series', False)
            time_col = payload.get('time_col')
            frequency = payload.get('frequency', 'tidak_beraturan')
            alpha = float(payload.get('alpha', 0.05))
            missing_policy = payload.get('missing_policy', 'listwise')

            if not file_base64:
                self.send_error(400, "file_bytes_base64 is required")
                return
            if not y_col:
                self.send_error(400, "y_col is required")
                return
            if not x_cols or len(x_cols) == 0:
                self.send_error(400, "x_cols must contain at least one column")
                return

            raw_bytes = base64.b64decode(file_base64)
            file_stream = io.BytesIO(raw_bytes)

            if format_type in ('xlsx', 'xls'):
                df = pd.read_excel(file_stream, sheet_name=sheet_name if sheet_name else 0)
            else:
                df = pd.read_csv(file_stream)

            df.columns = [str(c).strip() for c in df.columns]

            errors = []
            warnings = []

            # 1. Invarian I5: Y tidak boleh anggota X
            if y_col in x_cols:
                errors.append(f"Variabel dependen Y ('{y_col}') tidak boleh dimasukkan ke dalam daftar variabel independen X.")

            # 2. Periksa keberadaan kolom
            if y_col not in df.columns:
                errors.append(f"Kolom Y '{y_col}' tidak ditemukan dalam sheet data.")
            for x in x_cols:
                if x not in df.columns:
                    errors.append(f"Kolom X '{x}' tidak ditemukan dalam sheet data.")

            if errors:
                self.respond_json({
                    "is_valid": False,
                    "errors": errors,
                    "warnings": warnings
                })
                return

            # 3. Invarian I1: Y harus numerik kontinu
            y_series = df[y_col]
            y_numeric = pd.to_numeric(y_series, errors='coerce')
            non_null_y = y_numeric.dropna()

            if len(non_null_y) == 0 or non_null_y.nunique() < 2:
                errors.append(f"Kolom Y ('{y_col}') tidak memuat nilai numerik valid yang bervariasi.")
            elif non_null_y.nunique() == 2:
                errors.append(f"Kolom Y ('{y_col}') bersifat biner/dikotomi (hanya 2 nilai unik). OLS memerlukan Y kontinu; gunakan Regresi Logistik.")

            # 4. Filter missing data (listwise)
            cols_needed = [y_col] + x_cols
            if is_time_series and time_col:
                cols_needed.append(time_col)

            subset_df = df[cols_needed].copy()
            n_initial = len(subset_df)
            clean_df = subset_df.dropna()
            n_used = len(clean_df)
            rows_dropped = n_initial - n_used
            pct_missing = (rows_dropped / max(n_initial, 1)) * 100

            if pct_missing > 20.0:
                warnings.append(f"Terdapat {rows_dropped} baris ({pct_missing:.1f}%) data hilang (missing data) dari total {n_initial} baris. Evaluasi pola missing data.")

            k = len(x_cols)
            model_type = "SLR" if k == 1 else "MLR"

            # 5. Invarian I2 & Green (1991) Kecukupan Sampel
            if n_used <= k + 1:
                errors.append(f"Ukuran sampel terpakai (n={n_used}) terlalu kecil untuk mengestimasi {k} prediktor (syarat n > k + 1 = {k + 2}). Analisis diblokir.")
            else:
                green_model_min = 50 + 8 * k
                green_predictor_min = 104 + k
                if n_used < green_model_min:
                    warnings.append(f"Ukuran sampel (n={n_used}) di bawah rekomendasi Green (1991) untuk pengujian kelayakan model (n >= 50 + 8k = {green_model_min}).")
                if n_used < green_predictor_min:
                    warnings.append(f"Ukuran sampel (n={n_used}) di bawah rekomendasi Green (1991) untuk pengujian signifikansi prediktor individu (n >= 104 + k = {green_predictor_min}).")

            # 6. Cek kolom X konstan & Rank Deficiency
            for x in x_cols:
                x_num = pd.to_numeric(clean_df[x], errors='coerce')
                if x_num.dropna().nunique() <= 1:
                    errors.append(f"Kolom X ('{x}') bersifat konstan (varians nol) setelah pembersihan missing data. Harap hapus dari model.")

            # Rank check pada matriks X jika semua numeric
            try:
                numeric_x = clean_df[x_cols].apply(pd.to_numeric, errors='coerce')
                if not numeric_x.isnull().any().any() and n_used > k + 1:
                    X_mat = np.column_stack([np.ones(n_used), numeric_x.values])
                    rank = np.linalg.matrix_rank(X_mat)
                    if rank < k + 1:
                        errors.append(f"Matriks variabel prediktor X tidak berperingkat penuh (rank deficient: rank={rank}, kolom={k+1}). Terjadi multikolinearitas sempurna.")
            except Exception as ex:
                pass

            # 7. Cek Time Series
            time_series_summary = None
            if is_time_series:
                if not time_col:
                    errors.append("Pilihan time series aktif, namun kolom waktu belum ditentukan.")
                elif time_col not in df.columns:
                    errors.append(f"Kolom waktu '{time_col}' tidak ditemukan.")
                elif time_col in x_cols or time_col == y_col:
                    errors.append(f"Kolom waktu ('{time_col}') tidak boleh menjadi variabel Y maupun X.")
                else:
                    # Periksa duplikat waktu dan pengurutan
                    t_series = clean_df[time_col]
                    dup_count = int(t_series.duplicated().sum())
                    if dup_count > 0:
                        warnings.append(f"Ditemukan {dup_count} nilai waktu duplikat pada kolom '{time_col}'.")
                    
                    time_series_summary = {
                        "time_col": time_col,
                        "frequency": frequency,
                        "duplicate_time_count": dup_count,
                        "is_sorted": bool(t_series.is_monotonic_increasing),
                        "notice": "Data time series akan diurutkan secara kronologis menaik. Uji autokorelasi (Breusch-Godfrey) dan stasioneritas (ADF/KPSS) diaktifkan."
                    }
            else:
                time_series_summary = {
                    "notice": "Data cross-section (bukan time series). Urutan baris dianggap independen. Uji Durbin-Watson hanya sebagai acuan deskriptif."
                }

            is_valid = len(errors) == 0

            response = {
                "success": True,
                "is_valid": is_valid,
                "model_type": model_type,
                "k_predictors": k,
                "sample_size": {
                    "n_initial": n_initial,
                    "n_used": n_used,
                    "rows_dropped": rows_dropped,
                    "pct_missing": round(pct_missing, 2)
                },
                "alpha": alpha,
                "missing_policy": missing_policy,
                "errors": errors,
                "warnings": warnings,
                "time_series_summary": time_series_summary
            }

            self.respond_json(response)

        except Exception as e:
            self.respond_json({
                "success": False,
                "is_valid": False,
                "errors": [f"Terjadi kesalahan pemrosesan validasi: {str(e)}"],
                "warnings": []
            }, status=500)

    def respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
