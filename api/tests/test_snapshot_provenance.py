import uuid

from app.services.snapshot_provenance import attach_provenance


def test_attach_provenance():
    run_id = uuid.uuid4()
    payload = attach_provenance({"key_id": "abc"}, "kms_key", run_id)
    assert payload["key_id"] == "abc"
    prov = payload["_provenance"]
    assert prov["collector"] == "collect_kms"
    assert prov["source_api"] == "kms:ListKeys"
    assert prov["scan_run_id"] == str(run_id)
