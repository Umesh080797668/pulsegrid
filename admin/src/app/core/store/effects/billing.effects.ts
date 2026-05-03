import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as BillingActions from '../actions/billing.actions';
import { Billing } from '../../services/billing';
import { catchError, map, mergeMap, of, forkJoin, tap } from 'rxjs';

@Injectable()
export class BillingEffects {
  private actions$ = inject(Actions);
  private billingService = inject(Billing);

  loadBilling$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BillingActions.loadBilling),
      mergeMap(() =>
        forkJoin({
          invoices: this.billingService.getInvoices(0, 50),
          subscriptions: this.billingService.getSubscriptions(),
        }).pipe(
          map(({ invoices, subscriptions }: any) =>
            BillingActions.loadBillingSuccess({
              invoices: invoices.items || invoices.invoices || invoices || [],
              subscriptions: subscriptions.items || subscriptions.subscriptions || subscriptions || [],
            })
          ),
          catchError((error) => of(BillingActions.loadBillingFailure({ error: error?.message || 'Failed to load billing' })))
        )
      )
    )
  );

  generateInvoice$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BillingActions.generateInvoice),
      mergeMap(({ billingPeriod }) =>
        this.billingService.generateInvoice(billingPeriod).pipe(
          map(() => BillingActions.loadBilling()),
          catchError((error) => of(BillingActions.loadBillingFailure({ error: error?.message || 'Failed to generate invoice' })))
        )
      )
    )
  );

  updateSubscription$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BillingActions.updateSubscription),
      mergeMap(({ subscriptionId, plan }) =>
        this.billingService.updateSubscription(subscriptionId, plan).pipe(
          map(() => BillingActions.loadBilling()),
          catchError((error) => of(BillingActions.loadBillingFailure({ error: error?.message || 'Failed to update subscription' })))
        )
      )
    )
  );

  cancelSubscription$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BillingActions.cancelSubscription),
      mergeMap(({ subscriptionId }) =>
        this.billingService.cancelSubscription(subscriptionId).pipe(
          map(() => BillingActions.loadBilling()),
          catchError((error) => of(BillingActions.loadBillingFailure({ error: error?.message || 'Failed to cancel subscription' })))
        )
      )
    )
  );

  downloadInvoice$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(BillingActions.downloadInvoice),
        mergeMap(({ invoiceId, format }) =>
          this.billingService.downloadInvoice(invoiceId).pipe(
            tap((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `invoice-${invoiceId}.${format}`;
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
