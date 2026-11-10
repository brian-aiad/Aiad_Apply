from aiadapply_v2.naming import MAX_RESUME_BASENAME_LENGTH, resume_basename, run_directory_basename


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


def test_resume_filename_accounts_for_long_windows_run_directory() -> None:
    directory = (
        r"C:\Users\kingt\OneDrive\Downloads\Resume_Builder\OUTPUT_RESUMES"
        r"\2026-10-20_MCG_Architecture_via_Luxus_Group_Desktop_Support_IT_Specialist_Tier_1_Tier_2_run_030a2443"
    )
    name = resume_basename(
        "MCG Architecture (via Luxus Group)",
        "Desktop Support IT Specialist Tier 1 Tier 2",
        output_directory=directory,
    )
    assert name.startswith("Brian_Aiad_Resume_MCG")
    assert len(directory + "\\" + name + ".docx") <= 240
    assert resume_basename("ACME", "Support", output_directory=r"C:\Jobs") == resume_basename(
        "ACME", "Support"
    )


def test_unusable_output_directory_fails_before_model_generation() -> None:
    import pytest

    with pytest.raises(ValueError, match="shorter output folder"):
        resume_basename("ACME", "Support", output_directory="x" * 230)


def test_worker_folder_bounds_long_labels_without_losing_run_identity() -> None:
    label = run_directory_basename(
        "Long company " * 20, "Long role " * 30, "12345678-aaaa", "2026-10-20"
    )
    other = run_directory_basename(
        "Long company " * 20, "Long role " * 30, "87654321-bbbb", "2026-10-20"
    )
    assert len(label) <= 96
    assert label.endswith("_run_12345678") and label != other
    root = r"C:\Users\kingt\OneDrive\Downloads\Resume_Builder\OUTPUT_RESUMES"
    filename = resume_basename(
        "Long company " * 20, "Long role " * 30, output_directory=root + "\\" + label
    )
    assert len(root + "\\" + label + "\\" + filename + ".docx") <= 240
