from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from aiadapply_v2.semantic.matcher import SentenceTransformerEncoder


def test_evidence_vectors_are_reused_only_for_identical_passages():
    calls = []

    class Model:
        def encode(self, texts, **kwargs):
            calls.append(list(texts))
            return np.array([[1.0, 0.0] for _ in texts])

    fake_module = SimpleNamespace(SentenceTransformer=lambda _: Model())
    with patch.dict("sys.modules", {"sentence_transformers": fake_module}):
        encoder = SentenceTransformerEncoder()
    assert encoder.similarities("SQL", ["original", "profile"]) == [1.0, 1.0]
    assert encoder.similarities("Python", ["original", "profile"]) == [1.0, 1.0]
    assert calls.count(["original", "profile"]) == 1
    encoder.similarities("SQL", ["original", "updated profile"])
    encoder.similarities("SQL", ["updated profile", "original"])
    assert ["original", "updated profile"] in calls
    assert ["updated profile", "original"] in calls
    before = len(calls)
    assert encoder.similarities("SQL", []) == []
    assert len(calls) == before
