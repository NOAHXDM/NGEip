import { ReportError, ReportRow, requireValue } from "./model";

interface Issue {
  id: string; key: string;
  fields: { summary: string; statuscategorychangedate: string; status: { statusCategory: { id: number } } };
}
export interface JiraConfig { cloudId: string; project: string; token: string; auth: "basic" | "bearer"; email: string }

export function completionRows(issues: Issue[], start: string, end: string): ReportRow[] {
  const lower = Date.parse(start);
  const upper = Date.parse(end);
  requireValue(Number.isFinite(lower) && Number.isFinite(upper) && lower < upper, "INVALID_PERIOD");
  return issues.flatMap(issue => {
    const time = Date.parse(issue.fields.statuscategorychangedate);
    requireValue(Number.isFinite(time) && typeof issue.fields.summary === "string" &&
      Number.isInteger(issue.fields.status.statusCategory.id), "JIRA_COMPLETION_FIELD_MISSING", 502);
    return issue.fields.status.statusCategory.id === 3 && time > lower && time <= upper
      ? [{ key: issue.key, summary: issue.fields.summary, completedAt: time }] : [];
  }).sort((a, b) => a.completedAt - b.completedAt || a.key.localeCompare(b.key, "en"));
}

export class JiraClient {
  private readonly base: string;
  private readonly authorization: string;
  constructor(private readonly config: JiraConfig, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {
    requireValue(/^[a-zA-Z0-9-]+$/.test(config.cloudId) && /^[A-Z][A-Z0-9_]*$/.test(config.project), "JIRA_CONFIG", 503);
    requireValue(config.token && (config.auth === "bearer" || (config.auth === "basic" && config.email)), "JIRA_CONFIG", 503);
    this.base = `https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3`;
    this.authorization = config.auth === "bearer" ? `Bearer ${config.token}` : `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`;
  }
  async report(start: string, end: string): Promise<ReportRow[]> {
    const deadline = this.now() + 390_000;
    // 相對天數加兩日緩衝，避開 JQL 帳號時區；回傳欄位再套精確 UTC 邊界。
    const lookback = Math.max(2, Math.ceil((this.now() - Date.parse(start)) / 86_400_000) + 2);
    requireValue(Number.isFinite(lookback), "INVALID_PERIOD");
    const jql = `project = ${this.config.project} AND type IN standardIssueTypes() AND statusCategory = Done AND statusCategoryChangedDate >= "-${lookback}d" ORDER BY key ASC`;
    const issues = new Map<string, Issue>();
    const seenTokens = new Set<string>();
    let token: string | undefined;
    do {
      requireValue(this.now() < deadline, "JIRA_DEADLINE", 504);
      let page: { issues: Issue[]; nextPageToken?: string; isLast?: boolean };
      try {
        const response = await this.fetcher(this.base + "/search/jql", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
          headers: { Authorization: this.authorization, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ jql, fields: ["summary", "statuscategorychangedate", "status"], maxResults: 100,
            ...(token ? { nextPageToken: token } : {}) }),
        });
        if (!response.ok) throw new ReportError(`JIRA_HTTP_${response.status}`, 502);
        page = await response.json() as typeof page;
      } catch (error) {
        if (error instanceof ReportError) throw error;
        throw new ReportError("JIRA_REQUEST_FAILED", 502);
      }
      requireValue(Array.isArray(page.issues), "JIRA_INVALID_RESPONSE", 502);
      for (const issue of page.issues) {
        requireValue(typeof issue.id === "string" && typeof issue.key === "string" && issue.fields?.status?.statusCategory, "JIRA_INVALID_RESPONSE", 502);
        issues.set(issue.id, issue);
      }
      requireValue(issues.size <= 10_000, "JIRA_TOO_MANY_ISSUES", 502);
      token = page.nextPageToken;
      requireValue(page.isLast === true || (typeof token === "string" && token.length > 0), "JIRA_INCOMPLETE_PAGE", 502);
      if (page.isLast === true) token = undefined;
      if (token) {
        requireValue(!seenTokens.has(token), "JIRA_REPEATED_PAGE", 502);
        seenTokens.add(token);
      }
    } while (token);
    return completionRows([...issues.values()], start, end);
  }
}
