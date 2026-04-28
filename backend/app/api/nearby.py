import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import Settings, get_settings
from app.schemas import NearbyResponse, NearbyStore
from app.services.maps import find_nearby_medical_stores

router = APIRouter()


@router.get("/nearby", response_model=NearbyResponse)
async def nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    settings: Settings = Depends(get_settings),
) -> NearbyResponse:
    try:
        stores = await find_nearby_medical_stores(
            lat=lat,
            lng=lng,
            timeout_sec=settings.request_timeout_sec,
            user_agent=settings.app_user_agent,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"OpenStreetMap request failed: {exc}") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"OpenStreetMap request failed: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OpenStreetMap source error: {exc.response.status_code}",
        ) from exc

    return NearbyResponse(stores=[NearbyStore(**store) for store in stores])
