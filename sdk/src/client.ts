import {
  ApiAgent,
  ApiAgentDetail,
  ApiApproval,
  ApiBulkDecideResult,
  ApiDeploy,
  ApiTask,
  ApiTaskStatus,
  ApiUsage,
  ApiWorkflow,
  ApiWorkflowRun,
  CadreApiError,
  Page,
  PageOptions,
} from "./types";

export type CadreClientOptions = {
  /** Your `hk_...` API key, minted in Dashboard → Developer. */
  apiKey: string;
  /** Base URL of your Cadre deployment, e.g. https://your-app.convex.site.
   * Defaults to the hosted Cadre control plane. */
  baseUrl?: string;
  /** Override the fetch implementation (tests, non-standard runtimes). */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://api.cadre.to";

/**
 * Zero-dependency TypeScript client for the Cadre public API (v1).
 *
 * ```ts
 * const cadre = new CadreClient({ apiKey: process.env.CADRE_API_KEY! });
 * const { agents } = await cadre.agents.list();
 * ```
 */
export class CadreClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CadreClientOptions) {
    if (!opts.apiKey) throw new Error("CadreClient requires an apiKey");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new CadreApiError(
        "invalid_response",
        `Non-JSON response (status ${res.status})`,
        res.status,
      );
    }

    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | { error?: string })
        ?.error;
      if (typeof err === "string") {
        throw new CadreApiError("error", err, res.status);
      }
      throw new CadreApiError(
        err?.code ?? "error",
        err?.message ?? `Request failed with status ${res.status}`,
        res.status,
      );
    }

    return (json as { data: T }).data;
  }

  /** Build a `?cursor=&limit=` query string from pagination options, merged
   * with any route-specific params already present. */
  private static qs(params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") search.set(k, v);
    }
    const s = search.toString();
    return s ? `?${s}` : "";
  }

  agents = {
    /** Cursor-paginated; pass `{ cursor }` from the previous page's
     * `Page.cursor` to fetch the next one. */
    list: (opts?: PageOptions): Promise<{ agents: ApiAgent[] } & Page<ApiAgent>> =>
      this.request(
        "GET",
        `/api/v1/agents${CadreClient.qs({ cursor: opts?.cursor ?? undefined, limit: opts?.limit?.toString() })}`,
      ),
    /** Single-agent detail. Throws `CadreApiError("not_found", ..., 404)` if
     * the id doesn't exist or isn't in this key's Space. */
    get: (agentId: string): Promise<ApiAgentDetail> =>
      this.request("GET", `/api/v1/agents/${encodeURIComponent(agentId)}`),
  };

  deploys = {
    list: (opts?: PageOptions): Promise<{ deploys: ApiDeploy[] } & Page<ApiDeploy>> =>
      this.request(
        "GET",
        `/api/v1/deploys${CadreClient.qs({ cursor: opts?.cursor ?? undefined, limit: opts?.limit?.toString() })}`,
      ),
  };

  tasks = {
    list: (opts?: PageOptions): Promise<{ tasks: ApiTask[] } & Page<ApiTask>> =>
      this.request(
        "GET",
        `/api/v1/tasks${CadreClient.qs({ cursor: opts?.cursor ?? undefined, limit: opts?.limit?.toString() })}`,
      ),
    create: (input: { title: string; description?: string }): Promise<{ id: string }> =>
      this.request("POST", "/api/v1/tasks", input),
    /** Partial update — only the fields you pass are changed. */
    update: (
      taskId: string,
      input: { title?: string; description?: string; status?: ApiTaskStatus },
    ): Promise<{ id: string }> =>
      this.request("PATCH", `/api/v1/tasks/${encodeURIComponent(taskId)}`, input),
  };

  messages = {
    send: (input: {
      content: string;
      threadTitle?: string;
    }): Promise<{ threadId: string }> => this.request("POST", "/api/v1/messages", input),
  };

  workflows = {
    list: (opts?: PageOptions): Promise<{ workflows: ApiWorkflow[] } & Page<ApiWorkflow>> =>
      this.request(
        "GET",
        `/api/v1/workflows${CadreClient.qs({ cursor: opts?.cursor ?? undefined, limit: opts?.limit?.toString() })}`,
      ),
    run: (input: { workflowId: string }): Promise<{ runId: string }> =>
      this.request("POST", "/api/v1/workflows/run", input),
    /** Enable or disable a workflow (paused workflows never start new runs
     * from triggers). */
    toggle: (workflowId: string, enabled: boolean): Promise<{ id: string; enabled: boolean }> =>
      this.request("POST", `/api/v1/workflows/${encodeURIComponent(workflowId)}/toggle`, {
        enabled,
      }),
    runs: (
      workflowId?: string,
      opts?: PageOptions,
    ): Promise<{ runs: ApiWorkflowRun[] } & Page<ApiWorkflowRun>> =>
      this.request(
        "GET",
        `/api/v1/workflows/runs${CadreClient.qs({
          workflowId,
          cursor: opts?.cursor ?? undefined,
          limit: opts?.limit?.toString(),
        })}`,
      ),
  };

  approvals = {
    list: (
      status?: "pending" | "approved" | "rejected",
      opts?: PageOptions,
    ): Promise<{ approvals: ApiApproval[] } & Page<ApiApproval>> =>
      this.request(
        "GET",
        `/api/v1/approvals${CadreClient.qs({
          status,
          cursor: opts?.cursor ?? undefined,
          limit: opts?.limit?.toString(),
        })}`,
      ),
    decide: (approvalId: string, approve: boolean): Promise<{ ok: true }> =>
      this.request("POST", `/api/v1/approvals/${approvalId}/decide`, { approve }),
    /** Best-effort per row: already-decided or cross-Space IDs land in
     * `failed`, everything else is applied and counted in `succeeded`. */
    bulkDecide: (approvalIds: string[], approve: boolean): Promise<ApiBulkDecideResult> =>
      this.request("POST", "/api/v1/approvals/bulk-decide", { approvalIds, approve }),
  };

  usage = {
    get: (): Promise<ApiUsage> => this.request("GET", "/api/v1/usage"),
  };
}
