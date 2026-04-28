import os
if "SSLKEYLOGFILE" in os.environ:
    del os.environ["SSLKEYLOGFILE"]

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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

app.include_router(ocr_router, prefix="/api", tags=["ocr"])
app.include_router(analyze_router, prefix="/api", tags=["analyze"])
app.include_router(alternatives_router, prefix="/api", tags=["alternatives"])
app.include_router(nearby_router, prefix="/api", tags=["nearby"])
app.include_router(chat_router, prefix="/api", tags=["chat"])
app.include_router(medicine_info_router, prefix="/api", tags=["medicine-info"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

static_path = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_path):
    assets_path = os.path.join(static_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(static_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_path, "index.html"))
