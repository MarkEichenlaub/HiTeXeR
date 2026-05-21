"""One-off probe: inspect aops3.crypt_collections columns and dump
all rows for our collection IDs (including physics) so we can pick the
best column for human-readable names.
"""
import os, sys
sys.path.insert(0, os.path.join(
    os.path.dirname(__file__), '..', '..', 'eigennode', 'scripts'))
from dotenv import load_dotenv
load_dotenv(os.path.join(
    os.path.dirname(__file__), '..', '..', 'eigennode', 'scripts', '.env'))
import aops_db

MATH_IDS = [71, 647, 289, 95, 53, 4, 51, 321, 398, 57, 282, 36, 462, 463,
            134, 402, 401, 186, 583, 510, 10, 582]
PHYSICS_IDS = [405, 268, 190, 175, 191, 539, 540, 400]
ALL_IDS = MATH_IDS + PHYSICS_IDS

conn = aops_db.get_connection()

print("=== Columns on aops3.crypt_collections ===")
with conn.cursor() as cur:
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'aops3' AND table_name = 'crypt_collections'
        ORDER BY ordinal_position
    """)
    for col, dtype in cur.fetchall():
        print(f"  {col:30s} {dtype}")

print(f"\n=== Rows for {len(ALL_IDS)} collection IDs ===")
placeholders = ','.join(['%s'] * len(ALL_IDS))
with conn.cursor() as cur:
    cur.execute(f"""
        SELECT * FROM aops3.crypt_collections
        WHERE collection_id IN ({placeholders})
        ORDER BY collection_id
    """, ALL_IDS)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

print(f"Columns: {cols}")
print()
for row in rows:
    rec = dict(zip(cols, row))
    print(f"--- id={rec.get('collection_id')} ---")
    for c, v in rec.items():
        if c == 'collection_id':
            continue
        if v is None or v == '':
            continue
        s = str(v)
        if len(s) > 120:
            s = s[:120] + '...'
        print(f"  {c}: {s}")
conn.close()
