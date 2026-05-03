import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as AuditActions from '../../../core/store/actions/audit.actions';
import { selectAllAuditLogs, selectAuditLoading } from '../../../core/store/selectors/audit.selectors';
import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-audit-log-viewer',
  standalone: true,
  imports: [CommonModule, MatTableModule],
  templateUrl: './audit-log-viewer.html',
  styleUrl: './audit-log-viewer.scss',
})
export class AuditLogViewer implements OnInit {
  logs$: Observable<any[]>;
  loading$: Observable<boolean>;

  displayedColumns = ['timestamp', 'user', 'action', 'resource', 'status'];

  constructor(private store: Store) {
    this.logs$ = this.store.select(selectAllAuditLogs);
    this.loading$ = this.store.select(selectAuditLoading);
  }

  ngOnInit(): void {
    this.store.dispatch(AuditActions.loadAuditLogs({ page: 0, size: 25 }));
  }
}
