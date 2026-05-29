from app.collectors.sg_ingress import has_public_port, public_ingress_for_port


def test_rdp_only_flags_3389_not_https():
    ingress = [
        {
            "IpProtocol": "tcp",
            "FromPort": 443,
            "ToPort": 443,
            "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
        }
    ]
    assert not has_public_port(ingress, 3389)
    assert not public_ingress_for_port(ingress, 3389)


def test_rdp_flags_explicit_3389():
    ingress = [
        {
            "IpProtocol": "tcp",
            "FromPort": 3389,
            "ToPort": 3389,
            "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
        }
    ]
    rules = public_ingress_for_port(ingress, 3389)
    assert len(rules) == 1
    assert rules[0]["match_reason"] == "port_in_range"


def test_all_traffic_flags_rdp():
    ingress = [{"IpProtocol": "-1", "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]
    assert has_public_port(ingress, 3389)
    assert public_ingress_for_port(ingress, 3389)[0]["match_reason"] == "all_traffic"


def test_missing_ports_on_tcp_not_treated_as_all_ports():
    ingress = [{"IpProtocol": "tcp", "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]
    assert not has_public_port(ingress, 3389)
