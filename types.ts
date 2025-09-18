export enum Tab {
  Today = 'Hoje',
  Calendar = 'Calendário',
  Settings = 'Configurações',
}

export type EnemIncidence = 'baixa' | 'media' | 'alta';

export interface HistoryEntry {
  date: string; // YYYY-MM-DD
  confidence: number; // 1-5
  notes?: string;
}

export interface Subtopic {
  id: string;
  name: string;
  difficulty: number; // 1-5
  enemIncidence: EnemIncidence;
  lastStudied: string | null; // YYYY-MM-DD
  confidence: number; // 1-5
  history: HistoryEntry[];
}

export interface Topic {
  id: string;
  name: string;
  subtopics: Subtopic[];
}

export interface Discipline {
  id: string;
  name: string;
  weight: number;
  topics: Topic[];
}

export type TaskType = 'study' | 'review';

export interface Task {
  id: string;
  subtopicId: string;
  topicId: string;
  disciplineId: string;
  subtopicName: string;
  topicName: string;
  disciplineName: string;
  type: TaskType;
  duration: number; // in minutes
  completed: boolean;
  notes?: string;
  completionDate?: string; // YYYY-MM-DD
  confidence?: number; // on completion
}

export interface DailyPlan {
  date: string; // YYYY-MM-DD
  tasks: Task[];
  isRestDay: boolean;
}

export interface AppSettings {
  dailyStudyMinutes: number;
  studyDaysPerWeek: number;
  pomodoroFocus: number;
  pomodoroShortBreak: number;
  pomodoroLongBreak: number;
  pomodoroCycles: number;
  maxTasksPerDisciplinePerDay: number;
  maxReviewsPerDay: number;
  autoReplanOnComplete: boolean;
  crunchTimeWeeks: number;
  autoReview: boolean;
  baseCadence: number[];
  confidenceFactors: {
    low: number;
    high: number;
  };
}

export interface AppState {
  activeTab: Tab;
  settings: AppSettings;
  disciplines: Discipline[];
  plans: Record<string, DailyPlan>; // Keyed by date string YYYY-MM-DD
  showSplashScreen: boolean;
  lastReorganized: string | null;
}
