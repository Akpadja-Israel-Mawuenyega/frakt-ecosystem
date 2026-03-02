# worker/logger.py
import logging
import sys


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


def get_worker_logger():
    """Returns a configured logger for the worker subsystem."""
    logger = logging.getLogger("frakt_worker")

    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(WorkerFormatter())
        logger.addHandler(handler)

    return logger


# Single instance for the package
worker_logger = get_worker_logger()
