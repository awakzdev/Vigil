from app.services.check_evidence import (
    CLASS_BENCHMARK,
    CLASS_HYGIENE,
    CLASS_SUPPORTING,
    evidence_class_for_check,
)


def test_optional_check_is_hygiene():
    assert evidence_class_for_check("github.repo.no_codeowners") == CLASS_HYGIENE
    assert evidence_class_for_check("gitlab.repo.no_codeowners") == CLASS_HYGIENE
    assert evidence_class_for_check("iam.policy.unattached") == CLASS_HYGIENE


def test_extended_mapped_is_supporting():
    assert evidence_class_for_check("guardduty.detector.not_enabled") == CLASS_SUPPORTING


def test_core_mapped_is_benchmark():
    assert evidence_class_for_check("iam.root.no_mfa") == CLASS_BENCHMARK


def test_unmapped_non_optional_is_hygiene():
    # Runs in registry but not in mappings — classify as hygiene
    assert evidence_class_for_check("definitely.not.a.real.check.id") == CLASS_HYGIENE
