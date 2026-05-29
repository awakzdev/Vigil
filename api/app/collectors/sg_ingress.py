"""Parse security group ingress for public exposure (SSH/RDP)."""
from __future__ import annotations

from typing import Any

PUBLIC_IPV4 = frozenset({"0.0.0.0/0"})
PUBLIC_IPV6 = frozenset({"::/0"})


def _public_cidrs(perm: dict) -> list[str]:
    out: list[str] = []
    for r in perm.get("IpRanges", []):
        cidr = r.get("CidrIp")
        if cidr in PUBLIC_IPV4:
            out.append(cidr)
    for r in perm.get("Ipv6Ranges", []):
        cidr = r.get("CidrIpv6")
        if cidr in PUBLIC_IPV6:
            out.append(cidr)
    return out


def public_ingress_for_port(ingress: list[dict], port: int) -> list[dict[str, Any]]:
    """Rules that expose ``port`` to the internet (0.0.0.0/0 or ::/0).

    - ``-1`` (all traffic) counts for every port.
    - TCP/UDP rules must include ``FromPort``/``ToPort``; missing ports are not
      treated as 0–65535 (avoids false positives on incomplete rule objects).
    - Wide TCP ranges that include the port (e.g. 3000–4000 for 3389) count.
    - A single rule 0–65535 TCP is recorded but tagged ``wide_range`` so the UI
      can distinguish from RDP-only (3389) rules.
    """
    matches: list[dict[str, Any]] = []
    for perm in ingress:
        proto = str(perm.get("IpProtocol", ""))
        cidrs = _public_cidrs(perm)
        if not cidrs:
            continue

        if proto == "-1":
            for cidr in cidrs:
                matches.append(
                    {
                        "protocol": "all",
                        "from_port": None,
                        "to_port": None,
                        "cidr": cidr,
                        "match_reason": "all_traffic",
                    }
                )
            continue

        from_port = perm.get("FromPort")
        to_port = perm.get("ToPort")
        if from_port is None or to_port is None:
            continue
        if not (int(from_port) <= port <= int(to_port)):
            continue

        wide = int(from_port) == 0 and int(to_port) >= 65535
        for cidr in cidrs:
            matches.append(
                {
                    "protocol": proto,
                    "from_port": int(from_port),
                    "to_port": int(to_port),
                    "cidr": cidr,
                    "match_reason": "wide_range" if wide else "port_in_range",
                }
            )
    return matches


def has_public_port(ingress: list[dict], port: int) -> bool:
    return bool(public_ingress_for_port(ingress, port))


def build_public_exposure(ingress: list[dict]) -> dict[str, list[dict[str, Any]]]:
    return {
        "ssh": public_ingress_for_port(ingress, 22),
        "rdp": public_ingress_for_port(ingress, 3389),
    }
