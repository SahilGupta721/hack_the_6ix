"""Auth0 access-token verification for the API.

Enforcement is env-gated so the core demo never depends on credentials:
- AUTH0_AUDIENCE unset: open mode. Dependencies return None and endpoints
  keep their v1 behaviour (client-asserted identity, Auth0 UI gate only).
- AUTH0_AUDIENCE set (an Auth0 API created in the dashboard): every guarded
  endpoint requires a Bearer access token, verified RS256 against the
  tenant's JWKS (cached client, fail-closed audience and issuer checks).
  Identity comes from the token's own `sub`; client-supplied subs are ignored.

Design notes vs the reference implementations we audited: JWKS keys are
fetched through a cached PyJWKClient (not per-request), verification fails
closed when configuration is missing in enforced mode, and there is no
in-band test bypass (tests use FastAPI dependency_overrides).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException, Request

ROLES_CLAIM = "https://innsight.app/roles"


def _domain() -> str | None:
    return os.environ.get("AUTH0_DOMAIN") or None


def _audience() -> str | None:
    return os.environ.get("AUTH0_AUDIENCE") or None


def enforcement_on() -> bool:
    return bool(_domain() and _audience())


@lru_cache(maxsize=1)
def _jwks_client() -> Any:
    import jwt

    return jwt.PyJWKClient(
        f"https://{_domain()}/.well-known/jwks.json",
        cache_keys=True,
        lifespan=3600,
    )


def _decode(token: str) -> dict[str, Any]:
    import jwt

    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=_audience(),
        issuer=f"https://{_domain()}/",
        options={"require": ["exp", "iss", "aud", "sub"]},
    )


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


async def current_claims(request: Request) -> dict[str, Any] | None:
    """Verified token claims, or None in open mode."""
    if not enforcement_on():
        return None
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        return _decode(token)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid or expired token")


async def current_sub(
    claims: dict[str, Any] | None = Depends(current_claims),
) -> str | None:
    """The verified user id, or None in open mode."""
    return claims.get("sub") if claims else None


def require_role(role: str):
    """Route dependency: in enforced mode the access token must carry the
    role in our namespaced claim; open mode passes through."""

    async def _check(
        claims: dict[str, Any] | None = Depends(current_claims),
    ) -> None:
        if claims is None:
            return
        roles = claims.get(ROLES_CLAIM) or []
        if role not in roles:
            raise HTTPException(
                status_code=403, detail=f"requires the {role} role"
            )

    return _check
