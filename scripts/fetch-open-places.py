"""Download Japan soup/noodle POIs from Overture's public, spatially sorted release.

Reads only the Parquet row groups whose bounding boxes overlap Japan, straight from
Overture's public S3 bucket (anonymous access, no DuckDB extensions to download).
Requires pyarrow (see pyproject.toml). Raw results stay outside Git.
Usage: python3 scripts/fetch-open-places.py --release 2026-09-23.1 --output /tmp/soupmap-overture.json
"""
import argparse
import json
import os
import re
import pyarrow.fs as pafs
import pyarrow.parquet as pq

parser = argparse.ArgumentParser()
parser.add_argument("--release", default="2026-09-23.1")
parser.add_argument("--output", default="/tmp/soupmap-overture.json")
args = parser.parse_args()
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", args.release):
    raise ValueError("Invalid Overture release")

WEST, SOUTH, EAST, NORTH = 122, 20, 154, 46
COLUMNS = ["id", "names", "taxonomy", "addresses", "sources", "confidence", "websites", "socials",
           "phones", "brand", "operating_status", "bbox"]
CATEGORY = re.compile(r"ramen|udon|soba|noodle|soup|oden")
NAME = re.compile(r"ラーメン|らーめん|拉麺|中華そば|つけ麺|担々麺|担担麺|うどん|饂飩|蕎麦|おでん")

proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
fs = pafs.S3FileSystem(anonymous=True, region="us-west-2", **({"proxy_options": proxy} if proxy else {}))
base = f"overturemaps-us-west-2/release/{args.release}/theme=places/type=place/"


def overlapping_row_groups(metadata):
    columns = {metadata.schema.column(i).path: i for i in range(metadata.num_columns)}
    for group in range(metadata.num_row_groups):
        row_group = metadata.row_group(group)
        xs = row_group.column(columns["bbox.xmin"]).statistics
        ys = row_group.column(columns["bbox.ymin"]).statistics
        if xs.max >= WEST and xs.min <= EAST and ys.max >= SOUTH and ys.min <= NORTH:
            yield group


def keep(row):
    bbox = row["bbox"]
    if not (WEST <= bbox["xmin"] <= EAST and SOUTH <= bbox["ymin"] <= NORTH):
        return False
    if not any((a or {}).get("country") == "JP" for a in (row["addresses"] or [])):
        return False
    if (row["operating_status"] or "open") in ("closed", "permanently_closed"):
        return False
    taxonomy = row["taxonomy"] or {}
    categories = " ".join([taxonomy.get("primary") or ""] + (taxonomy.get("alternates") or [])).lower()
    name = (row["names"] or {}).get("primary") or ""
    return bool(CATEGORY.search(categories) or ("restaurant" in (taxonomy.get("hierarchy") or []) and NAME.search(name)))


print(f"Querying Japan soup/noodle places from Overture {args.release}…", flush=True)
records = []
for info in fs.get_file_info(pafs.FileSelector(base)):
    if not info.path.endswith(".parquet"):
        continue
    parquet = pq.ParquetFile(info.path, filesystem=fs)
    for group in overlapping_row_groups(parquet.metadata):
        for row in parquet.read_row_group(group, columns=COLUMNS).to_pylist():
            if keep(row):
                row["lng"], row["lat"] = row["bbox"]["xmin"], row["bbox"]["ymin"]
                del row["bbox"]
                records.append(row)
if not records:
    raise RuntimeError("No records returned; existing catalog was not changed")
with open(args.output, "w") as out:
    json.dump({"release": args.release, "records": records}, out, ensure_ascii=False, default=str)
print(f"Wrote {len(records)} source records to {args.output}", flush=True)
