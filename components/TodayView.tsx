import React from 'react';
import { DailyPlan, AppSettings, Task } from '../types';
import PomodoroTimer from './PomodoroTimer';
import InteractiveWidget from './InteractiveWidget';
import MediaSlot from './MediaSlot';
import { CheckIcon } from './icons';

interface TodayViewProps {
  plan: DailyPlan | undefined;
  settings: AppSettings;
  onCompleteTask: (task: Task) => void;
}

const TodayView: React.FC<TodayViewProps> = ({ plan, settings, onCompleteTask }) => {
  const tasks = plan?.tasks || [];
  const focusTask = tasks.find(t => !t.completed) || null;

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-150px)] max-w-7xl mx-auto">
      {/* Left Column - Task List */}
      <div className="lg:w-1/3 bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg shadow-lg border border-gray-700 flex flex-col">
        <h2 className="text-2xl font-bold text-white mb-4 flex-shrink-0">Tarefas de Hoje</h2>
        {tasks.length > 0 ? (
          <ul className="space-y-3 overflow-y-auto custom-scrollbar flex-grow pr-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-center justify-between p-3 rounded-md transition-all duration-300 ${
                  task.completed 
                    ? 'bg-green-800/30 text-gray-400' 
                    : 'bg-gray-700/50 hover:bg-gray-700'
                } ${
                  task.id === focusTask?.id ? 'border-l-4 border-indigo-400' : ''
                }`}
              >
                <div className="flex-grow">
                  <span className={`block font-semibold ${task.completed ? 'line-through' : ''}`}>
                    {task.subtopicName}
                  </span>
                  <span className="text-xs text-gray-400">
                    {task.disciplineName} &bull; {task.topicName} &bull; <span className={task.type === 'review' ? 'text-yellow-400' : 'text-cyan-400'}>{task.type === 'review' ? 'Revisão' : 'Estudo'}</span>
                  </span>
                </div>
                {!task.completed && (
                  <button
                    onClick={() => onCompleteTask(task)}
                    className="p-2 ml-2 rounded-full hover:bg-green-500/20 text-green-400 flex-shrink-0"
                    title="Marcar como concluída"
                  >
                    <CheckIcon className="w-6 h-6" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
           <div className="flex-grow flex items-center justify-center">
             <p className="text-gray-400 text-center py-4">{plan?.isRestDay ? "Hoje é dia de descanso! 🎉" : "Nenhuma tarefa para hoje."}</p>
           </div>
        )}
      </div>

      {/* Center Column - Video and Focus */}
      <div className="lg:w-1/3 flex flex-col gap-8">
        <div className="flex-grow-[2] min-h-0"><MediaSlot /></div>

        <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg shadow-lg border border-gray-700 flex-grow-[3] flex flex-col min-h-0">
          <h2 className="text-2xl font-bold text-white mb-4">Foco do Dia</h2>
           {focusTask ? (
            <div className="text-center flex-grow flex flex-col justify-center">
                <p className="text-lg text-gray-300">{focusTask.disciplineName} &bull; {focusTask.topicName}</p>
                <h3 className="text-3xl font-bold text-indigo-300 leading-tight">{focusTask.subtopicName}</h3>
                <p className="mt-2 text-base font-semibold text-cyan-400 uppercase tracking-wider">{focusTask.type === 'review' ? 'Revisar Conceitos' : 'Novo Estudo'}</p>
            </div>
           ) : (
            <div className="text-center flex-grow flex flex-col justify-center">
                <p className="text-lg text-gray-400">{plan?.isRestDay ? "Aproveite para recarregar as energias." : "Todas as tarefas concluídas!"}</p>
                <h3 className="text-3xl font-bold text-green-400">Bom trabalho!</h3>
            </div>
           )}
        </div>
      </div>
      
      {/* Right Column - Pomodoro and Widgets */}
      <div className="lg:w-1/3 flex flex-col gap-8">
        <div className="flex-grow-[3] min-h-0"><PomodoroTimer settings={settings} /></div>
        <div className="flex-grow-[1] min-h-0"><InteractiveWidget /></div>
      </div>
    </div>
  );
};

export default TodayView;
