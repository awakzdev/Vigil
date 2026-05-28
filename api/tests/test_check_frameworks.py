from app.services.check_frameworks import check_framework_map, frameworks_for_check


def test_check_framework_map_includes_known_checks():
    m = check_framework_map()
    assert "iam.user.no_mfa" in m
    assert "soc2" in m["iam.user.no_mfa"]
    assert "cis_aws_l1" in m["iam.user.no_mfa"]


def test_unattached_not_in_framework_map():
    assert frameworks_for_check("iam.policy.unattached") == []


def test_wildcard_resource_in_framework_map():
    fw = frameworks_for_check("iam.policy.wildcard_resource")
    assert "soc2" in fw
    assert "iso27001" in fw
