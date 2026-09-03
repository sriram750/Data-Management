import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_setup_wizard_flow(client: AsyncClient):
    # 1. Initially setup is required
    status_res = await client.get("/api/v1/setup/status")
    assert status_res.status_code == 200
    assert status_res.json()["setup_required"] is True
    assert status_res.json()["total_users"] == 0

    # 2. Setup super admin
    setup_payload = {
        "username": "superadmin",
        "full_name": "Super Administrator",
        "email": "admin@enterprise.internal",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!",
    }
    setup_res = await client.post("/api/v1/setup/initialize-admin", json=setup_payload)
    assert setup_res.status_code == 200
    assert setup_res.json()["username"] == "superadmin"
    assert setup_res.json()["is_super_admin"] is True

    # 3. Setup is now locked
    status_res2 = await client.get("/api/v1/setup/status")
    assert status_res2.status_code == 200
    assert status_res2.json()["setup_required"] is False
    assert status_res2.json()["total_users"] == 1

    # 4. Attempting to re-run setup wizard fails
    setup_res2 = await client.post("/api/v1/setup/initialize-admin", json=setup_payload)
    assert setup_res2.status_code == 403


@pytest.mark.asyncio
async def test_login_and_session(client: AsyncClient, super_admin_auth):
    user_info, headers = super_admin_auth

    # Valid Login
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "superadmin", "password": "SecurePassword123!"},
    )
    assert login_res.status_code == 200
    data = login_res.json()
    assert "token" in data
    assert data["user"]["username"] == "superadmin"

    # Get /me profile
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["username"] == "superadmin"

    # Invalid password
    bad_login = await client.post(
        "/api/v1/auth/login",
        json={"username": "superadmin", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # Active sessions list
    sess_res = await client.get("/api/v1/auth/sessions", headers=headers)
    assert sess_res.status_code == 200
    assert len(sess_res.json()) >= 1

    # Logout
    logout_res = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Token is now revoked
    me_after_logout = await client.get("/api/v1/auth/me", headers=headers)
    assert me_after_logout.status_code == 401
