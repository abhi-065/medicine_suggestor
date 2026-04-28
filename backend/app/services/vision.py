import io
import re
from functools import lru_cache

from PIL import Image

DOSAGE_HINT_PATTERN = re.compile(
    r"\b(\d{2,4}\s?(mg|mcg|ml|g)|\d{2,4}|mg|ml|mcg|tablet|tab|capsule|cap|syrup)\b",
    re.IGNORECASE,
)
VALID_LINE_PATTERN = re.compile(r"^[A-Za-z0-9\-\+\s]{3,60}$")


def extract_candidates(raw_text: str) -> list[str]:
    if not raw_text.strip():
        return []

    candidates: list[str] = []
    seen: set[str] = set()

    for line in raw_text.splitlines():
        normalized = re.sub(r"[^A-Za-z0-9\-\+\s]", " ", line)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            continue
        if len(normalized.split()) > 6:
            continue
        if not VALID_LINE_PATTERN.match(normalized):
            continue
        if not any(ch.isalpha() for ch in normalized):
            continue
        if not DOSAGE_HINT_PATTERN.search(normalized):
            continue

        dedupe_key = normalized.lower()
        if dedupe_key not in seen:
            seen.add(dedupe_key)
            candidates.append(normalized)

    return candidates


@lru_cache(maxsize=1)
def _rapid_ocr_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return None
    return RapidOCR()


def _run_rapid_ocr(image: Image.Image) -> str:
    engine = _rapid_ocr_engine()
    if engine is None:
        return ""

    import numpy as np

    results, _ = engine(np.asarray(image))
    if not results:
        return ""

    lines: list[str] = []
    for row in results:
        if len(row) < 2:
            continue
        text = str(row[1]).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def _run_tesseract_ocr(image: Image.Image) -> str:
    try:
        import pytesseract
    except ImportError:
        return ""

    try:
        return pytesseract.image_to_string(image)
    except pytesseract.TesseractNotFoundError as exc:
        raise RuntimeError(
            "No local OCR engine found. Install Tesseract (`brew install tesseract`) "
            "or keep rapidocr-onnxruntime installed."
        ) from exc


async def extract_medicines_from_image(image_bytes: bytes) -> list[str]:
    if not image_bytes:
        return []

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    raw_text = _run_rapid_ocr(image)
    if not raw_text.strip():
        raw_text = _run_tesseract_ocr(image)

    if not raw_text.strip():
        raise RuntimeError(
            "Could not extract text from image. Try a clearer photo or install OCR "
            "dependencies (`rapidocr-onnxruntime` or Tesseract)."
        )

    return extract_candidates(raw_text)
