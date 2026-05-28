from app.services.check_settings import hidden_check_ids, is_check_enabled, optional_checks_for_ui


def test_optional_check_off_by_default():
    assert is_check_enabled({}, "iam.policy.wildcard_resource") is False
    assert is_check_enabled({}, "iam.policy.unattached") is False


def test_optional_check_can_be_enabled():
    settings = {"checks": {"iam.policy.wildcard_resource": {"enabled": True}}}
    assert is_check_enabled(settings, "iam.policy.wildcard_resource") is True
    settings2 = {"checks": {"iam.policy.unattached": {"enabled": True}}}
    assert is_check_enabled(settings2, "iam.policy.unattached") is True


def test_benchmark_check_on_by_default():
    assert is_check_enabled({}, "iam.role.wildcard_action") is True


def test_hidden_check_ids():
    hidden = hidden_check_ids({})
    assert "iam.policy.wildcard_resource" in hidden
    assert "iam.policy.unattached" in hidden
    assert "iam.policy.wildcard_resource" not in hidden_check_ids(
        {"checks": {"iam.policy.wildcard_resource": {"enabled": True}}}
    )
    assert "iam.policy.unattached" not in hidden_check_ids(
        {"checks": {"iam.policy.unattached": {"enabled": True}}}
    )


def test_optional_checks_for_ui():
    rows = optional_checks_for_ui({})
    assert len(rows) == 2
    ids = {r["check_id"] for r in rows}
    assert ids == {"iam.policy.wildcard_resource", "iam.policy.unattached"}
    assert all(r["enabled"] is False for r in rows)
