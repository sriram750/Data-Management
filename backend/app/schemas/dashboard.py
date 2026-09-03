from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel


class RecentActivityItem(BaseModel):
    id: UUID
    timestamp: datetime
    username: str
    action: str
    description: str
    table_name: Optional[str] = None
    record_id: Optional[UUID] = None


class DashboardMetricsResponse(BaseModel):
    total_tables: int = 0
    total_records: int = 0
    total_users: int = 0
    active_users: int = 0
    changes_today: int = 0
    imports_today: int = 0
    exports_today: int = 0
    recent_activities: List[RecentActivityItem] = []
