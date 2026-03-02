"""
Frakt Sandbox Worker Package.

This package manages the isolated execution of user-provided Python templates
using a multi-layered isolation strategy (Docker + ProcessPool).
"""

import logging

# Set up the base logger that other modules in this package will inherit
logger = logging.getLogger("frakt.worker")
logger.setLevel(logging.INFO)
