import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UserState } from '../app.state';

export const selectUserState = createFeatureSelector<UserState>('users');

export const selectAllUsers = createSelector(
  selectUserState,
  (state: UserState) => state.users
);

export const selectUserLoading = createSelector(
  selectUserState,
  (state: UserState) => state.loading
);

export const selectUserError = createSelector(
  selectUserState,
  (state: UserState) => state.error
);

export const selectSelectedUser = createSelector(
  selectUserState,
  (state: UserState) => state.selectedUser
);

export const selectAllRoles = createSelector(
  selectUserState,
  (state: UserState) => state.roles
);

export const selectUserPagination = createSelector(
  selectUserState,
  (state: UserState) => state.pagination
);

export const selectUserById = (userId: string) =>
  createSelector(selectAllUsers, (users) =>
    users.find((u) => u.id === userId)
  );
