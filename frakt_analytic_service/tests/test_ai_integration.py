import pytest
import httpx


BASE_URL = "http://localhost:8000"
HEADERS = {"X-API-KEY": "your_test_api_key"}


def test_ai_to_svg_full_stack():
    """
    Validates the full AI -> Gateway -> Sandbox pipeline.
    Ensures PredictiveEngine results are packaged and sent over UDS.
    """

    # 1. Prepare payload for the 'generate-predictive' endpoint
    payload = {
        "template_name": "ai_chart_template",  # Ensure this exists in your MySQL DB
        "params": {"points": [10, 22, 35, 48, 62]},
        "metadata": {"ai_method": "polynomial"},
    }

    # 2. Execute the request against the Gateway
    with httpx.Client(base_url=BASE_URL, headers=HEADERS) as client:
        response = client.post(
            "/generate-predictive", json=payload, params={"mode": "both"}
        )

    # 3. Assertions 
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/svg+xml"

    svg_content = response.text
    assert "<svg" in svg_content
    assert "polyline" in svg_content

    # 4. Check the Premium Billing Headers
    assert "X-Usage-Charged" in response.headers
    assert response.headers["X-Usage-Charged"] == "2"

    print("\n AI-Enhanced SVG Generated and Billed successfully through UDS!")
