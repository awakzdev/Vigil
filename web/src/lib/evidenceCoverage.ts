export type EvidenceCoverage = {
  coverage_label: string;
  coverage_ratio: number;
  warning: string | null;
  period_start: string;
  period_end: string;
  successful_scans_in_period: number;
  days_with_data?: number;
  days_requested?: number;
  coverage_start?: string | null;
  scope_limitations?: string[];
};
