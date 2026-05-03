import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as ComplianceActions from '../actions/compliance.actions';
import { Compliance } from '../../services/compliance';
import { catchError, map, mergeMap, of, tap } from 'rxjs';

@Injectable()
export class ComplianceEffects {
  private actions$ = inject(Actions);
  private complianceService = inject(Compliance);

  loadCompliance$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ComplianceActions.loadCompliance),
      mergeMap(() =>
        this.complianceService.getDashboard().pipe(
          map((res: any) =>
            ComplianceActions.loadComplianceSuccess({
              policies: res.policies || [],
              violations: res.violations || [],
              metrics: res.metrics || {},
            })
          ),
          catchError((error) =>
            of(
              ComplianceActions.loadComplianceFailure({
                error: error?.message || 'Failed to load compliance',
              })
            )
          )
        )
      )
    )
  );

  runAudit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ComplianceActions.runComplianceAudit),
      mergeMap(() =>
        this.complianceService.runAudit().pipe(
          map(() => ComplianceActions.loadCompliance()),
          catchError((error) =>
            of(
              ComplianceActions.loadComplianceFailure({
                error: error?.message || 'Failed to run compliance audit',
              })
            )
          )
        )
      )
    )
  );

  updatePolicy$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ComplianceActions.updateCompliancePolicy),
      mergeMap(({ policyId, policy }) =>
        this.complianceService.updatePolicy(policyId, policy).pipe(
          map(() => ComplianceActions.loadCompliance()),
          catchError((error) =>
            of(
              ComplianceActions.loadComplianceFailure({
                error: error?.message || 'Failed to update policy',
              })
            )
          )
        )
      )
    )
  );

  scheduleAudit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ComplianceActions.scheduleComplianceAudit),
      mergeMap(({ frequency, time }) =>
        this.complianceService.scheduleAudit(frequency, time).pipe(
          map(() => ComplianceActions.loadCompliance()),
          catchError((error) =>
            of(
              ComplianceActions.loadComplianceFailure({
                error: error?.message || 'Failed to schedule audit',
              })
            )
          )
        )
      )
    )
  );

  exportReport$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ComplianceActions.exportComplianceReport),
        mergeMap(({ reportId, format }) =>
          this.complianceService.exportReport(reportId, format).pipe(
            tap((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `compliance-report-${reportId}.${format}`;
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
