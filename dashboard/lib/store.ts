'use client';

import { create } from 'zustand';

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_user_id: string;
  settings?: Record<string, unknown>;
  created_at?: string | null;
};

export const LS_ACCESS = 'pulsegrid.accessToken';
export const LS_WORKSPACE = 'pulsegrid.workspaceId';

type DashboardStore = {
  accessToken: string;
  workspaceId: string;
  workspaces: WorkspaceItem[];
  setAccessToken: (token: string) => void;
  setWorkspaceId: (workspaceId: string) => void;
  setWorkspaces: (workspaces: WorkspaceItem[]) => void;
  clearSession: () => void;
  hydrateFromStorage: () => void;
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  accessToken: '',
  workspaceId: '',
  workspaces: [],
  setAccessToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem(LS_ACCESS, token);
      } else {
        window.localStorage.removeItem(LS_ACCESS);
      }
    }
    set({ accessToken: token });
  },
  setWorkspaceId: (workspaceId) => {
    if (typeof window !== 'undefined') {
      if (workspaceId) {
        window.localStorage.setItem(LS_WORKSPACE, workspaceId);
      } else {
        window.localStorage.removeItem(LS_WORKSPACE);
      }
    }
    set({ workspaceId });
  },
  setWorkspaces: (workspaces) => set({ workspaces }),
  clearSession: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LS_ACCESS);
    }
    set({ accessToken: '', workspaces: [] });
  },
  hydrateFromStorage: () => {
    if (typeof window === 'undefined') {
      return;
    }
    set({
      accessToken: window.localStorage.getItem(LS_ACCESS) || '',
      workspaceId: window.localStorage.getItem(LS_WORKSPACE) || '',
    });
  },
}));
