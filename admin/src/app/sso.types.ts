export type SsoProvider = 'saml2' | 'oidc';

export interface SsoConfigurationModel {
  id?: string;
  workspaceId: string;
  provider: SsoProvider;
  entityId: string;
  acsUrl: string;
  idpMetadataXml: string;
  emailAttribute: string;
  roleAttribute?: string;
  departmentAttribute?: string;
  groupsAttribute?: string;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  enabled: boolean;
  samlLoginUrl?: string;
  oidcLoginUrl?: string;
  samlRegistrationId?: string;
  oidcRegistrationId?: string;
  serviceProviderMetadataXml?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SsoPreset {
  label: string;
  provider: SsoProvider;
  notes: string;
  emailAttribute: string;
  roleAttribute: string;
  departmentAttribute: string;
  groupsAttribute: string;
}

export interface LoginUrlResponse {
  provider: string;
  loginUrl: string;
  registrationId: string;
}
