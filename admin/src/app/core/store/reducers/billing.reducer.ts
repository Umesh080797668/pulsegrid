import { createReducer, on } from '@ngrx/store';
import { BillingState } from '../app.state';
import * as BillingActions from '../actions/billing.actions';

const initialState: BillingState = {
  invoices: [],
  subscriptions: [],
  selectedInvoice: null,
  loading: false,
  error: null,
};

export const billingReducer = createReducer(
  initialState,
  on(BillingActions.loadBilling, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(BillingActions.loadBillingSuccess, (state, { invoices, subscriptions }) => ({
    ...state,
    invoices,
    subscriptions,
    loading: false,
  })),
  on(BillingActions.loadBillingFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(BillingActions.selectInvoice, (state, { invoiceId }) => ({
    ...state,
    selectedInvoice:
      state.invoices.find((i) => i.id === invoiceId) || null,
  })),
  on(BillingActions.generateInvoice, (state) => ({
    ...state,
    loading: true,
  })),
  on(BillingActions.cancelSubscription, (state, { subscriptionId }) => ({
    ...state,
    subscriptions: state.subscriptions.filter(
      (s) => s.id !== subscriptionId
    ),
  }))
);
