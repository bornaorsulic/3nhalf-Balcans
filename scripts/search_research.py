"""Search the stored research evidence (Amass stand-in).

    python3 scripts/search_research.py sleep
    python3 scripts/search_research.py            # list everything

Today this is a text search over the `research_sources` table, which holds the
papers the demo cites. When the Amass API is connected, keep the same output
shape (id, title, detail, url) and the agent will not need to change.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.retrieval import get_research, search_research  # noqa: E402


def main() -> None:
    query = " ".join(sys.argv[1:]).strip()
    results = search_research(query, limit=20) if query else get_research(limit=50)

    label = f"matching '{query}'" if query else "stored"
    print(f"\n{len(results)} research source(s) {label}:\n")

    for item in results:
        print(f"- {item['title']}")
        if item.get("detail"):
            print(f"    {item['detail']}")
        if item.get("url"):
            print(f"    {item['url']}")

    if not results:
        print("  (nothing found — run scripts/ingest_patient.py to load the demo data)")


if __name__ == "__main__":
    main()
