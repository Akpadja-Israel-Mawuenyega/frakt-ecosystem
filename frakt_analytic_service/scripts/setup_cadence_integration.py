# service_python/scripts/setup_cadence_integration.py
"""
One-time provisioning script for the Cadence <-> Frakt integration.

Registers a Frakt tenant ("Cadence Study Planner") and the shared
`cadence_line_forecast_v1` chart template, then prints the .env values
Cadence needs to call /v1/generate and /v1/generate-predictive.

Usage (from frakt_analytic_service/, with the gateway running):
    python -m scripts.setup_cadence_integration

Environment overrides:
    FRAKT_BASE_URL          Base URL of the running Frakt gateway
                            (default: http://127.0.0.1:8000)
    CADENCE_CUSTOMER_NAME   Display name for the Frakt tenant
                            (default: "Cadence Study Planner")
    CADENCE_CUSTOMER_EMAIL  Email used to register the tenant
                            (default: "cadence-platform@cadence-study-planner.app")

Notes:
    - The Worker process is NOT required for this script — registration
      only touches the Gateway + database. Start it before generating
      real charts from Cadence.
    - Frakt issues the raw API key ONCE, on registration, and never again.
      If a customer with this email already exists, re-running this script
      fails with 409. Either set CADENCE_CUSTOMER_EMAIL to a fresh address,
      or authenticate as the existing customer and call
      POST /v1/customers/rotate-key to mint a new key for that account.
    - New accounts start on the "free" tier (100 request quota).
      /v1/generate-predictive deducts 2 credits per call — upgrade the
      tier directly in the database for real usage.
"""

import os
import sys

import httpx

from scripts.templates.cadence_line_forecast_v1 import (
    TEMPLATE_CODE,
    REQUIRED_PARAMS,
    TEMPLATE_NAME,
)

FRAKT_BASE_URL = os.environ.get("FRAKT_BASE_URL", "http://127.0.0.1:8000")
CUSTOMER_NAME = os.environ.get("CADENCE_CUSTOMER_NAME", "Cadence Study Planner")
CUSTOMER_EMAIL = os.environ.get("CADENCE_CUSTOMER_EMAIL", "cadence-platform@cadence-study-planner.app")


def main() -> int:
    print(f"Frakt gateway: {FRAKT_BASE_URL}")
    print(f"Registering customer '{CUSTOMER_NAME}' <{CUSTOMER_EMAIL}>...")

    try:
        with httpx.Client(base_url=FRAKT_BASE_URL, timeout=10.0) as client:
            resp = client.post(
                "/v1/customers/register",
                json={"name": CUSTOMER_NAME, "email": CUSTOMER_EMAIL},
            )

            if resp.status_code == 409:
                print(
                    "\nERROR: A customer with this email is already registered.\n"
                    "Frakt never re-issues a raw API key for an existing account.\n"
                    "Either:\n"
                    "  - set CADENCE_CUSTOMER_EMAIL to a new address and re-run, or\n"
                    "  - authenticate as the existing customer and call\n"
                    "    POST /v1/customers/rotate-key to mint a fresh key, then\n"
                    "    register the template manually with that key.\n"
                )
                return 1

            resp.raise_for_status()
            data = resp.json()
            api_key = data["api_key"]
            customer_id = data["customer_id"]
            print(f"Customer registered: {customer_id}")

            print(f"Registering chart template '{TEMPLATE_NAME}'...")
            resp = client.post(
                "/v1/templates/",
                headers={"x-api-key": api_key},
                json={
                    "template_name": TEMPLATE_NAME,
                    "template_code": TEMPLATE_CODE,
                    "required_params": REQUIRED_PARAMS,
                },
            )
            resp.raise_for_status()
            print(f"Template registered: {resp.json()}")

    except httpx.ConnectError:
        print(
            f"\nERROR: Could not reach the Frakt gateway at {FRAKT_BASE_URL}.\n"
            "Start it first, e.g. from frakt_analytic_service/: python main.py\n"
        )
        return 1

    print("\n" + "=" * 70)
    print("Add the following to cadence_study_planner/.env.local:")
    print("=" * 70)
    print(f"FRAKT_API_URL={FRAKT_BASE_URL}")
    print(f"FRAKT_API_KEY={api_key}")
    print(f"FRAKT_CHART_TEMPLATE={TEMPLATE_NAME}")
    print("=" * 70)
    print(
        "\nStore this API key securely - Frakt will not display it again.\n"
        "If lost, authenticate with it once and call POST /v1/customers/rotate-key\n"
        "to issue a replacement."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
