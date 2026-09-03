import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_excel_and_csv_export_with_permissions(client: AsyncClient, super_admin_auth):
    _, headers = super_admin_auth

    # Create table with records
    create_t = await client.post(
        "/api/v1/tables",
        json={
            "name": "exportable_vendors",
            "display_name": "Exportable Vendors",
            "columns": [
                {"name": "vendor_name", "display_name": "Vendor Name", "data_type": "TEXT"},
                {"name": "contact_email", "display_name": "Contact Email", "data_type": "EMAIL"},
                {"name": "api_secret", "display_name": "API Secret", "data_type": "PASSWORD", "is_sensitive": True},
            ],
        },
        headers=headers,
    )
    table_id = create_t.json()["id"]

    await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"vendor_name": "Acme Cloud", "contact_email": "support@acme.com", "api_secret": "Secret123"}},
        headers=headers,
    )

    # 1. Export as XLSX
    xlsx_res = await client.post(
        "/api/v1/exports/generate",
        json={"table_id": table_id, "export_format": "XLSX"},
        headers=headers,
    )
    assert xlsx_res.status_code == 200
    assert xlsx_res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert len(xlsx_res.content) > 0

    # 2. Export as CSV
    csv_res = await client.post(
        "/api/v1/exports/generate",
        json={"table_id": table_id, "export_format": "CSV"},
        headers=headers,
    )
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    csv_text = csv_res.content.decode("utf-8")
    assert "Vendor Name" in csv_text
    assert "Acme Cloud" in csv_text

    # 3. Export History
    exp_hist = await client.get("/api/v1/exports/history", headers=headers)
    assert exp_hist.status_code == 200
    assert len(exp_hist.json()) >= 2
