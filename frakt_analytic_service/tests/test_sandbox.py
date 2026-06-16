"""
RestrictedPython sandbox security tests.

Tests the five-layer defense model in generator.py directly (not via HTTP)
so failures are precisely located:
  Layer 1 — compile-time AST rewriting blocks dunder attribute traversal
  Layer 2 — whitelist-only builtins (no open, no import, no eval)
  Layer 3 — process isolation via ProcessPoolExecutor (not tested here —
             OS-level property)
  Layer 4 — 2-second hard timeout kills infinite loops
  Layer 5 — type enforcement: execution must produce a non-empty str
"""

import pytest
from worker.generator import generate_svg_from_template, TemplateExecutionError

MINIMAL_SVG = '<svg viewBox="0 0 800 250" xmlns="http://www.w3.org/2000/svg"><path d=""/></svg>'


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
class TestValidTemplates:
    def test_plain_string_assignment_produces_svg(self):
        code = f"svg_output = '{MINIMAL_SVG}'"
        result = generate_svg_from_template(code, {}, {})
        assert result == MINIMAL_SVG

    def test_params_are_accessible(self):
        code = 'title = params.get("title", "n/a")\nsvg_output = "<svg>" + title + "</svg>"'
        result = generate_svg_from_template(code, {"title": "hello"}, {})
        assert result == "<svg>hello</svg>"

    def test_math_module_is_available(self):
        code = 'pi = str(round(math.pi, 4))\nsvg_output = "<svg>" + pi + "</svg>"'
        result = generate_svg_from_template(code, {}, {})
        assert "3.1416" in result

    def test_json_module_is_available(self):
        code = 'data = json.dumps({"x": 1})\nsvg_output = "<svg>" + data + "</svg>"'
        result = generate_svg_from_template(code, {}, {})
        assert '{"x": 1}' in result

    def test_allowed_builtins_work(self):
        code = (
            "nums = [3, 1, 4, 1, 5]\n"
            "total = str(sum(nums))\n"
            "mx = str(max(nums))\n"
            "svg_output = '<svg>' + total + ',' + mx + '</svg>'"
        )
        result = generate_svg_from_template(code, {}, {})
        assert "14,5" in result


# ---------------------------------------------------------------------------
# Layer 1 — dunder attribute access blocked via AST rewriting
# ---------------------------------------------------------------------------
class TestDunderBlocking:
    def test_dunder_class_access_raises(self):
        """RestrictedPython rewrites __class__ access; the guarded _getattr_
        in safe_globals raises AttributeError for private names."""
        code = 'x = "hello".__class__\nsvg_output = str(x)'
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_subclasses_escape_chain_is_blocked(self):
        """Classic sandbox escape: ().__class__.__bases__[0].__subclasses__()
        Each dunder access goes through the guarded _getattr_ which blocks it."""
        code = (
            "x = ().__class__.__bases__[0].__subclasses__()\n"
            "svg_output = str(x)"
        )
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})


# ---------------------------------------------------------------------------
# Layer 2 — whitelist-only builtins
# ---------------------------------------------------------------------------
class TestBuiltinWhitelist:
    def test_open_is_not_available(self):
        code = 'f = open("/etc/passwd", "r")\nsvg_output = f.read()'
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_import_is_blocked(self):
        code = "import os\nsvg_output = os.listdir('.')"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_eval_is_not_available(self):
        code = "svg_output = eval('\"<svg/>\"')"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_exec_is_not_available(self):
        code = "exec('svg_output = \"<svg/>\"')"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})


# ---------------------------------------------------------------------------
# Layer 4 — time-boxing
# ---------------------------------------------------------------------------
class TestTimeout:
    def test_infinite_loop_is_killed_after_two_seconds(self):
        """while True loops are not blocked at compile time, but the
        ProcessPoolExecutor timeout terminates the subprocess at 2.0 s."""
        code = "while True:\n    pass\nsvg_output = 'done'"
        with pytest.raises(TemplateExecutionError, match="timed out"):
            generate_svg_from_template(code, {}, {})


# ---------------------------------------------------------------------------
# Layer 5 — type enforcement
# ---------------------------------------------------------------------------
class TestTypeEnforcement:
    def test_integer_output_is_rejected(self):
        code = "svg_output = 42"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_none_output_is_rejected(self):
        code = "svg_output = None"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})

    def test_missing_svg_output_variable_is_rejected(self):
        code = "result = '<svg/>'"
        with pytest.raises(TemplateExecutionError):
            generate_svg_from_template(code, {}, {})
