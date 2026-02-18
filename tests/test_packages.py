"""Package endpoint tests."""

from httpx import AsyncClient


async def test_list_packages(client: AsyncClient):
    resp = await client.get("/api/packages")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


async def test_list_packages_with_pagination(client: AsyncClient, seed_package: dict):
    resp = await client.get("/api/packages", params={"offset": 0, "limit": 10})
    assert resp.status_code == 200
    body = resp.json()
    assert body["offset"] == 0
    assert body["limit"] == 10
    assert body["total"] >= 1


async def test_list_packages_search(client: AsyncClient, seed_package: dict):
    resp = await client.get("/api/packages", params={"search": "test-pkg"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any(p["name"] == "test-pkg-001" for p in body["items"])


async def test_list_packages_search_no_results(client: AsyncClient):
    resp = await client.get("/api/packages", params={"search": "nonexistent-zzz-xyz"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_list_packages_filter_by_type(client: AsyncClient, seed_package: dict):
    resp = await client.get("/api/packages", params={"package_type": "atman"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    for p in body["items"]:
        assert p["package_type"] == "atman"


async def test_get_package(client: AsyncClient, seed_package: dict):
    pid = str(seed_package["id"])
    resp = await client.get(f"/api/packages/{pid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "test-pkg-001"
    assert "linked_subjects" in body


async def test_get_package_not_found(client: AsyncClient):
    resp = await client.get("/api/packages/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_update_package(client: AsyncClient, seed_package: dict):
    pid = str(seed_package["id"])
    resp = await client.put(f"/api/packages/{pid}", json={
        "name": "renamed-pkg",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed-pkg"


async def test_delete_package(client: AsyncClient, seed_package: dict):
    pid = str(seed_package["id"])
    resp = await client.delete(f"/api/packages/{pid}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/packages/{pid}")
    assert resp.status_code == 404


async def test_list_package_assets_empty(client: AsyncClient, seed_package: dict):
    """Package with no assets should return empty paginated response."""
    pid = str(seed_package["id"])
    resp = await client.get(f"/api/packages/{pid}/assets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_list_package_assets(client: AsyncClient, seed_asset: dict):
    pid = str(seed_asset["package_id"])
    resp = await client.get(f"/api/packages/{pid}/assets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any(a["filename"] == "frame_0001.png" for a in body["items"])
