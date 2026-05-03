import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as WorkspaceActions from '../actions/workspace.actions';
import { Api } from '../../services/api';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class WorkspaceEffects {
  private actions$ = inject(Actions);
  private api = inject(Api);

  loadWorkspaces$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorkspaceActions.loadWorkspaces),
      mergeMap(() =>
        this.api.get('/workspaces').pipe(
          map((res: any) => WorkspaceActions.loadWorkspacesSuccess({ workspaces: res.items || res })),
          catchError((error) => of(WorkspaceActions.loadWorkspacesFailure({ error: error?.message || 'Failed to load workspaces' })))
        )
      )
    )
  );
}
