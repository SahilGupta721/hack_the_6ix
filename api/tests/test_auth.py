"""Enforced-mode auth behaviour: no token means 401, garbage means 401,
open mode stays open. No network: invalid tokens fail before any JWKS fetch."""

import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("AUTH0_DOMAIN", "unit-test.auth0.local")
    monkeypatch.setenv("AUTH0_AUDIENCE", "https://innsight-api.test")
    import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


@pytest.fixture()
def open_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("AUTH0_AUDIENCE", raising=False)
    import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


def test_enforced_runs_mine_requires_token(client: TestClient) -> None:
    res = client.get("/runs/mine", params={"auth0_sub": "auth0|attacker"})
    assert res.status_code == 401


def test_enforced_rejects_garbage_token(client: TestClient) -> None:
    res = client.get(
        "/runs/mine",
        params={"auth0_sub": "auth0|attacker"},
        headers={"Authorization": "Bearer not.a.jwt"},
    )
    assert res.status_code == 401


def test_enforced_memo_requires_token(client: TestClient) -> None:
    res = client.post("/memo", json={"building_type": "boutique", "rooms": 40})
    assert res.status_code == 401


def test_open_mode_unchanged(open_client: TestClient) -> None:
    res = open_client.post(
        "/compare", json={"building_type": "boutique", "rooms": 40}
    )
    assert res.status_code == 200
    assert res.json()["recommended"] in ("A", "B")
