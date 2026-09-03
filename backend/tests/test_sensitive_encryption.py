import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sensitive_field_encryption_and_reveal_audit(client: AsyncClient, super_admin_auth):
    admin_info, admin_headers = super_admin_auth

    # 1. Create table with a sensitive password column
    create_t = await client.post(
        "/api/v1/tables",
        json={
            "name": "database_credentials",
            "display_name": "Database Credentials",
            "columns": [
                {"name": "service_name", "display_name": "Service Name", "data_type": "TEXT", "is_required": True},
                {"name": "db_username", "display_name": "DB Username", "data_type": "TEXT"},
                {"name": "db_password", "display_name": "DB Password", "data_type": "PASSWORD", "is_sensitive": True},
            ],
        },
        headers=admin_headers,
    )
    assert create_t.status_code == 200
    table = create_t.json()
    table_id = table["id"]
    pw_col_id = next(c["id"] for c in table["columns"] if c["name"] == "db_password")

    # 2. Insert record with a secret password
    raw_secret = "UltraSecret#Password$2026"
    rec_res = await client.post(
        f"/api/v1/tables/{table_id}/records",
        json={"data": {"service_name": "Payment Gateway DB", "db_username": "app_user", "db_password": raw_secret}},
        headers=admin_headers,
    )
    assert rec_res.status_code == 200
    record_id = rec_res.json()["id"]

    # 3. Standard record list should ALWAYS return masked value
    list_res = await client.get(f"/api/v1/tables/{table_id}/records", headers=admin_headers)
    assert list_res.status_code == 200
    item = list_res.json()["items"][0]
    assert item["data"]["db_password"] == "••••••••"

    # 4. Reveal secret endpoint decrypts authenticated ciphertext
    reveal_res = await client.post(
        f"/api/v1/tables/{table_id}/records/{record_id}/columns/{pw_col_id}/reveal-secret",
        json={},
        headers=admin_headers,
    )
    assert reveal_res.status_code == 200
    assert reveal_res.json()["plaintext_value"] == raw_secret

    # 5. Check audit logs to verify PASSWORD_VIEWED event was generated
    audit_res = await client.get("/api/v1/audit/logs?is_sensitive_only=true", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()["items"]
    pw_view_events = [l for l in logs if l["action"] == "PASSWORD_VIEWED"]
    assert len(pw_view_events) >= 1
    # Verify the plaintext secret was NEVER stored in the audit log
    assert pw_view_events[0]["old_value"] is None or raw_secret not in str(pw_view_events[0]["old_value"])
    assert pw_view_events[0]["new_value"] is None or raw_secret not in str(pw_view_events[0]["new_value"])
