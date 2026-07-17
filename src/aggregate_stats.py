import os
import duckdb
import numpy as np

# Quarter subdirectory names (must match actual folder names on disk)
QUARTERS = [
    "faers_ascii_2025q1",
    "faers_ascii_2025q2",
    "faers_ascii_2025q3",
    "faers_ascii_2025Q4",
]

def calculate_stats_duckdb(processed_dir, output_file):
    output_file_fwd = output_file.replace("\\", "/")

    db_dir = "C:/duckdb_work"
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, "faers_work.db")

    print(f"Connecting to persistent DuckDB at {db_path}...")
    conn = duckdb.connect(db_path)
    conn.execute("SET threads=2;")
    conn.execute("SET memory_limit='6GB';")
    conn.execute("SET preserve_insertion_order=false;")

    # ── Step 1: Create empty accumulator tables ───────────────────────────────
    print("\nStep 1 — Creating accumulator tables...")
    conn.execute("DROP TABLE IF EXISTS pair_event_agg;")
    conn.execute("DROP TABLE IF EXISTS pair_agg;")
    conn.execute("DROP TABLE IF EXISTS event_agg;")
    conn.execute("""
        CREATE TABLE pair_event_agg (
            drug_a VARCHAR, drug_b VARCHAR, event VARCHAR, a BIGINT
        );
    """)
    conn.execute("""
        CREATE TABLE pair_agg (
            drug_a VARCHAR, drug_b VARCHAR, pair_total BIGINT
        );
    """)
    conn.execute("""
        CREATE TABLE event_agg (
            event VARCHAR, event_total BIGINT
        );
    """)

    # ── Step 2: Process one quarter at a time ─────────────────────────────────
    total_N = 0
    for i, quarter in enumerate(QUARTERS, 1):
        q_dir = os.path.join(processed_dir, quarter)
        if not os.path.isdir(q_dir):
            print(f"  [SKIP] {quarter} — folder not found")
            continue

        q_glob = os.path.join(q_dir, "*.parquet").replace("\\", "/")
        print(f"\nStep 2.{i} — Processing quarter: {quarter}")

        # Row count for this quarter
        n = conn.execute(f"SELECT count(*) FROM read_parquet('{q_glob}')").fetchone()[0]
        total_N += n
        print(f"         Rows: {n:,}  (running total: {total_N:,})")

        # Pair-event counts for this quarter → insert into accumulator
        print(f"         Inserting pair-event counts...")
        conn.execute(f"""
            INSERT INTO pair_event_agg
            SELECT drug_a, drug_b, event, count(*) AS a
            FROM read_parquet('{q_glob}')
            GROUP BY drug_a, drug_b, event;
        """)

        # Pair counts for this quarter
        print(f"         Inserting pair counts...")
        conn.execute(f"""
            INSERT INTO pair_agg
            SELECT drug_a, drug_b, count(*) AS pair_total
            FROM read_parquet('{q_glob}')
            GROUP BY drug_a, drug_b;
        """)

        # Event counts for this quarter
        print(f"         Inserting event counts...")
        conn.execute(f"""
            INSERT INTO event_agg
            SELECT event, count(*) AS event_total
            FROM read_parquet('{q_glob}')
            GROUP BY event;
        """)

    print(f"\n  Total rows across all quarters: {total_N:,}")

    # ── Step 3: Re-aggregate across quarters ─────────────────────────────────
    print("\nStep 3 — Re-aggregating pair-event counts across quarters (HAVING a >= 3)...")
    conn.execute("DROP TABLE IF EXISTS pair_event_counts;")
    conn.execute("""
        CREATE TABLE pair_event_counts AS
        SELECT drug_a, drug_b, event, sum(a) AS a
        FROM pair_event_agg
        GROUP BY drug_a, drug_b, event
        HAVING sum(a) >= 3;
    """)
    n_pec = conn.execute("SELECT count(*) FROM pair_event_counts").fetchone()[0]
    print(f"         Significant triples: {n_pec:,}")
    conn.execute("DROP TABLE IF EXISTS pair_event_agg;")

    print("\nStep 4 — Re-aggregating pair counts across quarters...")
    conn.execute("DROP TABLE IF EXISTS pair_counts;")
    conn.execute("""
        CREATE TABLE pair_counts AS
        SELECT drug_a, drug_b, sum(pair_total) AS pair_total
        FROM pair_agg
        GROUP BY drug_a, drug_b;
    """)
    conn.execute("DROP TABLE IF EXISTS pair_agg;")

    print("\nStep 5 — Re-aggregating event counts across quarters...")
    conn.execute("DROP TABLE IF EXISTS event_counts;")
    conn.execute("""
        CREATE TABLE event_counts AS
        SELECT event, sum(event_total) AS event_total
        FROM event_agg
        GROUP BY event;
    """)
    conn.execute("DROP TABLE IF EXISTS event_agg;")

    # ── Step 4: Compute PRR/ROR/risk_score and write directly to parquet ──────
    eps = 0.5
    print("\nStep 6 — Computing PRR/ROR/risk_score and writing to parquet...")
    conn.execute(f"""
        COPY (
            SELECT
                pec.drug_a,
                pec.drug_b,
                pec.event,
                pec.a,
                pc.pair_total,
                ec.event_total,
                ((pec.a + {eps}) / (pec.a + {eps} + (pc.pair_total - pec.a) + {eps}))
                /
                ((ec.event_total - pec.a + {eps}) / (ec.event_total - pec.a + {eps} + ({total_N} - pc.pair_total - ec.event_total + pec.a) + {eps}))
                    AS PRR,
                ((pec.a + {eps}) * ({total_N} - pc.pair_total - ec.event_total + pec.a + {eps}))
                /
                (((pc.pair_total - pec.a) + {eps}) * ((ec.event_total - pec.a) + {eps}))
                    AS ROR,
                ln(1 + pec.a) * ln(1 +
                    ((pec.a + {eps}) / (pec.a + {eps} + (pc.pair_total - pec.a) + {eps}))
                    /
                    ((ec.event_total - pec.a + {eps}) / (ec.event_total - pec.a + {eps} + ({total_N} - pc.pair_total - ec.event_total + pec.a) + {eps}))
                ) AS risk_score
            FROM pair_event_counts pec
            JOIN pair_counts pc  ON pec.drug_a = pc.drug_a AND pec.drug_b = pc.drug_b
            JOIN event_counts ec ON pec.event  = ec.event
            ORDER BY risk_score DESC, pec.a DESC
        ) TO '{output_file_fwd}' (FORMAT PARQUET);
    """)

    # Clean up
    for t in ["pair_event_counts", "pair_counts", "event_counts"]:
        conn.execute(f"DROP TABLE IF EXISTS {t};")
    conn.close()

    print(f"\nDone! aggregated_stats.parquet saved to: {output_file}")


if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    processed_dir = os.path.join(base_dir, "processed")
    output_file = os.path.join(base_dir, "processed", "aggregated_stats.parquet")

    calculate_stats_duckdb(processed_dir, output_file)
