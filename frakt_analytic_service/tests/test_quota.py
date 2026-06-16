"""
Quota enforcement & billing integrity tests.

The core mechanism is an atomic SQL UPDATE WHERE usage_count < quota — these
tests verify that it blocks at the right boundary, that charges accumulate
correctly, and that the compensating refund fires when the worker fails.
"""

import pytest
from sqlalchemy import update

from app.database.models import Customer
from app.configs.tier_config import TIER_LIMITS

_GENERATE_PATH = "/v1/generate"
_PREDICTIVE_PATH = "/v1/generate-predictive"


def _gen_payload(template_name: str):
    return {
        "template_name": template_name,
        "params": {"points": [10, 20, 30, 40, 50]},
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    }


class TestPreFlightCharge:
    def test_successful_generate_increments_usage_by_one(
        self, client, db_session, test_customer, test_template
    ):
        customer, raw_key = test_customer
        template = test_template

        assert customer.usage_count == 0

        response = client.post(
            _GENERATE_PATH,
            json=_gen_payload(template.template_name),
            headers={"x-api-key": raw_key},
        )

        assert response.status_code == 200
        db_session.refresh(customer)
        assert customer.usage_count == 1

    def test_predictive_generate_charges_two_credits(
        self, client, db_session, test_customer, test_template
    ):
        customer, raw_key = test_customer
        template = test_template

        payload = {**_gen_payload(template.template_name), "ai_method": "linear"}
        response = client.post(
            _PREDICTIVE_PATH,
            json=payload,
            headers={"x-api-key": raw_key},
        )

        assert response.status_code == 200
        assert response.headers["x-usage-charged"] == "2"
        db_session.refresh(customer)
        assert customer.usage_count == 2

    def test_quota_exceeded_returns_403(
        self, client, db_session, test_customer, test_template
    ):
        customer, raw_key = test_customer
        template = test_template

        # Push usage to the pro-tier ceiling
        customer.usage_count = TIER_LIMITS["pro"]["quota"]
        db_session.commit()

        response = client.post(
            _GENERATE_PATH,
            json=_gen_payload(template.template_name),
            headers={"x-api-key": raw_key},
        )

        assert response.status_code == 403
        assert "quota" in response.json()["detail"].lower()

    def test_usage_not_incremented_when_quota_exceeded(
        self, client, db_session, test_customer, test_template
    ):
        customer, raw_key = test_customer
        template = test_template

        customer.usage_count = TIER_LIMITS["pro"]["quota"]
        db_session.commit()

        client.post(
            _GENERATE_PATH,
            json=_gen_payload(template.template_name),
            headers={"x-api-key": raw_key},
        )

        db_session.refresh(customer)
        assert customer.usage_count == TIER_LIMITS["pro"]["quota"]


class TestAtomicQuotaPattern:
    def test_conditional_update_only_succeeds_once_at_boundary(self, db_session, test_customer):
        """
        The UPDATE WHERE usage_count < quota pattern is race-condition-safe:
        only the first writer that finds usage_count < quota gets rowcount=1.
        Running it five times from usage_count=quota-1 produces exactly one
        success — the same guarantee a concurrent burst of requests would have.
        """
        customer, _ = test_customer
        free_quota = TIER_LIMITS["free"]["quota"]  # 100

        customer.tier = "free"
        customer.usage_count = free_quota - 1
        db_session.commit()

        successes = 0
        for _ in range(5):
            result = db_session.execute(
                update(Customer)
                .where(Customer.id == customer.id)
                .where(Customer.usage_count < free_quota)
                .values(usage_count=Customer.usage_count + 1)
            )
            db_session.commit()
            if result.rowcount > 0:
                successes += 1

        db_session.refresh(customer)
        assert successes == 1
        assert customer.usage_count == free_quota


class TestCompensatingRefund:
    def test_worker_failure_refunds_usage_credit(
        self, client, db_session, test_customer, test_template, mock_worker
    ):
        """
        If the worker raises an exception after the charge is committed,
        the compensating UPDATE must roll usage_count back to its original
        value before the 500 is returned.
        """
        customer, raw_key = test_customer
        template = test_template

        mock_worker.post.side_effect = Exception("Worker process died")

        response = client.post(
            _GENERATE_PATH,
            json=_gen_payload(template.template_name),
            headers={"x-api-key": raw_key},
        )

        assert response.status_code == 500
        db_session.refresh(customer)
        assert customer.usage_count == 0

    def test_worker_failure_on_predictive_refunds_two_credits(
        self, client, db_session, test_customer, test_template, mock_worker
    ):
        customer, raw_key = test_customer
        template = test_template

        mock_worker.post.side_effect = Exception("Worker timeout")

        payload = {**_gen_payload(template.template_name), "ai_method": "linear"}
        response = client.post(
            _PREDICTIVE_PATH,
            json=payload,
            headers={"x-api-key": raw_key},
        )

        assert response.status_code == 500
        db_session.refresh(customer)
        assert customer.usage_count == 0
