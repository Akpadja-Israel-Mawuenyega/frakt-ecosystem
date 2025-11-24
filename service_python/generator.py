# service_python/generator.py

from typing import Dict, Any, Optional
from logging_config import logger
import json
import math

# --- 1. Custom Exception for Template Execution Failures ---
class TemplateExecutionError(Exception):
    # Custom exception raised when template code execution fails or malforms the output.
    pass

# --- 2. Security Configuration: Restricted Built-ins (The Code Sandbox) ---
RESTRICTED_BUILTINS = {
    # BLOCKED
    '__import__' : None,
    'open' : None,
    'exec' : None,
    'eval' : None,
    'exit' : None,
    'quit' : None,
    
    # ALLOWED data types and functions
    'str' : str,
    'int' : int,
    'float' : float,
    'dict' : dict,
    'list' : list,
    'tuple' : tuple,
    'len' : len,
    'min' : min,
    'max' : max,
    'range' : range,
    'sum' : sum,
    'round' : round,
    
    # ALLOWED modules
    'json': json,
    'math': math,   
}

# --- 3. Core generator function ---
def generate_svg_from_template(
    template_code: str,
    params: Dict[str, Any],
    metadata: Optional[Dict[str, Any]]
    ) -> str:
    # Safely executes the provided template code to generate an SVG string.
    # The code runs inside a restricted scope (sandbox)
    
    execution_scope = {
        'params': params,
        'metadata': metadata,
        'svg_output': None,
        '__builtins__': RESTRICTED_BUILTINS
    }
    
    try:
        logger.info(f"Starting sandboxed execution of template code...")
        
        exec(template_code, execution_scope)
    except TemplateExecutionError as tee:
        raise tee
    except Exception as e:
        logger.error(f"Template execution failed: {type(e).__name__}: {e}") 
        raise TemplateExecutionError(f"Execution Error in Template Logic: {e}")       
        
    svg_content = execution_scope.get('svg_output')
    
    if not svg_content or isinstance(svg_content, str):
        logger.error("Template finished execution but did not set the required 'svg_output' string variable.")
        raise TemplateExecutionError("Template code must assign the final SVG string to the 'svg_output' variable.")
    
    # Simple check to confirm the output looks like SVG
    if not svg_content.strip().startswith('<svg'):
        logger.warning("Template output does not start with '<svg'. Output might be malformed.")
        
    logger.info("Template execution successful. SVG content prepared for response.")
    return svg_content