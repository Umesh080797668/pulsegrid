import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as ConnectorActions from '../actions/connector.actions';
import { Connector } from '../../services/connector';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class ConnectorEffects {
  private actions$ = inject(Actions);
  private connectorService = inject(Connector);

  loadConnectors$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.loadConnectors),
      mergeMap(() =>
        this.connectorService.getConnectors().pipe(
          map((res: any) => ConnectorActions.loadConnectorsSuccess({ 
            connectors: res.items || res, 
            allowlist: res.allowlist || [], 
            blocklist: res.blocklist || [] 
          })),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to load connectors' 
          })))
        )
      )
    )
  );

  addToAllowlist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.addToAllowlist),
      mergeMap(({ connectorId }) =>
        this.connectorService.addToAllowlist(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to add to allowlist' 
          })))
        )
      )
    )
  );

  removeFromAllowlist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.removeFromAllowlist),
      mergeMap(({ connectorId }) =>
        this.connectorService.removeFromAllowlist(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to remove from allowlist' 
          })))
        )
      )
    )
  );

  addToBlocklist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.addToBlocklist),
      mergeMap(({ connectorId }) =>
        this.connectorService.addToBlocklist(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to add to blocklist' 
          })))
        )
      )
    )
  );

  removeFromBlocklist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.removeFromBlocklist),
      mergeMap(({ connectorId }) =>
        this.connectorService.removeFromBlocklist(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to remove from blocklist' 
          })))
        )
      )
    )
  );

  updateConnectorConfig$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.updateConnectorConfig),
      mergeMap(({ connectorId, config }) =>
        this.connectorService.updateConfig(connectorId, config).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to update connector config' 
          })))
        )
      )
    )
  );

  testConnector$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.testConnector),
      mergeMap(({ connectorId }) =>
        this.connectorService.testConnector(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to test connector' 
          })))
        )
      )
    )
  );

  deployConnector$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectorActions.deployConnector),
      mergeMap(({ connectorId }) =>
        this.connectorService.deployConnector(connectorId).pipe(
          map(() => ConnectorActions.loadConnectors()),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ 
            error: error?.message || 'Failed to deploy connector' 
          })))
        )
      )
    )
  );
}
