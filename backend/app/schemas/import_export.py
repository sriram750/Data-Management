from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.dynamic_column import ColumnType
from app.models.import_export import ExportFormat, ImportStatus


class DetectedColumn(BaseModel):
    original_name: str
    suggested_name: str
    suggested_type: ColumnType
    sample_values: List[Any] = []
    is_required: bool = False
    is_sensitive: bool = False


class ExcelPreviewResponse(BaseModel):
    file_token: str
    file_name: str
    file_size_bytes: int
    sheets: List[str]
    selected_sheet: str
    total_rows: int
    total_columns: int
    detected_columns: List[DetectedColumn]
    preview_rows: List[Dict[str, Any]]


class ColumnMappingConfig(BaseModel):
    source_column: str
    target_column: str
    data_type: ColumnType
    is_required: bool = False
    is_sensitive: bool = False
    is_encrypted: bool = False
    validation_rules: Optional[Dict[str, Any]] = None


class ImportRowError(BaseModel):
    row_number: int
    column_name: Optional[str] = None
    error_type: str
    message: str
    raw_value: Optional[Any] = None


class ImportValidationSummary(BaseModel):
    total_rows: int
    valid_rows: int
    warning_rows: int
    error_rows: int
    is_valid: bool
    errors: List[ImportRowError] = []
    warnings: List[ImportRowError] = []


class ImportExecuteRequest(BaseModel):
    file_token: str
    sheet_name: str
    mode: str = "INSERT_NEW_TABLE"
    new_table_name: Optional[str] = None
    new_table_display_name: Optional[str] = None
    new_table_description: Optional[str] = None
    is_private: bool = False
    is_locked: bool = False
    password: Optional[str] = None
    existing_table_id: Optional[UUID] = None
    matching_key_column: Optional[str] = None
    columns: List[ColumnMappingConfig]


class ImportHistoryResponse(BaseModel):
    id: UUID
    table_id: Optional[UUID] = None
    table_name: str
    file_name: str
    file_size_bytes: int
    total_rows: int
    imported_rows: int
    warning_rows: int
    error_rows: int
    status: ImportStatus
    validation_summary: Optional[Dict[str, Any]] = None
    imported_by_username: Optional[str] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class ExportRequest(BaseModel):
    table_id: UUID
    export_format: ExportFormat = ExportFormat.XLSX
    selected_column_ids: Optional[List[UUID]] = None
    filters: Optional[Dict[str, Any]] = None
    search: Optional[str] = None


class ExportHistoryResponse(BaseModel):
    id: UUID
    table_id: Optional[UUID] = None
    table_name: str
    export_format: ExportFormat
    total_rows: int
    file_size_bytes: Optional[int] = 0
    exported_columns: List[str]
    exported_by_username: Optional[str] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class BatchSheetConfig(BaseModel):
    sheet_name: str
    table_display_name: str
    table_name: str


class BatchImportExecuteRequest(BaseModel):
    file_token: str
    sheets: List[BatchSheetConfig]


class BatchImportTableResult(BaseModel):
    sheet_name: str
    table_id: Optional[UUID] = None
    table_name: str
    table_display_name: str
    total_columns: int = 0
    imported_rows: int = 0
    status: str = "SUCCESS"
    error_message: Optional[str] = None


class BatchImportExecuteResponse(BaseModel):
    total_sheets_processed: int
    successful_tables: List[BatchImportTableResult]
    failed_sheets: List[BatchImportTableResult] = []
