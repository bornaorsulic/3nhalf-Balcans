"""Print one patient's stored data, the way the API returns it.

    python3 scripts/inspect_patient.py            # the demo patient
    python3 scripts/inspect_patient.py P001
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# backend/retrieval.py prints the full patient context when run directly.
if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parent.parent / "backend" / "retrieval.py"), run_name="__main__")
