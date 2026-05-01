import { Injectable, Logger } from '@nestjs/common';
import { GuardEvent, TriageResult, ResearchResult, MaintenanceResult } from '../types';

interface SlackAlertPayload {
  guardEvent: GuardEvent;
  triageResult: TriageResult;
  researchResult: ResearchResult;
  maintenanceResult: MaintenanceResult;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  async sendSlackAlert(payload: SlackAlertPayload): Promise<void> {
    try {
      const { guardEvent, triageResult, researchResult, maintenanceResult } =
        payload;

      // Build Slack message
      const color =
        triageResult.severity_recommendation === 'critical' ? 'danger' : 'warning';

      const fields: any[] = [
        {
          title: 'Source',
          value: guardEvent.source,
          short: true,
        },
        {
          title: 'Severity',
          value: triageResult.severity_recommendation.toUpperCase(),
          short: true,
        },
        {
          title: 'Root Cause',
          value: triageResult.root_cause,
          short: false,
        },
        {
          title: 'AI Confidence',
          value: `${(triageResult.confidence * 100).toFixed(0)}%`,
          short: true,
        },
        {
          title: 'Maintenance Action',
          value: maintenanceResult.scope === 'full' ? 'FULL MAINTENANCE' : maintenanceResult.scope,
          short: true,
        },
      ];

      if (researchResult.cve_ids && researchResult.cve_ids.length > 0) {
        fields.push({
          title: 'CVEs Found',
          value: researchResult.cve_ids.join(', '),
          short: false,
        });
      }

      const message = {
        attachments: [
          {
            color,
            title: `PulseGuard Alert: ${triageResult.root_cause}`,
            title_link: `${process.env.ADMIN_URL || 'http://localhost:3000'}/guard/alerts/${
              guardEvent.id
            }`,
            text: triageResult.explanation,
            fields,
            footer: 'PulseGuard',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      // Get Slack webhook URL from environment or vault
      const slackWebhookUrl = process.env.GUARD_SLACK_WEBHOOK_URL;

      if (!slackWebhookUrl) {
        this.logger.warn('GUARD_SLACK_WEBHOOK_URL not configured, skipping Slack notification');
        return;
      }

      // Send to Slack
      const axios = require('axios');
      await axios.post(slackWebhookUrl, message);

      this.logger.log(`Sent Slack alert for event ${guardEvent.id}`);
    } catch (err) {
      this.logger.error('Failed to send Slack alert', err);
    }
  }
}
