"""Download Japan soup/noodle POIs from Overture's public, spatially indexed release.

Requires the duckdb dependency in pyproject.toml. Raw results stay outside Git.
Usage: python3 scripts/fetch-open-places.py --output /tmp/soupmap-overture.json
"""
import argparse
import json
import re
import duckdb

parser = argparse.ArgumentParser()
parser.add_argument("--release", default="2026-09-23.1")
parser.add_argument("--output", default="/tmp/soupmap-overture.json")
args = parser.parse_args()
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", args.release):
    raise ValueError("Invalid Overture release")

db = duckdb.connect()
db.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET threads=4; SET memory_limit='1GB';")
path = f"s3://overturemaps-us-west-2/release/{args.release}/theme=places/type=place/*"
query = f"""
SELECT id, names, taxonomy, addresses, sources, confidence,
       bbox.xmin AS lng, bbox.ymin AS lat
FROM read_parquet('{path}', hive_partitioning=1)
WHERE bbox.xmin BETWEEN 122 AND 154 AND bbox.ymin BETWEEN 20 AND 46
  AND list_contains(list_transform(addresses, a -> a.country), 'JP')
  AND coalesce(operating_status, 'open') NOT IN ('closed', 'permanently_closed')
  AND (
    regexp_matches(lower(coalesce(taxonomy.primary, '') || ' ' ||
      coalesce(array_to_string(taxonomy.alternates, ' '), '')), 'ramen|udon|soba|noodle|soup|oden')
    OR (list_contains(taxonomy.hierarchy, 'restaurant') AND
      regexp_matches(names.primary, 'ラーメン|らーめん|拉麺|中華そば|つけ麺|担々麺|担担麺|うどん|饂飩|蕎麦|おでん'))
  )
"""
print(f"Querying Japan soup/noodle places from Overture {args.release}…", flush=True)
rows = db.execute("SELECT to_json(t) FROM (" + query + ") t").fetchall()
records = [json.loads(row[0]) for row in rows]
if not records:
    raise RuntimeError("No records returned; existing catalog was not changed")
with open(args.output, "w") as out:
    json.dump({"release": args.release, "records": records}, out, ensure_ascii=False)
print(f"Wrote {len(records)} source records to {args.output}", flush=True)
