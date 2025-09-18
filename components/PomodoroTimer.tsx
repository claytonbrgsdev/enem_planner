import React, { useState, useEffect, useCallback } from 'react';
import { PlayIcon, PauseIcon, ResetIcon } from './icons';
// Fix: Renamed Settings to AppSettings to match the exported type from '../types'.
import { type AppSettings } from '../types';

interface PomodoroTimerProps {
  settings: AppSettings;
}

type SessionType = 'focus' | 'shortBreak' | 'longBreak';

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ settings }) => {
  const [timeLeft, setTimeLeft] = useState(settings.pomodoroFocus * 60);
  const [isActive, setIsActive] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>('focus');
  const [cycleCount, setCycleCount] = useState(0);

  const getDuration = useCallback((type: SessionType) => {
    switch (type) {
      case 'focus': return settings.pomodoroFocus * 60;
      case 'shortBreak': return settings.pomodoroShortBreak * 60;
      case 'longBreak': return settings.pomodoroLongBreak * 60;
      default: return settings.pomodoroFocus * 60;
    }
  }, [settings]);
  
  const resetTimer = useCallback((type: SessionType) => {
    setIsActive(false);
    setSessionType(type);
    setTimeLeft(getDuration(type));
  }, [getDuration]);


  useEffect(() => {
    resetTimer('focus');
  }, [settings, resetTimer]);

  useEffect(() => {
    // Fix: `NodeJS.Timeout` is not available in the browser. Use `ReturnType<typeof setInterval>`.
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (sessionType === 'focus') {
        const newCycleCount = cycleCount + 1;
        setCycleCount(newCycleCount);
        if (newCycleCount % settings.pomodoroCycles === 0) {
          resetTimer('longBreak');
        } else {
          resetTimer('shortBreak');
        }
      } else {
        resetTimer('focus');
      }
      // Auto-start next session
      setIsActive(true);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, sessionType, cycleCount, settings.pomodoroCycles, resetTimer]);

  const toggleTimer = () => setIsActive(!isActive);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getSessionLabel = () => {
    switch(sessionType) {
      case 'focus': return 'Foco';
      case 'shortBreak': return 'Pausa Curta';
      case 'longBreak': return 'Pausa Longa';
    }
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg shadow-lg text-center border border-gray-700 h-full flex flex-col justify-center items-center">
      <div>
        <div className="text-sm font-semibold uppercase tracking-widest text-indigo-400 mb-2">{getSessionLabel()}</div>
        <div className="text-7xl font-mono font-bold text-white mb-4">{formatTime(timeLeft)}</div>
        <div className="flex justify-center space-x-4">
          <button onClick={toggleTimer} className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition-colors">
            {isActive ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8" />}
          </button>
          <button onClick={() => resetTimer('focus')} className="p-3 bg-gray-600 text-white rounded-full hover:bg-gray-500 transition-colors">
            <ResetIcon className="w-8 h-8" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
