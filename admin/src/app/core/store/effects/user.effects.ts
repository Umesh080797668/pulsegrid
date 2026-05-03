import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { UserManagement } from '../../services/user-management';
import * as UserActions from '../actions/user.actions';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class UserEffects {
  private actions$ = inject(Actions);
  private userService = inject(UserManagement);

  loadUsers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.loadUsers),
      mergeMap(({ page = 0, size = 10 }) =>
        this.userService.getUsers(page, size).pipe(
          map((res: any) => UserActions.loadUsersSuccess({ users: res.items || res, total: res.total || (res.items && res.items.length) || 0 })),
          catchError((error) => of(UserActions.loadUsersFailure({ error: error?.message || 'Failed to load users' })))
        )
      )
    )
  );
}
