import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas import AlternativeItem, AlternativesRequest, AlternativesResponse
from app.services.gemini import generate_alternatives
from app.services.market_search import _buy_links

router = APIRouter()


@router.post("/alternatives", response_model=AlternativesResponse)
async def alternatives(
    request: AlternativesRequest,
    settings: Settings = Depends(get_settings),
) -> AlternativesResponse:
    try:
        generated = await generate_alternatives(
            mappings=[{"input": item.input, "generic": item.generic} for item in request.mappings],
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_sec=settings.request_timeout_sec,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Alternatives search failed: {exc}",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Alternatives source error: {exc.response.status_code}",
        ) from exc

    items = []
    for item in generated:
        item["source"] = "Gemini AI"
        item["buy_online_links"] = _buy_links(item["name"])
        items.append(AlternativeItem(**item))

    return AlternativesResponse(alternatives=items)
