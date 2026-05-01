import { Injectable, Logger } from '@nestjs/common';
import { GuardEvent, TriageResult, TriageContext } from '../types';
import { ContextBuilderService } from './context-builder.service';

@Injectable()
export class AITriageService {
  private readonly logger = new Logger('AITriageService');
  private anthropic: any;

  constructor(private contextBuilder: ContextBuilderService) {
    // Initialize Anthropic client
    const AnthropicSDK = require('@anthropic-ai/sdk').default;
    this.anthropic = new AnthropicSDK({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async triage(event: GuardEvent): Promise<TriageResult> {
    try {
      // Build context for the error
      const ctx = await this.contextBuilder.buildContext(event);

      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(ctx);

      this.logger.debug(`Calling Anthropic API for event ${event.id}`);

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const raw =
        response.content[0].type === 'text' ? response.content[0].text : '';

      // Extract JSON from response (it might be wrapped in markdown code blocks)
      let jsonStr = raw;
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const result: TriageResult = JSON.parse(jsonStr);

      this.logger.debug(
        `Triage result for event ${event.id}: confidence=${result.confidence}`,
      );

      return result;
    } catch (err) {
      this.logger.error(`Failed to triage event ${event.id}`, err);

      // Return fallback triage result on error
      return {
        root_cause: 'Error during AI analysis',
        explanation: `Failed to analyze error: ${String(err)}`,
        confidence: 0,
        severity_recommendation: event.severity,
        maintenance_scope: 'none',
        affected_file_path: null,
        search_queries: [],
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are PulseGuard, the AI error intelligence agent for PulseGrid — a Rust-powered
automation platform. You receive production error events enriched with codebase context.

Your job:
1. Identify the root cause of the error with high precision.
2. Determine severity scope: Warning (log only) | Error (pause affected flows) | Critical (full maintenance mode).
3. Suggest an industry-grade code fix appropriate for developer review.
4. Output strictly valid JSON — no prose outside the JSON object.

Output format (valid JSON, no markdown):
{
  "root_cause": "concise root cause description (max 100 chars)",
  "explanation": "full technical explanation of why this error occurs",
  "confidence": 0.0–1.0,
  "severity_recommendation": "warning|error|critical",
  "maintenance_scope": "none|flows_only|full",
  "affected_file_path": "path/to/affected/file.rs or null",
  "code_suggestion": {
    "file_path": "string",
    "original_snippet": "the problematic code",
    "suggested_snippet": "the fixed code",
    "explanation": "why this fix resolves the root cause"
  },
  "search_queries": ["query1 for CVE lookup", "query2 for GitHub issues"]
}`;
  }

  private buildUserMessage(ctx: TriageContext): string {
    return `## Error Event
Source: ${ctx.event.source}
Severity: ${ctx.event.severity}
Category: ${ctx.event.category}
Message: ${ctx.event.message}

## Stack Trace
\`\`\`
${ctx.event.stack_trace ?? 'Not available'}
\`\`\`

## Surrounding Logs (±50 lines)
\`\`\`
${ctx.surroundingLogs.map((l) => `[${l.timestamp}] ${l.level} ${l.message}`).join('\n') || 'No logs available'}
\`\`\`

## Relevant Codebase Context
${
  ctx.relevantFiles.length > 0
    ? ctx.relevantFiles
        .map(
          (f) =>
            `### ${f.file_path}\nLanguage: ${f.language}\nFunctions: ${JSON.stringify(
              f.function_sigs,
              null,
              2,
            )}`,
        )
        .join('\n\n')
    : 'No relevant files found'
}

## Recent Deployments
${
  ctx.recentDeploys.length > 0
    ? ctx.recentDeploys
        .map(
          (d) =>
            `- ${d.sha.substring(0, 8)}: ${d.message} (${d.deployedAt})`,
        )
        .join('\n')
    : 'No deployment history available'
}

## Connector Health (if applicable)
${
  ctx.connectorHealth
    ? JSON.stringify(ctx.connectorHealth, null, 2)
    : 'N/A'
}`;
  }
}
