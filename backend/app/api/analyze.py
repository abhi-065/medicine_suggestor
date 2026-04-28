import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas import AnalyzeRequest, AnalyzeResponse, GenericMapping
from app.services.gemini import analyze_medicines

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    try:
        mappings = await analyze_medicines(
            medicines=request.medicines,
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_sec=settings.request_timeout_sec,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Medicine analysis failed: {exc}",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Medicine source error: {exc.response.status_code}",
        ) from exc

    return AnalyzeResponse(mappings=[GenericMapping(**item) for item in mappings])
