import { type AppState, type Discipline, type StudyTopic, type StudyHistoryEntry, type CalendarEntry } from '../types';
import { INITIAL_APP_STATE } from '../constants';
import {
  loadGioConfigFromFirestore,
  saveGioConfigToFirestore,
  type GioConfig,
  type FirestoreDiscipline,
  type FirestoreTopic,
  type FirestoreHistoryEntry,
  type FirestoreCalendarEntry
} from './firestoreService';

const STORAGE_KEY = 'gio-study-app-state';

const cloneHistoryEntry = (entry: FirestoreHistoryEntry): StudyHistoryEntry => ({
  date: entry?.date ?? new Date().toISOString(),
  notes: entry?.notes ?? '',
  type: entry?.type === 'review' ? 'review' : 'study'
});

const ensureStudyTopic = (disciplineId: string, topic: FirestoreTopic): StudyTopic => ({
  id: topic.id,
  disciplineId,
  name: topic.name,
  description: topic.description ?? '',
  incidence: topic.incidence ?? 1,
  difficulty: topic.difficulty ?? 1,
  needsReview: Boolean(topic.needsReview),
  priorityScore: topic.priorityScore ?? 1,
  priorityColor: topic.priorityColor ?? 'green',
  completionDate: topic.completionDate ?? null,
  history: Array.isArray(topic.history) ? topic.history.map(cloneHistoryEntry) : [],
  isAssigned: Boolean(topic.isAssigned)
});

const ensureDiscipline = (discipline: FirestoreDiscipline): Discipline => {
  const topics = discipline.topics.map((topic) => ensureStudyTopic(discipline.id, topic));
  return {
    id: discipline.id,
    name: discipline.name,
    weight: discipline.weight ?? 1,
    topics,
    pending: discipline.pending ?? topics.filter((topic) => !topic.completionDate).length
  };
};

const ensureCalendarEntry = (entry: FirestoreCalendarEntry): CalendarEntry => ({
  id: entry.id,
  date: entry.date,
  timestamp: entry.timestamp,
  type: entry.type === 'review' ? 'review' : 'study',
  title: entry.title,
  disciplineId: entry.disciplineId ?? '',
  disciplineName: entry.disciplineName ?? '',
  topicId: entry.topicId ?? '',
  notes: entry.notes ?? undefined,
  reviewSequence: typeof entry.reviewSequence === 'number' ? entry.reviewSequence : undefined
});

const serializeCalendarEntry = (entry: CalendarEntry): FirestoreCalendarEntry => {
  const payload: FirestoreCalendarEntry = {
    id: entry.id,
    date: entry.date,
    timestamp: entry.timestamp,
    type: entry.type,
    title: entry.title,
    disciplineId: entry.disciplineId,
    disciplineName: entry.disciplineName,
    topicId: entry.topicId
  };

  if (entry.notes && entry.notes.trim().length > 0) {
    payload.notes = entry.notes.trim();
  }
  if (typeof entry.reviewSequence === 'number') {
    payload.reviewSequence = entry.reviewSequence;
  }

  return payload;
};

const toFirestorePayload = (disciplines: Discipline[], calendar: CalendarEntry[]): GioConfig => ({
  disciplines: disciplines.map((discipline) => ({
    id: discipline.id,
    name: discipline.name,
    weight: discipline.weight,
    pending: discipline.pending,
    topics: discipline.topics.map((topic) => ({
      id: topic.id,
      disciplineId: topic.disciplineId,
      name: topic.name,
      description: topic.description,
      incidence: topic.incidence,
      difficulty: topic.difficulty,
      needsReview: topic.needsReview,
      priorityScore: topic.priorityScore,
      priorityColor: topic.priorityColor,
      completionDate: topic.completionDate,
      history: topic.history.map((entry) => ({ ...entry })),
      isAssigned: topic.isAssigned ?? false
    }))
  })),
  calendar: calendar.map((entry) => serializeCalendarEntry(entry)),
  lastUpdated: new Date().toISOString(),
  version: '1.0.0'
});

