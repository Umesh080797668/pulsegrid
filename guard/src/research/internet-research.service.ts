import { Injectable, Logger } from '@nestjs/common';
import { GuardEvent, TriageResult, ResearchResult } from '../types';

@Injectable()
export class InternetResearchService {
  private readonly logger = new Logger('InternetResearchService');
  private anthropic: any;

  constructor() {
    const AnthropicSDK = require('@anthropic-ai/sdk').default;
    this.anthropic = new AnthropicSDK({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async research(
    event: GuardEvent,
    triage: TriageResult,
  ): Promise<ResearchResult> {
    try {
      this.logger.debug(
        `Running internet research for event ${event.id}`,
      );

      // Use Anthropic web search if available
      if (!triage.search_queries || triage.search_queries.length === 0) {
        return {
          sources: [],
          cve_ids: [],
          recommended_dep_versions: {},
        };
      }

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are researching a production error for PulseGuard.
Return strictly valid JSON (no markdown):
{
  "sources": [{"url": "...", "relevance": "...", "summary": "..."}],
  "cve_ids": [],
  "recommended_dep_versions": {}
}`,
        messages: [
          {
            role: 'user',
            content: `Research these queries for a production error:
${triage.search_queries.map((q) => `- ${q}`).join('\n')}

Focus on: security vulnerabilities, dependency issues, known workarounds.`,
          },
        ],
      });

      const raw =
        response.content[0].type === 'text' ? response.content[0].text : '';

      // Extract JSON from response
      let jsonStr = raw;
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const result: ResearchResult = JSON.parse(jsonStr);

      this.logger.debug(
        `Found ${result.cve_ids.length} CVEs for event ${event.id}`,
      );

      return result;
    } catch (err) {
      this.logger.warn(`Failed to run internet research for event ${event.id}`, err);

      return {
        sources: [],
        cve_ids: [],
        recommended_dep_versions: {},
      };
    }
  }
}
