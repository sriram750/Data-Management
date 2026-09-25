import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_manual_table_lifecycle(client: AsyncClient, super_admin_auth):
    _, headers = super_admin_auth

    # 1. Initial table list has ZERO tables (Zero fake data guarantee)
    tables_initial = await client.get("/api/v1/tables", headers=headers)
    assert tables_initial.status_code == 200
    assert tables_initial.json()["total"] == 0

    # 2. Create table manually with 5 distinct column types
    table_payload = {
        "name": "network_devices",
        "display_name": "Network Devices",
        "description": "Switches, routers, and firewalls",
        "columns": [
            {"name": "hostname", "display_name": "Hostname", "data_type": "TEXT", "is_required": True},
            {"name": "ip_address", "display_name": "IP Address", "data_type": "IP_ADDRESS", "is_required": True},
            {"name": "port_count", "display_name": "Port Count", "data_type": "NUMBER"},
            {"name": "is_active", "display_name": "Active Status", "data_type": "BOOLEAN"},
            {"name": "admin_password", "display_name": "Admin Password", "data_type": "PASSWORD", "is_sensitive": True},
        ],
    }
    create_res = await client.post("/api/v1/tables", json=table_payload, headers=headers)
    assert create_res.status_code == 200
    table = create_res.json()
    assert table["name"] == "network_devices"
    assert len(table["columns"]) == 5
    assert table["record_count"] == 0
    table_id = table["id"]

    # 3. Update table (rename display name, toggle favorite)
    update_res = await client.put(
        f"/api/v1/tables/{table_id}",
        json={"display_name": "Enterprise Network Devices", "is_favorite": True},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["display_name"] == "Enterprise Network Devices"
    assert update_res.json()["is_favorite"] is True

    # 4. Check Table History contains TABLE_CREATED and TABLE_UPDATED
    hist_res = await client.get(f"/api/v1/tables/{table_id}/history", headers=headers)
    assert hist_res.status_code == 200
    actions = [h["action"] for h in hist_res.json()]
    assert "TABLE_CREATED" in actions
    assert "TABLE_UPDATED" in actions

    # 5. Delete table (Moves to trash)
    del_res = await client.delete(f"/api/v1/tables/{table_id}", headers=headers)
    assert del_res.status_code == 200

    # 6. Verify table list has 0 active tables
    tables_after = await client.get("/api/v1/tables", headers=headers)
    assert tables_after.json()["total"] == 0

    # 7. Verify trash tables list contains the deleted table
    trash_res = await client.get("/api/v1/tables/trash", headers=headers)
    assert trash_res.status_code == 200
    assert trash_res.json()["total"] == 1
    assert trash_res.json()["items"][0]["id"] == table_id

    # 8. Restore table from trash
    restore_res = await client.post(f"/api/v1/tables/{table_id}/restore", headers=headers)
    assert restore_res.status_code == 200
    assert restore_res.json()["is_active"] is True

    # 9. Verify table is back in active list
    tables_restored = await client.get("/api/v1/tables", headers=headers)
    assert tables_restored.json()["total"] == 1

    # 10. Permanently delete table
    perm_del_res = await client.delete(f"/api/v1/tables/{table_id}/permanent", headers=headers)
    assert perm_del_res.status_code == 200

    # 11. Verify neither active nor trash has the table
    tables_final = await client.get("/api/v1/tables", headers=headers)
    assert tables_final.json()["total"] == 0
    trash_final = await client.get("/api/v1/tables/trash", headers=headers)
    assert trash_final.json()["total"] == 0


@pytest.mark.asyncio
async def test_table_lock_and_privacy(client: AsyncClient, super_admin_auth):
    _, admin_headers = super_admin_auth

    # 1. Create a regular VIEWER user
    roles_res = await client.get("/api/v1/roles", headers=admin_headers)
    viewer_role_id = next(r["id"] for r in roles_res.json() if r["name"] == "VIEWER")

    user_payload = {
        "username": "viewer_bob",
        "full_name": "Bob Viewer",
        "email": "bob@enterprise.internal",
        "password": "BobPassword123!",
        "status": "ACTIVE",
        "role_ids": [viewer_role_id],
    }
    await client.post("/api/v1/users", json=user_payload, headers=admin_headers)

    v_login = await client.post(
        "/api/v1/auth/login",
        json={"username": "viewer_bob", "password": "BobPassword123!"},
    )
    assert v_login.status_code == 200
    viewer_headers = {"Authorization": f"Bearer {v_login.json()['token']}"}

    # 2. Super admin creates a PRIVATE table
    priv_table_res = await client.post(
        "/api/v1/tables",
        json={
            "name": "executive_salaries",
            "display_name": "Executive Salaries",
            "is_private": True,
            "columns": [
                {"name": "employee", "display_name": "Employee", "data_type": "TEXT", "is_required": True},
                {"name": "salary", "display_name": "Salary", "data_type": "NUMBER"},
            ],
        },
        headers=admin_headers,
    )
    assert priv_table_res.status_code == 200
    priv_table = priv_table_res.json()
    assert priv_table["is_private"] is True
    priv_table_id = priv_table["id"]

    # 3. Super admin can see private table in list and details
    admin_list = await client.get("/api/v1/tables", headers=admin_headers)
    assert any(t["id"] == priv_table_id for t in admin_list.json()["items"])

    admin_table_detail = await client.get(f"/api/v1/tables/{priv_table_id}", headers=admin_headers)
    assert admin_table_detail.status_code == 200

    # 4. Viewer user CANNOT see private table in list
    viewer_list = await client.get("/api/v1/tables", headers=viewer_headers)
    assert not any(t["id"] == priv_table_id for t in viewer_list.json()["items"])

    # 5. Viewer user is FORBIDDEN from viewing details or records of private table
    viewer_table_detail = await client.get(f"/api/v1/tables/{priv_table_id}", headers=viewer_headers)
    assert viewer_table_detail.status_code == 403

    viewer_records = await client.get(f"/api/v1/tables/{priv_table_id}/records", headers=viewer_headers)
    assert viewer_records.status_code == 403

    # 6. Create a PUBLIC table with a PASSWORD LOCK
    locked_table_res = await client.post(
        "/api/v1/tables",
        json={
            "name": "shared_configs",
            "display_name": "Shared Configs",
            "is_private": False,
            "is_locked": True,
            "password": "TableSecret123!",
            "columns": [
                {"name": "config_key", "display_name": "Key", "data_type": "TEXT", "is_required": True},
                {"name": "config_val", "display_name": "Value", "data_type": "TEXT"},
            ],
        },
        headers=admin_headers,
    )
    assert locked_table_res.status_code == 200
    locked_table = locked_table_res.json()
    assert locked_table["is_locked"] is True
    assert locked_table["has_password"] is True
    locked_table_id = locked_table["id"]

    # Add a record to the locked table
    await client.post(
        f"/api/v1/tables/{locked_table_id}/records",
        json={"data": {"config_key": "DB_HOST", "config_val": "10.0.0.1"}},
        headers=admin_headers,
    )

    # 7. Viewer can see public locked table in list (with locked badge)
    viewer_list_2 = await client.get("/api/v1/tables", headers=viewer_headers)
    found_locked = next((t for t in viewer_list_2.json()["items"] if t["id"] == locked_table_id), None)
    assert found_locked is not None
    assert found_locked["is_locked"] is True
    assert found_locked["has_password"] is True

    # 8. Viewer attempting to fetch records without password gets TABLE_LOCKED 403
    rec_no_pw = await client.get(f"/api/v1/tables/{locked_table_id}/records", headers=viewer_headers)
    assert rec_no_pw.status_code == 403
    assert "TABLE_LOCKED" in rec_no_pw.json()["detail"]

    # 9. Viewer tries to unlock with wrong password
    wrong_unlock = await client.post(
        f"/api/v1/tables/{locked_table_id}/unlock",
        json={"password": "WrongPassword"},
        headers=viewer_headers,
    )
    assert wrong_unlock.status_code == 403

    # 10. Viewer unlocks with correct password
    correct_unlock = await client.post(
        f"/api/v1/tables/{locked_table_id}/unlock",
        json={"password": "TableSecret123!"},
        headers=viewer_headers,
    )
    assert correct_unlock.status_code == 200
    assert correct_unlock.json()["unlocked"] is True

    # 11. Viewer fetches records with X-Table-Password header
    rec_with_pw = await client.get(
        f"/api/v1/tables/{locked_table_id}/records",
        headers={**viewer_headers, "X-Table-Password": "TableSecret123!"},
    )
    assert rec_with_pw.status_code == 200
    assert rec_with_pw.json()["total"] == 1
    assert rec_with_pw.json()["items"][0]["data"]["config_key"] == "DB_HOST"

    # 12. Super Admin also cannot fetch records without password (TABLE_LOCKED 403)
    admin_rec_no_pw = await client.get(f"/api/v1/tables/{locked_table_id}/records", headers=admin_headers)
    assert admin_rec_no_pw.status_code == 403
    assert "TABLE_LOCKED" in admin_rec_no_pw.json()["detail"]

    # 13. Super Admin with X-Table-Password succeeds
    admin_rec_with_pw = await client.get(
        f"/api/v1/tables/{locked_table_id}/records",
        headers={**admin_headers, "X-Table-Password": "TableSecret123!"},
    )
    assert admin_rec_with_pw.status_code == 200
    assert admin_rec_with_pw.json()["total"] == 1

    # 14. Disabling lock without current_password fails (422)
    failed_disable = await client.put(
        f"/api/v1/tables/{locked_table_id}/lock",
        json={"is_locked": False, "password": ""},
        headers=admin_headers,
    )
    assert failed_disable.status_code == 422
    assert "Current table password is required" in failed_disable.json()["detail"]

    # 15. Disabling lock with wrong current_password fails (422)
    wrong_pw_disable = await client.put(
        f"/api/v1/tables/{locked_table_id}/lock",
        json={"is_locked": False, "password": "", "current_password": "WrongPassword"},
        headers=admin_headers,
    )
    assert wrong_pw_disable.status_code == 422

    # 16. Disabling lock with correct current_password succeeds
    lock_update = await client.put(
        f"/api/v1/tables/{locked_table_id}/lock",
        json={"is_locked": False, "password": "", "current_password": "TableSecret123!"},
        headers=admin_headers,
    )
    assert lock_update.status_code == 200
    assert lock_update.json()["is_locked"] is False
    assert lock_update.json()["has_password"] is False

