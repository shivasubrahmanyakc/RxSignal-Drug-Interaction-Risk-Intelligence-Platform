import os
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, precision_score, recall_score, f1_score, classification_report
import joblib

def train_xgboost(data_file, model_file):
    print(f"Loading ML data from {data_file}...")
    df = pd.read_parquet(data_file)
    
    features = [
        'drug_a_freq', 'drug_b_freq', 'drug_a_mean_risk', 'drug_b_mean_risk',
        'combined_risk_interaction', 'risk_difference', 'freq_ratio',
        'drug_a_log_freq', 'drug_b_log_freq', 'log_combined_risk', 'log_risk_difference'
    ]
    # Train on log-transformed target for better R²
    target = 'log_max_risk'
    
    X = df[features]
    y = df[target]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"Training DEEP XGBoost Regressor (Log-Transform) on {len(X_train)} samples...")
    model = xgb.XGBRegressor(
        n_estimators=800,
        learning_rate=0.03,
        max_depth=10,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=5.0,
        reg_alpha=1.0,  # Added L1 regularization
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=100)
    
    print("\n" + "="*70)
    print("EVALUATING DEEP XGBoost MODEL (Log-Transform)")
    print("="*70)
    
    # Predict in log space
    y_test_pred_log = model.predict(X_test)
    
    # R² in log space (this is the improved metric)
    log_r2 = r2_score(y_test, y_test_pred_log)
    log_mse = mean_squared_error(y_test, y_test_pred_log)
    print(f"\nLog-Space Regression -> MSE: {log_mse:.4f} | R² Score: {log_r2:.4f}")
    
    # Convert back to original scale for classification metrics
    y_test_original = np.expm1(y_test)
    y_test_pred_original = np.expm1(y_test_pred_log)
    
    orig_r2 = r2_score(y_test_original, y_test_pred_original)
    orig_mse = mean_squared_error(y_test_original, y_test_pred_original)
    print(f"Original-Scale Regression -> MSE: {orig_mse:.4f} | R² Score: {orig_r2:.4f}")
    
    # Classification metrics on original scale
    threshold = 5.0
    y_true_bin = (y_test_original > threshold).astype(int)
    y_pred_bin = (y_test_pred_original > threshold).astype(int)
    
    acc = accuracy_score(y_true_bin, y_pred_bin)
    prec = precision_score(y_true_bin, y_pred_bin, zero_division=0)
    rec = recall_score(y_true_bin, y_pred_bin, zero_division=0)
    f1 = f1_score(y_true_bin, y_pred_bin, zero_division=0)
    
    print(f"\nClassification Metrics (Risk > {threshold}):")
    print(f"  Accuracy:  {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall:    {rec:.4f}")
    print(f"  F1-Score:  {f1:.4f}")
    
    print(f"\nFull Classification Report:")
    print(classification_report(y_true_bin, y_pred_bin, target_names=["LOW RISK", "SIGNIFICANT RISK"]))
    
    # Save metrics
    metrics = (f"XGBoost Log-R2: {log_r2:.4f}, Orig-R2: {orig_r2:.4f}, "
               f"Acc: {acc:.4f}, Prec: {prec:.4f}, Rec: {rec:.4f}, F1: {f1:.4f}")
    with open(os.path.join(os.path.dirname(model_file), "..", "xgb_metrics.txt"), "w") as f:
        f.write(metrics)
        
    print(f"\nSaving model to {model_file}...")
    joblib.dump(model, model_file)
    print("Done!")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_file = os.path.join(base_dir, "processed", "ml_training_data.parquet")
    model_file = os.path.join(base_dir, "models", "xgboost_risk_model.pkl")
    
    train_xgboost(data_file, model_file)
