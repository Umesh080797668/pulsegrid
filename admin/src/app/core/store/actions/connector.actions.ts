import { createAction, props } from '@ngrx/store';
import { Connector } from '../app.state';

export const loadConnectors = createAction(
  '[Connector] Load Connectors'
);

export const loadConnectorsSuccess = createAction(
  '[Connector] Load Connectors Success',
  props<{ connectors: Connector[]; allowlist: string[]; blocklist: string[] }>()
);

export const loadConnectorsFailure = createAction(
  '[Connector] Load Connectors Failure',
  props<{ error: string }>()
);

export const selectConnector = createAction(
  '[Connector] Select Connector',
  props<{ connectorId: string }>()
);

export const addToAllowlist = createAction(
  '[Connector] Add To Allowlist',
  props<{ connectorId: string }>()
);

export const removeFromAllowlist = createAction(
  '[Connector] Remove From Allowlist',
  props<{ connectorId: string }>()
);

export const addToBlocklist = createAction(
  '[Connector] Add To Blocklist',
  props<{ connectorId: string }>()
);

export const removeFromBlocklist = createAction(
  '[Connector] Remove From Blocklist',
  props<{ connectorId: string }>()
);

export const updateConnectorConfig = createAction(
  '[Connector] Update Connector Config',
  props<{ connectorId: string; config: any }>()
);

export const testConnector = createAction(
  '[Connector] Test Connector',
  props<{ connectorId: string }>()
);

export const deployConnector = createAction(
  '[Connector] Deploy Connector',
  props<{ connectorId: string }>()
);
