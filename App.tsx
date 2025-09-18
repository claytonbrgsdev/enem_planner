import React, { useState, useEffect, useCallback } from 'react';
import {
  type AppState,
  type Task,
  type Discipline,
  type AppSettings,
  Tab,
} from './types';
import { loadState, saveState } from './services/storageService';
import { getTodayDateString } from './services/dateUtils';
import { reorganizeAgenda } from './services/planningService';

import SplashScreen from './components/SplashScreen';
import Header from './components/Header';
import Tabs from './components/Tabs';
import TodayView from './components/TodayView';
import CalendarView from './components/CalendarView';
import SettingsView from './components/SettingsView';
import CompleteTaskModal from './components/CompleteTaskModal';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(loadState);
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);

  // Persist state to localStorage on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Initial plan generation if none exists
  useEffect(() => {
    if (state.disciplines.length > 0 && Object.keys(state.plans).length === 0) {
      const newPlans = reorganizeAgenda(state.disciplines, state.settings);
      setState(s => ({ ...s, plans: newPlans, lastReorganized: getTodayDateString() }));
    }
  }, [state.disciplines, state.plans, state.settings]);

  const handleReorganize = useCallback(() => {
    const newPlans = reorganizeAgenda(state.disciplines, state.settings);
    setState(s => ({
      ...s,
      plans: newPlans,
      lastReorganized: getTodayDateString(),
    }));
  }, [state.disciplines, state.settings]);

  const handleSplashScreenFinished = () => {
    setState(s => ({ ...s, showSplashScreen: false }));
  };

  const handleSetTab = (tab: Tab) => {
    setState(s => ({ ...s, activeTab: tab }));
  };
  
  const handleStartCompleteTask = (task: Task) => {
    setTaskToComplete(task);
  };

  const handleCancelCompleteTask = () => {
    setTaskToComplete(null);
  };
  
  const handleConfirmCompleteTask = (confidence: number, notes: string) => {
    if (!taskToComplete) return;

    const today = getTodayDateString();

    setState(prevState => {
      const newDisciplines = prevState.disciplines.map(d => {
        if (d.id === taskToComplete.disciplineId) {
          return {
            ...d,
            topics: d.topics.map(t => {
              if (t.id === taskToComplete.topicId) {
                return {
                    ...t,
                    subtopics: t.subtopics.map(st => {
                        if(st.id === taskToComplete.subtopicId) {
                            return {
                                ...st,
                                confidence,
                                lastStudied: today,
                                history: [...st.history, { date: today, confidence, notes }],
                            }
                        }
                        return st;
                    })
                }
              }
              return t;
            }),
          };
        }
        return d;
      });

      const newPlans = { ...prevState.plans };
      const todayPlan = newPlans[today];
      if (todayPlan) {
        todayPlan.tasks = todayPlan.tasks.map(t =>
          t.id === taskToComplete.id ? { ...t, completed: true, completionDate: today, confidence, notes } : t
        );
      }
      
      let finalState = { ...prevState, disciplines: newDisciplines, plans: newPlans };
      
      if(prevState.settings.autoReplanOnComplete) {
          const replanned = reorganizeAgenda(newDisciplines, prevState.settings);
          finalState = { ...finalState, plans: replanned, lastReorganized: today };
      }

      return finalState;
    });

    setTaskToComplete(null);
  };
  
  const handleUpdateSettings = (newSettings: AppSettings) => {
      setState(s => ({ ...s, settings: newSettings }));
  };
  
  const handleDisciplinesChange = (newDisciplines: Discipline[]) => {
      setState(s => ({ ...s, disciplines: newDisciplines }));
  };

  if (state.showSplashScreen) {
    return <SplashScreen onFinished={handleSplashScreenFinished} />;
  }

  const today = getTodayDateString();
  const todayPlan = state.plans[today];

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col h-screen">
      <Header />
      <Tabs activeTab={state.activeTab} setActiveTab={handleSetTab} />
      <main className="px-4 pb-8 flex-1">
        {state.activeTab === Tab.Today && (
          <TodayView
            plan={todayPlan}
            settings={state.settings}
            onCompleteTask={handleStartCompleteTask}
          />
        )}
        {state.activeTab === Tab.Calendar && <CalendarView plans={state.plans} />}
        {state.activeTab === Tab.Settings && (
          <SettingsView
            settings={state.settings}
            onUpdateSettings={handleUpdateSettings}
            onReorganize={handleReorganize}
            disciplines={state.disciplines}
            onDisciplinesChange={handleDisciplinesChange}
          />
        )}
      </main>
      {taskToComplete && (
        <CompleteTaskModal 
            task={taskToComplete}
            onClose={handleCancelCompleteTask}
            onComplete={handleConfirmCompleteTask}
        />
      )}
    </div>
  );
};

export default App;
