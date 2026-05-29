from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

from app.services.remediation_runner_status import check_remediation_runner


def test_no_role_arn_blocker():
    acc = MagicMock()
    acc.role_arn = None
    out = check_remediation_runner(acc)
    assert out["ready"] is False
    assert any("role" in b.lower() for b in out["blockers"])


@patch("app.services.remediation_runner_status.assume_role")
def test_rule_missing_blocker(mock_assume):
    acc = MagicMock()
    acc.role_arn = "arn:aws:iam::123:role/x"
    acc.external_id = "ext"

    events = MagicMock()
    lam = MagicMock()
    schemas = MagicMock()

    sess = MagicMock()

    def client_factory(svc, **kwargs):
        return {"events": events, "lambda": lam, "schemas": schemas}[svc]

    sess.client.side_effect = client_factory
    mock_assume.return_value = sess

    events.describe_event_bus.return_value = {"Arn": "arn:aws:events:us-east-1:123:event-bus/default"}
    events.describe_rule.side_effect = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "missing"}},
        "DescribeRule",
    )
    lam.get_function.return_value = {"Configuration": {"Runtime": "python3.12", "FunctionArn": "arn:..."}}
    schemas.list_discoverers.return_value = {"Discoverers": []}

    out = check_remediation_runner(acc)
    assert out["ready"] is False
    assert any("VigilRemediationApproved" in b for b in out["blockers"])
