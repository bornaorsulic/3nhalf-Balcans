"""Server-only settings. Never import these into frontend code."""
from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env.local', override=False)

@dataclass(frozen=True)
class Settings:
    nebius_api_key: str = ''
    nebius_base_url: str = 'https://api.tokenfactory.nebius.com/v1'
    nebius_model: str = ''
    amass_api_key: str = ''
    amass_base_url: str = 'https://api.amass.tech/api/v1'
    model_timeout: float = 120
    research_timeout: float = 15
    max_tokens: int = 2200
    backend_token: str = ''

    @classmethod
    def from_env(cls):
        amass_base_url = os.getenv('AMASS_BASE_URL') or cls.amass_base_url
        if amass_base_url.strip() in ('...', '<AMASS_BASE_URL>'):
            amass_base_url = cls.amass_base_url
        return cls(
            nebius_api_key=os.getenv('NEBIUS_API_KEY', ''),
            nebius_base_url=os.getenv('NEBIUS_BASE_URL') or cls.nebius_base_url,
            nebius_model=os.getenv('NEBIUS_MODEL', ''),
            amass_api_key=os.getenv('AMASS_API_KEY', ''),
            amass_base_url=amass_base_url,
            model_timeout=min(120, max(1, float(os.getenv('NEBIUS_TIMEOUT_SECONDS', '120')))),
            research_timeout=min(15, max(1, float(os.getenv('AMASS_TIMEOUT_SECONDS', '15')))),
            max_tokens=min(4096, max(256, int(os.getenv('NEBIUS_MAX_TOKENS', '2200')))),
            backend_token=os.getenv('HEALTH_AGENT_BACKEND_TOKEN', ''),
        )
