import pytest
from core.ai_engine import PredictiveEngine
from core.generator import generate_svg_from_template


def test_ai_to_svg_workflow():
    user_data = [10, 22, 35, 48, 62]

    ai_result = PredictiveEngine.get_trend(user_data)

    assert "forecast" in ai_result
    combined_data = ai_result["forecast"]

    ai_template = """
data = params.get('data', [])
points = ""
for i, val in enumerate(data):
    x = i * 50
    y = 150 - val
    points += f"{x},{y} "
    
# Style the line: Red if it's a prediction, Blue if it's real
svg_output = f'<svg width="500" height="200"><polyline points="{points}" fill="none" stroke="purple" stroke-width="3" stroke-dasharray="5,5"/></svg>'
    """

    svg_output = generate_svg_from_template(ai_template, {"data": combined_data}, {})

    assert "polyline" in svg_output
    print(svg_output)
    print("\n AI-Enhanced SVG Generated successfully!")
