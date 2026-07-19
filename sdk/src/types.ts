// Types matching the shapes returned by convex/publicApi.ts + convex/approvals.ts
// via the /api/v1/* routes in convex/http.ts. Kept hand-written (zero codegen
// dependency) so the SDK ships standalone — update alongside convex/http.ts
// when a route's payload shape changes.

export type ApiAgent = {
  id: string;
  name: string;
  status: "online" | "offline" | "degraded" | "pending";
  kind: string;
  framework?: string;
  capabilities: string[];
  deploymentStatus?: string;
};

export type ApiDeploy = {
  id: string;
  name: string;
  vmProvider?: string;
  vmId?: string;
  region?: string;
  deploymentStatus?: string;
  harness?: string;
  status: string;
};

export type ApiTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

export type ApiWorkflow = {
  id: string;
  name: string;
  enabled: boolean;
  stepCount: number;
  updatedAt: number;
};

export type ApiWorkflowRun = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
};

export type ApiApproval = {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  status: "pending" | "approved" | "rejected";
  riskLevel?: "low" | "medium" | "high";
  createdAt: number;
  decidedAt?: number;
};

export type ApiUsage = {
  today: { requests: number; errors: number; routes: Record<string, number> };
  currentMinute: { requests: number };
};

export class CadreApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CadreApiError";
    this.code = code;
    this.status = status;
  }
}
