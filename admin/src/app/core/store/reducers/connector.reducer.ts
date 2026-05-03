import { createReducer, on } from '@ngrx/store';
import { ConnectorState } from '../app.state';
import * as ConnectorActions from '../actions/connector.actions';

const initialState: ConnectorState = {
  connectors: [],
  allowlist: [],
  blocklist: [],
  selectedConnector: null,
  loading: false,
  error: null,
};

export const connectorReducer = createReducer(
  initialState,
  on(ConnectorActions.loadConnectors, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(ConnectorActions.loadConnectorsSuccess, (state, { connectors, allowlist, blocklist }) => ({
    ...state,
    connectors,
    allowlist,
    blocklist,
    loading: false,
  })),
  on(ConnectorActions.loadConnectorsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ConnectorActions.selectConnector, (state, { connectorId }) => ({
    ...state,
    selectedConnector:
      state.connectors.find((c) => c.id === connectorId) || null,
  })),
  on(ConnectorActions.addToAllowlist, (state, { connectorId }) => ({
    ...state,
    allowlist: [...state.allowlist, connectorId],
    blocklist: state.blocklist.filter((id) => id !== connectorId),
  })),
  on(ConnectorActions.addToBlocklist, (state, { connectorId }) => ({
    ...state,
    blocklist: [...state.blocklist, connectorId],
    allowlist: state.allowlist.filter((id) => id !== connectorId),
  })),
  on(ConnectorActions.removeFromAllowlist, (state, { connectorId }) => ({
    ...state,
    allowlist: state.allowlist.filter((id) => id !== connectorId),
  })),
  on(ConnectorActions.removeFromBlocklist, (state, { connectorId }) => ({
    ...state,
    blocklist: state.blocklist.filter((id) => id !== connectorId),
  }))
);
