from app.collectors.account_governance import _alternate_complete, _contact_complete


def test_contact_complete_requires_core_fields():
    assert _contact_complete(
        {
            "AddressLine1": "1 Main",
            "City": "Austin",
            "CountryCode": "US",
            "PhoneNumber": "+15551234567",
        }
    )
    assert not _contact_complete({"AddressLine1": "1 Main"})


def test_alternate_complete_requires_email_and_phone():
    assert _alternate_complete({"EmailAddress": "sec@example.com", "PhoneNumber": "+15551234567"})
    assert not _alternate_complete({"EmailAddress": "sec@example.com"})
