import { createReducer, on } from '@ngrx/store';
import { WorkspaceState } from '../app.state';
import * as WorkspaceActions from '../actions/workspace.actions';

const initialState: WorkspaceState = {
  workspaces: [],
  selectedWorkspace: null,
  loading: false,
  error: null,
};

export const workspaceReducer = createReducer(
  initialState,
  on(WorkspaceActions.loadWorkspaces, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(WorkspaceActions.loadWorkspacesSuccess, (state, { workspaces }) => ({
    ...state,
    workspaces,
    loading: false,
  })),
  on(WorkspaceActions.loadWorkspacesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(WorkspaceActions.selectWorkspace, (state, { workspaceId }) => ({
    ...state,
    selectedWorkspace:
      state.workspaces.find((w) => w.id === workspaceId) || null,
  })),
  on(WorkspaceActions.createWorkspace, (state, { workspace }) => ({
    ...state,
    workspaces: [...state.workspaces, workspace],
  })),
  on(WorkspaceActions.updateWorkspace, (state, { workspaceId, workspace }) => ({
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId ? workspace : w
    ),
  })),
  on(WorkspaceActions.deleteWorkspace, (state, { workspaceId }) => ({
    ...state,
    workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
  }))
);
