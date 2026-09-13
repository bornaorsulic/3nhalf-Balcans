"""Signed-in API clients for tests that need a real record behind them.

These need the seeded demo database (README step 3). Tests that use them skip
rather than fail when it is not there, so `pytest` still runs on a fresh checkout.
"""

import pytest
from fastapi.testclient import TestClient

from backend import api

PASSWORD = "demo1234"


def _signed_in(email):
    client = TestClient(api.app)
    try:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    except Exception as error:  # no database configured for this checkout
        pytest.skip(f"needs the seeded demo database ({type(error).__name__})")
    if response.status_code != 200:
        pytest.skip(f"needs the seeded demo accounts ({email} -> {response.status_code})")
    return client, response.json()


@pytest.fixture
def demo_clinician():
    """Dr. Eriksson, connected to the demo patient."""
    client, _ = _signed_in("eriksson@demo.health")
    with client:
        yield client, "demo"


@pytest.fixture
def demo_patient():
    """Sofia, acting on her own record."""
    client, user = _signed_in("sofia@demo.health")
    with client:
        yield client, user["patientId"]
