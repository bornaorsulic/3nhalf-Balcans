"""Explicit live smoke test of configured providers; uses only a generic prompt.

    python scripts/check_providers.py --live

May consume a small amount of API credit. No patient data is sent.
"""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import Settings
from backend.amass import AmassClient
from backend.nebius import NebiusClient, ProviderFailure
from pydantic import BaseModel

class Probe(BaseModel):
    ok: bool

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Allow small, credit-consuming provider calls')
    args = parser.parse_args()
    config = Settings.from_env()
    configured = {'nebius': bool(config.nebius_api_key and config.nebius_model), 'amass': bool(config.amass_api_key)}
    print(json.dumps({'configured': configured}))
    if not args.live:
        print('No requests sent. Use --live to check the configured providers.')
        return
    ok = all(configured.values())
    if configured['nebius']:
        try:
            raw = NebiusClient(config).complete([{'role':'user', 'content':'Return JSON with ok set to true.'}], Probe.model_json_schema())
            result = Probe.model_validate_json(raw)
            print('Nebius JSON response:', 'PASS' if result.ok else 'FAIL')
            ok = ok and result.ok
        except (ProviderFailure, ValueError) as exc:
            print('Nebius: FAIL', exc.reason if isinstance(exc, ProviderFailure) else 'invalid JSON')
            ok = False
    if configured['amass']:
        result = AmassClient(config, lambda _: []).search('sleep metabolic health')
        print('AMASS:', 'PASS' if result.origin == 'amass' else 'FAIL: no usable live evidence')
        ok = ok and result.origin == 'amass'
    if not ok:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
