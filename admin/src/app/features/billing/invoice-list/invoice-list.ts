import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as BillingActions from '../../../core/store/actions/billing.actions';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-list.html',
  styleUrl: './invoice-list.scss',
})
export class InvoiceList implements OnInit {
  invoices$: Observable<any[]>;

  constructor(private store: Store) {
    this.invoices$ = this.store.select((s: any) => s.billing?.invoices || []);
  }

  ngOnInit(): void {
    this.store.dispatch(BillingActions.loadBilling());
  }
}
