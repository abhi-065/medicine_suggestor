import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas import AlternativeItem, AlternativesRequest, AlternativesResponse
from app.services.market_search import generate_alternatives_with_market

router = APIRouter()


@router.post("/alternatives", response_model=AlternativesResponse)
async def alternatives(
    request: AlternativesRequest,
    settings: Settings = Depends(get_settings),
) -> AlternativesResponse:
    try:
        generated = await generate_alternatives_with_market(
            mappings=[{"input": item.input, "generic": item.generic} for item in request.mappings],
            timeout_sec=settings.request_timeout_sec,
            user_agent=settings.app_user_agent,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Alternatives web search failed: {exc}",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Alternatives source error: {exc.response.status_code}",
        ) from exc

    return AlternativesResponse(alternatives=[AlternativeItem(**item) for item in generated])
