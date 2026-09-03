import enum
from sqlalchemy import BigInteger, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, UUIDMixin, utc_now


class ImportStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS"
    FAILED = "FAILED"


class ExportFormat(str, enum.Enum):
    XLSX = "XLSX"
    CSV = "CSV"


class ImportHistory(Base, UUIDMixin):
    __tablename__ = "import_history"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="SET NULL"), nullable=True, index=True)
    table_name = Column(String(128), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    
    total_rows = Column(Integer, default=0, nullable=False)
    imported_rows = Column(Integer, default=0, nullable=False)
    warning_rows = Column(Integer, default=0, nullable=False)
    error_rows = Column(Integer, default=0, nullable=False)
    
    status = Column(Enum(ImportStatus), default=ImportStatus.COMPLETED, nullable=False, index=True)
    validation_summary = Column(JSON, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    imported_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    imported_by_username = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)


class ExportHistory(Base, UUIDMixin):
    __tablename__ = "export_history"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="SET NULL"), nullable=True, index=True)
    table_name = Column(String(128), nullable=False, index=True)
    export_format = Column(Enum(ExportFormat), default=ExportFormat.XLSX, nullable=False)
    
    total_rows = Column(Integer, default=0, nullable=False)
    exported_columns = Column(JSON, nullable=False)  # List of column names exported
    
    exported_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    exported_by_username = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
