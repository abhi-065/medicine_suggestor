import json

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas import MedicineInfoRequest, MedicineInfoResponse
from app.services.gemini import medicine_information
from app.services.offline_assistant import medicine_info_without_gemini

router = APIRouter()


@router.post("/medicine-info", response_model=MedicineInfoResponse)
async def medicine_info(
    request: MedicineInfoRequest,
    settings: Settings = Depends(get_settings),
) -> MedicineInfoResponse:
    if not settings.gemini_api_key:
        payload = medicine_info_without_gemini(
            medicine_name=request.medicine_name,
            generic_name=request.generic_name,
        )
        return MedicineInfoResponse(**payload)

    try:
        payload = await medicine_information(
            medicine_name=request.medicine_name,
            generic_name=request.generic_name,
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_sec=settings.request_timeout_sec,
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Gemini returned invalid JSON.") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error: {exc.response.status_code}",
        ) from exc

    return MedicineInfoResponse(**payload)
