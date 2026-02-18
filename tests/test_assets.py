"""Asset endpoint tests."""

from httpx import AsyncClient


async def test_list_assets_empty(client: AsyncClient):
    resp = await client.get("/api/assets")
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


async def test_list_assets_with_seed(client: AsyncClient, seed_asset: dict):
    resp = await client.get("/api/assets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


async def test_list_assets_filter_by_type(client: AsyncClient, seed_asset: dict):
    resp = await client.get("/api/assets", params={"file_type": "image"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["image_count"] >= 1
    for a in body["items"]:
        assert a["file_type"] == "image"


async def test_list_assets_filter_by_asset_type(client: AsyncClient, seed_asset: dict):
    resp = await client.get("/api/assets", params={"asset_type": "aligned"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


async def test_get_asset(client: AsyncClient, seed_asset: dict):
    aid = str(seed_asset["id"])
    resp = await client.get(f"/api/assets/{aid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["filename"] == "frame_0001.png"
    assert body["file_type"] == "image"


async def test_get_asset_not_found(client: AsyncClient):
    resp = await client.get("/api/assets/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


async def test_update_asset(client: AsyncClient, seed_asset: dict):
    aid = str(seed_asset["id"])
    resp = await client.put(f"/api/assets/{aid}", json={
        "review_status": "approved",
    })
    assert resp.status_code == 200
    assert resp.json()["review_status"] == "approved"


async def test_delete_asset(client: AsyncClient, seed_asset: dict):
    aid = str(seed_asset["id"])
    resp = await client.delete(f"/api/assets/{aid}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/assets/{aid}")
    assert resp.status_code == 404


async def test_lookup_by_path(client: AsyncClient, seed_asset: dict):
    resp = await client.get("/api/assets/lookup-by-path", params={
        "disk_path": "/tmp/test/frame_0001.png",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body is not None
    assert body["filename"] == "frame_0001.png"


async def test_lookup_by_path_not_found(client: AsyncClient):
    resp = await client.get("/api/assets/lookup-by-path", params={
        "disk_path": "/nonexistent/path.png",
    })
    assert resp.status_code == 200
    assert resp.json() is None
