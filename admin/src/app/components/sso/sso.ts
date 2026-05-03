import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SsoAdminApi } from '../../services/sso-service/sso-api-service';
import type { SsoConfigurationModel, SsoPreset } from '../../sso.types';

const emptyConfig = (): SsoConfigurationModel => ({
  workspaceId: '',
  provider: 'saml2',
  entityId: '',
  acsUrl: '',
  idpMetadataXml: '',
  emailAttribute: 'email',
  roleAttribute: 'groups',
  departmentAttribute: 'department',
  groupsAttribute: 'groups',
  enabled: false,
});

@Component({
  selector: 'app-sso-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './sso.html',
  styleUrl: './sso.scss',
})
export class SsoAdminPage implements OnInit {
  private readonly api = inject(SsoAdminApi);
  private readonly route = inject(ActivatedRoute);

  workspaceId = '';
  busy = false;
  error = '';
  info = 'Configure tenant SSO and copy the service-provider metadata into your IdP.';
  config: SsoConfigurationModel = emptyConfig();
  presets: SsoPreset[] = [
    {
      label: 'Okta',
      provider: 'saml2',
      notes: 'Map email to email, roles to groups, and department to department. Use Okta SAML metadata XML.',
      emailAttribute: 'email',
      roleAttribute: 'groups',
      departmentAttribute: 'department',
      groupsAttribute: 'groups',
    },
    {
      label: 'Azure AD',
      provider: 'saml2',
      notes: 'Use the Microsoft Entra ID SAML app, mapping emailAddress, roles, and department claims.',
      emailAttribute: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      roleAttribute: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      departmentAttribute: 'department',
      groupsAttribute: 'groups',
    },
    {
      label: 'Google Workspace',
      provider: 'saml2',
      notes: 'Use the Google SAML app, map primary email plus groups/department as custom attributes.',
      emailAttribute: 'email',
      roleAttribute: 'groups',
      departmentAttribute: 'department',
      groupsAttribute: 'groups',
    },
  ];

  ngOnInit(): void {
    const presetWorkspaceId = this.route.snapshot.queryParamMap.get('workspaceId') || '';
    if (presetWorkspaceId) {
      this.workspaceId = presetWorkspaceId;
      void this.loadConfig();
    }
  }

  resetForm(): void {
    this.config = emptyConfig();
    this.error = '';
    this.info = 'Configuration cleared.';
  }

  applyPreset(kind: 'okta' | 'azure' | 'google'): void {
    const preset = this.presets.find((item) =>
      kind === 'okta' ? item.label === 'Okta' : kind === 'azure' ? item.label === 'Azure AD' : item.label === 'Google Workspace',
    );
    if (!preset) return;
    this.config.provider = 'saml2';
    this.config.emailAttribute = preset.emailAttribute;
    this.config.roleAttribute = preset.roleAttribute;
    this.config.departmentAttribute = preset.departmentAttribute;
    this.config.groupsAttribute = preset.groupsAttribute;
    this.info = `${preset.label} preset applied.`;
  }

  async loadConfig(): Promise<void> {
    if (!this.workspaceId) {
      this.error = 'Workspace ID is required.';
      return;
    }
    this.setBusy(true);
    try {
      const config = await this.api.loadConfig(this.workspaceId);
      this.config = config ? { ...config } : { ...emptyConfig(), workspaceId: this.workspaceId };
      this.info = config ? 'Loaded existing SSO configuration.' : 'No saved SSO configuration found; starting fresh.';
      await this.refreshGeneratedArtifacts();
      this.error = '';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to load configuration';
    } finally {
      this.setBusy(false);
    }
  }

  async saveConfig(): Promise<void> {
    if (!this.workspaceId) {
      this.error = 'Workspace ID is required.';
      return;
    }
    this.setBusy(true);
    try {
      this.config.workspaceId = this.workspaceId;
      const saved = await this.api.saveConfig(this.config);
      this.config = { ...saved, workspaceId: this.workspaceId };
      await this.refreshGeneratedArtifacts();
      this.info = 'SSO configuration saved successfully.';
      this.error = '';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to save configuration';
    } finally {
      this.setBusy(false);
    }
  }

  async enableConfig(): Promise<void> {
    if (!this.workspaceId) return;
    this.setBusy(true);
    try {
      await this.api.enableConfig(this.workspaceId);
      this.config.enabled = true;
      this.info = 'SSO enabled for the workspace.';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to enable SSO';
    } finally {
      this.setBusy(false);
    }
  }

  async disableConfig(): Promise<void> {
    if (!this.workspaceId) return;
    this.setBusy(true);
    try {
      await this.api.disableConfig(this.workspaceId);
      this.config.enabled = false;
      this.info = 'SSO disabled for the workspace.';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to disable SSO';
    } finally {
      this.setBusy(false);
    }
  }

  async deleteConfig(): Promise<void> {
    if (!this.workspaceId) return;
    this.setBusy(true);
    try {
      await this.api.deleteConfig(this.workspaceId);
      this.config = { ...emptyConfig(), workspaceId: this.workspaceId };
      this.info = 'SSO configuration deleted.';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unable to delete SSO configuration';
    } finally {
      this.setBusy(false);
    }
  }

  async refreshGeneratedArtifacts(): Promise<void> {
    if (!this.workspaceId) return;
    try {
      this.config.serviceProviderMetadataXml = await this.api.loadMetadata(this.workspaceId);
    } catch {
      this.config.serviceProviderMetadataXml = this.config.serviceProviderMetadataXml || '';
    }
    try {
      const saml = await this.api.loadLoginUrl(this.workspaceId, 'saml2');
      this.config.samlLoginUrl = saml.loginUrl;
      this.config.samlRegistrationId = saml.registrationId;
    } catch {
      this.config.samlLoginUrl = this.config.samlLoginUrl || '';
    }
    try {
      const oidc = await this.api.loadLoginUrl(this.workspaceId, 'oidc');
      this.config.oidcLoginUrl = oidc.loginUrl;
      this.config.oidcRegistrationId = oidc.registrationId;
    } catch {
      this.config.oidcLoginUrl = this.config.oidcLoginUrl || '';
    }
  }

  async copyMetadata(): Promise<void> {
    if (!this.config.serviceProviderMetadataXml) return;
    await navigator.clipboard.writeText(this.config.serviceProviderMetadataXml);
    this.info = 'Service-provider metadata copied to clipboard.';
  }

  private setBusy(value: boolean): void {
    this.busy = value;
    if (value) {
      this.error = '';
    }
  }
}
