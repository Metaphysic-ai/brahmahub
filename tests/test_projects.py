"""Project CRUD tests."""

from httpx import AsyncClient


async def test_list_projects_empty(client: AsyncClient):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    # May contain existing data from the dev DB, but should be a list
    assert isinstance(resp.json(), list)


async def test_create_project(client: AsyncClient):
    resp = await client.post("/api/projects", json={
        "name": "pytest-project-create",
        "description": "Created by test",
        "project_type": "atman",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "pytest-project-create"
    assert body["project_type"] == "atman"
    assert body["subject_count"] == 0
    assert body["package_count"] == 0


async def test_get_project(client: AsyncClient, seed_project: dict):
    pid = str(seed_project["id"])
    resp = await client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Project"


async def test_get_project_not_found(client: AsyncClient):
    resp = await client.get("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_update_project(client: AsyncClient, seed_project: dict):
    pid = str(seed_project["id"])
    resp = await client.put(f"/api/projects/{pid}", json={
        "name": "Updated Name",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


async def test_update_project_no_fields(client: AsyncClient, seed_project: dict):
    pid = str(seed_project["id"])
    resp = await client.put(f"/api/projects/{pid}", json={})
    assert resp.status_code == 400


async def test_delete_project(client: AsyncClient, seed_project: dict):
    pid = str(seed_project["id"])
    resp = await client.delete(f"/api/projects/{pid}")
    assert resp.status_code == 204

    # Verify it's gone
    resp = await client.get(f"/api/projects/{pid}")
    assert resp.status_code == 404


async def test_delete_project_not_found(client: AsyncClient):
    resp = await client.delete("/api/projects/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_list_project_subjects(client: AsyncClient, seed_subject: dict):
    pid = str(seed_subject["project_id"])
    resp = await client.get(f"/api/projects/{pid}/subjects")
    assert resp.status_code == 200
    subjects = resp.json()
    assert len(subjects) >= 1
    assert any(s["name"] == "Test Subject" for s in subjects)
