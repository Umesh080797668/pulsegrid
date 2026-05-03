import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import * as UserActions from '../../../core/store/actions/user.actions';
import { selectAllUsers, selectUserLoading } from '../../../core/store/selectors/user.selectors';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatPaginatorModule],
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
})
export class UserList implements OnInit {
  users$: Observable<any[]>;
  loading$: Observable<boolean>;

  displayedColumns = ['id', 'name', 'email', 'roles'];

  constructor(private store: Store) {
    this.users$ = this.store.select(selectAllUsers);
    this.loading$ = this.store.select(selectUserLoading);
  }

  ngOnInit(): void {
    this.store.dispatch(UserActions.loadUsers({ page: 0, size: 25 }));
  }
}
