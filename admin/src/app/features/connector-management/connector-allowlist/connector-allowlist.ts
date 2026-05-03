import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as ConnectorActions from '../../../core/store/actions/connector.actions';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-connector-allowlist',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './connector-allowlist.html',
  styleUrl: './connector-allowlist.scss',
})
export class ConnectorAllowlist implements OnInit {
  private store = inject(Store);

  connectors$: Observable<any[]>;
  allowlist$: Observable<string[]>;
  loading$: Observable<boolean>;

  constructor() {
    this.connectors$ = this.store.select((s: any) => s.connectors?.connectors || []);
    this.allowlist$ = this.store.select((s: any) => s.connectors?.allowlist || []);
    this.loading$ = this.store.select((s: any) => s.connectors?.loading || false);
  }

  ngOnInit(): void {
    this.store.dispatch(ConnectorActions.loadConnectors());
  }

  getAllowlistedConnectors(connectors: any[], allowlist: string[]): any[] {
    return connectors.filter((c) => allowlist.includes(c.id));
  }

  removeFromAllowlist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.removeFromAllowlist({ connectorId }));
  }
}
