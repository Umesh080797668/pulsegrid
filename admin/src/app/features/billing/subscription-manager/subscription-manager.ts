import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as BillingActions from '../../../core/store/actions/billing.actions';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-subscription-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './subscription-manager.html',
  styleUrl: './subscription-manager.scss',
})
export class SubscriptionManager implements OnInit {
  subscriptions$: Observable<any[]>;
  draftPlans: Record<string, string> = {};

  constructor(private store: Store) {
    this.subscriptions$ = this.store.select(
      (s: any) => s.billing?.subscriptions || []
    );
  }

  ngOnInit(): void {
    this.store.dispatch(BillingActions.loadBilling());
  }

  updatePlan(subscription: any) {
    const plan = this.draftPlans[subscription.id] || subscription.plan;
    this.store.dispatch(
      BillingActions.updateSubscription({
        subscriptionId: subscription.id,
        plan,
      })
    );
  }

  cancel(subscriptionId: string) {
    if (!confirm('Cancel this subscription?')) return;
    this.store.dispatch(BillingActions.cancelSubscription({ subscriptionId }));
  }
}
