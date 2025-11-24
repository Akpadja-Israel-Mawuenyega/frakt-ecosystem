# service_python/logging_config.py

import logging
import sys
from logging.handlers import RotatingFileHandler
import os
from dotenv import load_dotenv

class LogSeparatorFilter(logging.Filter):
    # Inserts a separator line before certain log messages.
    def __init__(self, sep_message="--- APPLICATION LOG ---"):
        self.sep_message = sep_message
        super().__init__()

    def filter(self, record):
        if record.levelno == logging.CRITICAL:
            separator_record = logging.LogRecord(
                name='SEPARATOR',
                level=logging.INFO,
                pathname=record.pathname,
                lineno=record.lineno,
                msg=self.sep_message,
                args=(),
                exc_info=None,
                func=record.funcName,
            )
            self.handler.emit(separator_record)
        return True

load_dotenv()

LOG_DIR = os.environ.get("LOG_DIR", "logs")
LOG_FILE = os.path.join(LOG_DIR, 'frakt.log')

def setup_logging():
    logger = logging.getLogger('frakt_app')
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)s | %(name)s | %(module)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    
    os.makedirs(LOG_DIR, exist_ok=True)
    
    file_handler = RotatingFileHandler(
        LOG_FILE, 
        maxBytes=5 * 1024 * 1024,
        backupCount=5            
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    sqlalchemy_logger = logging.getLogger('sqlalchemy.engine')
    sqlalchemy_logger.setLevel(logging.INFO)
    sqlalchemy_logger.addHandler(file_handler)
    
    return logger

logger = setup_logging()