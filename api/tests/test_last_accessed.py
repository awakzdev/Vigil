from app.collectors.last_accessed import _tracked_actions_from_svc


def test_tracked_actions_from_svc_uses_last_accessed_time():
    svc = {
        "ServiceNamespace": "ec2",
        "TrackedActionsLastAccessed": [
            {"ActionName": "DescribeInstances", "LastAccessedTime": "2026-05-01T00:00:00+00:00"},
            {"ActionName": "RunInstances", "LastAccessedTime": None},
            {"ActionName": "TerminateInstances"},
        ],
    }
    actions = _tracked_actions_from_svc(svc)
    assert actions == [
        {"action": "ec2:DescribeInstances", "last_authenticated": "2026-05-01T00:00:00+00:00"},
    ]


def test_tracked_actions_from_svc_preserves_service_prefix():
    svc = {
        "ServiceNamespace": "s3",
        "TrackedActionsLastAccessed": [
            {"ActionName": "s3:GetObject", "LastAccessedTime": "2026-05-01T00:00:00+00:00"},
        ],
    }
    actions = _tracked_actions_from_svc(svc)
    assert actions == [
        {"action": "s3:GetObject", "last_authenticated": "2026-05-01T00:00:00+00:00"},
    ]


def test_tracked_actions_from_svc_empty_when_no_used_actions():
    svc = {
        "ServiceNamespace": "ec2",
        "TrackedActionsLastAccessed": [
            {"ActionName": "DescribeInstances", "LastAccessedTime": None},
        ],
    }
    assert _tracked_actions_from_svc(svc) is None


def test_tracked_actions_from_svc_legacy_action_last_accessed():
    svc = {
        "ServiceNamespace": "dynamodb",
        "ActionLastAccessed": [
            {"ActionName": "DescribeTable", "LastAuthenticated": "2026-05-01T00:00:00+00:00"},
        ],
    }
    actions = _tracked_actions_from_svc(svc)
    assert actions == [
        {"action": "dynamodb:DescribeTable", "last_authenticated": "2026-05-01T00:00:00+00:00"},
    ]
