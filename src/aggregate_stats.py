import os
import duckdb
import numpy as np

def calculate_stats_duckdb(processed_dir, output_file):
    print("Connecting to DuckDB and querying Parquet files...")
    
    # Path to all parquet files
    parquet_glob = os.path.join(processed_dir, "*", "*.parquet").replace("\\", "/")
    
    # We use DuckDB to perform the aggregations out-of-core (disk-backed), avoiding memory crashes
    query = f"""
    WITH base AS (
        SELECT drug_a, drug_b, event FROM read_parquet('{parquet_glob}')
    ),
    totals AS (
        SELECT count(*) as total_N FROM base
    ),
    pair_counts AS (
        SELECT drug_a, drug_b, count(*) as pair_total
        FROM base
        GROUP BY drug_a, drug_b
    ),
    event_counts AS (
        SELECT event, count(*) as event_total
        FROM base
        GROUP BY event
    ),
    pair_event_counts AS (
        SELECT drug_a, drug_b, event, count(*) as a
        FROM base
        GROUP BY drug_a, drug_b, event
        HAVING count(*) >= 3  -- Only keep significant co-occurrences
    )
    SELECT 
        pec.drug_a,
        pec.drug_b,
        pec.event,
        pec.a,
        pc.pair_total,
        ec.event_total,
        t.total_N
    FROM pair_event_counts pec
    JOIN pair_counts pc ON pec.drug_a = pc.drug_a AND pec.drug_b = pc.drug_b
    JOIN event_counts ec ON pec.event = ec.event
    CROSS JOIN totals t
    """
    
    print("Executing aggregation query (this may take a few minutes)...")
    # Execute query and pull results into pandas (the aggregated result is small enough for memory)
    conn = duckdb.connect()
    conn.execute("PRAGMA temp_directory='Y:/.duckdb_tmp';")
    df = conn.query(query).df()
    
    print(f"Aggregation complete. Processed {len(df)} significant pairs. Calculating PRR/ROR...")
    
    eps = 0.5
    
    # Calculate b, c, d
    df['b'] = df['pair_total'] - df['a']
    df['c'] = df['event_total'] - df['a']
    df['d'] = df['total_N'] - (df['a'] + df['b'] + df['c'])
    
    # Add epsilon
    a_eps = df['a'] + eps
    b_eps = df['b'] + eps
    c_eps = df['c'] + eps
    d_eps = df['d'] + eps
    
    # Stats formulas
    df['PRR'] = (a_eps / (a_eps + b_eps)) / (c_eps / (c_eps + d_eps))
    df['ROR'] = (a_eps * d_eps) / (b_eps * c_eps)
    
    # Confidence/Risk score
    df['risk_score'] = np.log1p(df['a']) * np.log1p(df['PRR'])
    
    # Sort and clean
    output_cols = ['drug_a', 'drug_b', 'event', 'a', 'pair_total', 'event_total', 'PRR', 'ROR', 'risk_score']
    final_stats = df[output_cols].sort_values(by=['risk_score', 'a'], ascending=[False, False])
    
    print(f"Saving final aggregated stats to {output_file}...")
    final_stats.to_parquet(output_file, index=False)
    print("Done!")

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    processed_dir = os.path.join(base_dir, "processed")
    output_file = os.path.join(base_dir, "processed", "aggregated_stats.parquet")
    
    calculate_stats_duckdb(processed_dir, output_file)
