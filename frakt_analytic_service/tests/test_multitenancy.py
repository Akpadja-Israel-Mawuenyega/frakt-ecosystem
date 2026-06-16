"""
Multi-tenancy isolation tests.

Every database query in Frakt is scoped by owner_id. These tests verify
that a customer cannot read, write, or generate from another customer's
templates — even with a valid API key.
"""

import pytest
from app.database.models import Customer, SVGTemplate
from app.routers.utils import generate_secure_api_key


def _make_customer(db, name: str, email: str, tier: str = "pro") -> tuple:
    raw_key, hashed_key = generate_secure_api_key()
    customer = Customer(
        name=name,
        email=email,
        hashed_api_key=hashed_key,
        tier=tier,
        usage_count=0,
        is_active=True,
    )
    db.add(customer)
    db.flush()
    return customer, raw_key


def _make_template(db, owner_id: str, name: str) -> SVGTemplate:
    t = SVGTemplate(
        owner_id=owner_id,
        template_name=name,
        template_code='svg_output = "<svg/>"',
        required_params={},
    )
    db.add(t)
    db.flush()
    return t


class TestGenerationIsolation:
    def test_customer_cannot_generate_from_another_customers_template(
        self, client, db_session
    ):
        """
        Customer A holds a valid API key, but the template is owned by Customer B.
        The generation router checks owner_id and must return 403.
        """
        customer_a, key_a = _make_customer(db_session, "Alice", "alice@example.com")
        customer_b, _ = _make_customer(db_session, "Bob", "bob@example.com")
        _make_template(db_session, customer_b.id, "bob_private_chart")
        db_session.commit()

        response = client.post(
            "/v1/generate",
            json={
                "template_name": "bob_private_chart",
                "params": {"points": [1, 2, 3, 4, 5]},
            },
            headers={"x-api-key": key_a},
        )

        assert response.status_code == 403

    def test_unknown_template_name_returns_404(self, client, db_session, test_customer):
        _, key = test_customer

        response = client.post(
            "/v1/generate",
            json={
                "template_name": "does_not_exist",
                "params": {"points": [1, 2, 3, 4, 5]},
            },
            headers={"x-api-key": key},
        )

        assert response.status_code == 404


class TestTemplateListIsolation:
    def test_list_returns_only_owned_templates(self, client, db_session):
        customer_a, key_a = _make_customer(db_session, "A", "a@example.com")
        customer_b, _ = _make_customer(db_session, "B", "b@example.com")

        _make_template(db_session, customer_a.id, "chart_a1")
        _make_template(db_session, customer_a.id, "chart_a2")
        _make_template(db_session, customer_b.id, "chart_b1")
        db_session.commit()

        response = client.get("/v1/templates/", headers={"x-api-key": key_a})

        assert response.status_code == 200
        templates = response.json()
        assert len(templates) == 2
        assert all(t["owner_id"] == customer_a.id for t in templates)

    def test_customer_with_no_templates_gets_empty_list(self, client, db_session):
        _, key = _make_customer(db_session, "Empty", "empty@example.com")
        db_session.commit()

        response = client.get("/v1/templates/", headers={"x-api-key": key})

        assert response.status_code == 200
        assert response.json() == []


class TestTemplateFetchIsolation:
    def test_fetching_another_customers_template_by_id_returns_404(
        self, client, db_session
    ):
        """
        The template router filters by both id AND owner_id, so a foreign
        template ID returns 404 rather than exposing its existence.
        """
        customer_a, key_a = _make_customer(db_session, "A", "a@example.com")
        customer_b, _ = _make_customer(db_session, "B", "b@example.com")
        template_b = _make_template(db_session, customer_b.id, "secret")
        db_session.commit()
        db_session.refresh(template_b)

        response = client.get(
            f"/v1/templates/{template_b.id}", headers={"x-api-key": key_a}
        )

        assert response.status_code == 404


class TestTemplateDuplicateConstraint:
    def test_same_name_allowed_for_different_customers(self, client, db_session):
        """
        The unique constraint is (owner_id, template_name) — two different
        customers are allowed to each have a template named 'line_chart'.
        """
        _, key_a = _make_customer(db_session, "A", "a@example.com")
        _, key_b = _make_customer(db_session, "B", "b@example.com")
        db_session.commit()

        payload = {
            "template_name": "line_chart",
            "template_code": 'svg_output = "<svg/>"',
            "required_params": {},
        }

        r_a = client.post("/v1/templates/", json=payload, headers={"x-api-key": key_a})
        r_b = client.post("/v1/templates/", json=payload, headers={"x-api-key": key_b})

        assert r_a.status_code == 201
        assert r_b.status_code == 201

    def test_duplicate_name_for_same_customer_returns_409(self, client, db_session):
        _, key = _make_customer(db_session, "Solo", "solo@example.com")
        db_session.commit()

        payload = {
            "template_name": "my_chart",
            "template_code": 'svg_output = "<svg/>"',
            "required_params": {},
        }

        client.post("/v1/templates/", json=payload, headers={"x-api-key": key})
        r2 = client.post("/v1/templates/", json=payload, headers={"x-api-key": key})

        assert r2.status_code == 409
