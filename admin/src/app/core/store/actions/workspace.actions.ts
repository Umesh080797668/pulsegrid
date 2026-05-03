import { createAction, props } from '@ngrx/store';

export const loadWorkspaces = createAction(
  '[Workspace] Load Workspaces'
);

export const loadWorkspacesSuccess = createAction(
  '[Workspace] Load Workspaces Success',
  props<{ workspaces: any[] }>()
);

export const loadWorkspacesFailure = createAction(
  '[Workspace] Load Workspaces Failure',
  props<{ error: string }>()
);

export const selectWorkspace = createAction(
  '[Workspace] Select Workspace',
  props<{ workspaceId: string }>()
);

export const createWorkspace = createAction(
  '[Workspace] Create Workspace',
  props<{ workspace: any }>()
);

export const updateWorkspace = createAction(
  '[Workspace] Update Workspace',
  props<{ workspaceId: string; workspace: any }>()
);

export const deleteWorkspace = createAction(
  '[Workspace] Delete Workspace',
  props<{ workspaceId: string }>()
);

export const addWorkspaceMember = createAction(
  '[Workspace] Add Workspace Member',
  props<{ workspaceId: string; userId: string; role: string }>()
);

export const removeWorkspaceMember = createAction(
  '[Workspace] Remove Workspace Member',
  props<{ workspaceId: string; userId: string }>()
);
