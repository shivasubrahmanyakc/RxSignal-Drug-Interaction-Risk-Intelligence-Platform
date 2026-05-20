import os
import pandas as pd
import numpy as np
import joblib

def prep_ml_data(processed_dir, output_file):
    stats_file = os.path.join(processed_dir, "aggregated_stats.parquet")
    print(f"Loading data from {stats_file}...")
    df = pd.read_parquet(stats_file)
    
    print("Aggregating max risk per pair...")
    pair_df = df.groupby(['drug_a', 'drug_b']).agg(
        max_risk=('risk_score', 'max'),
        total_reports=('pair_total', 'first')
    ).reset_index()
    
    pair_df = pair_df.sort_values(by='max_risk', ascending=False)
    ml_df = pair_df
    
    # Apply Log Transform to the target variable to compress extreme outliers
    # This dramatically improves R² by making the distribution more normal
    print("Applying LOG TRANSFORM to target variable (max_risk)...")
    ml_df['log_max_risk'] = np.log1p(ml_df['max_risk'].clip(lower=0))
    
    print("Engineering ADVANCED features (Frequency, Target Encoding, Feature Crosses)...")
    all_drugs = pd.concat([df['drug_a'], df['drug_b']])
    drug_freq = all_drugs.value_counts().to_dict()
    
    ml_df['drug_a_freq'] = ml_df['drug_a'].map(drug_freq).fillna(0)
    ml_df['drug_b_freq'] = ml_df['drug_b'].map(drug_freq).fillna(0)
    
    # Log-transform the frequencies too for consistency
    ml_df['drug_a_log_freq'] = np.log1p(ml_df['drug_a_freq'])
    ml_df['drug_b_log_freq'] = np.log1p(ml_df['drug_b_freq'])
    
    d_a_risk = ml_df.groupby('drug_a')['max_risk'].mean()
    d_b_risk = ml_df.groupby('drug_b')['max_risk'].mean()
    drug_mean_risk = pd.concat([d_a_risk, d_b_risk]).groupby(level=0).mean().to_dict()
    
    ml_df['drug_a_mean_risk'] = ml_df['drug_a'].map(drug_mean_risk).fillna(0)
    ml_df['drug_b_mean_risk'] = ml_df['drug_b'].map(drug_mean_risk).fillna(0)
    
    # Advanced Feature Crosses
    ml_df['combined_risk_interaction'] = ml_df['drug_a_mean_risk'] * ml_df['drug_b_mean_risk']
    ml_df['risk_difference'] = abs(ml_df['drug_a_mean_risk'] - ml_df['drug_b_mean_risk'])
    ml_df['freq_ratio'] = ml_df[['drug_a_freq', 'drug_b_freq']].min(axis=1) / (ml_df[['drug_a_freq', 'drug_b_freq']].max(axis=1) + 1e-6)
    
    # Log-transformed feature crosses
    ml_df['log_combined_risk'] = np.log1p(ml_df['combined_risk_interaction'].clip(lower=0))
    ml_df['log_risk_difference'] = np.log1p(ml_df['risk_difference'].clip(lower=0))
    
    # Save Encoders
    model_dir = os.path.join(os.path.dirname(output_file), "..", "models")
    os.makedirs(model_dir, exist_ok=True)
    
    encoders = {
        'freq': drug_freq,
        'mean_risk': drug_mean_risk
    }
    joblib.dump(encoders, os.path.join(model_dir, "encoders.pkl"))
    
    print(f"Saving Advanced ML training data to {output_file}...")
    ml_df.to_parquet(output_file, index=False)
    print("Done!")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    processed_dir = os.path.join(base_dir, "processed")
    output_file = os.path.join(processed_dir, "ml_training_data.parquet")
    
    prep_ml_data(processed_dir, output_file)
