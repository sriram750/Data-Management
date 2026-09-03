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
