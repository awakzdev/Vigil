from types import SimpleNamespace

from app.checks.iam_role_external_trust import _external_account_ids, _external_ids_for_finding
from app.checks.iam_role_exclusions import is_vigil_integration_role


def _mock_settings(arn: str):
    return SimpleNamespace(TRUST_PRINCIPAL_ARN=arn)


def test_vigil_readonly_role_excluded_by_name():
    assert is_vigil_integration_role("VigilReadOnly") is True
    assert is_vigil_integration_role("OtherRole") is False


def test_trust_only_vigil_control_plane_not_flagged(monkeypatch):
    monkeypatch.setattr(
        "app.checks.iam_role_external_trust.get_settings",
        lambda: _mock_settings("arn:aws:iam::016266969060:role/vigil-control"),
    )
    policy = {
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": "arn:aws:iam::016266969060:root"},
                "Action": "sts:AssumeRole",
            }
        ]
    }
    external = _external_account_ids(policy, "946796614687")
    assert external == ["016266969060"]
    assert _external_ids_for_finding(external) == []


def test_other_external_accounts_still_flagged(monkeypatch):
    monkeypatch.setattr(
        "app.checks.iam_role_external_trust.get_settings",
        lambda: _mock_settings("arn:aws:iam::016266969060:role/vigil-control"),
    )
    external = ["016266969060", "111111111111"]
    assert _external_ids_for_finding(external) == ["111111111111"]
