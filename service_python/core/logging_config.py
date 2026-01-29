import logging
import sys
from logging.handlers import RotatingFileHandler
import os
from dotenv import load_dotenv


class FraktFormatter(logging.Formatter):
    SEP = "\n================= CRITICAL ERROR =================\n"

    def format(self, record):
        result = super().format(record)
        if record.levelno == logging.CRITICAL:
            return f"{self.SEP}{result}{self.SEP}"
        return result


load_dotenv()

LOG_DIR = os.environ.get("LOG_DIR", "logs")
LOG_FILE = os.path.join(LOG_DIR, "frakt.log")


def setup_logging():
    logger = logging.getLogger("frakt_app")
    logger.setLevel(logging.INFO)

    fmt_str = "%(asctime)s | %(levelname)s | %(name)s | %(module)s - %(message)s"
    date_str = "%Y-%m-%d %H:%M:%S"

    formatter = FraktFormatter(fmt_str, datefmt=date_str)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    os.makedirs(LOG_DIR, exist_ok=True)
    file_handler = RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")
    sqlalchemy_logger.setLevel(logging.WARNING)
    sqlalchemy_logger.addHandler(file_handler)

    return logger


logger = setup_logging()
