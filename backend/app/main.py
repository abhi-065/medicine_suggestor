from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.alternatives import router as alternatives_router
from app.api.analyze import router as analyze_router
from app.api.chat import router as chat_router
from app.api.medicine_info import router as medicine_info_router
from app.api.nearby import router as nearby_router
from app.api.ocr import router as ocr_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="MedIntel Quick+ API",
    version="1.1.0",
    description=(
        "Prescription OCR, medicine analysis, web-searched alternatives, "
        "OpenStreetMap nearby stores, and optional Gemini chat."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr_router, tags=["ocr"])
app.include_router(analyze_router, tags=["analyze"])
app.include_router(alternatives_router, tags=["alternatives"])
app.include_router(nearby_router, tags=["nearby"])
app.include_router(chat_router, tags=["chat"])
app.include_router(medicine_info_router, tags=["medicine-info"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
