# service_python/worker/logger.py
"""
Frakt Worker Observability & Telemetry.

A specialized logging subsystem designed for the sandboxed execution
environment. This module implements high-visibility terminal formatting
to ensure critical sandbox events and system failures are instantly
identifiable during live deployment.

Key Architectural Pillars:
1.  Visual Identity: Color-coded severity levels (ANSI) for rapid diagnostic.
2.  Subsystem Tagging: Every log entry is stamped with 'WORKER-SANDBOX'
    to prevent confusion with Gateway-level logs.
3.  Thread-Safe Singleton: Provides a single, globally accessible logger
    instance to avoid duplicate handlers.
4.  Standardized Formatting: Synchronizes timestamps and layouts with
    the broader Frakt ecosystem.
"""

import os
import sys
import logging
from dotenv import load_dotenv
from logging.handlers import RotatingFileHandler

# =============================================================================
# SECTION 1: VISUAL FORMATTING (ANSI COLOR ENGINE)
# =============================================================================
class WorkerFormatter(logging.Formatter):
    """Custom formatter to maintain the Frakt visual identity in logs."""

    # ANSI Colors for that "Pro" terminal look
    grey = "\x1b[38;20m"
    yellow = "\x1b[33;20m"
    red = "\x1b[31;20m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"
    fmt = "%(asctime)s | %(levelname)s | WORKER-SANDBOX | %(message)s"

    FORMATS = {
        logging.DEBUG: grey + fmt + reset,
        logging.INFO: grey + fmt + reset,
        logging.WARNING: yellow + fmt + reset,
        logging.ERROR: red + fmt + reset,
        logging.CRITICAL: bold_red
        + "\n=== CRITICAL ===\n"
        + fmt
        + "\n===============\n"
        + reset,
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt, datefmt="%Y-%m-%d %H:%M:%S")
        return formatter.format(record)


# =============================================================================
# SECTION 2: LOGGER INITIALIZATION & INFRASTRUCTURE
# =============================================================================

load_dotenv()

# Pull from .env for cross-subsystem synchronization
LOG_DIR = os.getenv("LOG_DIR", "logs")
LOG_FILENAME = os.getenv("WORKER_LOG_FILE", "frakt_worker.log")
LOG_PATH = os.path.join(LOG_DIR, LOG_FILENAME)

def get_worker_logger():
    """Returns a configured logger for the worker subsystem."""
    logger = logging.getLogger("frakt_worker")

    if not logger.handlers:
        logger.setLevel(logging.INFO)

        # 1. Console Handler: Real-time monitoring with ANSI colors
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(WorkerFormatter())
        logger.addHandler(handler)

        # 2. Rotating File Handler: Secure persistence for forensic audit
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = RotatingFileHandler(
            LOG_PATH, maxBytes=5 * 1024 * 1024, backupCount=5
        )

        # Use clean formatting for files (removes ANSI escape codes)
        file_fmt = logging.Formatter(
            "%(asctime)s | %(levelname)s | WORKER-SANDBOX | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        file_handler.setFormatter(file_fmt)
        logger.addHandler(file_handler)

    return logger


# Globally accessible logger instance
worker_logger = get_worker_logger()
