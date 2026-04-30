import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface FlowFailureAlert {
  workspace_id: string;
  flow_name: string;
  error: string;
  email: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'noreply@pulsegrid.dev';

    if (!smtpHost || !smtpPort) {
      this.logger.warn('Email service not configured. Email sending will be logged only.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: process.env.SMTP_SECURE === 'true',
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${token}`;
    const htmlContent = `
      <h1>Verify Your Email</h1>
      <p>Thank you for signing up for PulseGrid!</p>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
        Verify Email
      </a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not sign up for this account, please ignore this email.</p>
    `;

    const textContent = `
      Verify Your Email
      
      Thank you for signing up for PulseGrid!
      
      Please verify your email address by visiting the link below:
      ${verificationUrl}
      
      This link will expire in 24 hours.
      
      If you did not sign up for this account, please ignore this email.
    `;

    return this.sendEmail(email, 'Verify Your Email Address', htmlContent, textContent);
  }

  async sendFlowFailureAlert(payload: FlowFailureAlert): Promise<boolean> {
    const subject = `PulseGrid flow failed: ${payload.flow_name}`;
    const htmlContent = `
      <h1>Flow failure alert</h1>
      <p>A flow execution failed in workspace <strong>${payload.workspace_id}</strong>.</p>
      <ul>
        <li><strong>Flow:</strong> ${payload.flow_name}</li>
        <li><strong>Error:</strong> ${payload.error}</li>
      </ul>
    `;

    const textContent = [
      'Flow failure alert',
      `Workspace: ${payload.workspace_id}`,
      `Flow: ${payload.flow_name}`,
      `Error: ${payload.error}`,
    ].join('\n');

    return this.sendEmail(payload.email, subject, htmlContent, textContent);
  }

  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@pulsegrid.dev',
        to,
        subject,
        html,
        text,
      });

      this.logger.log(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      return false;
    }
  }
}
