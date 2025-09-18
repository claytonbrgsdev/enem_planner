
import React from 'react';
import { DailyPlan } from '../types';

interface CalendarDayModalProps {
  plan: DailyPlan | undefined;
  onClose: () => void;
}

const CalendarDayModal: React.FC<CalendarDayModalProps> = ({ plan, onClose }) => {
  if (!plan) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl p-6 m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">{new Date(plan.date.replace(/-/g, '/')).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        
        {plan.isRestDay ? (
            <div className="text-center py-8">
                <p className="text-xl text-gray-300">Dia de Descanso! 🧘‍♀️</p>
            </div>
        ) : plan.tasks.length > 0 ? (
          <div>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {plan.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center p-3 rounded-md bg-gray-700/50"
                >
                  <div className="flex-grow">
                    <span className="block font-semibold">{task.subtopicName}</span>
                    <span className="text-xs text-gray-400">
                      {task.disciplineName} &bull; {task.topicName} &bull; <span className={task.type === 'review' ? 'text-yellow-400' : 'text-cyan-400'}>{task.type === 'review' ? 'Revisão' : 'Estudo'}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400">Nenhuma tarefa planejada para este dia.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarDayModal;
