"""Refresh the small, attributed O*NET title vocabulary used by Discover."""

import json
import urllib.request
from pathlib import Path

SOURCE = "https://www.onetcenter.org/dl_files/database/db_31_0_json/sample_of_reported_titles.json"
CODES = {"15-1211.00", "15-1231.00", "15-1232.00", "15-1244.00", "15-1242.00", "15-1253.00"}
with urllib.request.urlopen(SOURCE, timeout=30) as response:
    data = json.load(response)
rows = [row for row in data["row"] if row["onetsoc_code"] in CODES]
result = {
    "source": SOURCE,
    "version": "31.0",
    "attribution": "O*NET OnLine / U.S. Department of Labor, Employment and Training Administration. Adapted under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/",
    "titles": [{"code": row["onetsoc_code"], "title": row["reported_job_title"]} for row in rows],
}
Path("apps/web/src/lib/discovery/occupation-titles.json").write_text(
    json.dumps(result, indent=2) + "\n"
)
print(f"Saved {len(rows)} occupation titles.")
