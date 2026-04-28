from __future__ import annotations

import json
from typing import Any

import httpx

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates", [])
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", [])
    text_parts = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(text_parts).strip()


async def _gemini_request(
    prompt: str,
    api_key: str | None,
    model: str,
    timeout_sec: float,
    response_mime_type: str,
) -> str:
    if not api_key:
        raise RuntimeError("Gemini API key is missing.")

    request_payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 800,
            "responseMimeType": response_mime_type,
        },
    }

    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        response = await client.post(
            GEMINI_API_URL.format(model=model),
            params={"key": api_key},
            json=request_payload,
        )
        response.raise_for_status()

    text = _extract_text(response.json())
    if not text:
        raise ValueError("Gemini returned an empty response.")
    return text


async def analyze_medicines(
    medicines: list[str],
    api_key: str | None,
    model: str,
    timeout_sec: float,
) -> list[dict[str, str]]:
    prompt = (
        "You are a medicine normalization assistant.\n"
        "Given this list of medicine inputs, map each item to the most likely "
        "generic medicine with dosage.\n"
        "Return JSON only as an array. Each item must be:\n"
        '{"input": "...", "generic": "..."}\n'
        "Keep dosage in generic when available.\n"
        f"Inputs: {json.dumps(medicines)}"
    )

    raw_json = await _gemini_request(
        prompt=prompt,
        api_key=api_key,
        model=model,
        timeout_sec=timeout_sec,
        response_mime_type="application/json",
    )
    parsed = json.loads(raw_json)
    if not isinstance(parsed, list):
        raise ValueError("Invalid analyze response format from Gemini.")

    normalized: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        source = str(item.get("input", "")).strip()
        generic = str(item.get("generic", "")).strip()
        if source and generic:
            normalized.append({"input": source, "generic": generic})

    if not normalized:
        raise ValueError("Gemini analyze response did not contain valid mappings.")
    return normalized


async def generate_alternatives(
    mappings: list[dict[str, str]],
    api_key: str | None,
    model: str,
    timeout_sec: float,
) -> list[dict[str, Any]]:
    prompt = (
        "You are helping users find cost-saving medicine options in India.\n"
        "For each generic item below, suggest 2 to 3 commonly available "
        "alternatives with approximate INR price.\n"
        "Return JSON only as an array using this shape:\n"
        '[{"generic":"...", "alternatives":[{"name":"...", "approx_price":12.5}]}]\n'
        "Do not include explanations.\n"
        f"Input: {json.dumps(mappings)}"
    )

    raw_json = await _gemini_request(
        prompt=prompt,
        api_key=api_key,
        model=model,
        timeout_sec=timeout_sec,
        response_mime_type="application/json",
    )
    parsed = json.loads(raw_json)
    if not isinstance(parsed, list):
        raise ValueError("Invalid alternatives response format from Gemini.")

    alternatives: list[dict[str, Any]] = []
    for group in parsed:
        if not isinstance(group, dict):
            continue
        generic = str(group.get("generic", "")).strip()
        group_items = group.get("alternatives", [])
        if not generic or not isinstance(group_items, list):
            continue
        for alt in group_items:
            if not isinstance(alt, dict):
                continue
            name = str(alt.get("name", "")).strip()
            price_raw = alt.get("approx_price")
            if not name:
                continue
            try:
                price = float(price_raw)
            except (TypeError, ValueError):
                continue
            if price < 0:
                continue
            alternatives.append(
                {
                    "generic": generic,
                    "name": name,
                    "approx_price": round(price, 2),
                }
            )

    if not alternatives:
        raise ValueError("Gemini alternatives response did not contain valid items.")
    return sorted(alternatives, key=lambda item: item["approx_price"])


async def answer_medicine_question(
    question: str,
    selected_medicine: str | None,
    mappings: list[dict[str, str]],
    api_key: str | None,
    model: str,
    timeout_sec: float,
) -> str:
    prompt = (
        "You are a concise medicine explainer for general education.\n"
        "Answer in 2 to 3 short lines, plain language, max 60 words.\n"
        "Include a brief caution to consult a doctor for personal advice.\n"
        f"Selected medicine: {selected_medicine or 'Not selected'}\n"
        f"Known mappings: {json.dumps(mappings)}\n"
        f"Question: {question}"
    )

    return await _gemini_request(
        prompt=prompt,
        api_key=api_key,
        model=model,
        timeout_sec=timeout_sec,
        response_mime_type="text/plain",
    )


async def medicine_information(
    medicine_name: str,
    generic_name: str | None,
    api_key: str | None,
    model: str,
    timeout_sec: float,
) -> dict[str, Any]:
    prompt = (
        "You are a medicine information assistant for patient-friendly education.\n"
        "Return strict JSON only with this schema:\n"
        '{'
        '"medicine_name":"...",'
        '"used_for":["..."],'
        '"side_effects":["..."],'
        '"precautions":["..."],'
        '"note":"..."'
        "}\n"
        "Rules:\n"
        "- Keep each list concise (3 to 6 items)\n"
        "- Use simple language\n"
        "- Include common uses and side effects only\n"
        "- Add caution to consult doctor in note\n"
        f"Medicine: {medicine_name}\n"
        f"Generic: {generic_name or 'Unknown'}"
    )

    raw_json = await _gemini_request(
        prompt=prompt,
        api_key=api_key,
        model=model,
        timeout_sec=timeout_sec,
        response_mime_type="application/json",
    )
    payload = json.loads(raw_json)
    if not isinstance(payload, dict):
        raise ValueError("Invalid medicine information format from Gemini.")

    used_for = payload.get("used_for", [])
    side_effects = payload.get("side_effects", [])
    precautions = payload.get("precautions", [])
    if not all(isinstance(item, list) for item in [used_for, side_effects, precautions]):
        raise ValueError("Invalid medicine information details from Gemini.")

    return {
        "medicine_name": str(payload.get("medicine_name") or medicine_name),
        "used_for": [str(item).strip() for item in used_for if str(item).strip()][:6],
        "side_effects": [str(item).strip() for item in side_effects if str(item).strip()][:6],
        "precautions": [str(item).strip() for item in precautions if str(item).strip()][:6],
        "note": str(payload.get("note") or "Consult your doctor before use.").strip(),
    }
