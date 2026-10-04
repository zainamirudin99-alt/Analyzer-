"""
Health check endpoint for Vercel Python Serverless Engine
GET /api/engine/health
"""
import json
import sys
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            import numpy as np
            import scipy
            import statsmodels
            import pandas as pd

            data = {
                "success": True,
                "status": "healthy",
                "service": "regression-statistical-engine",
                "version": "1.0.0",
                "environment": {
                    "python": sys.version,
                    "numpy": np.__version__,
                    "scipy": scipy.__version__,
                    "statsmodels": statsmodels.__version__,
                    "pandas": pd.__version__
                }
            }
            status_code = 200
        except Exception as e:
            data = {
                "success": False,
                "status": "degraded",
                "error": str(e),
                "environment": {
                    "python": sys.version
                }
            }
            status_code = 500

        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
