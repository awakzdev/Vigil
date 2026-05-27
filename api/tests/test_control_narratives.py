"""Control questionnaire narrative lookup."""
from app.data.control_narratives import narrative_for


def test_cis_narrative_uses_prefixed_key():
    text = narrative_for("cis_aws_l1", "1.16")
    assert text is not None
    assert "directly to users" in text


def test_soc2_narrative_by_control_id():
    text = narrative_for("soc2", "CC6.1")
    assert text is not None
    assert "IAM user" in text


def test_iso_narrative_for_new_backup_control():
    text = narrative_for("iso27001", "A.12.3.1")
    assert text is not None
    assert "DynamoDB" in text
