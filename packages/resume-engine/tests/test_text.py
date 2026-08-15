from aiadapply_v2.text import split_skill_values


def test_split_skill_values_keeps_parenthesized_cloud_services_together() -> None:
    assert split_skill_values("AWS (EC2, S3, IAM), Vercel, CI/CD (GitHub Actions)") == [
        "AWS (EC2, S3, IAM)",
        "Vercel",
        "CI/CD (GitHub Actions)",
    ]
