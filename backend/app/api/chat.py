import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas import ChatRequest, ChatResponse
from app.services.gemini import answer_medicine_question
from app.services.offline_assistant import answer_without_gemini

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    context_mappings = [
        {"input": item.input, "generic": item.generic} for item in request.mappings
    ]

    if not settings.gemini_api_key:
        answer = answer_without_gemini(
            question=request.question,
            selected_medicine=request.selected_medicine,
            mappings=context_mappings,
        )
        return ChatResponse(answer=answer)

    try:
        answer = await answer_medicine_question(
            question=request.question,
            selected_medicine=request.selected_medicine,
            mappings=context_mappings,
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout_sec=settings.request_timeout_sec,
        )
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

    return ChatResponse(answer=answer)
