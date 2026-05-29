from app.collectors.cloudtrail_events import TRACKED_EVENTS, _should_collect


def test_tracked_event_always_collected():
    assert _should_collect({}, "CreateUser") is True


def test_readonly_api_skipped():
    assert _should_collect({"readOnly": True, "eventSource": "iam.amazonaws.com"}, "CreateUser") is True
    assert _should_collect({"readOnly": True, "eventSource": "iam.amazonaws.com"}, "ListUsers") is False


def test_put_bucket_policy_write():
    assert _should_collect(
        {"readOnly": False, "eventSource": "s3.amazonaws.com"},
        "PutBucketPolicy",
    ) is True


def test_list_skipped_by_prefix():
    assert _should_collect(
        {"readOnly": False, "eventSource": "ec2.amazonaws.com"},
        "DescribeInstances",
    ) is False


def test_unknown_service_skipped():
    assert _should_collect(
        {"readOnly": False, "eventSource": "ce.amazonaws.com"},
        "SomeWrite",
    ) is False
