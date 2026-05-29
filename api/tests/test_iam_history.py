import uuid
from datetime import datetime, timezone

from app.services.iam_history import build_iam_history


def test_build_iam_history_empty_db(mock_db):
    acc_id = uuid.uuid4()
    mock_db.scalars.return_value.all.return_value = []
    out = build_iam_history(mock_db, acc_id, datetime.now(timezone.utc))
    assert out["snapshot_count"] == 0
    assert out["summary"]["iam_user"] == 0
