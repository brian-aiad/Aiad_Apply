from aiadapply_v2.naming import MAX_RESUME_BASENAME_LENGTH, resume_basename


def test_resume_basename_includes_candidate_company_and_role() -> None:
    assert (
        resume_basename(
            "Raytheon",
            "RF/Microwave Antenna Electrical Engineer I (Onsite)",
        )
        == "Brian_Aiad_Resume_Raytheon_RF_Microwave_Antenna_Electrical_Engineer_I_Onsite"
    )


def test_resume_basename_is_cross_platform_safe_and_bounded() -> None:
    value = resume_basename(
        "ACME & Sons: West/Coast",
        "Senior Engineer? " + ("Very Long Role " * 20),
    )
    assert value.startswith("Brian_Aiad_Resume_ACME_and_Sons_West_Coast_Senior_Engineer")
    assert len(value) <= MAX_RESUME_BASENAME_LENGTH
    assert set(value) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")
