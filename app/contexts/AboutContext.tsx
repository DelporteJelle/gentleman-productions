import { Partner, TeamMember } from "@/types";
import { showNotification } from "@mantine/notifications";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

interface AboutContextProps {
  fetchData: () => Promise<void>;
  createTeamMember: (member: TeamMember) => Promise<void>;
  createPartner: (partner: Partner) => Promise<void>;
  deleteTeamMember: (uuid: string) => Promise<void>;
  deletePartner: (uuid: string) => Promise<void>;
  updateTeamMember: (member: TeamMember) => Promise<void>;
  updatePartner: (partner: Partner) => Promise<void>;
  teamMembers: TeamMember[];
  partners: Partner[];
  loading: boolean;
  error: string | null;
}

const AboutContext = createContext<AboutContextProps | undefined>(undefined);
const TEAM_MEMBER_KEY = "teamMembers";
const PARTNERS_KEY = "partners";

export const AboutProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

  // Utility function to save data to localStorage with a timestamp
  const saveToLocalStorage = useCallback(
    (key: string, data: any) => {
      const item = {
        value: data,
        expiry: Date.now() + ONE_WEEK_IN_MS, // Current time + 1 week
      };
      localStorage.setItem(key, JSON.stringify(item));
    },
    [ONE_WEEK_IN_MS],
  );

  // Utility function to load data from localStorage and check expiry
  const loadFromLocalStorage = useCallback((key: string) => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
      return null;
    }

    const item = JSON.parse(itemStr);
    if (Date.now() > item.expiry) {
      // If the data has expired, remove it from localStorage
      localStorage.removeItem(key);
      return null;
    }

    return item.value;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to load team members from localStorage
      const cachedTeamMembers = loadFromLocalStorage(TEAM_MEMBER_KEY);
      const cachedPartners = loadFromLocalStorage(PARTNERS_KEY);

      if (cachedTeamMembers) {
        setTeamMembers(cachedTeamMembers);
      }

      if (cachedPartners) {
        setPartners(cachedPartners);
      }

      // Fetch team members from the API if not in localStorage
      if (!cachedTeamMembers) {
        let response = await fetch("/api/team");
        if (!response.ok) {
          throw new Error("Failed to fetch team members");
        }

        const teamData = await response.json();
        setTeamMembers(teamData);
        saveToLocalStorage("teamMembers", teamData);
      }

      // Fetch partners from the API if not in localStorage
      if (!cachedPartners) {
        let response = await fetch("/api/partners");
        if (!response.ok) {
          throw new Error("Failed to fetch partners");
        }

        const partnerData = await response.json();
        setPartners(partnerData);
        saveToLocalStorage(PARTNERS_KEY, partnerData);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [loadFromLocalStorage, saveToLocalStorage]);

  const createTeamMember = async (member: TeamMember) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(member),
      });

      if (!response.ok) {
        throw new Error("Failed to create team member");
      }

      showNotification({
        title: "Success",
        message: "Team member created successfully",
        color: "green",
      });

      const newMember = await response.json();
      setTeamMembers((prev) => [...prev, newMember]);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      //remove localStorage data to force a refetch
      localStorage.removeItem(TEAM_MEMBER_KEY);
      setLoading(false);
    }
  };

  const createPartner = async (partner: Partner) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partner),
      });

      if (!response.ok) {
        throw new Error("Failed to create partner");
      }

      showNotification({
        title: "Success",
        message: "Partner created successfully",
        color: "green",
      });

      const newPartner = await response.json();
      setPartners((prev) => [...prev, newPartner]);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      //remove localStorage data to force a refetch
      localStorage.removeItem(PARTNERS_KEY);
      setLoading(false);
    }
  };

  const deleteTeamMember = async (uuid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/team?uuid=${uuid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete team member");
      }

      showNotification({
        title: "Success",
        message: "Team member deleted successfully",
        color: "green",
      });

      setTeamMembers((prev) => prev.filter((member) => member.uuid !== uuid));
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const deletePartner = async (uuid: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/partners?uuid=${uuid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete partner");
      }

      setPartners((prev) => prev.filter((partner) => partner.uuid !== uuid));
      showNotification({
        title: "Success",
        message: "Partner deleted successfully",
        color: "green",
      });
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const updateTeamMember = async (member: TeamMember) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(member),
      });

      if (!response.ok) {
        throw new Error("Failed to update team member");
      }

      showNotification({
        title: "Success",
        message: "Team member updated successfully",
        color: "green",
      });

      const updatedMember = await response.json();
      setTeamMembers((prev) =>
        prev.map((m) => (m.uuid === updatedMember.uuid ? updatedMember : m)),
      );
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const updatePartner = async (partner: Partner) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/partners", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partner),
      });

      if (!response.ok) {
        throw new Error("Failed to update partner");
      }

      showNotification({
        title: "Success",
        message: "Partner updated successfully",
        color: "green",
      });

      const updatedPartner = await response.json();
      setPartners((prev) =>
        prev.map((p) => (p.uuid === updatedPartner.uuid ? updatedPartner : p)),
      );
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (error) {
      showNotification({
        title: "Error",
        message: error,
        color: "red",
      });
    }
  }, [loading, error]);

  return (
    <AboutContext.Provider
      value={{
        fetchData,
        teamMembers,
        partners,
        loading,
        error,
        createTeamMember,
        createPartner,
        deleteTeamMember,
        deletePartner,
        updateTeamMember,
        updatePartner,
      }}
    >
      {children}
    </AboutContext.Provider>
  );
};

// Custom hook to use the AboutContext
export const useAbout = () => {
  const context = useContext(AboutContext);
  if (!context) {
    throw new Error("useAbout must be used within an AboutProvider");
  }
  return context;
};
