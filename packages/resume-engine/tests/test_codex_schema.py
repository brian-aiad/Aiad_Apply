from aiadapply_v2.reasoning.codex import (
    AI_API_KEY_VARIABLES,
    _codex_environment,
    _codex_failure_detail,
    _strict_response_schema,
)
from aiadapply_v2.schemas import ReasoningResult


def test_codex_response_schema_requires_every_declared_property() -> None:
    schema = _strict_response_schema(ReasoningResult.model_json_schema())

    def check(value: object) -> None:
        if isinstance(value, dict):
            properties = value.get("properties")
            if isinstance(properties, dict):
                assert set(value["required"]) == set(properties)
                assert value["additionalProperties"] is False
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(schema)


def test_usage_limit_error_does_not_echo_prompt_or_evidence_payload() -> None:
    output = """large prompt payload with candidate evidence
ERROR: You've hit your usage limit. Try again at Aug 10th, 2026 4:41 PM.
"""

    detail = _codex_failure_detail(output)

    assert detail == "You've hit your usage limit. Try again at Aug 10th, 2026 4:41 PM."
    assert "candidate evidence" not in detail


def test_codex_subprocess_never_inherits_ai_api_keys(monkeypatch) -> None:
    for name in AI_API_KEY_VARIABLES:
        monkeypatch.setenv(name, "must-not-leak")
    monkeypatch.setenv("PATH", "keep-this")

    environment = _codex_environment()

    assert environment["PATH"] == "keep-this"
    assert not (AI_API_KEY_VARIABLES & environment.keys())
