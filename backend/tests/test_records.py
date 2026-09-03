import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_record_crud_and_version_history(client: AsyncClient, super_admin_auth):
    _, headers = super_admin_auth

    # Create table
    create_t = await client.post(
        "/api/v1/tables",
        json={
            "name": "employees",
            "display_name": "Employees",
            "columns": [
                {"name": "emp_id", "display_name": "Employee ID", "data_type": "TEXT", "is_required": True},
                {"name": "full_name", "display_name": "Full Name", "data_type": "TEXT", "is_required": True},
                {"name": "department", "display_name": "Department", "data_type": "DROPDOWN"},
                {"name": "salary", "display_name": "Salary", "data_type": "CURRENCY"},
            ],
        },
        headers=headers,
    )
    table_id = create_t.json()["id"]

    # 1. Add Record (Version 1)
    rec1_res = await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"emp_id": "EMP-001", "full_name": "Alice Developer", "department": "Engineering", "salary": 95000}},
        headers=headers,
    )
    assert rec1_res.status_code == 200
    record = rec1_res.json()
    assert record["version"] == 1
    record_id = record["id"]

    # 2. Update Record (Version 2)
    update_res = await client.put(
        f"/api/v1/records/{record_id}",
        json={"data": {"salary": 110000, "department": "Core Platform"}},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["version"] == 2
    assert update_res.json()["data"]["salary"] == 110000

    # 3. Update Record again (Version 3)
    update_res2 = await client.put(
        f"/api/v1/records/{record_id}",
        json={"data": {"full_name": "Alice Principal Developer"}},
        headers=headers,
    )
    assert update_res2.status_code == 200
    assert update_res2.json()["version"] == 3

    # 4. View Version History -> Should have 3 revisions
    history_res = await client.get(f"/api/v1/records/{record_id}/history", headers=headers)
    assert history_res.status_code == 200
    versions = history_res.json()
    assert len(versions) == 3
    assert versions[0]["version_number"] == 3
    assert versions[1]["version_number"] == 2
    assert versions[2]["version_number"] == 1

    # 5. Restore Version 1
    restore_res = await client.post(f"/api/v1/records/{record_id}/restore/1", headers=headers)
    assert restore_res.status_code == 200
    restored = restore_res.json()
    assert restored["version"] == 4
    assert restored["data"]["full_name"] == "Alice Developer"
    assert restored["data"]["salary"] == 95000

    # 6. Delete Record
    del_res = await client.delete(f"/api/v1/records/{record_id}", headers=headers)
    assert del_res.status_code == 200

    # Verify 0 records remaining
    list_res = await client.get(f"/api/v1/tables/{table_id}/records", headers=headers)
    assert list_res.json()["total"] == 0
