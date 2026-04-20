export type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AuditViolation {
  id: string;
  impact: ImpactLevel;
  description: string;
  help: string;
  helpUrl: string;
  nodes: {
    html: string;
    target: string[];
    failureSummary: string;
  }[];
}

export interface AuditResult {
  url: string;
  timestamp: string;
  totalViolations: number;
  violations: AuditViolation[];
  violationsByImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

export interface AuditError {
  error: string;
  details?: string;
}
