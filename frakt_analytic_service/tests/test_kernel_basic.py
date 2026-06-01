import pytest
from core.generator import generate_svg_from_template


def test_complex_line_graph_generation():
    # A sophisticated template that calculates SVG points from a list
    test_template = """
# Calculate coordinates dynamically
data = params.get('data', [])
max_val = max(data) if data else 1
width = 400
height = 200

# Generate polyline points (scaling data to SVG viewbox)
points_str = ""
for i, val in enumerate(data):
    x = (i / (len(data) - 1)) * width if len(data) > 1 else 0
    y = height - (val / max_val * height)
    points_str += f"{x},{y} "

# Construct SVG with a path and axis
svg_output = f'''
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f9f9f9"/>
    <polyline points="{points_str}" fill="none" stroke="#007bff" stroke-width="3" />
    <text x="10" y="20" font-family="Arial" font-size="12">AI Predictive Trend</text>
</svg>
'''
    """

    # Mock data that might come from your AI Engine
    test_params = {"data": [10, 45, 20, 80, 60, 100]}

    result = generate_svg_from_template(
        template_code=test_template, params=test_params, metadata={}
    )

    # Assertions to ensure logic was processed
    assert "<polyline points=" in result
    assert 'stroke="#007bff"' in result
    print(result)

    # Save it so you can actually look at it!
    with open("complex_graph.svg", "w") as f:
        f.write(result)

    print("\n Complex Line Graph Generated: complex_graph.svg")
