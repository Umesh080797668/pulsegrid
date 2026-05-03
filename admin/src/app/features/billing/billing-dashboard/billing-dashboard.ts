import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import * as BillingActions from '../../../core/store/actions/billing.actions';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-billing-dashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './billing-dashboard.html',
  styleUrl: './billing-dashboard.scss',
})
export class BillingDashboard implements OnInit {
  invoices$;
  subscriptions$;

  constructor(private store: Store) {
    this.invoices$ = this.store.select((s: any) => s.billing?.invoices || []);
    this.subscriptions$ = this.store.select((s: any) => s.billing?.subscriptions || []);
  }

  ngOnInit(): void {
    this.store.dispatch(BillingActions.loadBilling());
  }

  generateCurrentInvoice() {
    const month = new Date().toISOString().slice(0, 7);
    this.store.dispatch(BillingActions.generateInvoice({ billingPeriod: month }));
  }

  trackRevenue(invoices: any[]): number {
    return (invoices || []).reduce((sum, i) => {
      const amount =
        typeof i.amount === 'number'
          ? i.amount
          : typeof i.total === 'number'
            ? i.total
            : typeof i.amountCents === 'number'
              ? i.amountCents / 100
              : 0;
      return sum + amount;
    }, 0);
  }
}
