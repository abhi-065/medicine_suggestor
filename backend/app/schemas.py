from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class OCRResponse(BaseModel):
    medicines: list[str]


class AnalyzeRequest(BaseModel):
    medicines: list[str] = Field(min_length=1, max_length=20)


class GenericMapping(BaseModel):
    input: str
    generic: str


class AnalyzeResponse(BaseModel):
    mappings: list[GenericMapping]


class AlternativesRequest(BaseModel):
    mappings: list[GenericMapping] = Field(min_length=1, max_length=20)


class AlternativeItem(BaseModel):
    generic: str
    name: str
    approx_price: float = Field(ge=0)
    source: str = "PharmEasy Web Search"
    buy_online_links: dict[str, str] = Field(default_factory=dict)


class AlternativesResponse(BaseModel):
    alternatives: list[AlternativeItem]


class NearbyStore(BaseModel):
    name: str
    distance_km: float
    map_link: str
    address: Optional[str] = None


class NearbyResponse(BaseModel):
    stores: list[NearbyStore]


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=400)
    selected_medicine: Optional[str] = None
    mappings: list[GenericMapping] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str


class MedicineInfoRequest(BaseModel):
    medicine_name: str = Field(min_length=2, max_length=200)
    generic_name: Optional[str] = None


class MedicineInfoResponse(BaseModel):
    medicine_name: str
    used_for: list[str] = Field(default_factory=list)
    side_effects: list[str] = Field(default_factory=list)
    precautions: list[str] = Field(default_factory=list)
    note: str
