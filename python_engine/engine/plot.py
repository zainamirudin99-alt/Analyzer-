"""
Diagnostic Plot Image Generator Endpoint for Word Export (.docx)
POST /api/engine/plot
Generates 200 DPI PNG diagnostic charts using matplotlib in headless mode.
"""
import json
import io
import os
import sys
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode('utf-8'))

            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import numpy as np

            plot_type = payload.get("plot_type", "pp")
            data = payload.get("data", {})
            title = payload.get("title", "")
            return_base64 = payload.get("base64", False)

            fig, ax = plt.subplots(figsize=(6, 4.2), dpi=200)
            ax.set_facecolor('#ffffff')
            fig.patch.set_facecolor('#ffffff')

            if plot_type == "pp":
                # Normal P-P Plot
                # data: [{ observed: number, expected: number }]
                obs = [p.get("observed", 0) for p in data]
                exp = [p.get("expected", 0) for p in data]
                ax.scatter(exp, obs, color='#0284c7', edgecolors='#0369a1', s=25, alpha=0.8, label='Kasus Sampel')
                ax.plot([0, 1], [0, 1], color='#dc2626', linestyle='--', linewidth=1.5, label='Garis Normal')
                ax.set_xlim(-0.05, 1.05)
                ax.set_ylim(-0.05, 1.05)
                ax.set_xlabel('Probabilitas Kumulatif Harapan (Expected)', fontsize=9)
                ax.set_ylabel('Probabilitas Kumulatif Teramati (Observed)', fontsize=9)
                ax.set_title(title or 'Normal P-P Plot of Regression Standardized Residual', fontsize=10, fontweight='bold')
                ax.grid(True, linestyle=':', alpha=0.6)
                ax.legend(fontsize=8, loc='upper left')

            elif plot_type == "qq":
                # Normal Q-Q Plot
                # data: [{ theoretical: number, sample: number }]
                theo = [p.get("theoretical", 0) for p in data]
                samp = [p.get("sample", 0) for p in data]
                ax.scatter(theo, samp, color='#0d9488', edgecolors='#0f766e', s=25, alpha=0.8, label='Residu Sampel')
                if theo and samp:
                    min_v = min(min(theo), min(samp))
                    max_v = max(max(theo), max(samp))
                    ax.plot([min_v, max_v], [min_v, max_v], color='#dc2626', linestyle='--', linewidth=1.5, label='Kuantil Normal')
                ax.set_xlabel('Kuantil Teoretis (Theoretical Quantiles)', fontsize=9)
                ax.set_ylabel('Kuantil Sampel Terstandarisasi', fontsize=9)
                ax.set_title(title or 'Normal Q-Q Plot of Standardized Residuals', fontsize=10, fontweight='bold')
                ax.grid(True, linestyle=':', alpha=0.6)
                ax.legend(fontsize=8, loc='upper left')

            elif plot_type == "res_fit":
                # Residuals vs Fitted
                # data: [{ fitted: number, residual: number }]
                fit = [p.get("fitted", 0) for p in data]
                res = [p.get("residual", 0) for p in data]
                ax.scatter(fit, res, color='#6366f1', edgecolors='#4f46e5', s=25, alpha=0.8)
                ax.axhline(0, color='#dc2626', linestyle='--', linewidth=1.5)
                ax.set_xlabel('Nilai Prediksi Terstandarisasi (Fitted Values)', fontsize=9)
                ax.set_ylabel('Residu Terstandarisasi (Standardized Residuals)', fontsize=9)
                ax.set_title(title or 'Scatterplot: Standardized Residual vs Predicted Value', fontsize=10, fontweight='bold')
                ax.grid(True, linestyle=':', alpha=0.6)

            elif plot_type == "histogram":
                # Residual Histogram with normal curve
                # data: [{ binStart: number, binEnd: number, count: number, normalDensity: number }]
                centers = [0.5 * (b.get("binStart", 0) + b.get("binEnd", 0)) for b in data]
                counts = [b.get("count", 0) for b in data]
                densities = [b.get("normalDensity", 0) for b in data]
                width = (centers[1] - centers[0]) * 0.9 if len(centers) > 1 else 0.5
                ax.bar(centers, counts, width=width, color='#38bdf8', edgecolor='#0284c7', alpha=0.7, label='Frekuensi Residu')
                # Scale normal curve to histogram max count
                if counts and densities and max(densities) > 0:
                    scaled_densities = [d * (max(counts) / max(densities)) for d in densities]
                    ax.plot(centers, scaled_densities, color='#dc2626', linewidth=2.0, label='Kurva Normal Acuan')
                ax.set_xlabel('Residu Terstandarisasi', fontsize=9)
                ax.set_ylabel('Frekuensi', fontsize=9)
                ax.set_title(title or 'Histogram of Standardized Residual', fontsize=10, fontweight='bold')
                ax.grid(True, linestyle=':', alpha=0.6)
                ax.legend(fontsize=8, loc='upper right')

            elif plot_type == "acf_pacf":
                # ACF / PACF Plot
                # data: [{ lag: number, acf: number, pacf: number, ci: number }]
                lags = [p.get("lag", 0) for p in data]
                acfs = [p.get("acf", 0) for p in data]
                ci = data[0].get("ci", 0.2) if data else 0.2
                ax.stem(lags, acfs, linefmt='b-', markerfmt='bo', basefmt='r-')
                ax.axhline(ci, color='#dc2626', linestyle=':', label='Batas Signifikansi 95%')
                ax.axhline(-ci, color='#dc2626', linestyle=':')
                ax.set_xlabel('Lag', fontsize=9)
                ax.set_ylabel('Autokorelasi (ACF)', fontsize=9)
                ax.set_title(title or 'Korelogram Autokorelasi Residual (ACF)', fontsize=10, fontweight='bold')
                ax.grid(True, linestyle=':', alpha=0.6)
                ax.legend(fontsize=8, loc='upper right')

            plt.tight_layout()
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=200)
            plt.close(fig)
            buf.seek(0)
            png_bytes = buf.getvalue()

            if return_base64:
                import base64
                b64_str = base64.b64encode(png_bytes).decode('utf-8')
                res_data = {"success": True, "base64": f"data:image/png;base64,{b64_str}"}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(res_data).encode('utf-8'))
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(png_bytes)

        except Exception as e:
            err_data = {"success": False, "error": str(e)}
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(err_data).encode('utf-8'))
