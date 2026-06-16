"""
Authentication & API key security tests.

Covers: key hashing, prefix format, 401/422 gating, soft-delete revocation,
and key rotation invalidating the previous credential.
"""

import pytest
from app.database.models import Customer
from app.routers.utils import generate_secure_api_key
from app.middleware.middleware import hash_api_key


class TestApiKeyFormat:
    def test_generated_key_has_frakt_live_prefix(self):
        raw_key, _ = generate_secure_api_key()
        assert raw_key.startswith("frakt_live_")

    def test_hashed_key_is_64_hex_chars(self):
        raw_key, hashed = generate_secure_api_key()
        assert len(hashed) == 64
        assert all(c in "0123456789abcdef" for c in hashed)

    def test_raw_key_not_stored_in_db(self, db_session, test_customer):
        customer, raw_key = test_customer
        assert customer.hashed_api_key != raw_key

    def test_hash_is_deterministic(self):
        key = "frakt_live_test123"
        assert hash_api_key(key) == hash_api_key(key)

    def test_different_keys_produce_different_hashes(self):
        _, h1 = generate_secure_api_key()
        _, h2 = generate_secure_api_key()
        assert h1 != h2


class TestAuthenticationGating:
    def test_valid_key_returns_200(self, client, test_customer):
        customer, raw_key = test_customer
        response = client.get("/v1/customers/me", headers={"x-api-key": raw_key})
        assert response.status_code == 200

    def test_wrong_key_returns_401(self, client, test_customer):
        response = client.get(
            "/v1/customers/me",
            headers={"x-api-key": "frakt_live_totallywrongkey"},
        )
        assert response.status_code == 401

    def test_missing_key_header_returns_422(self, client, test_customer):
        # x-api-key is a required Header — omitting it triggers FastAPI validation
        response = client.get("/v1/customers/me")
        assert response.status_code == 422

    def test_inactive_account_is_rejected(self, client, db_session, test_customer):
        customer, raw_key = test_customer
        customer.is_active = False
        db_session.commit()

        response = client.get("/v1/customers/me", headers={"x-api-key": raw_key})
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()


class TestKeyRotation:
    def test_rotate_returns_new_key(self, client, test_customer):
        _, raw_key = test_customer
        response = client.post(
            "/v1/customers/rotate-key", headers={"x-api-key": raw_key}
        )
        assert response.status_code == 200
        assert "api_key" in response.json()
        new_key = response.json()["api_key"]
        assert new_key.startswith("frakt_live_")

    def test_old_key_is_invalid_after_rotation(self, client, test_customer):
        _, raw_key = test_customer

        client.post("/v1/customers/rotate-key", headers={"x-api-key": raw_key})

        response = client.get("/v1/customers/me", headers={"x-api-key": raw_key})
        assert response.status_code == 401

    def test_new_key_works_after_rotation(self, client, test_customer):
        _, raw_key = test_customer

        rotate_response = client.post(
            "/v1/customers/rotate-key", headers={"x-api-key": raw_key}
        )
        new_key = rotate_response.json()["api_key"]

        response = client.get("/v1/customers/me", headers={"x-api-key": new_key})
        assert response.status_code == 200


class TestRegistration:
    def test_registration_returns_api_key(self, client):
        response = client.post(
            "/v1/customers/register",
            json={"name": "Alice", "email": "alice@example.com"},
        )
        assert response.status_code == 201
        body = response.json()
        assert "api_key" in body
        assert body["api_key"].startswith("frakt_live_")

    def test_duplicate_email_returns_409(self, client, test_customer):
        customer, _ = test_customer
        response = client.post(
            "/v1/customers/register",
            json={"name": "Dup", "email": customer.email},
        )
        assert response.status_code == 409

    def test_account_deactivation_revokes_access(self, client, test_customer):
        _, raw_key = test_customer

        client.delete("/v1/customers/me", headers={"x-api-key": raw_key})

        response = client.get("/v1/customers/me", headers={"x-api-key": raw_key})
        assert response.status_code == 401
