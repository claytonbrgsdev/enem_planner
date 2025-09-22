export enum Tab {
  Today = 'Hoje',
  Calendar = 'Calendário',
  Settings = 'Configurações',
}

export type PriorityColor = 'green' | 'yellow' | 'red';

export interface StudyHistoryEntry {
  date: string; // ISO string
  notes: string;
  type: 'study' | 'review';
}

export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string with time
  type: 'study' | 'review';
  title: string;
  disciplineId: string;
  disciplineName: string;
  topicId: string;
  notes?: string;
  reviewSequence?: number;
}

export interface StudyTopic {
  id: string;
  disciplineId: string;
  name: string;
  description: string;
  incidence: number;
  difficulty: number;
  needsReview: boolean;
  priorityScore: number;
  priorityColor: PriorityColor;
  completionDate: string | null;
  history: StudyHistoryEntry[];
  isAssigned?: boolean;
}

export interface Discipline {
  id: string;
  name: string;
  weight: number;
  topics: StudyTopic[];
  pending: number;
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
  calendar: CalendarEntry[];
  showSplashScreen: boolean;
  lastReorganized: string | null;
}
