import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as ConnectorActions from '../../../core/store/actions/connector.actions';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ViewChild } from '@angular/core';

@Component({
  selector: 'app-connector-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './connector-list.html',
  styleUrl: './connector-list.scss',
})
export class ConnectorList implements OnInit {
  private store = inject(Store);

  connectors$: Observable<any[]>;
  allowlist$: Observable<string[]>;
  blocklist$: Observable<string[]>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;

  displayedColumns: string[] = ['name', 'type', 'status', 'allowlist', 'blocklist', 'actions'];
  dataSource = new MatTableDataSource<any>([]);
  @ViewChild(MatPaginator) paginator: MatPaginator | null = null;

  searchValue = '';

  constructor() {
    this.connectors$ = this.store.select((s: any) => s.connectors?.connectors || []);
    this.allowlist$ = this.store.select((s: any) => s.connectors?.allowlist || []);
    this.blocklist$ = this.store.select((s: any) => s.connectors?.blocklist || []);
    this.loading$ = this.store.select((s: any) => s.connectors?.loading || false);
    this.error$ = this.store.select((s: any) => s.connectors?.error || null);
  }

  ngOnInit(): void {
    this.store.dispatch(ConnectorActions.loadConnectors());

    this.connectors$.subscribe((connectors) => {
      this.dataSource.data = connectors || [];
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
    });
  }

  onSearch(value: string): void {
    this.searchValue = value;
    this.dataSource.filter = value.trim().toLowerCase();
  }

  isInAllowlist(connectorId: string): boolean {
    let result = false;
    this.allowlist$.subscribe((list) => {
      result = list.includes(connectorId);
    }).unsubscribe();
    return result;
  }

  isInBlocklist(connectorId: string): boolean {
    let result = false;
    this.blocklist$.subscribe((list) => {
      result = list.includes(connectorId);
    }).unsubscribe();
    return result;
  }

  addToAllowlist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.addToAllowlist({ connectorId }));
  }

  removeFromAllowlist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.removeFromAllowlist({ connectorId }));
  }

  addToBlocklist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.addToBlocklist({ connectorId }));
  }

  removeFromBlocklist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.removeFromBlocklist({ connectorId }));
  }

  testConnector(connectorId: string): void {
    this.store.dispatch(ConnectorActions.testConnector({ connectorId }));
  }

  deployConnector(connectorId: string): void {
    this.store.dispatch(ConnectorActions.deployConnector({ connectorId }));
  }
}
