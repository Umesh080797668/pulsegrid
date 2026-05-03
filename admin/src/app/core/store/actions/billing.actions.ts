import { createAction, props } from '@ngrx/store';

export const loadBilling = createAction(
  '[Billing] Load Billing'
);

export const loadBillingSuccess = createAction(
  '[Billing] Load Billing Success',
  props<{ invoices: any[]; subscriptions: any[] }>()
);

export const loadBillingFailure = createAction(
  '[Billing] Load Billing Failure',
  props<{ error: string }>()
);

export const selectInvoice = createAction(
  '[Billing] Select Invoice',
  props<{ invoiceId: string }>()
);

export const generateInvoice = createAction(
  '[Billing] Generate Invoice',
  props<{ billingPeriod: string }>()
);

export const downloadInvoice = createAction(
  '[Billing] Download Invoice',
  props<{ invoiceId: string; format: 'pdf' | 'csv' }>()
);

export const updateSubscription = createAction(
  '[Billing] Update Subscription',
  props<{ subscriptionId: string; plan: string }>()
);

export const cancelSubscription = createAction(
  '[Billing] Cancel Subscription',
  props<{ subscriptionId: string }>()
);
