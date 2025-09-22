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

export type FirestoreCalendarEntry = {
  id: string;
  date: string;
  timestamp: string;
  type: 'study' | 'review';
  title: string;
  disciplineId: string;
  disciplineName: string;
  topicId: string;
  notes?: string;
  reviewSequence?: number;
};

export interface GioConfig {
  disciplines: FirestoreDiscipline[];
  calendar: FirestoreCalendarEntry[];
  lastUpdated: string;
  version: string;
}

const GIO_CONFIG_COLLECTION = 'gio_config';

export const loadGioConfigFromFirestore = async (userId: string): Promise<GioConfig | null> => {
  try {
    const docRef = doc(db, GIO_CONFIG_COLLECTION, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      disciplines: (data.disciplines || []) as FirestoreDiscipline[],
      calendar: (data.calendar || []) as FirestoreCalendarEntry[],
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      version: data.version || '1.0.0'
    };
  } catch (error) {
    console.error('Error loading GIO config from Firestore:', error);
    return null;
  }
};

export const saveGioConfigToFirestore = async (userId: string, config: GioConfig): Promise<boolean> => {
  try {
    const docRef = doc(db, GIO_CONFIG_COLLECTION, userId);
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
