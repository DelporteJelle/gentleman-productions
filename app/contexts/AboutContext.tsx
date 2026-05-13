"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { useQuery, useQueryClient, useIsRestoring } from "@tanstack/react-query";
import { Partner, TeamMember } from "@/types";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  notifySuccess,
  notifyError,
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
// Query Keys
// ============================================================================

export const aboutQueryKeys = {
  teamMembers: ["teamMembers"] as const,
  partners: ["partners"] as const,
};

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
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();

  const {
    data: teamMembers = [],
    isLoading: teamLoading,
    error: teamError,
  } = useQuery({
    queryKey: aboutQueryKeys.teamMembers,
    queryFn: TeamAPI.fetchAll,
  });

  const {
    data: partners = [],
    isLoading: partnersLoading,
    error: partnersError,
  } = useQuery({
    queryKey: aboutQueryKeys.partners,
    queryFn: PartnersAPI.fetchAll,
  });

  const loading = teamLoading || partnersLoading || isRestoring;
  const error = teamError?.message ?? partnersError?.message ?? null;

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aboutQueryKeys.teamMembers }),
      queryClient.invalidateQueries({ queryKey: aboutQueryKeys.partners }),
    ]);
  }, [queryClient]);

  // ============================================================================
  // Team Member Operations
  // ============================================================================

  const createTeamMember = useCallback(
    async (member: TeamMember) => {
      try {
        await TeamAPI.create(member);
        notifySuccess("Success", "Team member created successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.teamMembers });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create team member";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const updateTeamMember = useCallback(
    async (member: TeamMember) => {
      try {
        await TeamAPI.update(member);
        notifySuccess("Success", "Team member updated successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.teamMembers });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update team member";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const deleteTeamMember = useCallback(
    async (uuid: string) => {
      try {
        await TeamAPI.delete(uuid);
        notifySuccess("Success", "Team member deleted successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.teamMembers });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete team member";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  // ============================================================================
  // Partner Operations
  // ============================================================================

  const createPartner = useCallback(
    async (partner: Partner) => {
      try {
        await PartnersAPI.create(partner);
        notifySuccess("Success", "Partner created successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.partners });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create partner";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const updatePartner = useCallback(
    async (partner: Partner) => {
      try {
        await PartnersAPI.update(partner);
        notifySuccess("Success", "Partner updated successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.partners });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update partner";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  const deletePartner = useCallback(
    async (uuid: string) => {
      try {
        await PartnersAPI.delete(uuid);
        notifySuccess("Success", "Partner deleted successfully");
        await queryClient.invalidateQueries({ queryKey: aboutQueryKeys.partners });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete partner";
        notifyError("Error", message);
      }
    },
    [queryClient],
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: AboutContextValue = useMemo(
    () => ({
      teamMembers,
      partners,
      loading,
      error,

      fetchData,

      createTeamMember,
      updateTeamMember,
      deleteTeamMember,

      createPartner,
      updatePartner,
      deletePartner,
    }),
    [
      teamMembers,
      partners,
      loading,
      error,
      fetchData,
      createTeamMember,
      updateTeamMember,
      deleteTeamMember,
      createPartner,
      updatePartner,
      deletePartner,
    ],
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
