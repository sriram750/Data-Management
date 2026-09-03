import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_audit_logs_query_and_tamper_resistance(client: AsyncClient, super_admin_auth):
    _, headers = super_admin_auth

    # 1. Fetch audit logs (should contain login and setup events)
    logs_res = await client.get("/api/v1/audit/logs", headers=headers)
    assert logs_res.status_code == 200
    data = logs_res.json()
    assert data["total"] >= 1
    actions = [i["action"] for i in data["items"]]
    assert "LOGIN" in actions

    # 2. Perform an action and verify new audit entry appears
    await client.post(
        "/api/v1/tables",
        json={
            "name": "audit_test_table",
            "display_name": "Audit Test Table",
            "columns": [{"name": "col1", "display_name": "Col 1", "data_type": "TEXT"}],
        },
        headers=headers,
    )

    logs_after = await client.get("/api/v1/audit/logs?action=TABLE_CREATED", headers=headers)
    assert logs_after.status_code == 200
    created_events = logs_after.json()["items"]
    assert any(e["table_name"] == "audit_test_table" for e in created_events)

    # 3. Test dashboard metrics calculation
    dash_res = await client.get("/api/v1/dashboard/metrics", headers=headers)
    assert dash_res.status_code == 200
    metrics = dash_res.json()
    assert metrics["total_tables"] >= 1
    assert metrics["total_users"] >= 1
    assert len(metrics["recent_activities"]) >= 1
