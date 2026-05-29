import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.models import Finding
from app.services.timeline_finding_links import link_findings_to_timeline_events


def test_timeline_links_finding_by_bucket_name():
    org_id = uuid.uuid4()
    account_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    f = Finding(
        id=uuid.uuid4(),
        org_id=org_id,
        account_id=account_id,
        check_id="s3.bucket.public_access_not_blocked",
        resource_arn="arn:aws:s3:::my-bucket",
        title="Public bucket",
        severity="high",
        risk_score=80,
        status="open",
        evidence={"bucket_name": "my-bucket"},
        first_seen=now,
        last_seen=now,
    )
    db = MagicMock()
    db.scalars.return_value.all.return_value = [f]

    events = [
        {
            "event_name": "PutBucketPolicy",
            "resources": [{"type": "AWS::S3::Bucket", "name": "my-bucket"}],
        }
    ]
    out = link_findings_to_timeline_events(db, account_id, events)
    assert len(out[0]["related_findings"]) == 1
    assert out[0]["related_findings"][0]["finding_id"] == str(f.id)
