# service_python/app/configs/logging_config.py
"""
Frakt Observability Framework.

This module initializes a centralized, multi-handler logging architecture
designed for high-performance monitoring and forensic debugging. It implements
rotating file persistence and custom visual formatting to prioritize
critical system failures in a high-traffic production environment.
"""


import logging
import sys
from logging.handlers import RotatingFileHandler
import os
from dotenv import load_dotenv


class FraktFormatter(logging.Formatter):
    """
    Custom logging formatter that adds visual emphasis to CRITICAL errors.

    Wraps critical-level logs with a high-visibility separator to ensure
    system-threatening issues are easily identifiable in large log files.
    """

    SEP = "\n================= CRITICAL ERROR =================\n"

    def format(self, record):
        result = super().format(record)
        if record.levelno == logging.CRITICAL:
            return f"{self.SEP}{result}{self.SEP}"
        return result


load_dotenv()

LOG_DIR = os.getenv("LOG_DIR", "logs")
LOG_FILENAME = os.getenv("GATEWAY_LOG_FILE", "frakt_gateway.log")
LOG_PATH = os.path.join(LOG_DIR, LOG_FILENAME)

def setup_logging():
    """
    Initializes a multi-handler logging system for the application.

    Configures:
    1. A Console Handler for real-time stdout monitoring.
    2. A Rotating File Handler to persist logs (5MB limit per file, 5 backups).
    3. Custom formatting with timestamps and module tracking.
    4. Suppression of verbose SQLAlchemy engine logs to WARNING level.
    """

    logger = logging.getLogger("frakt_app")
    logger.setLevel(logging.INFO)

    fmt_str = "%(asctime)s | %(levelname)s | %(name)s | %(module)s - %(message)s"
    date_str = "%Y-%m-%d %H:%M:%S"

    formatter = FraktFormatter(fmt_str, datefmt=date_str)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    os.makedirs(LOG_DIR, exist_ok=True)
    file_handler = RotatingFileHandler(
        LOG_PATH, maxBytes=5 * 1024 * 1024, backupCount=5
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")
    sqlalchemy_logger.setLevel(logging.WARNING)
    sqlalchemy_logger.addHandler(file_handler)

    return logger


logger = setup_logging()
