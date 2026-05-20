import os
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib

def train_xgboost(data_file, model_file):
    print(f"Loading ML data from {data_file}...")
    df = pd.read_parquet(data_file)
    
    features = ['drug_a_freq', 'drug_b_freq', 'drug_a_mean_risk', 'drug_b_mean_risk']
    target = 'max_risk'
    
    X = df[features]
    y = df[target]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"Training XGBoost Regressor on {len(X_train)} samples...")
    model = xgb.XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=7,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)
    
    print("\nEvaluating model...")
    # Training Metrics
    y_train_pred = model.predict(X_train)
    train_mse = mean_squared_error(y_train, y_train_pred)
    train_r2 = r2_score(y_train, y_train_pred)
    
    # Test Metrics
    y_test_pred = model.predict(X_test)
    test_mse = mean_squared_error(y_test, y_test_pred)
    test_r2 = r2_score(y_test, y_test_pred)
    
    print(f"Train MSE: {train_mse:.4f} | Train R2 Score: {train_r2:.4f}")
    print(f"Test MSE:  {test_mse:.4f} | Test R2 Score:  {test_r2:.4f}")
    
    print(f"Saving model to {model_file}...")
    joblib.dump(model, model_file)
    print("Done!")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_file = os.path.join(base_dir, "processed", "ml_training_data.parquet")
    model_file = os.path.join(base_dir, "models", "xgboost_risk_model.pkl")
    
    train_xgboost(data_file, model_file)
