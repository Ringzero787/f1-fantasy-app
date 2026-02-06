/**
 * React hooks for OpenF1 API integration
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { openF1Service, OpenF1Session } from '../services/openf1.service';
import { useAdminStore } from '../store/admin.store';
import { demoRaces } from '../data/demoData';

/**
 * Get all sessions for a year
 */
export function useOpenF1Sessions(year: number) {
  return useQuery({
    queryKey: ['openf1', 'sessions', year],
    queryFn: () => openF1Service.getSessions(year),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get race sessions only
 */
export function useOpenF1RaceSessions(year: number) {
  return useQuery({
    queryKey: ['openf1', 'races', year],
    queryFn: () => openF1Service.getRaceSessions(year),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get session results
 */
export function useOpenF1SessionResults(sessionKey: number | undefined) {
  return useQuery({
    queryKey: ['openf1', 'results', sessionKey],
    queryFn: () => openF1Service.getSessionResults(sessionKey!),
    enabled: !!sessionKey,
    staleTime: 1 * 60 * 1000, // 1 minute for live data
  });
}

/**
 * Get race weekend results (race + sprint)
 */
export function useOpenF1RaceWeekendResults(meetingKey: number | undefined) {
  return useQuery({
    queryKey: ['openf1', 'weekend', meetingKey],
    queryFn: () => openF1Service.getRaceWeekendResults(meetingKey!),
    enabled: !!meetingKey,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Get driver championship standings
 */
export function useOpenF1DriverChampionship(sessionKey: number | undefined) {
  return useQuery({
    queryKey: ['openf1', 'championship', 'drivers', sessionKey],
    queryFn: () => openF1Service.getDriverChampionship(sessionKey!),
    enabled: !!sessionKey,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get constructor championship standings
 */
export function useOpenF1TeamChampionship(sessionKey: number | undefined) {
  return useQuery({
    queryKey: ['openf1', 'championship', 'teams', sessionKey],
    queryFn: () => openF1Service.getTeamChampionship(sessionKey!),
    enabled: !!sessionKey,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Find matching app race ID from OpenF1 session
 */
function findAppRaceId(session: OpenF1Session): string | null {
  if (!session || !session.country_name) {
    console.warn('[OpenF1] Session or country_name is undefined');
    return null;
  }

  // Try to match by country name and year
  const countryLower = session.country_name.toLowerCase().replace(/\s+/g, '_');
  const potentialId = `${countryLower}_${session.year}`;
  const sessionLocation = session.location?.toLowerCase() || '';

  // Check if this race exists in our demo data
  const matchingRace = demoRaces.find(race => {
    if (!race.country) return false;

    const raceCountry = race.country.toLowerCase().replace(/\s+/g, '_');
    const raceCity = race.city?.toLowerCase() || '';
    const raceId = race.id?.toLowerCase() || '';

    return raceCountry === countryLower ||
           raceId.includes(countryLower) ||
           (sessionLocation && raceCity && raceCity.includes(sessionLocation));
  });

  if (matchingRace) {
    return matchingRace.id;
  }

  // Fallback: construct ID from session data
  return potentialId;
}

/**
 * Import race results from OpenF1 into admin store
 */
export function useImportOpenF1Results() {
  const {
    initializeRaceResult,
    updateDriverPoints,
    updateDriverPosition,
    updateDriverDnf,
    updateConstructorPoints,
    updateSprintDriverPoints,
    updateSprintDriverDnf,
    updateSprintConstructorPoints,
    markRaceComplete,
  } = useAdminStore();

  return useMutation({
    mutationFn: async ({
      meetingKey,
      appRaceId,
      autoComplete = false,
    }: {
      meetingKey: number;
      appRaceId: string;
      autoComplete?: boolean;
    }) => {
      console.log('[OpenF1 Import] Starting import for meeting:', meetingKey, 'race:', appRaceId);

      // Initialize the race result in our store
      initializeRaceResult(appRaceId);

      // Get results from OpenF1
      const { race, sprint } = await openF1Service.getRaceWeekendResults(meetingKey);

      // Import race results
      if (race) {
        console.log('[OpenF1 Import] Importing race results:', race.driverResults.length, 'drivers');

        for (const result of race.driverResults) {
          updateDriverPoints(appRaceId, result.driverId, result.points);
          updateDriverPosition(appRaceId, result.driverId, result.position);
          if (result.dnf) {
            updateDriverDnf(appRaceId, result.driverId, true);
          }
        }

        for (const result of race.constructorResults) {
          updateConstructorPoints(appRaceId, result.constructorId, result.points);
        }
      }

      // Import sprint results
      if (sprint) {
        console.log('[OpenF1 Import] Importing sprint results:', sprint.driverResults.length, 'drivers');

        for (const result of sprint.driverResults) {
          updateSprintDriverPoints(appRaceId, result.driverId, result.points);
          if (result.dnf) {
            updateSprintDriverDnf(appRaceId, result.driverId, true);
          }
        }

        for (const result of sprint.constructorResults) {
          updateSprintConstructorPoints(appRaceId, result.constructorId, result.points);
        }
      }

      // Mark race as complete if requested
      if (autoComplete && race) {
        console.log('[OpenF1 Import] Marking race as complete');
        markRaceComplete(appRaceId);
      }

      return {
        raceImported: !!race,
        sprintImported: !!sprint,
        driversImported: race?.driverResults.length || 0,
      };
    },
    onSuccess: (data) => {
      console.log('[OpenF1 Import] Success:', data);
    },
    onError: (error) => {
      console.error('[OpenF1 Import] Error:', error);
    },
  });
}

/**
 * Auto-sync latest race results from OpenF1
 */
export function useAutoSyncOpenF1() {
  const importResults = useImportOpenF1Results();

  return useMutation({
    mutationFn: async (year: number) => {
      console.log('[OpenF1 AutoSync] Starting for year:', year);

      // Get the latest completed race
      let latestRace;
      try {
        latestRace = await openF1Service.getLatestRaceSession(year);
      } catch (error) {
        console.error('[OpenF1 AutoSync] Failed to fetch sessions:', error);
        throw new Error(`Failed to fetch race sessions from OpenF1: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      if (!latestRace) {
        throw new Error(`No completed races found for ${year}. The season may not have started yet.`);
      }

      console.log('[OpenF1 AutoSync] Found race:', latestRace.country_name, 'meeting_key:', latestRace.meeting_key);

      // Find matching app race ID
      const appRaceId = findAppRaceId(latestRace);

      if (!appRaceId) {
        throw new Error(`Could not match race: ${latestRace.country_name || 'Unknown'}`);
      }

      console.log('[OpenF1 AutoSync] Matched to app race ID:', appRaceId);

      // Import the results
      return importResults.mutateAsync({
        meetingKey: latestRace.meeting_key,
        appRaceId,
        autoComplete: true,
      });
    },
  });
}
