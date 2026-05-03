import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as ComplianceActions from '../actions/compliance.actions';
import { Compliance } from '../../services/compliance';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class ComplianceEffects {
  private actions$ = inject(Actions);
  private complianceService = inject(Compliance);

  loadCompliance$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ComplianceActions.loadCompliance),
      mergeMap(() =>
        this.complianceService.getDashboard().pipe(
          map((res: any) => ComplianceActions.loadComplianceSuccess({ policies: res.policies || [], violations: res.violations || [], metrics: res.metrics || {} })),
          catchError((error) => of(ComplianceActions.loadComplianceFailure({ error: error?.message || 'Failed to load compliance' })))
        )
      )
    )
  );
}
