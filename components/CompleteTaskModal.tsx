
import React, { useState } from 'react';
import { Task } from '../types';

interface CompleteTaskModalProps {
  task: Task;
  onClose: () => void;
  onComplete: (confidence: number, notes: string) => void;
}

const StarRating: React.FC<{ rating: number; setRating: (rating: number) => void }> = ({ rating, setRating }) => {
  return (
    <div className="flex justify-center my-4">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => setRating(star)}
          className={`text-4xl transition-transform duration-200 transform hover:scale-125 focus:outline-none ${
            star <= rating ? 'text-yellow-400' : 'text-gray-500'
          }`}
          aria-label={`Avaliação ${star} de 5`}
        >
          ★
        </button>
      ))}
    </div>
  );
};

const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({ task, onClose, onComplete }) => {
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState(3); // Default to neutral confidence

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(confidence, notes);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg p-6 m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-white mb-2">Tarefa Concluída!</h2>
        <p className="text-indigo-300 font-semibold mb-2">{task.subtopicName}</p>
        <p className="text-sm text-gray-400 mb-4">{task.disciplineName} &bull; {task.topicName}</p>
        
        <form onSubmit={handleSubmit}>
          <label className="block text-center text-gray-300 mb-1">
            Qual seu nível de confiança neste tópico agora?
          </label>
          <StarRating rating={confidence} setRating={setConfidence} />

          <label htmlFor="notes" className="block text-gray-300 mb-2">
            Adicione notas (opcional):
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-gray-700/50 text-white placeholder-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Ex: Entendi a fórmula, mas preciso praticar mais exercícios..."
          />
          <div className="mt-6 flex justify-end gap-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500 transition-colors">
              Salvar e Concluir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompleteTaskModal;
