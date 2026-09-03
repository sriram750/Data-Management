import logging
import re
import sys
from typing import Any, Dict


class SensitiveDataFilter(logging.Filter):
    """Logging filter to guarantee passwords, encryption keys, tokens, and secret parameters
    are never emitted into application or debug logs."""
    
    PATTERNS = [
        re.compile(r'(password|passwd|secret|token|encryption_key|api_key)["\']?\s*[:=]\s*["\']?([^"\'\s,;]+)', re.IGNORECASE),
        re.compile(r'Bearer\s+([A-Za-z0-9_\-\.]+)', re.IGNORECASE),
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._redact(str(v)) if isinstance(v, str) else v for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self._redact(str(a)) if isinstance(a, str) else a for a in record.args)
        return True

    def _redact(self, text: str) -> str:
        res = text
        for pattern in self.PATTERNS:
            res = pattern.sub(r'\1="[REDACTED]"', res)
        return res


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("app")
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        handler.addFilter(SensitiveDataFilter())
        logger.addHandler(handler)
        
    return logger


logger = setup_logging()
