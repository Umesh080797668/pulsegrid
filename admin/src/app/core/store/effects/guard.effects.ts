import { Injectable, inject } from '@angular/core';
import { Actions, concatLatestFrom, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, forkJoin, from, map, mergeMap, of, switchMap } from 'rxjs';
import { Guard } from '../../services/guard';
import { selectGuardFilters } from '../selectors/guard.selectors';
import * as GuardActions from '../actions/guard.actions';

const DEFAULT_MAINTENANCE = {
  maintenance_active: false,
  states: [],
};

const DEFAULT_INDEX_STATUS = {
  status: 'degraded' as const,
  last_rebuilt: null,
  file_count: 0,
};

@Injectable()
export class GuardEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly guardService = inject(Guard);

  loadDashboard$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.loadGuardDashboard),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      switchMap(([{ filters }, currentFilters]) => {
        const effectiveFilters = {
          ...currentFilters,
          ...filters,
        };

        return this.guardService.getAlerts(effectiveFilters).pipe(
          switchMap((alertsResponse) =>
            forkJoin({
              maintenance: this.guardService.getMaintenanceState(effectiveFilters.tenant_id).pipe(
                catchError(() => of(DEFAULT_MAINTENANCE)),
              ),
              indexStatus: this.guardService.getIndexStatus().pipe(
                catchError(() => of(DEFAULT_INDEX_STATUS)),
              ),
            }).pipe(
              map(({ maintenance, indexStatus }) =>
                GuardActions.loadGuardDashboardSuccess({
                  alerts: alertsResponse.alerts ?? [],
                  total: alertsResponse.total ?? 0,
                  limit: alertsResponse.limit ?? effectiveFilters.limit ?? 20,
                  offset: alertsResponse.offset ?? effectiveFilters.offset ?? 0,
                  maintenance,
                  indexStatus,
                }),
              ),
            ),
          ),
          catchError((error) =>
            of(
              GuardActions.loadGuardDashboardFailure({
                error: error?.message || 'Failed to load PulseGuard dashboard',
              }),
            ),
          ),
        );
      }),
    ),
  );

  refreshOnFilterChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.setGuardFilters),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      map(([, filters]) => GuardActions.loadGuardDashboard({ filters })),
    ),
  );

  resetFilters$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.clearGuardFilters),
      map(() => GuardActions.loadGuardDashboard({ filters: { limit: 20, offset: 0 } })),
    ),
  );

  loadAlert$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.loadGuardAlert),
      mergeMap(({ id }) =>
        this.guardService.getAlert(id).pipe(
          map((alert) => GuardActions.loadGuardAlertSuccess({ alert })),
          catchError((error) =>
            of(
              GuardActions.loadGuardAlertFailure({
                error: error?.message || 'Failed to load alert details',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  acknowledgeAlert$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.acknowledgeGuardAlert),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ id, actorUserId }, filters]) =>
        this.guardService.acknowledgeAlert(id, actorUserId).pipe(
          mergeMap((alert) =>
            from([
              GuardActions.loadGuardAlertSuccess({ alert }),
              GuardActions.loadGuardDashboard({ filters }),
              GuardActions.selectGuardAlert({ id: alert.id }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to acknowledge alert',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  resolveAlert$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.resolveGuardAlert),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ id, actorUserId }, filters]) =>
        this.guardService.resolveAlert(id, actorUserId).pipe(
          mergeMap((alert) =>
            from([
              GuardActions.loadGuardAlertSuccess({ alert }),
              GuardActions.loadGuardDashboard({ filters }),
              GuardActions.selectGuardAlert({ id: alert.id }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to resolve alert',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  dismissAlert$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.dismissGuardAlert),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ id, actorUserId }, filters]) =>
        this.guardService.dismissAlert(id, actorUserId).pipe(
          mergeMap((alert) =>
            from([
              GuardActions.loadGuardAlertSuccess({ alert }),
              GuardActions.loadGuardDashboard({ filters }),
              GuardActions.selectGuardAlert({ id: alert.id }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to dismiss alert',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  githubIssue$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.createGuardGithubIssue),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ id, owner, repo, baseBranch }, filters]) =>
        this.guardService.createGithubIssue(id, owner, repo, baseBranch).pipe(
          mergeMap(() =>
            from([
              GuardActions.loadGuardDashboard({ filters }),
              GuardActions.loadGuardAlert({ id }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to create GitHub issue',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  clearMaintenance$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.clearGuardMaintenance),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ tenantId, actorUserId, reason }, filters]) =>
        this.guardService.clearMaintenance(tenantId, actorUserId, reason).pipe(
          mergeMap(() =>
            from([
              GuardActions.loadGuardDashboard({ filters: tenantId ? { ...filters, tenant_id: tenantId } : filters }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to clear maintenance state',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  rebuildIndex$ = createEffect(() =>
    this.actions$.pipe(
      ofType(GuardActions.rebuildGuardIndex),
      concatLatestFrom(() => this.store.select(selectGuardFilters)),
      mergeMap(([{ requestedBy, reason }, filters]) =>
        this.guardService.rebuildIndex(requestedBy, reason).pipe(
          mergeMap(() =>
            from([
              GuardActions.loadGuardDashboard({ filters }),
            ]),
          ),
          catchError((error) =>
            of(
              GuardActions.guardActionFailure({
                error: error?.message || 'Failed to rebuild the index',
              }),
            ),
          ),
        ),
      ),
    ),
  );
}