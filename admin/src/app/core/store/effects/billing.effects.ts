import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as BillingActions from '../actions/billing.actions';
import { Billing } from '../../services/billing';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class BillingEffects {
  private actions$ = inject(Actions);
  private billingService = inject(Billing);

  loadBilling$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BillingActions.loadBilling),
      mergeMap(() =>
        this.billingService.getInvoices().pipe(
          map((res: any) => BillingActions.loadBillingSuccess({ invoices: res.invoices || res, subscriptions: res.subscriptions || [] })),
          catchError((error) => of(BillingActions.loadBillingFailure({ error: error?.message || 'Failed to load billing' })))
        )
      )
    )
  );
}
