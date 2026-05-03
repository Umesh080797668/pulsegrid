import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as AuditActions from '../../../core/store/actions/audit.actions';
import {
  selectAllAuditLogs,
  selectAuditLoading,
  selectAuditPagination,
} from '../../../core/store/selectors/audit.selectors';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuditFilter } from '../audit-filter/audit-filter';
import { AuditExport } from '../audit-export/audit-export';
import { AuditFilters } from '../../../core/store/app.state';

@Component({
  selector: 'app-audit-log-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    AuditFilter,
    AuditExport,
  ],
  templateUrl: './audit-log-viewer.html',
  styleUrl: './audit-log-viewer.scss',
})
export class AuditLogViewer implements OnInit {
  logs$: Observable<any[]>;
  loading$: Observable<boolean>;
  pagination$: Observable<any>;

  dataSource = new MatTableDataSource<any>([]);
  displayedColumns = [
    'timestamp',
    'user',
    'action',
    'resource',
    'details',
    'status',
  ];

  @ViewChild(MatPaginator) paginator: MatPaginator | null = null;

  constructor(private store: Store) {
    this.logs$ = this.store.select(selectAllAuditLogs);
    this.loading$ = this.store.select(selectAuditLoading);
    this.pagination$ = this.store.select(selectAuditPagination);
  }

  ngOnInit(): void {
    this.store.dispatch(AuditActions.loadAuditLogs({ page: 0, size: 25 }));

    this.logs$.subscribe((logs) => {
      this.dataSource.data = logs || [];
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
    });
  }

  onFilterApply(filters: AuditFilters) {
    this.store.dispatch(AuditActions.filterAuditLogs({ filters }));
  }

  onFilterClear() {
    this.store.dispatch(AuditActions.clearAuditFilters());
  }

  onExport(format: 'csv' | 'pdf' | 'json') {
    this.store.dispatch(AuditActions.exportAuditLogs({ format }));
  }

  onPageChange(event: any) {
    this.store.dispatch(
      AuditActions.loadAuditLogs({
        page: event.pageIndex,
        size: event.pageSize,
      })
    );
  }
}
