import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type FirestoreHistoryEntry = {
  date: string;
  notes: string;
  type: 'study' | 'review';
};

export type FirestoreTopic = {
  id: string;
  disciplineId: string;
  name: string;
  description: string;
  incidence: number;
  difficulty: number;
  needsReview: boolean;
  priorityScore: number;
  priorityColor: 'green' | 'yellow' | 'red';
  completionDate: string | null;
  history: FirestoreHistoryEntry[];
  isAssigned?: boolean;
};

export type FirestoreDiscipline = {
  id: string;
  name: string;
  weight: number;
  pending: number;
  topics: FirestoreTopic[];
};

export interface GioConfig {
  disciplines: FirestoreDiscipline[];
  lastUpdated: string;
  version: string;
}

const GIO_CONFIG_COLLECTION = 'gio_config';
const DISCIPLINES_DOC = 'disciplines';

export const loadGioConfigFromFirestore = async (): Promise<GioConfig | null> => {
  try {
    const docRef = doc(db, GIO_CONFIG_COLLECTION, DISCIPLINES_DOC);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      disciplines: (data.disciplines || []) as FirestoreDiscipline[],
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      version: data.version || '1.0.0'
    };
  } catch (error) {
    console.error('Error loading GIO config from Firestore:', error);
    return null;
  }
};

export const saveGioConfigToFirestore = async (config: GioConfig): Promise<boolean> => {
  try {
    const docRef = doc(db, GIO_CONFIG_COLLECTION, DISCIPLINES_DOC);
    await setDoc(docRef, {
      ...config,
      lastUpdated: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error saving GIO config to Firestore:', error);
    return false;
  }
};
