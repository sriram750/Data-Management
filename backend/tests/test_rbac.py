import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_rbac_roles_and_table_permissions(client: AsyncClient, super_admin_auth):
    admin_info, admin_headers = super_admin_auth

    # 1. Verify default system roles exist
    roles_res = await client.get("/api/v1/roles", headers=admin_headers)
    assert roles_res.status_code == 200
    role_names = [r["name"] for r in roles_res.json()]
    assert "SUPER_ADMIN" in role_names
    assert "APPLICATION_ADMIN" in role_names
    assert "MANAGER" in role_names
    assert "DATA_ENTRY" in role_names
    assert "VIEWER" in role_names
    assert "AUDITOR" in role_names

    viewer_role_id = next(r["id"] for r in roles_res.json() if r["name"] == "VIEWER")

    # 2. Create a Viewer user
    user_payload = {
        "username": "viewer_user",
        "full_name": "Viewer User",
        "email": "viewer@enterprise.internal",
        "password": "ViewerPassword123!",
        "status": "ACTIVE",
        "role_ids": [viewer_role_id],
    }
    user_res = await client.post("/api/v1/users", json=user_payload, headers=admin_headers)
    assert user_res.status_code == 200
    viewer_user_id = user_res.json()["id"]

    # Login as viewer
    v_login = await client.post(
        "/api/v1/auth/login",
        json={"username": "viewer_user", "password": "ViewerPassword123!"},
    )
    assert v_login.status_code == 200
    viewer_headers = {"Authorization": f"Bearer {v_login.json()['token']}"}

    # 3. Super Admin creates a table
    table_payload = {
        "name": "project_assets",
        "display_name": "Project Assets",
        "description": "Hardware and cloud assets",
        "columns": [
            {"name": "asset_name", "display_name": "Asset Name", "data_type": "TEXT", "is_required": True},
            {"name": "ip_address", "display_name": "IP Address", "data_type": "IP_ADDRESS"},
            {"name": "secret_key", "display_name": "Secret Key", "data_type": "PASSWORD", "is_sensitive": True},
        ],
    }
    create_t_res = await client.post("/api/v1/tables", json=table_payload, headers=admin_headers)
    assert create_t_res.status_code == 200
    table_id = create_t_res.json()["id"]

    # Super admin adds a record
    rec_res = await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"asset_name": "Primary Database", "ip_address": "192.168.1.100", "secret_key": "MasterKeySecret"}},
        headers=admin_headers,
    )
    assert rec_res.status_code == 200
    record_id = rec_res.json()["id"]

    # 4. Viewer lists records -> Succeeded (can view)
    v_records_res = await client.get(f"/api/v1/tables/{table_id}/records", headers=viewer_headers)
    assert v_records_res.status_code == 200
    assert v_records_res.json()["total"] == 1
    # Note: Secret field is masked
    assert v_records_res.json()["items"][0]["data"]["secret_key"] == "••••••••"

    # 5. Viewer attempts to create record -> Fails (Forbidden 403)
    v_add_rec = await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"asset_name": "Unauthorized Asset"}},
        headers=viewer_headers,
    )
    assert v_add_rec.status_code == 403

    # 6. Viewer attempts to delete record -> Fails (Forbidden 403)
    v_del_rec = await client.delete(f"/api/v1/records/{record_id}", headers=viewer_headers)
    assert v_del_rec.status_code == 403

    # 7. Viewer attempts to add column -> Fails (Forbidden 403)
    v_add_col = await client.post(
        f"/api/v1/tables/{table_id}/columns",
        json={"name": "new_col", "display_name": "New Column", "data_type": "TEXT"},
        headers=viewer_headers,
    )
    assert v_add_col.status_code == 403

    # 8. Viewer attempts to export -> Fails (Forbidden 403)
    v_export = await client.post(
        "/api/v1/exports/generate",
        json={"table_id": table_id, "export_format": "CSV"},
        headers=viewer_headers,
    )
    assert v_export.status_code == 403
