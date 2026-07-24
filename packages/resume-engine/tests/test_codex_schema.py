from aiadapply_v2.reasoning.codex import _strict_response_schema
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
