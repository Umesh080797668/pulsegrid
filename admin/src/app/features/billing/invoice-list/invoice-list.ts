import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as BillingActions from '../../../core/store/actions/billing.actions';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { InvoiceDetail } from '../invoice-detail/invoice-detail';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatPaginatorModule,
    MatDialogModule,
  ],
  templateUrl: './invoice-list.html',
  styleUrl: './invoice-list.scss',
})
export class InvoiceList implements OnInit {
  invoices$: Observable<any[]>;
  dataSource = new MatTableDataSource<any>([]);
  displayedColumns = ['id', 'customer', 'amount', 'status', 'issuedAt', 'actions'];

  @ViewChild(MatPaginator) paginator: MatPaginator | null = null;

  constructor(private store: Store, private dialog: MatDialog) {
    this.invoices$ = this.store.select((s: any) => s.billing?.invoices || []);
  }

  ngOnInit(): void {
    this.store.dispatch(BillingActions.loadBilling());

    this.invoices$.subscribe((invoices) => {
      this.dataSource.data = invoices || [];
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
    });
  }

  applyFilter(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  downloadInvoice(invoiceId: string, format: 'pdf' | 'csv' = 'pdf') {
    this.store.dispatch(BillingActions.downloadInvoice({ invoiceId, format }));
  }

  openInvoice(invoice: any) {
    this.dialog.open(InvoiceDetail, {
      width: '640px',
      data: { invoice },
    });
  }
}
