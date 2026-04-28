from __future__ import annotations

def answer_without_gemini(
    question: str,
    selected_medicine: str | None,
    mappings: list[dict[str, str]],
) -> str:
    question_lower = question.lower()
    selected = selected_medicine or (mappings[0]["input"] if mappings else "this medicine")
    generic = mappings[0]["generic"] if mappings else "the listed medicine"

    if "safe" in question_lower:
        return (
            f"{selected} may be safe only when dosage and your health history are checked. "
            f"Use the generic equivalent ({generic}) exactly as prescribed.\n"
            "Avoid combining medicines without medical advice; ask your doctor for personal guidance."
        )

    if "used for" in question_lower or "use" in question_lower:
        return (
            f"{selected} is commonly used based on its generic form ({generic}). "
            "It usually helps symptom relief and does not replace diagnosis.\n"
            "Please confirm the exact use and duration with your doctor or pharmacist."
        )

    return (
        f"Based on your selection ({selected}), compare formula match, dose, and price before buying.\n"
        "For personal safety, confirm suitability with a doctor, especially for chronic conditions."
    )


def medicine_info_without_gemini(
    medicine_name: str,
    generic_name: str | None,
) -> dict[str, object]:
    generic_label = generic_name or medicine_name
    return {
        "medicine_name": medicine_name,
        "used_for": [
            f"Symptom relief based on the active ingredient ({generic_label}).",
            "Commonly used for short-term condition management.",
            "Used as advised in your prescription dosage.",
        ],
        "side_effects": [
            "Stomach discomfort",
            "Nausea",
            "Drowsiness or mild dizziness (medicine-dependent)",
        ],
        "precautions": [
            "Avoid self-adjusting the dose.",
            "Check interactions with your current medicines.",
            "Use caution if you have liver, kidney, or heart conditions.",
        ],
        "note": "This is general guidance. Confirm exact use and safety with your doctor or pharmacist.",
    }
