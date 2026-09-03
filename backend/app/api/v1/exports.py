from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.models.user import User
from app.schemas.import_export import ExportHistoryResponse, ExportRequest
from app.services.export_service import export_service

router = APIRouter(prefix="/exports", tags=["Export Engine"])


@router.post("/generate")
async def generate_export(
    req: ExportRequest,
    request: Request,
    current_user: User = Depends(require_permission("export:execute")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    file_bytes, media_type, filename = await export_service.export_data(
        db=db, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/history", response_model=List[ExportHistoryResponse])
async def list_export_history(
    table_id: Optional[UUID] = None,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    history = await export_service.get_export_history(db, table_id=table_id)
    return [ExportHistoryResponse.model_validate(h) for h in history]
