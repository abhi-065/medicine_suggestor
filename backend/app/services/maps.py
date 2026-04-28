from __future__ import annotations

import math

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    lat1_rad, lng1_rad = math.radians(lat1), math.radians(lng1)
    lat2_rad, lng2_rad = math.radians(lat2), math.radians(lng2)
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def find_nearby_medical_stores(
    lat: float,
    lng: float,
    timeout_sec: float,
    user_agent: str,
    limit: int = 3,
) -> list[dict[str, str | float]]:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_sec, connect=min(timeout_sec, 5.0))
    ) as client:
        overpass_error: str | None = None
        nominatim_error: str | None = None
        try:
            overpass_results = await _search_with_overpass(client, lat, lng, user_agent)
            if overpass_results:
                return overpass_results[:limit]
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            overpass_error = str(exc)

        try:
            nominatim_results = await _search_with_nominatim(client, lat, lng, user_agent)
            if nominatim_results:
                return nominatim_results[:limit]
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            nominatim_error = str(exc)

    fallback = _fallback_nearby_links(lat, lng)
    if fallback:
        return fallback[:limit]

    details = "No nearby sources available."
    if overpass_error:
        details = f"Overpass failed: {overpass_error}"
    if nominatim_error:
        details = f"{details}. Nominatim failed: {nominatim_error}"
    raise RuntimeError(details)


async def _search_with_overpass(
    client: httpx.AsyncClient,
    lat: float,
    lng: float,
    user_agent: str,
) -> list[dict[str, str | float]]:
    query = (
        "[out:json][timeout:25];"
        "("
        f'node["amenity"="pharmacy"](around:3500,{lat},{lng});'
        f'way["amenity"="pharmacy"](around:3500,{lat},{lng});'
        ");"
        "out center 40;"
    )
    response = await client.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": user_agent},
    )
    response.raise_for_status()

    payload = response.json()
    elements = payload.get("elements", [])
    stores: list[dict[str, str | float]] = []

    for node in elements:
        node_lat = node.get("lat", node.get("center", {}).get("lat"))
        node_lng = node.get("lon", node.get("center", {}).get("lon"))
        if node_lat is None or node_lng is None:
            continue

        tags = node.get("tags", {})
        name = tags.get("name") or "Medical Store"
        address_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:city"),
        ]
        address = ", ".join([part for part in address_parts if part]) or None
        distance = round(haversine_km(lat, lng, node_lat, node_lng), 2)
        map_link = (
            "https://www.openstreetmap.org/?mlat="
            f"{node_lat}&mlon={node_lng}#map=18/{node_lat}/{node_lng}"
        )

        stores.append(
            {
                "name": name,
                "distance_km": distance,
                "map_link": map_link,
                "address": address,
            }
        )

    stores.sort(key=lambda item: float(item["distance_km"]))
    return stores


async def _search_with_nominatim(
    client: httpx.AsyncClient,
    lat: float,
    lng: float,
    user_agent: str,
) -> list[dict[str, str | float]]:
    # Roughly ±3 km bounding box around the user location.
    lat_delta = 0.03
    lng_delta = 0.03 / max(0.25, math.cos(math.radians(lat)))
    viewbox = f"{lng-lng_delta},{lat+lat_delta},{lng+lng_delta},{lat-lat_delta}"

    response = await client.get(
        NOMINATIM_URL,
        params={
            "q": "pharmacy",
            "format": "jsonv2",
            "bounded": 1,
            "limit": 30,
            "viewbox": viewbox,
            "addressdetails": 1,
        },
        headers={"User-Agent": user_agent},
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []

    stores: list[dict[str, str | float]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            node_lat = float(item.get("lat"))
            node_lng = float(item.get("lon"))
        except (TypeError, ValueError):
            continue

        name = item.get("name") or item.get("display_name", "Medical Store").split(",")[0]
        display_name = item.get("display_name", "")
        address = display_name if isinstance(display_name, str) else None
        distance = round(haversine_km(lat, lng, node_lat, node_lng), 2)
        map_link = (
            "https://www.openstreetmap.org/?mlat="
            f"{node_lat}&mlon={node_lng}#map=18/{node_lat}/{node_lng}"
        )

        stores.append(
            {
                "name": str(name),
                "distance_km": distance,
                "map_link": map_link,
                "address": address,
            }
        )

    stores.sort(key=lambda item: float(item["distance_km"]))
    return stores
