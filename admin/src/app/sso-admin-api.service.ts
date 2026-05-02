import { Injectable } from '@angular/core';
import type { LoginUrlResponse, SsoConfigurationModel } from './sso.types';

@Injectable({ providedIn: 'root' })
export class SsoAdminApiService {
  private readonly apiBase = '/api/v1/enterprise';

  async loadConfig(workspaceId: string): Promise<SsoConfigurationModel | null> {
    const response = await fetch(`${this.apiBase}/sso/config/${encodeURIComponent(workspaceId)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unable to load SSO configuration (${response.status})`);
    }
    return (await response.json()) as SsoConfigurationModel;
  }

  async saveConfig(config: SsoConfigurationModel): Promise<SsoConfigurationModel> {
    const response = await fetch(`${this.apiBase}/sso/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const error = await this.readError(response);
      throw new Error(error || `Unable to save SSO configuration (${response.status})`);
    }
    return (await response.json()) as SsoConfigurationModel;
  }

  async enableConfig(workspaceId: string): Promise<void> {
    await this.simpleRequest(`/sso/config/${encodeURIComponent(workspaceId)}/enable`, 'POST');
  }

  async disableConfig(workspaceId: string): Promise<void> {
    await this.simpleRequest(`/sso/config/${encodeURIComponent(workspaceId)}/disable`, 'POST');
  }

  async deleteConfig(workspaceId: string): Promise<void> {
    await this.simpleRequest(`/sso/config/${encodeURIComponent(workspaceId)}`, 'DELETE');
  }

  async loadMetadata(workspaceId: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/sso/config/${encodeURIComponent(workspaceId)}/metadata`);
    if (!response.ok) {
      throw new Error(`Unable to load SP metadata (${response.status})`);
    }
    const payload = (await response.json()) as { metadataXml: string };
    return payload.metadataXml;
  }

  async loadLoginUrl(workspaceId: string, provider: string): Promise<LoginUrlResponse> {
    const response = await fetch(
      `${this.apiBase}/sso/config/${encodeURIComponent(workspaceId)}/login-url?provider=${encodeURIComponent(provider)}`,
    );
    if (!response.ok) {
      throw new Error(`Unable to load login URL (${response.status})`);
    }
    return (await response.json()) as LoginUrlResponse;
  }

  private async simpleRequest(path: string, method: 'POST' | 'DELETE'): Promise<void> {
    const response = await fetch(`${this.apiBase}${path}`, { method });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
  }

  private async readError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { message?: string };
      return payload.message || '';
    } catch {
      return '';
    }
  }
}
