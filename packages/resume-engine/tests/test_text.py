from aiadapply_v2.text import contains_term, preserves_source_term, split_skill_values


def test_evidence_aliases_do_not_change_literal_keyword_matching():
    assert preserves_source_term('Supported webhook workflows.', 'Webhooks')
    assert not contains_term('Supported webhook workflows.', 'Webhooks')
    assert preserves_source_term('CI/CD (GitHub Actions)', 'Continuous Integration')
    assert not preserves_source_term('Carrier integration workflows', 'Continuous Integration')
    assert not preserves_source_term('JavaScript', 'Java')
    assert not preserves_source_term('REST APIs', 'Microsoft Graph API')


def test_split_skill_values_keeps_parenthesized_cloud_services_together() -> None:
    assert split_skill_values("AWS (EC2, S3, IAM), Vercel, CI/CD (GitHub Actions)") == [
        "AWS (EC2, S3, IAM)",
        "Vercel",
        "CI/CD (GitHub Actions)",
    ]
