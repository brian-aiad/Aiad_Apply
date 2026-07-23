from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class TailorMode(StrEnum):
    production = "production"
    hybrid = "hybrid"
    transformation_draft = "transformation_draft"


class RiskLevel(StrEnum):
    grounded = "grounded"
    transferable = "transferable"
    stretched = "stretched"
    unsupported = "unsupported"
    human_confirm = "human_confirm"


class ParsedJob(BaseModel):
    company: str = ""
    title: str = ""
    location: str = ""
    linkedin_url: str | None = None
    job_description: str
    simplify_keywords: list[str] = Field(default_factory=list)
    high_priority_keywords: list[str] = Field(default_factory=list)
    low_priority_keywords: list[str] = Field(default_factory=list)
    simplify_score: tuple[int, int] = (0, 0)
    keyword_source: Literal["simplify", "fallback_jd"] = "fallback_jd"
    raw_paste: str = ""


class TargetRoleProfile(BaseModel):
    target_title: str
    company: str = ""
    role_family: str
    seniority: str = "unknown"
    industry_context: list[str] = Field(default_factory=list)
    hard_tools: list[str] = Field(default_factory=list)
    methodologies: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    action_verbs: list[str] = Field(default_factory=list)
    must_have_keywords: list[str] = Field(default_factory=list)
    nice_to_have_keywords: list[str] = Field(default_factory=list)


class ResumeEvidenceBlock(BaseModel):
    block_id: str
    section: str
    title: str = ""
    source_text: str
    facts: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    competencies: list[str] = Field(default_factory=list)
    transferable_to: list[str] = Field(default_factory=list)
    rewrite_flexibility: Literal["low", "medium", "high"] = "medium"


class ResumeEvidenceGraph(BaseModel):
    candidate_name: str
    base_identity: str
    blocks: list[ResumeEvidenceBlock]


class EvidenceMatch(BaseModel):
    target_keyword: str
    target_concept: str
    evidence_block_id: str | None
    evidence_text: str = ""
    semantic_bridge: str = ""
    confidence: float = Field(ge=0.0, le=1.0)
    risk: RiskLevel
    suggested_destination: str


class RewriteAction(BaseModel):
    section: str
    target: str
    intent: str
    keywords: list[str] = Field(default_factory=list)
    evidence_block_ids: list[str] = Field(default_factory=list)
    risk: RiskLevel
    note: str = ""


class RewritePlan(BaseModel):
    mode: TailorMode
    profile: TargetRoleProfile
    matches: list[EvidenceMatch]
    actions: list[RewriteAction]
    unsupported_keywords: list[str] = Field(default_factory=list)


class RiskFlag(BaseModel):
    keyword: str
    risk: RiskLevel
    reason: str
    recommended_action: str


class RiskReport(BaseModel):
    flags: list[RiskFlag] = Field(default_factory=list)

