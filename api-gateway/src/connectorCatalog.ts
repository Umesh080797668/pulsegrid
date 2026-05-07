export interface ConnectorCatalogItem {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
  notes?: string[];
  [k: string]: any;
}

export const DEFAULT_CONNECTOR_CATALOG: ConnectorCatalogItem[] = [
  {
    connector: 'http',
    action: 'request',
    category: 'custom',
    auth: 'mixed',
    required_input_fields: ['url'],
    optional_input_fields: ['method', 'json_body', 'headers'],
  },
  {
    connector: 'slack',
    action: 'send_message',
    category: 'communication',
    auth: 'none',
    required_input_fields: ['webhook_url', 'text'],
    optional_input_fields: [],
  },
  {
    connector: 'gmail',
    action: 'send_email',
    category: 'communication',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'from', 'to', 'subject', 'body'],
    optional_input_fields: [],
  },
  {
    connector: 'github',
    action: 'create_issue',
    category: 'developer',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'owner', 'repo', 'title'],
    optional_input_fields: ['body'],
  },
  {
    connector: 'telegram',
    action: 'send_message',
    category: 'communication',
    auth: 'api_key',
    required_input_fields: ['bot_token', 'chat_id', 'text'],
    optional_input_fields: [],
  },
  {
    connector: 'google_sheets',
    action: 'append_rows',
    category: 'productivity',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'spreadsheet_id', 'range', 'values'],
    optional_input_fields: [],
  },
  {
    connector: 'notion',
    action: 'create_page',
    category: 'productivity',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'database_id', 'properties'],
    optional_input_fields: [],
  },
  {
    connector: 'discord',
    action: 'send_message',
    category: 'communication',
    auth: 'none',
    required_input_fields: ['webhook_url', 'content'],
    optional_input_fields: [],
  },
  {
    connector: 'schedule',
    action: 'next_run',
    category: 'core',
    auth: 'none',
    required_input_fields: ['cron'],
    optional_input_fields: ['from'],
  },
  {
    connector: 'webhook',
    action: 'verify_signature',
    category: 'core',
    auth: 'api_key',
    required_input_fields: ['secret', 'raw_payload', 'provided_signature'],
    optional_input_fields: [],
  },
  {
    connector: 'custom',
    action: 'call_api',
    category: 'custom',
    auth: 'mixed',
    required_input_fields: ['endpoint_url'],
    optional_input_fields: ['method', 'body', 'headers', 'bearer_token', 'api_key_header', 'api_key_value'],
    notes: ['Use connector=custom or connector=custom_app for generic API actions.'],
  },
  {
    connector: 'resend',
    action: 'send_email',
    category: 'communication',
    auth: 'bearer',
    required_input_fields: ['api_key', 'from', 'to', 'subject', 'html'],
    optional_input_fields: [],
  },
  {
    connector: 'openai',
    action: 'chat_completion',
    category: 'ai',
    auth: 'bearer',
    required_input_fields: ['api_key', 'messages'],
    optional_input_fields: ['model', 'temperature', 'endpoint_url'],
  },
  {
    connector: 'anthropic',
    action: 'messages',
    category: 'ai',
    auth: 'api_key',
    required_input_fields: ['api_key', 'messages'],
    optional_input_fields: ['model', 'max_tokens', 'endpoint_url'],
  },
  {
    connector: 'airtable',
    action: 'create_record',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['api_key', 'base_id', 'table', 'fields'],
    optional_input_fields: [],
  },
  {
    connector: 'hubspot',
    action: 'create_contact',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['access_token', 'properties'],
    optional_input_fields: [],
  },
  {
    connector: 'jira',
    action: 'create_issue',
    category: 'developer',
    auth: 'bearer',
    required_input_fields: ['domain', 'access_token', 'fields'],
    optional_input_fields: [],
  },
  {
    connector: 'linear',
    action: 'graphql',
    category: 'developer',
    auth: 'bearer',
    required_input_fields: ['api_key', 'query'],
    optional_input_fields: ['variables'],
  },
  {
    connector: 'asana',
    action: 'create_task',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['access_token', 'data'],
    optional_input_fields: [],
  },
  {
    connector: 'clickup',
    action: 'create_task',
    category: 'business',
    auth: 'api_key',
    required_input_fields: ['api_key', 'list_id', 'name'],
    optional_input_fields: ['description', 'assignees', 'tags'],
  },
  {
    connector: 'trello',
    action: 'create_card',
    category: 'productivity',
    auth: 'api_key',
    required_input_fields: ['key', 'token', 'list_id', 'name'],
    optional_input_fields: ['desc'],
  },
  {
    connector: 'zendesk',
    action: 'create_ticket',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['subdomain', 'access_token', 'ticket'],
    optional_input_fields: [],
  },
  {
    connector: 'pagerduty',
    action: 'enqueue_event',
    category: 'developer',
    auth: 'api_key',
    required_input_fields: ['routing_key', 'payload'],
    optional_input_fields: ['event_action'],
  },
  {
    connector: 'stripe',
    action: 'request',
    category: 'finance',
    auth: 'api_key',
    required_input_fields: ['api_key'],
    optional_input_fields: ['endpoint_url', 'method', 'body', 'headers'],
  },
  {
    connector: 'sendgrid',
    action: 'send_email',
    category: 'communication',
    auth: 'api_key',
    required_input_fields: ['api_key', 'from', 'to', 'subject', 'content'],
    optional_input_fields: ['content_type'],
  },
  {
    connector: 'salesforce',
    action: 'create_record',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['access_token', 'instance_url', 'object_api_name', 'fields'],
    optional_input_fields: ['api_version'],
  },
  {
    connector: 'shopify',
    action: 'request',
    category: 'commerce',
    auth: 'api_key',
    required_input_fields: ['store_domain', 'access_token'],
    optional_input_fields: ['endpoint_path', 'method', 'body', 'headers'],
  },
  {
    connector: 'gitlab',
    action: 'create_issue',
    category: 'developer',
    auth: 'bearer',
    required_input_fields: ['access_token', 'project_id', 'title'],
    optional_input_fields: ['description', 'labels', 'assignee_ids'],
  },
  {
    connector: 'monday',
    action: 'graphql',
    category: 'productivity',
    auth: 'api_key',
    required_input_fields: ['api_key', 'query'],
    optional_input_fields: ['variables'],
  },
  {
    connector: 'brevo',
    action: 'send_email',
    category: 'communication',
    auth: 'api_key',
    required_input_fields: ['api_key', 'from', 'to', 'subject', 'html_content'],
    optional_input_fields: ['reply_to'],
  },
];

export function validateCatalogItem(item: any): string[] {
  const errs: string[] = [];
  if (!item || typeof item !== 'object') {
    errs.push('item must be an object');
    return errs;
  }
  if (!item.connector || typeof item.connector !== 'string') errs.push('missing connector');
  if (!item.action || typeof item.action !== 'string') errs.push('missing action');
  if (!Array.isArray(item.required_input_fields)) errs.push('required_input_fields must be array');
  if (!Array.isArray(item.optional_input_fields)) errs.push('optional_input_fields must be array');
  if (!['none', 'bearer', 'api_key', 'oauth2', 'mixed'].includes(item.auth)) errs.push('invalid auth');
  return errs;
}

export async function getCatalogFromUrl(url: string): Promise<ConnectorCatalogItem[] | null> {
  try {
    // prefer global fetch if available
    const fetchFn: any = (globalThis as any).fetch ?? (await import('node-fetch')).default;
    const res = await fetchFn(url, { method: 'GET' });
    if (!res.ok) return null;
    const body = await res.json();
    if (Array.isArray(body)) return body as ConnectorCatalogItem[];
    if (body && Array.isArray(body.items)) return body.items as ConnectorCatalogItem[];
    return null;
  } catch (err) {
    return null;
  }
}
