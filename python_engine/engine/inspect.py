"""
Dataset inspector endpoint for Vercel Python Serverless Engine
POST /api/engine/inspect
"""
import io
import json
import base64
from http.server import BaseHTTPRequestHandler
import pandas as pd
import numpy as np

def sanitize_value(val):
    if isinstance(val, str):
        if val.startswith(('=', '+', '-', '@')):
            return "'" + val
    return val

def detect_column_type(series: pd.Series) -> str:
    # Drop NAs for type determination
    non_null = series.dropna()
    if len(non_null) == 0:
        return "empty"
    
    # Check numeric
    if pd.api.types.is_numeric_dtype(series):
        # check distinct count
        distinct_count = non_null.nunique()
        if distinct_count <= 2 and set(non_null.unique()).issubset({0, 1, 0.0, 1.0}):
            return "binary"
        return "numeric"
    
    # Check datetime
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    
    # Attempt parsing datetime
    try:
        sample = non_null.iloc[:20].astype(str)
        pd.to_datetime(sample, errors='raise')
        return "datetime"
    except Exception:
        pass

    # Check distinct count for categorical vs free text
    distinct_ratio = non_null.nunique() / max(len(non_null), 1)
    if distinct_ratio < 0.2 or non_null.nunique() <= 10:
        return "categorical"
    
    return "text"

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

            if not file_base64:
                self.send_error(400, "file_bytes_base64 parameter is required")
                return

            raw_bytes = base64.b64decode(file_base64)
            file_stream = io.BytesIO(raw_bytes)

            sheets_summary = []

            if format_type in ('xlsx', 'xls'):
                excel_file = pd.ExcelFile(file_stream)
                sheet_names = excel_file.sheet_names

                for s_name in sheet_names:
                    df = pd.read_excel(excel_file, sheet_name=s_name)
                    # Clean column names
                    df.columns = [str(c).strip() for c in df.columns]
                    
                    col_types = {col: detect_column_type(df[col]) for col in df.columns}
                    
                    # Sanitize and get first 10 rows
                    preview_df = df.head(10).copy()
                    for col in preview_df.columns:
                        preview_df[col] = preview_df[col].apply(sanitize_value)
                    
                    # Replace NaN with None for valid JSON serialization
                    preview_records = preview_df.replace({np.nan: None}).to_dict(orient='records')

                    sheets_summary.append({
                        "sheet_name": s_name,
                        "row_count": len(df),
                        "column_count": len(df.columns),
                        "columns": list(df.columns),
                        "column_types": col_types,
                        "preview_rows": preview_records
                    })
            else: # CSV format
                df = pd.read_csv(file_stream)
                df.columns = [str(c).strip() for c in df.columns]
                col_types = {col: detect_column_type(df[col]) for col in df.columns}
                
                preview_df = df.head(10).copy()
                for col in preview_df.columns:
                    preview_df[col] = preview_df[col].apply(sanitize_value)
                preview_records = preview_df.replace({np.nan: None}).to_dict(orient='records')

                sheets_summary.append({
                    "sheet_name": "CSV_DATA",
                    "row_count": len(df),
                    "column_count": len(df.columns),
                    "columns": list(df.columns),
                    "column_types": col_types,
                    "preview_rows": preview_records
                })

            response_data = {
                "success": True,
                "sheets": sheets_summary
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
