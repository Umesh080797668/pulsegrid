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
  selector: 'app-connector-blocklist',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './connector-blocklist.html',
  styleUrl: './connector-blocklist.scss',
})
export class ConnectorBlocklist implements OnInit {
  private store = inject(Store);

  connectors$: Observable<any[]>;
  blocklist$: Observable<string[]>;
  loading$: Observable<boolean>;

  constructor() {
    this.connectors$ = this.store.select((s: any) => s.connectors?.connectors || []);
    this.blocklist$ = this.store.select((s: any) => s.connectors?.blocklist || []);
    this.loading$ = this.store.select((s: any) => s.connectors?.loading || false);
  }

  ngOnInit(): void {
    this.store.dispatch(ConnectorActions.loadConnectors());
  }

  getBlocklistedConnectors(connectors: any[], blocklist: string[]): any[] {
    return connectors.filter((c) => blocklist.includes(c.id));
  }

  removeFromBlocklist(connectorId: string): void {
    this.store.dispatch(ConnectorActions.removeFromBlocklist({ connectorId }));
  }
}
