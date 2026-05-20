import os
import re
import string
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

def clean_drug_name(name):
    if pd.isna(name):
        return ""
    # Convert to uppercase
    name = str(name).upper()
    # Remove punctuation
    name = name.translate(str.maketrans('', '', string.punctuation))
    # Remove extra whitespaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def process_quarter(base_path, quarter_name, output_base):
    path = os.path.join(base_path, quarter_name, "ASCII")
    if not os.path.exists(path):
        print(f"Skipping {quarter_name}, path {path} not found.")
        return

    print(f"\nReading files from: {path}")

    try:
        demo_file = [f for f in os.listdir(path) if f.startswith("DEMO") and f.endswith(".txt")][0]
        drug_file = [f for f in os.listdir(path) if f.startswith("DRUG") and f.endswith(".txt")][0]
        reac_file = [f for f in os.listdir(path) if f.startswith("REAC") and f.endswith(".txt")][0]
    except IndexError:
        print(f"Missing one of DEMO, DRUG, REAC files in {path}")
        return

    # Read with correct separator
    print("Loading datasets...")
    demo = pd.read_csv(os.path.join(path, demo_file), sep='$', engine='python', encoding='latin1', on_bad_lines='skip')
    drug = pd.read_csv(os.path.join(path, drug_file), sep='$', engine='python', encoding='latin1', on_bad_lines='skip')
    reac = pd.read_csv(os.path.join(path, reac_file), sep='$', engine='python', encoding='latin1', on_bad_lines='skip')

    # Normalize column names
    demo.columns = demo.columns.str.upper()
    drug.columns = drug.columns.str.upper()
    reac.columns = reac.columns.str.upper()

    # Keep required columns
    demo = demo[["PRIMARYID", "AGE", "SEX"]].copy()
    drug = drug[["PRIMARYID", "DRUGNAME"]].copy()
    reac = reac[["PRIMARYID", "PT"]].copy()

    print("Cleaning drug names...")
    drug["DRUGNAME"] = drug["DRUGNAME"].apply(clean_drug_name)
    drug = drug[drug["DRUGNAME"] != ""]
    
    # Get patients with at least 2 unique drugs
    drug = drug.drop_duplicates(subset=["PRIMARYID", "DRUGNAME"])
    drug_counts = drug.groupby("PRIMARYID").size()
    valid_pids = drug_counts[drug_counts >= 2].index
    
    if len(valid_pids) == 0:
        print(f"{quarter_name} processed. Rows: 0")
        return

    # Create output dir for quarter
    q_out_dir = os.path.join(output_base, quarter_name)
    os.makedirs(q_out_dir, exist_ok=True)
    
    chunk_size = 5000
    total_rows = 0
    
    print(f"Processing pairs for {len(valid_pids)} valid patients...")
    for i in range(0, len(valid_pids), chunk_size):
        chunk_pids = valid_pids[i:i+chunk_size]
        
        d_chunk = drug[drug["PRIMARYID"].isin(chunk_pids)]
        r_chunk = reac[reac["PRIMARYID"].isin(chunk_pids)]
        demo_chunk = demo[demo["PRIMARYID"].isin(chunk_pids)]
        
        # Self-merge to get all combinations, then filter to keep unique pairs (A < B)
        d_pairs = d_chunk.merge(d_chunk, on="PRIMARYID")
        d_pairs = d_pairs[d_pairs["DRUGNAME_x"] < d_pairs["DRUGNAME_y"]]
        
        # Merge with reactions and demographics
        merged = d_pairs.merge(r_chunk, on="PRIMARYID").merge(demo_chunk, on="PRIMARYID")
        
        # Rename columns
        df = merged.rename(columns={
            "DRUGNAME_x": "drug_a",
            "DRUGNAME_y": "drug_b",
            "PT": "event",
            "AGE": "age",
            "SEX": "gender"
        })
        
        df = df[["drug_a", "drug_b", "event", "age", "gender"]]
        
        if not df.empty:
            out_file = os.path.join(q_out_dir, f"part_{i//chunk_size}.parquet")
            df.to_parquet(out_file, index=False)
            total_rows += len(df)
            
        if (i // chunk_size) % 10 == 0:
            print(f"  Processed chunk {i//chunk_size}, cumulative rows: {total_rows}")

    print(f"{quarter_name} finished. Total rows: {total_rows}")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(base_dir, "processed")
    
    # Process all 4 quarters
    quarters = [
        "faers_ascii_2025q1",
        "faers_ascii_2025q2",
        "faers_ascii_2025q3",
        "faers_ascii_2025Q4"
    ]
    
    for q in quarters:
        process_quarter(base_dir, q, out_dir)
