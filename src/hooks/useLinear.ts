import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LinearTicket, LinearTeam, LinearProject } from "@/types";

export function useLinearTickets(meetingId: string) {
  const [tickets, setTickets] = useState<LinearTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<LinearTicket[]>("get_linear_tickets", {
        meetingId,
      });
      setTickets(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTicket = useCallback(
    async (
      summaryId: string,
      teamId: string,
      projectId: string | null,
      provider: string,
      model: string,
    ) => {
      const ticket = await invoke<LinearTicket>("create_linear_ticket", {
        summaryId,
        teamId,
        projectId,
        provider,
        model,
      });
      await refresh();
      return ticket;
    },
    [refresh],
  );

  return { tickets, loading, error, refresh, createTicket };
}

export function useLinearTeams() {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<LinearTeam[]>("list_linear_teams");
      setTeams(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { teams, loading, error, fetchTeams };
}

export function useLinearProjects(teamId: string | null) {
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setProjects([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await invoke<LinearProject[]>("list_linear_projects", {
          teamId,
        });
        setProjects(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [teamId]);

  return { projects, loading, error };
}

export function useLinearSettings() {
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(null);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const teamId = await invoke<string | null>("get_linear_setting", {
          key: "default_team_id",
        });
        const projectId = await invoke<string | null>("get_linear_setting", {
          key: "default_project_id",
        });
        setDefaultTeamId(teamId);
        setDefaultProjectId(projectId);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveDefaultTeam = useCallback(async (teamId: string) => {
    await invoke("set_linear_setting", {
      key: "default_team_id",
      value: teamId,
    });
    setDefaultTeamId(teamId);
  }, []);

  const saveDefaultProject = useCallback(async (projectId: string) => {
    await invoke("set_linear_setting", {
      key: "default_project_id",
      value: projectId,
    });
    setDefaultProjectId(projectId);
  }, []);

  return {
    defaultTeamId,
    defaultProjectId,
    loading,
    saveDefaultTeam,
    saveDefaultProject,
  };
}
