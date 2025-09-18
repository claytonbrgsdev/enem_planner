
import React, { useState } from 'react';
import { DailyPlan } from '../types';
import { toYYYYMMDD, getTodayDateString } from '../services/dateUtils';
import CalendarDayModal from './CalendarDayModal';

interface CalendarViewProps {
  plans: Record<string, DailyPlan>;
}

const CalendarView: React.FC<CalendarViewProps> = ({ plans }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDate = new Date(startOfMonth);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start on Sunday
  const endDate = new Date(endOfMonth);
  if (endDate.getDay() !== 6) {
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay())); // End on Saturday
  }

  const days: Date[] = [];
  let day = new Date(startDate);
  while (day <= endDate) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const todayStr = getTodayDateString();

  return (
    <div className="max-w-7xl mx-auto bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg shadow-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} className="px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600">&lt;</button>
        <h2 className="text-2xl font-bold text-white">
          {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
        </h2>
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} className="px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600">&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-semibold text-indigo-300 mb-2">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map(d => {
          const dateStr = toYYYYMMDD(d);
          const plan = plans[dateStr];
          const isToday = dateStr === todayStr;
          const isCurrentMonth = d.getMonth() === currentDate.getMonth();

          return (
            <div
              key={dateStr}
              className={`p-2 h-28 flex flex-col rounded-md transition-colors cursor-pointer border
                ${isCurrentMonth ? 'bg-gray-700/60 border-gray-600' : 'bg-gray-800/40 text-gray-500 border-gray-700'}
                ${isToday ? 'border-indigo-400' : ''}
                ${plan?.isRestDay ? 'bg-gray-900/50' : ''}
                hover:bg-gray-600/80`}
              onClick={() => plan && setSelectedDate(dateStr)}
            >
              <div className={`font-bold ${isToday ? 'text-indigo-400' : ''}`}>{d.getDate()}</div>
              {plan && !plan.isRestDay && plan.tasks.length > 0 && (
                <div className="mt-1 text-xs text-left overflow-y-auto flex-grow custom-scrollbar pr-1">
                   {plan.tasks.map(t => (
                    <div key={t.id} className={`truncate ${t.type === 'review' ? 'text-yellow-300' : 'text-gray-200'}`}>
                      - {t.subtopicName}
                    </div>
                  ))}
                </div>
              )}
              {plan?.isRestDay && (
                  <div className="m-auto text-center text-xs text-gray-400">Descanso</div>
              )}
            </div>
          );
        })}
      </div>
      {selectedDate && (
        <CalendarDayModal
          plan={plans[selectedDate]}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
};

export default CalendarView;
