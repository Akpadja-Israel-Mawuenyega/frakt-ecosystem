import pytest
from core.generator import generate_svg_from_template


def test_basic_svg_generation():
    # The variable name MUST be 'svg_output' to match the kernel's expectation
    test_template = """
x = params.get('x', 0)
y = params.get('y', 0)
svg_output = f'<svg><circle cx="{x}" cy="{y}" r="40" fill="blue" /></svg>'
    """

    test_params = {"x": 50, "y": 50}

    # Execute through the Kernel
    result = generate_svg_from_template(
        template_code=test_template, params=test_params, metadata={}
    )

    assert "<svg>" in result
    assert 'cx="50"' in result
    assert 'fill="blue"' in result
    print(result)
