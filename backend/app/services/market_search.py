from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import quote_plus

import httpx

PHARMEASY_SEARCH_URL = "https://pharmeasy.in/search/all"
NEXT_DATA_PATTERN = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)
DOSAGE_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\s?(mg|mcg|ml|g)\b", re.IGNORECASE)


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_ingredient_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9/\s-]", " ", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return ""

    parts = [part.strip() for part in re.split(r"/|,|\band\b|\+", cleaned, flags=re.I)]
    base = parts[0] if parts and parts[0] else cleaned
    base = base.replace("ACETAMINOPHEN", "PARACETAMOL")
    return base.title()


def _extract_dosage(text: str) -> str:
    match = DOSAGE_PATTERN.search(text)
    if not match:
        return ""
    return re.sub(r"\s+", "", match.group(0).lower())


def _generic_from_product(query: str, product: dict[str, object]) -> str:
    molecule_name = str(product.get("molecule_name", "")).strip()
    product_name = str(product.get("name", "")).strip()
    base_name = _normalize_ingredient_name(molecule_name) or _normalize_ingredient_name(
        product_name
    )
    dosage = _extract_dosage(query) or _extract_dosage(product_name)
    if base_name and dosage:
        return f"{base_name} {dosage}"
    if base_name:
        return base_name
    return query.strip()


def _parse_pharmeasy_payload(html: str) -> list[dict[str, object]]:
    match = NEXT_DATA_PATTERN.search(html)
    if not match:
        return []

    payload = json.loads(match.group(1))
    search_results = (
        payload.get("props", {})
        .get("pageProps", {})
        .get("searchResults", [])
    )
    if not isinstance(search_results, list):
        return []

    products: list[dict[str, object]] = []
    for item in search_results:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        sale_price = _safe_float(item.get("salePriceDecimal"))
        mrp = _safe_float(item.get("mrpDecimal"))
        approx_price = sale_price if sale_price is not None else mrp
        if approx_price is None:
            continue

        products.append(
            {
                "name": name,
                "approx_price": round(max(0.0, approx_price), 2),
                "mrp": round(max(0.0, mrp), 2) if mrp is not None else None,
                "molecule_name": str(item.get("moleculeName", "")).strip(),
                "manufacturer": str(item.get("manufacturer", "")).strip(),
                "slug": str(item.get("slug", "")).strip(),
            }
        )

    return products


async def search_pharmeasy_products(
    query: str,
    timeout_sec: float,
    user_agent: str,
    limit: int = 6,
) -> list[dict[str, object]]:
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        response = await client.get(
            PHARMEASY_SEARCH_URL,
            params={"name": query},
            headers={"User-Agent": user_agent},
        )
        response.raise_for_status()

    parsed = _parse_pharmeasy_payload(response.text)
    return parsed[:limit]


async def analyze_medicines_with_market(
    medicines: list[str],
    timeout_sec: float,
    user_agent: str,
) -> list[dict[str, str]]:
    search_tasks = [
        search_pharmeasy_products(
            query=medicine,
            timeout_sec=timeout_sec,
            user_agent=user_agent,
            limit=3,
        )
        for medicine in medicines
    ]
    search_results = await asyncio.gather(*search_tasks)

    mappings: list[dict[str, str]] = []
    for medicine, products in zip(medicines, search_results):
        if products:
            generic = _generic_from_product(medicine, products[0])
        else:
            generic = medicine.strip()
        mappings.append({"input": medicine.strip(), "generic": generic})
    return mappings


def _buy_links(name: str) -> dict[str, str]:
    encoded = quote_plus(name)
    return {
        "1mg": f"https://www.1mg.com/search/all?name={encoded}",
        "PharmEasy": f"https://pharmeasy.in/search/all?name={encoded}",
        "DuckDuckGo": f"https://duckduckgo.com/?q={encoded}+medicine+price+india",
    }


async def generate_alternatives_with_market(
    mappings: list[dict[str, str]],
    timeout_sec: float,
    user_agent: str,
) -> list[dict[str, object]]:
    deduped: dict[str, dict[str, object]] = {}

    search_tasks = [
        search_pharmeasy_products(
            query=mapping["generic"],
            timeout_sec=timeout_sec,
            user_agent=user_agent,
            limit=8,
        )
        for mapping in mappings
    ]
    search_results = await asyncio.gather(*search_tasks)

    for mapping, products in zip(mappings, search_results):
        generic = mapping["generic"]
        for product in products:
            name = str(product["name"])
            key = name.lower()
            candidate = {
                "generic": generic,
                "name": name,
                "approx_price": float(product["approx_price"]),
                "source": "PharmEasy Web Search",
                "buy_online_links": _buy_links(name),
            }
            previous = deduped.get(key)
            if previous is None or candidate["approx_price"] < float(previous["approx_price"]):
                deduped[key] = candidate

    alternatives = sorted(
        deduped.values(),
        key=lambda item: float(item["approx_price"]),
    )
    if alternatives:
        return alternatives[:15]

    fallback_items: list[dict[str, object]] = []
    for mapping in mappings[:6]:
        generic = mapping["generic"]
        fallback_items.append(
            {
                "generic": generic,
                "name": f"{generic} (Generic Option)",
                "approx_price": 50.0,
                "source": "Open Web Fallback",
                "buy_online_links": _buy_links(generic),
            }
        )
    return fallback_items
