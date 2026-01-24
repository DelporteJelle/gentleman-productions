"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Partner, TeamMember } from "@/types";
import { CacheKeys, saveToCache, loadFromCache, clearCache } from "@/lib/cache";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  notifySuccess,
  notifyError,
  delay,
  CACHE_INVALIDATION_DELAY,
} from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

interface AboutState {
  teamMembers: TeamMember[];
  partners: Partner[];
  loading: boolean;
  error: string | null;
}

interface AboutContextValue extends AboutState {
  // Data fetching
  fetchData: () => Promise<void>;

  // Team member operations
  createTeamMember: (member: TeamMember) => Promise<void>;
  updateTeamMember: (member: TeamMember) => Promise<void>;
  deleteTeamMember: (uuid: string) => Promise<void>;

  // Partner operations
  createPartner: (partner: Partner) => Promise<void>;
  updatePartner: (partner: Partner) => Promise<void>;
  deletePartner: (uuid: string) => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const AboutContext = createContext<AboutContextValue | undefined>(undefined);

// ============================================================================
// API Functions
// ============================================================================

const TeamAPI = {
  async fetchAll(): Promise<TeamMember[]> {
    return apiGet<TeamMember[]>("/api/team");
  },

  async create(member: TeamMember): Promise<TeamMember> {
    return apiPost<TeamMember, TeamMember>("/api/team", member);
  },

  async update(member: TeamMember): Promise<TeamMember> {
    return apiPut<TeamMember, TeamMember>("/api/team", member);
  },

  async delete(uuid: string): Promise<void> {
    await apiDelete(`/api/team?uuid=${uuid}`);
  },
};

const PartnersAPI = {
  async fetchAll(): Promise<Partner[]> {
    return apiGet<Partner[]>("/api/partners");
  },

  async create(partner: Partner): Promise<Partner> {
    return apiPost<Partner, Partner>("/api/partners", partner);
  },

  async update(partner: Partner): Promise<Partner> {
    return apiPut<Partner, Partner>("/api/partners", partner);
  },

  async delete(uuid: string): Promise<void> {
    await apiDelete(`/api/partners?uuid=${uuid}`);
  },
};

// ============================================================================
// Provider Component
// ============================================================================

export const AboutProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AboutState>({
    teamMembers: [],
    partners: [],
    loading: false,
    error: null,
  });

  // Helper to update state partially
  const updateState = useCallback((updates: Partial<AboutState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchTeamMembers = useCallback(
    async (skipCache = false): Promise<TeamMember[]> => {
      // Try cache first if not skipping
      if (!skipCache) {
        const cached = loadFromCache<TeamMember[]>(CacheKeys.TEAM_MEMBERS);
        if (cached) return cached;
      }

      // Fetch from API
      const data = await TeamAPI.fetchAll();
      saveToCache(CacheKeys.TEAM_MEMBERS, data);
      return data;
    },
    []
  );

  const fetchPartners = useCallback(
    async (skipCache = false): Promise<Partner[]> => {
      // Try cache first if not skipping
      if (!skipCache) {
        const cached = loadFromCache<Partner[]>(CacheKeys.PARTNERS);
        if (cached) return cached;
      }

      // Fetch from API
      const data = await PartnersAPI.fetchAll();
      saveToCache(CacheKeys.PARTNERS, data);
      return data;
    },
    []
  );

  const fetchData = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      const [teamMembers, partners] = await Promise.all([
        fetchTeamMembers(),
        fetchPartners(),
      ]);

      updateState({
        teamMembers,
        partners,
        loading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch data";
      updateState({ error: message, loading: false });
      notifyError("Error", message);
    }
  }, [fetchTeamMembers, fetchPartners, updateState]);

  // ============================================================================
  // Team Member Operations
  // ============================================================================

  const createTeamMember = useCallback(
    async (member: TeamMember) => {
      updateState({ loading: true, error: null });

      try {
        const newMember = await TeamAPI.create(member);
        notifySuccess("Success", "Team member created successfully");

        // Update state with new member
        setState((prev) => ({
          ...prev,
          teamMembers: [...prev.teamMembers, newMember],
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.TEAM_MEMBERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create team member";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  const updateTeamMember = useCallback(
    async (member: TeamMember) => {
      updateState({ loading: true, error: null });

      try {
        const updatedMember = await TeamAPI.update(member);
        notifySuccess("Success", "Team member updated successfully");

        // Update state with updated member
        setState((prev) => ({
          ...prev,
          teamMembers: prev.teamMembers.map((m) =>
            m.uuid === updatedMember.uuid ? updatedMember : m
          ),
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.TEAM_MEMBERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update team member";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  const deleteTeamMember = useCallback(
    async (uuid: string) => {
      updateState({ loading: true, error: null });

      try {
        await TeamAPI.delete(uuid);
        notifySuccess("Success", "Team member deleted successfully");

        // Remove from state
        setState((prev) => ({
          ...prev,
          teamMembers: prev.teamMembers.filter((m) => m.uuid !== uuid),
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.TEAM_MEMBERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete team member";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  // ============================================================================
  // Partner Operations
  // ============================================================================

  const createPartner = useCallback(
    async (partner: Partner) => {
      updateState({ loading: true, error: null });

      try {
        const newPartner = await PartnersAPI.create(partner);
        notifySuccess("Success", "Partner created successfully");

        // Update state with new partner
        setState((prev) => ({
          ...prev,
          partners: [...prev.partners, newPartner],
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.PARTNERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create partner";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  const updatePartner = useCallback(
    async (partner: Partner) => {
      updateState({ loading: true, error: null });

      try {
        const updatedPartner = await PartnersAPI.update(partner);
        notifySuccess("Success", "Partner updated successfully");

        // Update state with updated partner
        setState((prev) => ({
          ...prev,
          partners: prev.partners.map((p) =>
            p.uuid === updatedPartner.uuid ? updatedPartner : p
          ),
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.PARTNERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update partner";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  const deletePartner = useCallback(
    async (uuid: string) => {
      updateState({ loading: true, error: null });

      try {
        await PartnersAPI.delete(uuid);
        notifySuccess("Success", "Partner deleted successfully");

        // Remove from state
        setState((prev) => ({
          ...prev,
          partners: prev.partners.filter((p) => p.uuid !== uuid),
          loading: false,
        }));

        // Invalidate cache
        clearCache(CacheKeys.PARTNERS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete partner";
        updateState({ error: message, loading: false });
        notifyError("Error", message);
      }
    },
    [updateState]
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: AboutContextValue = useMemo(
    () => ({
      // State
      teamMembers: state.teamMembers,
      partners: state.partners,
      loading: state.loading,
      error: state.error,

      // Data fetching
      fetchData,

      // Team member operations
      createTeamMember,
      updateTeamMember,
      deleteTeamMember,

      // Partner operations
      createPartner,
      updatePartner,
      deletePartner,
    }),
    [
      state,
      fetchData,
      createTeamMember,
      updateTeamMember,
      deleteTeamMember,
      createPartner,
      updatePartner,
      deletePartner,
    ]
  );

  return (
    <AboutContext.Provider value={value}>{children}</AboutContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const useAbout = (): AboutContextValue => {
  const context = useContext(AboutContext);
  if (!context) {
    throw new Error("useAbout must be used within an AboutProvider");
  }
  return context;
};