export const loadStateSync = (): AppState => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return INITIAL_APP_STATE;
    }

    const parsedState = JSON.parse(serializedState);
    const calendar = Array.isArray(parsedState.calendar)
      ? (parsedState.calendar as FirestoreCalendarEntry[]).map((entry) => ensureCalendarEntry(entry))
      : INITIAL_APP_STATE.calendar;
    const disciplines = Array.isArray(parsedState.disciplines)
      ? (parsedState.disciplines as FirestoreDiscipline[]).map((discipline) => ensureDiscipline(discipline))
      : INITIAL_APP_STATE.disciplines;

    return {
      ...parsedState,
      disciplines,
      calendar,
      settings: {
        ...INITIAL_APP_STATE.settings,
        ...parsedState.settings,
      }
    };
  } catch (error) {
    console.error('Could not load state synchronously', error);
    return INITIAL_APP_STATE;
  }
};

export const loadState = async (userId?: string): Promise<AppState> => {
  try {
    if (userId) {
      const firestoreConfig = await loadGioConfigFromFirestore(userId);
      if (firestoreConfig) {
        return {
          ...INITIAL_APP_STATE,
          disciplines: firestoreConfig.disciplines.map((discipline) => ensureDiscipline(discipline)),
          calendar: firestoreConfig.calendar.map((entry) => ensureCalendarEntry(entry)),
          settings: {
            ...INITIAL_APP_STATE.settings,
            ...loadLocalSettings()
          }
        };
      }
    }

    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return INITIAL_APP_STATE;
    }

    const parsedState = JSON.parse(serializedState);
    return {
      ...parsedState,
      disciplines: Array.isArray(parsedState.disciplines)
        ? (parsedState.disciplines as FirestoreDiscipline[]).map((discipline) => ensureDiscipline(discipline))
        : INITIAL_APP_STATE.disciplines,
      calendar: Array.isArray(parsedState.calendar)
        ? (parsedState.calendar as FirestoreCalendarEntry[]).map((entry) => ensureCalendarEntry(entry))
        : INITIAL_APP_STATE.calendar,
      settings: {
        ...INITIAL_APP_STATE.settings,
        ...parsedState.settings,
      }
    };
  } catch (error) {
    console.error('Could not load state', error);
    return INITIAL_APP_STATE;
  }
};

export const saveState = async (userId: string | null, state: AppState): Promise<void> => {
  try {
    if (userId) {
      await saveGioConfigToFirestore(userId, toFirestorePayload(state.disciplines, state.calendar));
    }
    saveLocalSettings(state.settings);
  } catch (error) {
    console.error('Could not save state', error);
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, serializedState);
    } catch (localError) {
      console.error('Could not save state to localStorage either', localError);
    }
  }
};

const loadLocalSettings = (): Partial<AppState['settings']> => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState) {
      const parsedState = JSON.parse(serializedState);
      return parsedState.settings || {};
    }
  } catch (error) {
    console.error('Could not load settings from localStorage', error);
  }
  return {};
};

const saveLocalSettings = (settings: AppState['settings']): void => {
  try {
    const currentState = localStorage.getItem(STORAGE_KEY);
    const stateToSave = currentState ? JSON.parse(currentState) : {};
    stateToSave.settings = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (error) {
    console.error('Could not save settings to localStorage', error);
  }
};

export const initializeFirestoreWithDefaultData = async (userId: string): Promise<boolean> => {
  try {
    const existingConfig = await loadGioConfigFromFirestore(userId);
    if (!existingConfig) {
      return await saveGioConfigToFirestore(
        userId,
        toFirestorePayload(INITIAL_APP_STATE.disciplines, INITIAL_APP_STATE.calendar)
      );
    }
    return true;
  } catch (error) {
    console.error('Could not initialize Firestore with default data', error);
    return false;
  }
};
