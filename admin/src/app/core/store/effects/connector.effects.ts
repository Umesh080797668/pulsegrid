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
          map((res: any) => ConnectorActions.loadConnectorsSuccess({ connectors: res.items || res, allowlist: res.allowlist || [], blocklist: res.blocklist || [] })),
          catchError((error) => of(ConnectorActions.loadConnectorsFailure({ error: error?.message || 'Failed to load connectors' })))
        )
      )
    )
  );
}
