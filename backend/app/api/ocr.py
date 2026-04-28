from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas import OCRResponse
from app.services.vision import extract_medicines_from_image

router = APIRouter()


@router.post("/ocr", response_model=OCRResponse)
async def run_ocr(
    file: UploadFile = File(...),
) -> OCRResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    try:
        medicines = await extract_medicines_from_image(image_bytes=image_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return OCRResponse(medicines=medicines)
