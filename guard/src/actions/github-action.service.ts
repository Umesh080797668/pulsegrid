import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

interface GithubIssueBranchResult {
  issueUrl: string;
  issueNumber: number;
  branchName: string;
  branchUrl: string;
}

interface AlertGithubPayload {
  id: string;
  tenant_id: string;
  severity: string;
  source: string;
  ai_diagnosis: any;
  code_suggestion: any;
  maintenance_scope: any;
  created_at: string;
}

@Injectable()
export class GuardGithubActionService {
  private readonly logger = new Logger('GuardGithubActionService');
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    this.pool = connectionString ? new Pool({ connectionString }) : null;

    if (!this.pool) {
      this.logger.warn('DATABASE_URL not set; GitHub issue action unavailable');
    }
  }

  async createIssueAndBranchFromAlert(
    alertId: string,
    owner?: string,
    repo?: string,
    baseBranch?: string,
  ): Promise<GithubIssueBranchResult> {
    if (!this.pool) {
      throw new Error('Database unavailable');
    }

    const token =
      process.env.GUARD_GITHUB_TOKEN ||
      process.env.GITHUB_TOKEN ||
      process.env.GITHUB_PAT;

    if (!token) {
      throw new Error('GitHub token is not configured');
    }

    const repoOwner = owner || process.env.GITHUB_ORG || process.env.GITHUB_OWNER;
    const repoName = repo || process.env.GITHUB_REPO;

    if (!repoOwner || !repoName) {
      throw new Error('GitHub repository owner/repo is not configured');
    }

    const alert = await this.loadAlert(alertId);
    const github = this.createGithubClient(token);

    const repoInfo = await github.get(`/repos/${repoOwner}/${repoName}`);
    const targetBaseBranch = baseBranch || repoInfo.data.default_branch;

    const baseRef = await github.get(
      `/repos/${repoOwner}/${repoName}/git/ref/heads/${encodeURIComponent(targetBaseBranch)}`,
    );

    const branchName = `pulseguard/alert-${alert.id.slice(0, 8)}`;
    const branchRef = `refs/heads/${branchName}`;

    try {
      await github.post(`/repos/${repoOwner}/${repoName}/git/refs`, {
        ref: branchRef,
        sha: baseRef.data.object.sha,
      });
    } catch (error: any) {
      if (error?.response?.status !== 422) {
        throw error;
      }
      this.logger.log(`Branch ${branchName} already exists, continuing`);
    }

    const issueBody = this.buildIssueBody(alert, branchName, targetBaseBranch);
    const issueTitle = this.buildIssueTitle(alert);

    const issueResp = await github.post(`/repos/${repoOwner}/${repoName}/issues`, {
      title: issueTitle,
      body: issueBody,
      labels: ['pulseguard', `severity:${String(alert.severity || 'unknown').toLowerCase()}`],
    });

    const issueUrl: string = issueResp.data.html_url;
    const issueNumber: number = issueResp.data.number;
    const branchUrl = `https://github.com/${repoOwner}/${repoName}/tree/${encodeURIComponent(branchName)}`;

    await this.pool.query(
      `
      UPDATE guard.alerts
      SET github_issue_url = $2
      WHERE id = $1::uuid
      `,
      [alertId, issueUrl],
    );

    return {
      issueUrl,
      issueNumber,
      branchName,
      branchUrl,
    };
  }

  private createGithubClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 15000,
    });
  }

  private async loadAlert(alertId: string): Promise<AlertGithubPayload> {
    if (!this.pool) {
      throw new Error('Database unavailable');
    }

    const result = await this.pool.query<AlertGithubPayload>(
      `
      SELECT id::text, tenant_id::text, severity, source, ai_diagnosis, code_suggestion, maintenance_scope, created_at::text
      FROM guard.alerts
      WHERE id = $1::uuid
      LIMIT 1
      `,
      [alertId],
    );

    const alert = result.rows[0];
    if (!alert) {
      throw new Error('Alert not found');
    }

    return {
      ...alert,
      ai_diagnosis: this.ensureObject(alert.ai_diagnosis),
      code_suggestion: this.ensureObject(alert.code_suggestion),
      maintenance_scope: this.ensureObject(alert.maintenance_scope),
    };
  }

  private ensureObject(value: any): any {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  private buildIssueTitle(alert: AlertGithubPayload): string {
    const rootCause = alert.ai_diagnosis?.root_cause || 'PulseGuard detected production error';
    return `[PulseGuard] ${rootCause}`;
  }

  private buildIssueBody(
    alert: AlertGithubPayload,
    branchName: string,
    baseBranch: string,
  ): string {
    const diagnosis = alert.ai_diagnosis || {};
    const suggestion = diagnosis.code_suggestion || alert.code_suggestion || {};

    const filePath = suggestion.file_path || diagnosis.affected_file_path || 'unknown';
    const originalSnippet = suggestion.original_snippet || '';
    const suggestedSnippet = suggestion.suggested_snippet || '';

    const diffBlock = this.buildDiff(filePath, originalSnippet, suggestedSnippet);

    return `## PulseGuard Alert

- Alert ID: ${alert.id}
- Tenant: ${alert.tenant_id}
- Severity: ${alert.severity}
- Source: ${alert.source}
- Created At: ${alert.created_at}
- Suggested Branch: ${branchName}
- Base Branch: ${baseBranch}

## AI Root Cause
${diagnosis.root_cause || 'N/A'}

## Technical Explanation
${diagnosis.explanation || 'N/A'}

## Maintenance Scope
\
\
${JSON.stringify(alert.maintenance_scope || {}, null, 2)}
\
\

## Suggested File
${filePath}

## Full Diff Suggestion
\
\
${diffBlock}
\
\

## Suggested Fix Explanation
${suggestion.explanation || 'N/A'}

---
Generated by PulseGuard.`;
  }

  private buildDiff(filePath: string, originalSnippet: string, suggestedSnippet: string): string {
    const safeOriginal = (originalSnippet || '').trimEnd();
    const safeSuggested = (suggestedSnippet || '').trimEnd();

    const originalLines = safeOriginal.length > 0 ? safeOriginal.split('\n') : [''];
    const suggestedLines = safeSuggested.length > 0 ? safeSuggested.split('\n') : [''];

    const removed = originalLines.map((line) => `-${line}`).join('\n');
    const added = suggestedLines.map((line) => `+${line}`).join('\n');

    return [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      '@@',
      removed,
      added,
    ].join('\n');
  }
}
