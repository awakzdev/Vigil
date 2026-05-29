from app.services.timeline_filters import is_compliance_timeline_event


def test_ssm_is_operational_not_compliance():
    assert not is_compliance_timeline_event("ssm.amazonaws.com")


def test_ec2_is_compliance():
    assert is_compliance_timeline_event("ec2.amazonaws.com")
