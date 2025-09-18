
import { type AppState } from '../types';
import { INITIAL_APP_STATE } from '../constants';

const STORAGE_KEY = 'gio-study-app-state';

export const saveState = (state: AppState): void => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serializedState);
  } catch (error) {
    console.error("Could not save state to localStorage", error);
  }
};

export const loadState = (): AppState => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return INITIAL_APP_STATE;
    }
    const parsedState = JSON.parse(serializedState);
    // Basic migration: ensure all settings fields are present
    return {
      ...parsedState,
      settings: {
        ...INITIAL_APP_STATE.settings,
        ...parsedState.settings,
      }
    };
  } catch (error) {
    console.error("Could not load state from localStorage", error);
    return INITIAL_APP_STATE;
  }
};
