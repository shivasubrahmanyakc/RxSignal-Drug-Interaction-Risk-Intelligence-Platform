import os
import streamlit as st
import pandas as pd
import pyarrow.parquet as pq
import joblib
import xgboost as xgb
# Page config must be the first Streamlit command
st.set_page_config(
    page_title="FAERS DDI Predictor",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for modern, premium aesthetic (glassmorphism, vibrant colors, dark mode focus)
st.markdown("""
<style>
    /* Global background */
    .stApp {
        background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
        color: #f8fafc;
        font-family: 'Inter', sans-serif;
    }
    
    /* Headers */
    h1, h2, h3 {
        color: #e2e8f0;
        font-weight: 700;
        letter-spacing: -0.02em;
    }
    
    /* Title styling with gradient */
    .title-gradient {
        background: linear-gradient(to right, #38bdf8, #818cf8, #c084fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-size: 3rem !important;
        font-weight: 800 !important;
        margin-bottom: 0.5rem;
    }
    
    /* Glassmorphism containers */
    .glass-container {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .glass-container:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    }
    
    /* Metrics styling */
    .metric-value {
        font-size: 2.5rem;
        font-weight: 800;
        color: #38bdf8;
    }
    .metric-label {
        font-size: 1rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    /* Risk Badges */
    .risk-high { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px 12px; border-radius: 999px; font-weight: 600; }
    .risk-medium { background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.5); padding: 4px 12px; border-radius: 999px; font-weight: 600; }
    .risk-low { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.5); padding: 4px 12px; border-radius: 999px; font-weight: 600; }
    
    /* Data table overrides */
    .stDataFrame {
        background: transparent !important;
    }
    
    /* Button styling */
    .stButton>button {
        background: linear-gradient(to right, #3b82f6, #8b5cf6);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.75rem 1.5rem;
        font-weight: 600;
        transition: all 0.3s ease;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="title-gradient">FAERS Pharmacovigilance AI</div>', unsafe_allow_html=True)
st.markdown("Predict adverse events and estimate risk severity for drug-drug interactions using historical FDA data.")

@st.cache_resource
def load_ml_assets():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    model_file = os.path.join(base_dir, "models", "xgboost_risk_model.pkl")
    encoder_file = os.path.join(base_dir, "models", "encoders.pkl")
    if os.path.exists(model_file) and os.path.exists(encoder_file):
        model = joblib.load(model_file)
        encoders = joblib.load(encoder_file)
        return model, encoders
    return None, None

@st.cache_data
def load_data():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    stats_file = os.path.join(base_dir, "processed", "aggregated_stats.parquet")
    if not os.path.exists(stats_file):
        return pd.DataFrame()
    return pd.read_parquet(stats_file)

with st.spinner("Loading FAERS Knowledge Base & ML Models..."):
    df_stats = load_data()
    ml_model, ml_encoders = load_ml_assets()

if df_stats.empty:
    st.error("Aggregated statistics not found. Please run the data pipeline first.")
    st.stop()

# Sidebar for inputs
with st.sidebar:
    st.header("🔍 Query DDI")
    
    # Get unique drugs for autocomplete
    all_drugs = pd.concat([df_stats['drug_a'], df_stats['drug_b']]).unique()
    all_drugs.sort()
    
    drug1 = st.selectbox("Select Drug A", options=all_drugs, index=0 if len(all_drugs) > 0 else None)
    drug2 = st.selectbox("Select Drug B", options=all_drugs, index=1 if len(all_drugs) > 1 else None)
    
    st.markdown("---")
    st.markdown("### About")
    st.info("This MVP uses statistical frequencies (PRR/ROR) from FDA FAERS data to detect potential adverse drug interactions.")

# Main content
if drug1 and drug2:
    if drug1 == drug2:
        st.warning("Please select two different drugs.")
    else:
        # Sort to match canonical ordering
        d_a, d_b = sorted([drug1.upper().strip(), drug2.upper().strip()])
        
        # Filter data
        pair_data = df_stats[(df_stats['drug_a'] == d_a) & (df_stats['drug_b'] == d_b)]
        
        if pair_data.empty:
            st.info(f"No significant adverse events reported for the combination of **{d_a}** and **{d_b}** in the current dataset.")
        else:
            st.markdown(f"### Interaction Analysis: `{d_a}` + `{d_b}`")
            
            tab1, tab2 = st.tabs(["📊 Phase 1: Historical Evidence", "🤖 Phase 2: AI Risk Prediction"])
            
            with tab1:
                # Overview Metrics
                total_reports = pair_data['pair_total'].iloc[0]
                unique_events = len(pair_data)
                max_risk = pair_data['risk_score'].max()
                
                risk_class = "risk-high" if max_risk > 10 else "risk-medium" if max_risk > 5 else "risk-low"
                risk_label = "HIGH RISK" if max_risk > 10 else "MEDIUM RISK" if max_risk > 5 else "LOW RISK"
                
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.markdown(f"""
                    <div class="glass-container">
                        <div class="metric-label">Total Co-occurrences</div>
                        <div class="metric-value">{total_reports:,}</div>
                    </div>
                    """, unsafe_allow_html=True)
                with col2:
                    st.markdown(f"""
                    <div class="glass-container">
                        <div class="metric-label">Distinct Adverse Events</div>
                        <div class="metric-value">{unique_events:,}</div>
                    </div>
                    """, unsafe_allow_html=True)
                with col3:
                    st.markdown(f"""
                    <div class="glass-container">
                        <div class="metric-label">Highest Interaction Severity</div>
                        <div style="margin-top: 10px;"><span class="{risk_class}">{risk_label}</span></div>
                    </div>
                    """, unsafe_allow_html=True)
                
                # Top Adverse Events
                st.markdown("### Top Predicted Adverse Events")
                
                # Format the dataframe for display
                display_df = pair_data[['event', 'a', 'PRR', 'ROR', 'risk_score']].copy()
                display_df.columns = ['Adverse Event', 'Reported Cases', 'PRR', 'ROR', 'Risk Score']
                
                # Sort by Risk Score
                display_df = display_df.sort_values(by='Risk Score', ascending=False).head(10)
                
                # Apply styling to dataframe
                st.dataframe(
                    display_df.style.background_gradient(cmap='YlOrRd', subset=['Risk Score', 'PRR'])
                    .format({'PRR': '{:.2f}', 'ROR': '{:.2f}', 'Risk Score': '{:.2f}'}),
                    use_container_width=True,
                    height=400
                )
                
                st.markdown("---")
                st.markdown("### Explainability & Evidence")
                top_event = display_df.iloc[0]
                
                st.markdown(f"""
                <div class="glass-container">
                    <h4>Why is {top_event['Adverse Event']} highlighted?</h4>
                    <ul>
                        <li><strong>Historical Evidence:</strong> This adverse event was reported <b>{top_event['Reported Cases']}</b> times when {d_a} and {d_b} were taken together.</li>
                        <li><strong>Proportional Reporting Ratio (PRR):</strong> {top_event['PRR']:.2f}x higher frequency of this event compared to the background rate of all other drugs.</li>
                        <li><strong>Reporting Odds Ratio (ROR):</strong> The odds of this event are {top_event['ROR']:.2f}x higher for this combination.</li>
                    </ul>
                </div>
                """, unsafe_allow_html=True)
            
            with tab2:
                if ml_model is not None and ml_encoders is not None:
                    freq_dict = ml_encoders['freq']
                    mean_risk_dict = ml_encoders['mean_risk']
                    
                    # Create feature vector
                    features = pd.DataFrame([{
                        'drug_a_freq': freq_dict.get(d_a, 0),
                        'drug_b_freq': freq_dict.get(d_b, 0),
                        'drug_a_mean_risk': mean_risk_dict.get(d_a, 0),
                        'drug_b_mean_risk': mean_risk_dict.get(d_b, 0)
                    }])
                    
                    # Predict
                    pred_risk = ml_model.predict(features)[0]
                    
                    pred_class = "risk-high" if pred_risk > 10 else "risk-medium" if pred_risk > 5 else "risk-low"
                    pred_label = "HIGH RISK" if pred_risk > 10 else "MEDIUM RISK" if pred_risk > 5 else "LOW RISK"
                    
                    st.markdown(f"""
<div class="glass-container" style="border-left: 4px solid #8b5cf6;">
    <h3 style="color: #8b5cf6;">AI Predicted Risk Severity</h3>
    <p style="color: #94a3b8; margin-bottom: 20px;">The XGBoost model analyzes the historical baseline features and predicts the underlying biological risk score, learning to filter out purely statistical noise like small-sample coincidences.</p>
    
    <div class="metric-label">Predicted Severity Score</div>
    <div class="metric-value">{pred_risk:.2f}</div>
    <div style="margin-top: 15px;"><span class="{pred_class}">{pred_label}</span></div>
</div>
""", unsafe_allow_html=True)
                else:
                    st.warning("ML Models not found. Please run the Phase 2 training pipeline (`python src/train_model.py`).")
