from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.models.user import User
from app.schemas.import_export import (
    BatchImportExecuteRequest,
    BatchImportExecuteResponse,
    ColumnMappingConfig,
    ExcelPreviewResponse,
    ImportExecuteRequest,
    ImportHistoryResponse,
    ImportValidationSummary,
)
from app.services.import_service import import_service

router = APIRouter(prefix="/imports", tags=["Import Engine"])


@router.post("/upload", response_model=ExcelPreviewResponse)
async def upload_excel_for_preview(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    current_user: User = Depends(require_permission("import:execute")),
):
    """Step 1: Upload Excel (.xlsx) file, detect sheets, extract headers, and generate data preview."""
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx Excel files are supported.")

    file_bytes = await file.read()
    file_token = import_service.save_temp_file(file_bytes, file.filename)
    preview = import_service.parse_and_preview(file_token, file.filename, sheet_name=sheet_name)
    return preview


@router.post("/validate", response_model=ImportValidationSummary)
async def validate_import_rows(
    file_token: str = Form(...),
    sheet_name: str = Form(...),
    columns_json: str = Form(...),
    current_user: User = Depends(require_permission("import:execute")),
):
    """Step 2: Validate all rows against configured column types and rules. Returns Valid, Warnings, and Errors."""
    import json
    try:
        col_list_raw = json.loads(columns_json)
        column_configs = [ColumnMappingConfig.model_validate(c) for c in col_list_raw]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid column configuration JSON: {str(e)}")

    return import_service.validate_rows(file_token, sheet_name, column_configs)


@router.post("/execute", response_model=ImportHistoryResponse)
async def execute_import(
    req: ImportExecuteRequest,
    request: Request,
    current_user: User = Depends(require_permission("import:execute")),
    db: AsyncSession = Depends(get_db),
):
    """Step 3: Execute transactional ACID import into new table or existing table."""
    ip_address, user_agent = await get_client_info(request)
    original_filename = "imported_data.xlsx"
    history = await import_service.execute_import(
        db=db,
        req=req,
        original_filename=original_filename,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return ImportHistoryResponse.model_validate(history)


@router.post("/batch-execute", response_model=BatchImportExecuteResponse)
async def execute_batch_import(
    req: BatchImportExecuteRequest,
    request: Request,
    current_user: User = Depends(require_permission("import:execute")),
    db: AsyncSession = Depends(get_db),
):
    """Batch imports multiple worksheets creating distinct dynamic tables in one operation."""
    ip_address, user_agent = await get_client_info(request)
    original_filename = "multi_sheet_data.xlsx"
    return await import_service.batch_import_sheets(
        db=db,
        req=req,
        original_filename=original_filename,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.get("/history", response_model=List[ImportHistoryResponse])
async def list_import_history(
    table_id: Optional[UUID] = None,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    history = await import_service.get_import_history(db, table_id=table_id)
    return [ImportHistoryResponse.model_validate(h) for h in history]
