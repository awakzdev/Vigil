from app.services.cis_benchmark_coverage import CIS_V5_LEVEL1_TOTAL, cis_benchmark_coverage


def test_cis_coverage_is_subset_of_v5():
    cov = cis_benchmark_coverage()
    assert cov["mapped_control_count"] > 0
    assert cov["mapped_control_count"] < CIS_V5_LEVEL1_TOTAL
    assert cov["cis_v5_level1_total"] == CIS_V5_LEVEL1_TOTAL
    assert "disclaimer" in cov
    matrix = cov["cis_v5_matrix"]
    assert matrix["control_count"] >= CIS_V5_LEVEL1_TOTAL
    assert matrix["automated"] + matrix["manual"] + matrix["partial"] + matrix["extended"] == matrix["control_count"]
