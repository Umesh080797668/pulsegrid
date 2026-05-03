import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as AuditActions from '../actions/audit.actions';
import { Audit } from '../../services/audit';
import { catchError, map, mergeMap, of, tap } from 'rxjs';

@Injectable()
export class AuditEffects {
  private actions$ = inject(Actions);
  private auditService = inject(Audit);

  loadAudit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuditActions.loadAuditLogs),
      mergeMap(({ page = 0, size = 20, filters }) =>
        this.auditService.getAuditLogs(page, size, filters).pipe(
          map((res: any) => AuditActions.loadAuditLogsSuccess({ logs: res.items || res, total: res.total || (res.items && res.items.length) || 0 })),
          catchError((error) => of(AuditActions.loadAuditLogsFailure({ error: error?.message || 'Failed to load audit logs' })))
        )
      )
    )
  );

  filterAudit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuditActions.filterAuditLogs),
      map(({ filters }) => AuditActions.loadAuditLogs({ page: 0, size: 25, filters }))
    )
  );

  clearFilters$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuditActions.clearAuditFilters),
      map(() => AuditActions.loadAuditLogs({ page: 0, size: 25, filters: {} }))
    )
  );

  exportAudit$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuditActions.exportAuditLogs),
        mergeMap(({ format }) =>
          this.auditService.exportAuditLogs(format).pipe(
            tap((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `audit-logs.${format}`;
              a.click();
              URL.revokeObjectURL(url);
            }),
            catchError(() => of(null))
          )
        )
      ),
    { dispatch: false }
  );
}
