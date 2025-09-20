
import { type AppState } from '../types';
import { INITIAL_APP_STATE } from '../constants';
import { loadGioConfigFromFirestore, saveGioConfigToFirestore, type GioConfig } from './firestoreService';

const STORAGE_KEY = 'gio-study-app-state';

// Synchronous version for initial state loading
export const loadStateSync = (): AppState => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return INITIAL_APP_STATE;
    }
    
    const parsedState = JSON.parse(serializedState);
    return {
      ...parsedState,
      settings: {
        ...INITIAL_APP_STATE.settings,
        ...parsedState.settings,
      }
    };
  } catch (error) {
    console.error("Could not load state synchronously", error);
    return INITIAL_APP_STATE;
  }
};

// Load state with Firestore integration
export const loadState = async (): Promise<AppState> => {
  try {
    // First try to load from Firestore
    const firestoreConfig = await loadGioConfigFromFirestore();
    
    if (firestoreConfig) {
      // Use Firestore data as the source of truth for disciplines
      return {
        ...INITIAL_APP_STATE,
        disciplines: firestoreConfig.disciplines,
        settings: {
          ...INITIAL_APP_STATE.settings,
          ...loadLocalSettings()
        }
      };
    }
    
    // Fallback to localStorage if Firestore is not available
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) {
      return INITIAL_APP_STATE;
    }
    
    const parsedState = JSON.parse(serializedState);
    return {
      ...parsedState,
      settings: {
        ...INITIAL_APP_STATE.settings,
        ...parsedState.settings,
      }
    };
  } catch (error) {
    console.error("Could not load state", error);
    return INITIAL_APP_STATE;
  }
};

// Save state with Firestore integration
export const saveState = async (state: AppState): Promise<void> => {
  try {
    // Save disciplines to Firestore
    const gioConfig: GioConfig = {
      disciplines: state.disciplines,
      lastUpdated: new Date().toISOString(),
      version: '1.0.0'
    };
    
    await saveGioConfigToFirestore(gioConfig);
    
    // Save settings to localStorage (user-specific)
    saveLocalSettings(state.settings);
    
  } catch (error) {
    console.error("Could not save state", error);
    
    // Fallback to localStorage if Firestore fails
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, serializedState);
    } catch (localError) {
      console.error("Could not save state to localStorage either", localError);
    }
  }
};

// Helper to load only settings from localStorage
const loadLocalSettings = (): Partial<AppState['settings']> => {
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState) {
      const parsedState = JSON.parse(serializedState);
      return parsedState.settings || {};
    }
  } catch (error) {
    console.error("Could not load settings from localStorage", error);
  }
  return {};
};

// Helper to save only settings to localStorage
const saveLocalSettings = (settings: AppState['settings']): void => {
  try {
    const currentState = localStorage.getItem(STORAGE_KEY);
    let stateToSave = currentState ? JSON.parse(currentState) : {};
    
    stateToSave.settings = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (error) {
    console.error("Could not save settings to localStorage", error);
  }
};

// Initialize Firestore with default data if empty
export const initializeFirestoreWithDefaultData = async (): Promise<boolean> => {
  try {
    const existingConfig = await loadGioConfigFromFirestore();
    
    if (!existingConfig) {
      // No data in Firestore, upload default configuration
      const gioConfig: GioConfig = {
        disciplines: INITIAL_APP_STATE.disciplines,
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };
      
      return await saveGioConfigToFirestore(gioConfig);
    }
    
    return true; // Data already exists
  } catch (error) {
    console.error("Could not initialize Firestore with default data", error);
    return false;
  }
};
