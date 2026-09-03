import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_column_operations_and_type_compatibility(client: AsyncClient, super_admin_auth):
    _, headers = super_admin_auth

    # Create table
    create_t = await client.post(
        "/api/v1/tables",
        json={
            "name": "servers",
            "display_name": "Servers",
            "columns": [
                {"name": "server_name", "display_name": "Server Name", "data_type": "TEXT"},
                {"name": "cpu_cores", "display_name": "CPU Cores", "data_type": "TEXT"},  # initially TEXT
            ],
        },
        headers=headers,
    )
    table = create_t.json()
    table_id = table["id"]
    cpu_col_id = next(c["id"] for c in table["columns"] if c["name"] == "cpu_cores")

    # Add records with valid numbers in the TEXT column
    await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"server_name": "srv-prod-01", "cpu_cores": "16"}},
        headers=headers,
    )
    await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"server_name": "srv-prod-02", "cpu_cores": "32"}},
        headers=headers,
    )

    # 1. Check type conversion compatibility to NUMBER -> Should be safe
    check_res = await client.post(
        f"/api/v1/columns/{cpu_col_id}/check-type",
        json={"target_type": "NUMBER"},
        headers=headers,
    )
    assert check_res.status_code == 200
    report = check_res.json()
    assert report["total_records"] == 2
    assert report["compatible_count"] == 2
    assert report["incompatible_count"] == 0
    assert report["is_safe"] is True

    # 2. Add a non-numeric record
    bad_rec = await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"server_name": "srv-dev", "cpu_cores": "eight-cores"}},
        headers=headers,
    )
    assert bad_rec.status_code == 200

    # Check compatibility again -> Should detect 1 incompatible record
    check_res2 = await client.post(
        f"/api/v1/columns/{cpu_col_id}/check-type",
        json={"target_type": "NUMBER"},
        headers=headers,
    )
    assert check_res2.status_code == 200
    report2 = check_res2.json()
    assert report2["total_records"] == 3
    assert report2["compatible_count"] == 2
    assert report2["incompatible_count"] == 1
    assert report2["is_safe"] is False
    assert "eight-cores" in report2["sample_incompatible_values"]

    # 3. Add a new column
    add_col_res = await client.post(
        f"/api/v1/tables/{table_id}/columns",
        json={"name": "datacenter", "display_name": "Datacenter Location", "data_type": "TEXT"},
        headers=headers,
    )
    assert add_col_res.status_code == 200
    assert add_col_res.json()["name"] == "datacenter"
    dc_col_id = add_col_res.json()["id"]

    # 4. Reorder columns
    reorder_res = await client.post(
        f"/api/v1/tables/{table_id}/columns/reorder",
        json={"columns": [{"id": dc_col_id, "display_order": 0}, {"id": cpu_col_id, "display_order": 1}]},
        headers=headers,
    )
    assert reorder_res.status_code == 200

    # 5. Delete column
    del_col_res = await client.delete(f"/api/v1/columns/{dc_col_id}", headers=headers)
    assert del_col_res.status_code == 200
