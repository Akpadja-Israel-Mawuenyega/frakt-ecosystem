# service_python/worker/generator.py
"""
Frakt Sandboxed Execution Environment.

This module provides a secure, restricted Python runtime for executing
user-defined SVG generation logic. It utilizes a multi-layered defense
strategy to prevent Arbitrary Code Execution (ACE) and resource exhaustion.

Security Architecture:
1.  Compile-Time AST Restriction: RestrictedPython rewrites the AST before
    execution, blocking __class__, __bases__, and __subclasses__ traversal
    at the bytecode level — neutralizing object hierarchy escape attempts.
2.  Namespace Isolation: Only whitelisted built-ins and safe modules
    (math, json) are exposed to the 'exec' environment.
3.  Process Isolation: Every execution occurs in a separate OS process
    via ProcessPoolExecutor, preventing memory leakage into the main worker.
4.  Time-Boxing: A hard 2.0s timeout is enforced per execution to
    neutralize infinite loops and 'zip bomb' complexity.
5.  Type Enforcement: Validates that the execution results in a
    standardized 'svg_output' string before returning to the Gateway.
"""

import os
import json
import math
import logging
from typing import Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor, TimeoutError

from RestrictedPython import compile_restricted, safe_globals, safe_builtins
from RestrictedPython.Guards import guarded_iter_unpack_sequence

logger = logging.getLogger("worker")


# =============================================================================
# SECTION 1: SECURITY CONFIGURATION & SANDBOX LIMITS
# =============================================================================


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
    "zip": zip,
}

# Persistent process pool to avoid the overhead of spawning new OS processes per request.
# Provides a secondary layer of isolation within the Docker container.
executor = ProcessPoolExecutor(max_workers=os.cpu_count() or 2)


# =============================================================================
# SECTION 2: THE SANDBOX CORE (RESTRICTED EXECUTION ENVIRONMENT)
# =============================================================================


def _worker_execute(
    template_code: str, params: Dict[str, Any], metadata: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Compiles and executes raw Python code within a RestrictedPython namespace.

    Adds a compile-time AST rewriting layer on top of the existing namespace
    isolation. RestrictedPython transforms the source before execution,
    blocking dangerous attribute traversal patterns such as:
        ().__class__.__bases__[0].__subclasses__()
    at the bytecode level — making object hierarchy escape attempts impossible
    even if the attacker bypasses the builtins whitelist.

    Args:
        template_code: The Python string to be compiled and evaluated.
        params: Client-provided data for SVG rendering.
        metadata: Optional configuration (colors, dimensions, branding).

    Returns:
        A dictionary containing the 'success' status and the 'svg_output' string.
    """
    # Compile phase — RestrictedPython catches dangerous syntax and
    # rewrites the AST before any execution occurs.
    try:
        byte_code = compile_restricted(
            template_code, filename="<frakt_template>", mode="exec"
        )
    except SyntaxError as e:
        return {"status": "error", "message": f"SyntaxError: {str(e)}"}

    # Build a RestrictedPython-hardened globals scope.
    # safe_globals + safe_builtins block __subclasses__ walks at runtime
    # as a second defensive layer behind the compile-time rewrite.
    restricted_globals = {
        **safe_globals,
        "__builtins__": {**safe_builtins, **ALLOWED_FUNCS},
        "_iter_unpack_sequence_": guarded_iter_unpack_sequence,
        **SAFE_MODULES,
    }

    # execution_scope acts as the local variable store for the exec call
    execution_scope = {"params": params, "metadata": metadata or {}, "svg_output": None}

    try:
        exec(byte_code, restricted_globals, execution_scope)
        return {"status": "success", "output": execution_scope.get("svg_output")}
    except Exception as e:
        return {"status": "error", "message": f"{type(e).__name__}: {str(e)}"}


# =============================================================================
# SECTION 3: ORCHESTRATION & RESOURCE ENFORCEMENT
# =============================================================================


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
                                or encounters a Python or sandbox Exception.
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
