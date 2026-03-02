# worker/generator.py

import os
import json
import math
import logging
from typing import Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor, TimeoutError

logger = logging.getLogger("worker")


class TemplateExecutionError(Exception):
    """
    Raised when template execution violates safety constraints or fails internal logic.
    Used to signal the Worker to return a 400 Bad Request to the Gateway.
    """

    pass


# Whitelist-only environment to prevent arbitrary code execution (ACE)
SAFE_MODULES = {"json": json, "math": math}
ALLOWED_FUNCS = {
    "str": str,
    "int": int,
    "float": float,
    "dict": dict,
    "list": list,
    "tuple": tuple,
    "len": len,
    "min": min,
    "max": max,
    "range": range,
    "sum": sum,
    "round": round,
    "enumerate": enumerate,
}

# Persistent process pool to avoid the overhead of spawning new OS processes per request.
# Provides a secondary layer of isolation within the Docker container.
executor = ProcessPoolExecutor(max_workers=os.cpu_count() or 2)


def _worker_execute(
    template_code: str, params: Dict[str, Any], metadata: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Executes raw Python code within a restricted namespace.

    This is the lowest-level sandbox. It isolates the execution scope so that
    template variables cannot leak into the worker's own memory space.

    Args:
        template_code: The Python string to be evaluated.
        params: Client-provided data for SVG rendering.
        metadata: Optional configuration (colors, dimensions, branding).

    Returns:
        A dictionary containing the 'success' status and the 'svg_output' string.
    """
    globals_scope = {"__builtins__": ALLOWED_FUNCS}
    globals_scope.update(SAFE_MODULES)

    # execution_scope acts as the local variable store for the 'exec' call
    execution_scope = {"params": params, "metadata": metadata or {}, "svg_output": None}

    try:
        exec(template_code, globals_scope, execution_scope)
        return {"status": "success", "output": execution_scope.get("svg_output")}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)}"}


def generate_svg_from_template(
    template_code: str, params: Dict[str, Any], metadata: Optional[Dict[str, Any]]
) -> str:
    """
    Orchestrates the sandboxed execution with strict resource enforcement.

    Uses a ProcessPoolExecutor to run the execution in a separate OS process,
    allowing for a hard 2.0s timeout to prevent 'while True' loops or
    computationally expensive 'zip bombs' from hanging the worker.

    Returns:
        The generated SVG string.

    Raises:
        TemplateExecutionError: If execution times out, returns invalid types,
                                or encounters a Python Exception.
    """
    future = executor.submit(_worker_execute, template_code, params, metadata)

    try:
        result = future.result(timeout=2.0)

        if result["status"] == "error":
            raise TemplateExecutionError(result["message"])

        svg_content = result.get("output")
        if not isinstance(svg_content, str):
            raise TemplateExecutionError(
                "The template failed to produce a valid 'svg_output' string."
            )

        return svg_content

    except TimeoutError:
        logger.error("Template execution exceeded the 2.0s security limit.")
        raise TemplateExecutionError("Execution timed out (2.0s safety limit reached).")
    except Exception as e:
        logger.error(f"Sandbox system failure: {str(e)}")
        raise TemplateExecutionError(str(e))
