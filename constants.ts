
import { type AppState, Tab } from './types';

export const INITIAL_APP_STATE: AppState = {
  activeTab: Tab.Today,
  settings: {
    dailyStudyMinutes: 180,
    studyDaysPerWeek: 6,
    pomodoroFocus: 25,
    pomodoroShortBreak: 5,
    pomodoroLongBreak: 15,
    pomodoroCycles: 4,
    maxTasksPerDisciplinePerDay: 2,
    maxReviewsPerDay: 3,
    autoReplanOnComplete: true,
    crunchTimeWeeks: 4,
    autoReview: true,
    baseCadence: [1, 3, 7],
    confidenceFactors: {
      low: 0.8,
      high: 1.5,
    },
  },
  disciplines: [],
  plans: {},
  showSplashScreen: true,
  lastReorganized: null,
};
