import {
  ApiAgent,
  ApiApproval,
  ApiDeploy,
  ApiTask,
  ApiUsage,
  ApiWorkflow,
  ApiWorkflowRun,
  CadreApiError,
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
    method: "GET" | "POST",
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

  agents = {
    list: (): Promise<{ agents: ApiAgent[] }> => this.request("GET", "/api/v1/agents"),
  };

  deploys = {
    list: (): Promise<{ deploys: ApiDeploy[] }> => this.request("GET", "/api/v1/deploys"),
  };

  tasks = {
    list: (): Promise<{ tasks: ApiTask[] }> => this.request("GET", "/api/v1/tasks"),
    create: (input: { title: string; description?: string }): Promise<{ id: string }> =>
      this.request("POST", "/api/v1/tasks", input),
  };

  messages = {
    send: (input: {
      content: string;
      threadTitle?: string;
    }): Promise<{ threadId: string }> => this.request("POST", "/api/v1/messages", input),
  };

  workflows = {
    list: (): Promise<{ workflows: ApiWorkflow[] }> => this.request("GET", "/api/v1/workflows"),
    run: (input: { workflowId: string }): Promise<{ runId: string }> =>
      this.request("POST", "/api/v1/workflows/run", input),
    runs: (workflowId?: string): Promise<{ runs: ApiWorkflowRun[] }> =>
      this.request(
        "GET",
        `/api/v1/workflows/runs${workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : ""}`,
      ),
  };

  approvals = {
    list: (status?: "pending" | "approved" | "rejected"): Promise<{ approvals: ApiApproval[] }> =>
      this.request("GET", `/api/v1/approvals${status ? `?status=${status}` : ""}`),
    decide: (approvalId: string, approve: boolean): Promise<{ ok: true }> =>
      this.request("POST", `/api/v1/approvals/${approvalId}/decide`, { approve }),
  };

  usage = {
    get: (): Promise<ApiUsage> => this.request("GET", "/api/v1/usage"),
  };
}
