import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SsoAdminApiService } from './sso-admin-api.service';
import type { SsoConfigurationModel, SsoPreset } from './sso.types';

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
  template: `
    <section class="hero">
      <div>
        <p class="eyebrow">Enterprise SSO</p>
        <h1>SAML 2.0 / OIDC configuration</h1>
        <p class="lede">
          Configure workspace-level identity provider metadata, entity IDs, ACS URLs, attribute mappings, and sign-in links for Okta,
          Azure AD, and Google Workspace.
        </p>
      </div>
      <div class="hero-card">
        <div class="hero-card-title">Workspace</div>
        <label>
          Workspace ID
          <input [(ngModel)]="workspaceId" placeholder="6f9f0d3c-…" />
        </label>
        <div class="row">
          <button class="primary" (click)="loadConfig()" [disabled]="busy || !workspaceId">Load</button>
          <button class="secondary" (click)="resetForm()" [disabled]="busy">Reset</button>
        </div>
        <p class="hint">A dedicated SSO configuration page is available for every enterprise workspace.</p>
      </div>
    </section>

    <section class="content-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Provider setup</h2>
            <p>Persist per-tenant SSO configuration and supply the correct login URLs for each workspace.</p>
          </div>
          <div class="actions">
            <button class="ghost" (click)="applyPreset('okta')">Okta</button>
            <button class="ghost" (click)="applyPreset('azure')">Azure AD</button>
            <button class="ghost" (click)="applyPreset('google')">Google Workspace</button>
          </div>
        </div>

        <div class="grid-two">
          <label>
            Provider
            <select [(ngModel)]="config.provider">
              <option value="saml2">SAML 2.0</option>
              <option value="oidc">OIDC / OAuth2</option>
            </select>
          </label>
          <label>
            Enabled
            <input type="checkbox" [(ngModel)]="config.enabled" />
          </label>
        </div>

        <div class="grid-two">
          <label>
            Entity ID
            <input [(ngModel)]="config.entityId" placeholder="urn:pulsegrid:workspace:..." />
          </label>
          <label>
            ACS URL
            <input [(ngModel)]="config.acsUrl" placeholder="https://enterprise.example.com/api/v1/enterprise/login/saml2/sso/..." />
          </label>
        </div>

        <div class="grid-two">
          <label>
            Email attribute
            <input [(ngModel)]="config.emailAttribute" />
          </label>
          <label>
            Role attribute
            <input [(ngModel)]="config.roleAttribute" />
          </label>
        </div>

        <div class="grid-two">
          <label>
            Department attribute
            <input [(ngModel)]="config.departmentAttribute" />
          </label>
          <label>
            Groups attribute
            <input [(ngModel)]="config.groupsAttribute" />
          </label>
        </div>

        <ng-container *ngIf="config.provider === 'saml2'; else oidcFields">
          <label>
            IdP metadata XML
            <textarea [(ngModel)]="config.idpMetadataXml" rows="14" placeholder="Paste Okta, Azure AD, or Google Workspace metadata XML here"></textarea>
          </label>
        </ng-container>
        <ng-template #oidcFields>
          <div class="grid-two">
            <label>
              OIDC issuer URL
              <input [(ngModel)]="config.oidcIssuerUrl" placeholder="https://login.microsoftonline.com/.../v2.0" />
            </label>
            <label>
              OIDC client ID
              <input [(ngModel)]="config.oidcClientId" />
            </label>
          </div>
          <label>
            OIDC client secret
            <input [(ngModel)]="config.oidcClientSecret" type="password" />
          </label>
          <label>
            IdP metadata XML / discovery note
            <textarea [(ngModel)]="config.idpMetadataXml" rows="8" placeholder="Store IdP metadata XML or paste a discovery note for admins"></textarea>
          </label>
        </ng-template>

        <div class="row">
          <button class="primary" (click)="saveConfig()" [disabled]="busy || !workspaceId">Save configuration</button>
          <button class="secondary" (click)="enableConfig()" [disabled]="busy || !workspaceId">Enable</button>
          <button class="secondary" (click)="disableConfig()" [disabled]="busy || !workspaceId">Disable</button>
          <button class="ghost danger" (click)="deleteConfig()" [disabled]="busy || !workspaceId">Delete</button>
        </div>

        <p class="status" [class.error]="!!error">{{ error || info }}</p>
      </article>

      <aside class="stack">
        <article class="panel spotlight">
          <h2>Provider presets</h2>
          <ul>
            <li *ngFor="let preset of presets">
              <strong>{{ preset.label }}</strong>
              <p>{{ preset.notes }}</p>
            </li>
          </ul>
        </article>

        <article class="panel">
          <h2>Login URLs</h2>
          <div class="url-card">
            <span>SAML login</span>
            <code>{{ config.samlLoginUrl || 'Load or save a workspace first' }}</code>
          </div>
          <div class="url-card">
            <span>OIDC login</span>
            <code>{{ config.oidcLoginUrl || 'Load or save a workspace first' }}</code>
          </div>
          <div class="row">
            <button class="ghost" (click)="refreshGeneratedArtifacts()" [disabled]="busy || !workspaceId">Refresh artifacts</button>
            <button class="ghost" (click)="copyMetadata()" [disabled]="!config.serviceProviderMetadataXml">Copy SP metadata</button>
          </div>
        </article>

        <article class="panel">
          <h2>Service provider metadata</h2>
          <textarea rows="16" readonly [value]="config.serviceProviderMetadataXml || 'Generated metadata will appear after loading a workspace' "></textarea>
        </article>
      </aside>
    </section>
  `,
  styles: [`
    :host { display: block; color: #e5eefb; }
    .hero { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1.5rem; align-items: stretch; margin-bottom: 1.5rem; }
    .eyebrow { text-transform: uppercase; letter-spacing: .18em; color: #7dd3fc; font-size: .76rem; margin-bottom: .5rem; }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.6rem); line-height: 1.05; }
    .lede { color: #9fb2cc; max-width: 68ch; }
    .hero-card, .panel { background: rgba(9, 16, 32, .88); border: 1px solid rgba(148, 163, 184, .16); border-radius: 22px; box-shadow: 0 30px 70px rgba(2, 6, 23, .28); }
    .hero-card, .panel { padding: 1.25rem; }
    .hero-card-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .14em; color: #7dd3fc; margin-bottom: .75rem; }
    .content-grid { display: grid; grid-template-columns: 1.35fr .95fr; gap: 1.25rem; }
    .stack { display: grid; gap: 1.25rem; }
    .panel-header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1rem; }
    .panel h2 { margin: 0 0 .3rem; font-size: 1.2rem; }
    .panel p, .hint, li p { color: #9fb2cc; }
    label { display: grid; gap: .45rem; margin-bottom: .85rem; color: #c8d7ea; font-size: .92rem; }
    input, select, textarea { width: 100%; border-radius: 14px; border: 1px solid rgba(148, 163, 184, .18); background: #0f172a; color: #eef4ff; padding: .85rem .95rem; font: inherit; box-sizing: border-box; }
    textarea { resize: vertical; }
    input[type='checkbox'] { width: 1.1rem; height: 1.1rem; justify-self: start; }
    .grid-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; }
    .row, .actions { display: flex; flex-wrap: wrap; gap: .75rem; }
    button { border: 0; border-radius: 999px; padding: .8rem 1rem; cursor: pointer; font: inherit; transition: transform .12s ease, opacity .12s ease; }
    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: .55; cursor: not-allowed; transform: none; }
    .primary { background: linear-gradient(135deg, #38bdf8, #6366f1); color: white; }
    .secondary { background: #152238; color: #eef4ff; border: 1px solid rgba(148, 163, 184, .16); }
    .ghost { background: transparent; color: #cfe5ff; border: 1px solid rgba(148, 163, 184, .18); }
    .danger { color: #fda4af; }
    .status { margin-top: 1rem; min-height: 1.2rem; color: #86efac; }
    .status.error { color: #fca5a5; }
    .spotlight ul { margin: 0; padding-left: 1rem; display: grid; gap: .75rem; }
    .spotlight li { line-height: 1.45; }
    .url-card { display: grid; gap: .35rem; margin-bottom: .9rem; }
    .url-card span { color: #7dd3fc; font-size: .82rem; text-transform: uppercase; letter-spacing: .1em; }
    code { display: block; padding: .8rem .9rem; border-radius: 14px; background: #020617; border: 1px solid rgba(148, 163, 184, .18); overflow-wrap: anywhere; }
    @media (max-width: 1100px) { .hero, .content-grid { grid-template-columns: 1fr; } }
  `]
})
export class SsoAdminPageComponent implements OnInit {
  private readonly api = inject(SsoAdminApiService);
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
