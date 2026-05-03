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

  loadRoles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.loadRoles),
      mergeMap(() =>
        this.userService.getRoles().pipe(
          map((res: any) => UserActions.loadRolesSuccess({ roles: res.items || res })),
          catchError((error) => of(UserActions.loadRolesFailure({ error: error?.message || 'Failed to load roles' })))
        )
      )
    )
  );

  createUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.createUser),
      mergeMap(({ user }) =>
        this.userService.createUser(user).pipe(
          map(() => UserActions.loadUsers({ page: 0, size: 25 })),
          catchError((error) => of(UserActions.loadUsersFailure({ error: error?.message || 'Failed to create user' })))
        )
      )
    )
  );

  updateUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.updateUser),
      mergeMap(({ userId, user }) =>
        this.userService.updateUser(userId, user).pipe(
          map(() => UserActions.loadUsers({ page: 0, size: 25 })),
          catchError((error) => of(UserActions.loadUsersFailure({ error: error?.message || 'Failed to update user' })))
        )
      )
    )
  );

  deleteUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.deleteUser),
      mergeMap(({ userId }) =>
        this.userService.deleteUser(userId).pipe(
          map(() => UserActions.loadUsers({ page: 0, size: 25 })),
          catchError((error) => of(UserActions.loadUsersFailure({ error: error?.message || 'Failed to delete user' })))
        )
      )
    )
  );

  assignRole$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.assignRole),
      mergeMap(({ userId, roleId }) =>
        this.userService.assignRole(userId, roleId).pipe(
          map(() => UserActions.loadUsers({ page: 0, size: 25 })),
          catchError((error) => of(UserActions.loadUsersFailure({ error: error?.message || 'Failed to assign role' })))
        )
      )
    )
  );

  createRole$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.createRole),
      mergeMap(({ role }) =>
        this.userService.createRole(role).pipe(
          map(() => UserActions.loadRoles()),
          catchError((error) => of(UserActions.loadRolesFailure({ error: error?.message || 'Failed to create role' })))
        )
      )
    )
  );

  updateRole$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.updateRole),
      mergeMap(({ roleId, role }) =>
        this.userService.updateRole(roleId, role).pipe(
          map(() => UserActions.loadRoles()),
          catchError((error) => of(UserActions.loadRolesFailure({ error: error?.message || 'Failed to update role' })))
        )
      )
    )
  );

  deleteRole$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.deleteRole),
      mergeMap(({ roleId }) =>
        this.userService.deleteRole(roleId).pipe(
          map(() => UserActions.loadRoles()),
          catchError((error) => of(UserActions.loadRolesFailure({ error: error?.message || 'Failed to delete role' })))
        )
      )
    )
  );
}
