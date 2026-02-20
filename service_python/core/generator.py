# service_python/generator.py

import os
import json
import math
from typing import Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor, TimeoutError
from logging_config import logger


class TemplateExecutionError(Exception):
    """
    Custom exception raised when SVG template logic fails or violates safety constraints.
    """

    pass


SAFE_MODULES = {
    "json": json,
    "math": math,
}

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


executor = ProcessPoolExecutor(max_workers=os.cpu_count() or 2)


def _worker_execute(
    template_code: str, params: Dict[str, Any], metadata: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Internal execution sandbox running in a separate OS process.

    This function uses 'exec' within a restricted global scope to evaluate
    user-provided Python code. It isolates the execution to prevent
    infinite loops or crashes from affecting the main FastAPI application.
    """
    globals_scope = {"__builtins__": ALLOWED_FUNCS}
    globals_scope.update(SAFE_MODULES)

    # REQUIRED: The template_code must assign the final SVG string to 'svg_output'
    execution_scope = {
        "params": params,
        "metadata": metadata or {},
        "svg_output": None,
    }

    try:
        exec(template_code, globals_scope, execution_scope)
        return {"status": "success", "output": execution_scope.get("svg_output")}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)}"}


def generate_svg_from_template(
    template_code: str, params: Dict[str, Any], metadata: Optional[Dict[str, Any]]
) -> str:
    """
    Orchestrates the SVG generation process with safety timeouts.

    Submits the template code to the ProcessPoolExecutor and waits up to 2.0s
    for completion. This ensures that 'Heavy' or 'Malicious' code (like
    while True loops) is forcibly terminated, protecting system resources.

    Returns:
        str: The generated SVG string.

    Raises:
        TemplateExecutionError: If execution times out, fails logic, or
                                fails to produce a valid string.
    """
    logger.info("Dispatching execution to isolated worker process...")

    future = executor.submit(_worker_execute, template_code, params, metadata)

    try:
        result = future.result(timeout=2.0)

        if result["status"] == "error":
            logger.warning(f"Template logic error reported: {result['message']}")
            raise TemplateExecutionError(f"Logic Error: {result['message']}")

        svg_content = result.get("output")

        if not isinstance(svg_content, str) or not svg_content.strip():
            raise TemplateExecutionError(
                "Template executed but failed to define 'svg_output' as a string."
            )

        return svg_content

    except TimeoutError:
        logger.error("Template execution timed out (2.0s limit reached).")
        raise TemplateExecutionError("Execution exceeded the 2-second safety limit.")

    except TemplateExecutionError:
        raise

    except Exception as e:
        logger.error(f"System failure in generator: {e}")
        raise TemplateExecutionError(f"Internal generation system error: {e}")
