import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as ConnectorActions from '../../../core/store/actions/connector.actions';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-connector-list',
  standalone: true,
  imports: [CommonModule, MatListModule],
  templateUrl: './connector-list.html',
  styleUrl: './connector-list.scss',
})
export class ConnectorList implements OnInit {
  connectors$: Observable<any[]>;

  constructor(private store: Store) {
    this.connectors$ = this.store.select((s: any) => s.connectors?.connectors || []);
  }

  ngOnInit(): void {
    this.store.dispatch(ConnectorActions.loadConnectors());
  }
}
