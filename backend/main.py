import os
import math
import joblib
import tempfile
import requests
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import duckdb

app = FastAPI(title="FAERS Intelligence Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
models_dir = os.path.join(base_dir, "models")
processed_dir = os.path.join(base_dir, "processed")

# Global ML Objects
ml_model = None
encoders = None
    
# Global PyTorch GNN Objects
gnn_node_embeddings = None
gnn_drug_mapping = None

class RiskGraphSAGE(torch.nn.Module):
    def __init__(self, num_node_features):
        super(RiskGraphSAGE, self).__init__()
        from torch_geometric.nn import SAGEConv
        self.conv1 = SAGEConv(num_node_features, 256)
        self.bn1 = torch.nn.BatchNorm1d(256)
        self.conv2 = SAGEConv(256, 128)
        self.bn2 = torch.nn.BatchNorm1d(128)
        self.conv3 = SAGEConv(128, 64)
        self.bn3 = torch.nn.BatchNorm1d(64)
        
        self.fc1 = torch.nn.Linear(64 * 2, 32)
        self.fc2 = torch.nn.Linear(32, 1)
        self.dropout = torch.nn.Dropout(0.3)

    def decode_from_embeddings(self, z_src, z_dst):
        edge_features = torch.cat([z_src, z_dst], dim=1)
        out = F.relu(self.fc1(edge_features))
        return self.fc2(out).squeeze()

gnn_decoder = None

@app.on_event("startup")
async def startup_event():
    global ml_model, encoders, gnn_node_embeddings, gnn_drug_mapping, gnn_decoder
    print("Loading AI Models...")
    
    # Load Phase 2 XGBoost
    try:
        ml_model = joblib.load(os.path.join(models_dir, "xgboost_risk_model.pkl"))
        encoders = joblib.load(os.path.join(models_dir, "encoders.pkl"))
    except Exception as e:
        print(f"XGBoost missing: {e}")

    # Load Phase 3 PyTorch GNN
    try:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        gnn_node_embeddings = torch.load(os.path.join(models_dir, "gnn_node_embeddings.pth"), map_location=device)
        gnn_drug_mapping = joblib.load(os.path.join(processed_dir, "graph_drug_mapping.pkl"))
        
        # We only need the decoder part of the model for O(1) inference
        # The node embeddings (z) are already calculated!
        full_model = RiskGraphSAGE(num_node_features=2).to(device)
        full_model.load_state_dict(torch.load(os.path.join(models_dir, "risk_gnn.pth"), map_location=device))
        full_model.eval()
        gnn_decoder = full_model
        print("PyTorch GNN loaded.")
    except Exception as e:
        print(f"GNN missing: {e}")

class PredictionRequest(BaseModel):
    drug_a: str
    drug_b: str

@app.get("/api/drugs")
async def get_drugs():
    if not encoders:
        raise HTTPException(status_code=500, detail="Models not loaded")
    all_drugs = list(encoders['freq'].keys())
    return {"drugs": sorted(all_drugs)}

@app.post("/api/predict")
async def predict_risk(request: PredictionRequest):
    d_a, d_b = sorted([request.drug_a.upper().strip(), request.drug_b.upper().strip()])
    
    # 1. Phase 2 XGBoost Prediction (Log-Transform model)
    xgb_score = 0
    if ml_model and encoders:
        d_a_freq = encoders['freq'].get(d_a, 0)
        d_b_freq = encoders['freq'].get(d_b, 0)
        d_a_mean_risk = encoders['mean_risk'].get(d_a, 0)
        d_b_mean_risk = encoders['mean_risk'].get(d_b, 0)
        features = pd.DataFrame([{
            'drug_a_freq': d_a_freq,
            'drug_b_freq': d_b_freq,
            'drug_a_mean_risk': d_a_mean_risk,
            'drug_b_mean_risk': d_b_mean_risk,
            'combined_risk_interaction': d_a_mean_risk * d_b_mean_risk,
            'risk_difference': abs(d_a_mean_risk - d_b_mean_risk),
            'freq_ratio': min(d_a_freq, d_b_freq) / (max(d_a_freq, d_b_freq) + 1e-6),
            'drug_a_log_freq': np.log1p(d_a_freq),
            'drug_b_log_freq': np.log1p(d_b_freq),
            'log_combined_risk': np.log1p(max(0, d_a_mean_risk * d_b_mean_risk)),
            'log_risk_difference': np.log1p(abs(d_a_mean_risk - d_b_mean_risk)),
        }])
        # Model predicts in log space, expm1 converts back to original scale
        xgb_score = float(np.expm1(ml_model.predict(features)[0]))
        
        feature_drivers = [
            {"name": "Freq Ratio", "value": round(float(features.iloc[0]['freq_ratio']), 2), "normalized": min(1.0, float(features.iloc[0]['freq_ratio']))},
            {"name": "Comb Risk", "value": round(float(features.iloc[0]['combined_risk_interaction']), 2), "normalized": min(1.0, float(features.iloc[0]['combined_risk_interaction']) / 100.0)},
            {"name": "Risk Diff", "value": round(float(features.iloc[0]['risk_difference']), 2), "normalized": min(1.0, float(features.iloc[0]['risk_difference']) / 50.0)},
        ]
    else:
        feature_drivers = []
        
    xgb_label = "HIGH RISK" if xgb_score > 10 else "MEDIUM RISK" if xgb_score > 5 else "LOW RISK"
    
    # 2. Phase 3 PyTorch GNN Prediction
    gnn_score = 0
    gnn_label = "NOT FOUND IN GRAPH"
    if gnn_decoder is not None and gnn_node_embeddings is not None:
        try:
            idx_a = gnn_drug_mapping.get(d_a)
            idx_b = gnn_drug_mapping.get(d_b)
            if idx_a is not None and idx_b is not None:
                z_a = gnn_node_embeddings[idx_a].unsqueeze(0)
                z_b = gnn_node_embeddings[idx_b].unsqueeze(0)
                with torch.no_grad():
                    # Model predicts in log space, expm1 converts back
                    log_pred = float(gnn_decoder.decode_from_embeddings(z_a, z_b))
                    gnn_score = float(np.expm1(log_pred))
                gnn_label = "HIGH RISK" if gnn_score > 10 else "MEDIUM RISK" if gnn_score > 5 else "LOW RISK"
        except Exception as e:
            print(f"GNN Inference Error: {e}")
    
    # 3. Phase 1 Historical Evidence
    hf_dataset_url = os.environ.get("HF_DATASET_URL", "").replace("/blob/", "/resolve/")
    hf_token = os.environ.get("HF_TOKEN", "")

    parquet_full = os.path.join(processed_dir, "aggregated_stats.parquet").replace("\\", "/")
    parquet_sample = os.path.join(processed_dir, "aggregated_stats_sample.parquet").replace("\\", "/")
    hf_cached = "/tmp/aggregated_stats_hf.parquet"

    if hf_dataset_url and hf_token:
        if not os.path.exists(hf_cached):
            try:
                print("Downloading HF parquet (first time, ~1.1 GB)...")
                resp = requests.get(
                    hf_dataset_url,
                    headers={"Authorization": f"Bearer {hf_token}"},
                    timeout=300,
                    stream=True,
                )
                resp.raise_for_status()
                with open(hf_cached, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=4 * 1024 * 1024):
                        f.write(chunk)
                print(f"Saved HF parquet to {hf_cached}")
            except Exception as dl_err:
                print(f"HF download error: {dl_err}")
                hf_cached = None
        parquet_file = hf_cached if hf_cached and os.path.exists(hf_cached) else (
            parquet_full if os.path.exists(parquet_full) else parquet_sample
        )
    elif os.path.exists(parquet_full):
        parquet_file = parquet_full
    else:
        parquet_file = parquet_sample

    query = f"""
        SELECT event, a as co_occurrences, PRR, risk_score
        FROM read_parquet('{parquet_file}')
        WHERE (drug_a = '{d_a}' AND drug_b = '{d_b}') OR (drug_a = '{d_b}' AND drug_b = '{d_a}')
        ORDER BY risk_score DESC
        LIMIT 10
    """

    try:
        conn = duckdb.connect()
        evidence = conn.query(query).df().to_dict(orient="records")
    except Exception as e:
        print(f"DuckDB error: {e}")
        evidence = []

    return {
        "drug_a": d_a,
        "drug_b": d_b,
        "phase2_xgb": {
            "score": round(xgb_score, 2),
            "label": xgb_label,
            "feature_drivers": feature_drivers
        },
        "phase3_gnn": {
            "score": round(gnn_score, 2),
            "label": gnn_label
        },
        "historical_evidence": evidence
    }
