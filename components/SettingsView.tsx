import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, Discipline, EnemIncidence, Topic, Subtopic } from '../types';
import { DownloadIcon, UploadIcon, RefreshCwIcon } from './icons';
import { uuidv4 } from '../services/planningService';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onReorganize: () => void;
  disciplines: Discipline[];
  onDisciplinesChange: (disciplines: Discipline[]) => void;
}

const JSON_TEMPLATE = {
  "disciplines": [
    {
      "id": "mat_exemplo",
      "name": "Matemática",
      "weight": 1.2,
      "topics": [
        {
          "id": "mat_topico_exemplo_1",
          "name": "Análise Combinatória",
          "subtopics": [
            {
                "id": "mat_subtopico_exemplo_1",
                "name": "Permutação Simples",
                "difficulty": 2,
                "enemIncidence": "alta",
                "lastStudied": null,
                "confidence": 3,
                "history": []
            }
          ]
        }
      ]
    }
  ]
};

const SettingsField: React.FC<{ label: string; description: string; children: React.ReactNode }> = ({ label, description, children }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start py-4 border-b border-gray-700 last:border-b-0">
        <div className="md:col-span-1">
            <h4 className="font-semibold text-white">{label}</h4>
            <p className="text-sm text-gray-400">{description}</p>
        </div>
        <div className="md:col-span-2">{children}</div>
    </div>
);

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdateSettings, onReorganize, disciplines, onDisciplinesChange }) => {
  const [currentSettings, setCurrentSettings] = useState<AppSettings>(settings);
  const [localDisciplines, setLocalDisciplines] = useState<Discipline[]>(JSON.parse(JSON.stringify(disciplines)));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // For disciplines and topics
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReorganizing, setIsReorganizing] = useState(false);

  useEffect(() => {
    setLocalDisciplines(JSON.parse(JSON.stringify(disciplines)));
  }, [disciplines]);
  
  const toggleExpand = (id: string) => {
    setExpanded(prev => ({...prev, [id]: !prev[id]}));
  }

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setCurrentSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : Number(value),
    }));
  };

  const handleSaveSettings = () => {
    onUpdateSettings(currentSettings);
    alert('Configurações salvas!');
  };

  const handleReorganizeClick = () => {
      if(window.confirm("Isso irá apagar seu plano atual e criar um novo com base nos seus tópicos e configurações. Deseja continuar?")) {
          setIsReorganizing(true);
          setTimeout(() => {
              onReorganize();
              setIsReorganizing(false);
              alert("Agenda reorganizada com sucesso!");
          }, 500);
      }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify({ disciplines, settings }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'backup_gio_study_app.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };
  
  const handleImportClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result);
          if (parsed.disciplines && Array.isArray(parsed.disciplines)) {
            onDisciplinesChange(parsed.disciplines);
            if(parsed.settings) {
              onUpdateSettings(parsed.settings);
            }
            alert('Dados importados com sucesso! A agenda será reorganizada.');
            handleReorganizeClick();
          } else { throw new Error("Formato de arquivo inválido."); }
        }
      } catch (error) {
        alert(`Erro ao importar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleCopyJsonStructure = () => {
    navigator.clipboard.writeText(JSON.stringify(JSON_TEMPLATE, null, 2))
      .then(() => alert('Estrutura JSON copiada para a área de transferência!'))
      .catch(err => alert('Falha ao copiar a estrutura.'));
  };

  // --- Local Discipline Management ---

  const handleDisciplineChange = (id: string, field: keyof Discipline, value: any) => {
    setLocalDisciplines(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };
  
  const handleTopicChange = (disciplineId: string, topicId: string, field: keyof Topic, value: any) => {
    setLocalDisciplines(prev => prev.map(d => d.id === disciplineId ? { ...d, topics: d.topics.map(t => t.id === topicId ? { ...t, [field]: value } : t) } : d));
  };

  const handleSubtopicChange = (disciplineId: string, topicId: string, subtopicId: string, field: keyof Subtopic, value: any) => {
    setLocalDisciplines(prev => prev.map(d => d.id === disciplineId ? {
        ...d,
        topics: d.topics.map(t => t.id === topicId ? {
            ...t,
            subtopics: t.subtopics.map(st => st.id === subtopicId ? { ...st, [field]: value } : st)
        } : t)
    } : d));
  };

  const addDiscipline = () => {
    const newId = uuidv4();
    const newDiscipline: Discipline = { id: newId, name: 'Nova Disciplina', weight: 1, topics: [] };
    setLocalDisciplines(prev => [...prev, newDiscipline]);
    toggleExpand(newId);
  };

  const addTopic = (disciplineId: string) => {
    const newId = uuidv4();
    const newTopic: Topic = { id: newId, name: 'Novo Tópico', subtopics: [] };
    setLocalDisciplines(prev => prev.map(d => d.id === disciplineId ? { ...d, topics: [...d.topics, newTopic] } : d));
    toggleExpand(newId);
  };
  
  const addSubtopic = (disciplineId: string, topicId: string) => {
    const newSubtopic: Subtopic = { id: uuidv4(), name: 'Novo Subtópico', difficulty: 3, enemIncidence: 'media', lastStudied: null, confidence: 3, history: [] };
    setLocalDisciplines(prev => prev.map(d => d.id === disciplineId ? { ...d, topics: d.topics.map(t => t.id === topicId ? { ...t, subtopics: [...t.subtopics, newSubtopic] } : t) } : d));
  };

  const deleteDiscipline = (id: string) => {
    if (window.confirm('Excluir esta disciplina e tudo dentro dela?')) setLocalDisciplines(p => p.filter(d => d.id !== id));
  };

  const deleteTopic = (disciplineId: string, topicId: string) => {
    if (window.confirm('Excluir este tópico e seus subtópicos?')) setLocalDisciplines(p => p.map(d => d.id === disciplineId ? { ...d, topics: d.topics.filter(t => t.id !== topicId) } : d));
  };
  
  const deleteSubtopic = (disciplineId: string, topicId: string, subtopicId: string) => {
    if (window.confirm('Excluir este subtópico?')) setLocalDisciplines(p => p.map(d => d.id === disciplineId ? { ...d, topics: d.topics.map(t => t.id === topicId ? { ...t, subtopics: t.subtopics.filter(st => st.id !== subtopicId) } : t) } : d));
  };

  const saveDisciplineChanges = () => {
      onDisciplinesChange(localDisciplines);
      alert("Alterações salvas! Lembre-se de reorganizar a agenda.");
  };

  const inputStyle = "w-full bg-gray-700/50 text-white placeholder-gray-400 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const smallInputStyle = "bg-gray-700/50 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500";
  
  return (
    <div className="max-w-4xl mx-auto bg-gray-800/50 backdrop-blur-sm p-8 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl font-bold text-white mb-6">Configurações</h2>
      
      {/* General Settings */}
      <h3 className="text-xl font-semibold text-indigo-400 mb-4 border-b border-indigo-400/30 pb-2">Plano de Estudos</h3>
      <div className="mb-8">
          <SettingsField label="Minutos de estudo por dia" description="Tempo total de estudo focado por dia.">
              <input type="number" name="dailyStudyMinutes" value={currentSettings.dailyStudyMinutes} onChange={handleSettingChange} className={inputStyle} />
          </SettingsField>
          <SettingsField label="Dias de estudo por semana" description="Número de dias na semana que você irá estudar.">
              <input type="number" name="studyDaysPerWeek" min="1" max="7" value={currentSettings.studyDaysPerWeek} onChange={handleSettingChange} className={inputStyle} />
          </SettingsField>
          <div className="mt-4 flex justify-end">
             <button onClick={handleSaveSettings} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500 transition-colors">
                Salvar Configurações do Plano
             </button>
          </div>
      </div>

      {/* Manual Discipline Management */}
      <h3 className="text-xl font-semibold text-indigo-400 mt-12 mb-4 border-b border-indigo-400/30 pb-2">Gerenciar Disciplinas e Tópicos</h3>
      <div className="space-y-4 mb-6">
        {localDisciplines.map(d => (
          <div key={d.id} className="bg-gray-700/30 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-grow">
                 <input type="text" value={d.name} onChange={e => handleDisciplineChange(d.id, 'name', e.target.value)} className={`${smallInputStyle} font-bold text-lg w-1/3`} />
                 <label className="text-sm text-gray-400">Peso:</label>
                 <input type="number" step="0.1" value={d.weight} onChange={e => handleDisciplineChange(d.id, 'weight', parseFloat(e.target.value))} className={`${smallInputStyle} w-16`} />
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => deleteDiscipline(d.id)} className="text-red-400 hover:text-red-300 text-xs font-semibold">Excluir</button>
                 <button onClick={() => toggleExpand(d.id)} className="px-2 py-1 text-xs bg-gray-600 rounded">{expanded[d.id] ? 'Recolher' : 'Expandir'}</button>
              </div>
            </div>
            {expanded[d.id] && (
              <div className="mt-4 pl-4 border-l-2 border-gray-600 space-y-3">
                {d.topics.map(t => (
                   <div key={t.id} className="bg-gray-800/30 p-3 rounded-md">
                        <div className="flex items-center justify-between">
                            <input type="text" value={t.name} onChange={e => handleTopicChange(d.id, t.id, 'name', e.target.value)} className={`${smallInputStyle} font-semibold w-2/3`} placeholder="Nome do Tópico"/>
                            <div className="flex items-center gap-2">
                                <button onClick={() => deleteTopic(d.id, t.id)} className="text-red-400 hover:text-red-300 text-xs font-semibold">Excluir</button>
                                <button onClick={() => toggleExpand(t.id)} className="px-2 py-1 text-xs bg-gray-600 rounded">{expanded[t.id] ? 'Recolher' : 'Expandir'}</button>
                            </div>
                        </div>
                        {expanded[t.id] && (
                            <div className="mt-3 pt-3 pl-3 border-l-2 border-gray-500 space-y-2">
                                {t.subtopics.map(st => (
                                    <div key={st.id} className="grid grid-cols-12 gap-2 items-center text-sm">
                                        <input type="text" value={st.name} onChange={e => handleSubtopicChange(d.id, t.id, st.id, 'name', e.target.value)} className={`${smallInputStyle} col-span-5`} placeholder="Nome do subtópico" />
                                        <label className="text-right text-gray-400">Dific.:</label>
                                        <input type="number" min="1" max="5" value={st.difficulty} onChange={e => handleSubtopicChange(d.id, t.id, st.id, 'difficulty', parseInt(e.target.value))} className={`${smallInputStyle} col-span-1`} />
                                        <label className="text-right text-gray-400">Incid.:</label>
                                        <select value={st.enemIncidence} onChange={e => handleSubtopicChange(d.id, t.id, st.id, 'enemIncidence', e.target.value as EnemIncidence)} className={`${smallInputStyle} col-span-2`}>
                                            <option value="baixa">Baixa</option>
                                            <option value="media">Média</option>
                                            <option value="alta">Alta</option>
                                        </select>
                                        <div className="col-span-2 text-right">
                                            <button onClick={() => deleteSubtopic(d.id, t.id, st.id)} className="text-red-400 hover:text-red-300 text-xs font-semibold">Excluir</button>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => addSubtopic(d.id, t.id)} className="mt-2 px-2 py-1 text-xs bg-indigo-600/50 rounded hover:bg-indigo-600">Adicionar Subtópico</button>
                            </div>
                        )}
                   </div>
                ))}
                 <button onClick={() => addTopic(d.id)} className="mt-2 px-2 py-1 text-xs bg-indigo-600/80 rounded hover:bg-indigo-600">Adicionar Tópico</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <button onClick={addDiscipline} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Adicionar Disciplina</button>
        <button onClick={saveDisciplineChanges} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500">Salvar Alterações</button>
      </div>

      {/* Data Management */}
      <h3 className="text-xl font-semibold text-indigo-400 mt-12 mb-4 border-b border-indigo-400/30 pb-2">Gerenciamento de Dados</h3>
      <div className="flex flex-wrap gap-4">
        <button onClick={handleExport} className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">
          <DownloadIcon className="w-5 h-5 mr-2" /> Exportar Backup
        </button>
        <button onClick={handleImportClick} className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">
          <UploadIcon className="w-5 h-5 mr-2" /> Importar Backup
        </button>
        <button onClick={handleCopyJsonStructure} className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">
          Copiar Estrutura JSON
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
      </div>

      {/* Actions */}
      <h3 className="text-xl font-semibold text-indigo-400 mt-12 mb-4 border-b border-indigo-400/30 pb-2">Ações</h3>
      <div className="flex gap-4">
        <button onClick={handleReorganizeClick} disabled={isReorganizing} className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors disabled:bg-red-800 disabled:cursor-not-allowed">
          <RefreshCwIcon className={`w-5 h-5 mr-2 ${isReorganizing ? 'animate-spin' : ''}`} />
          {isReorganizing ? "Reorganizando..." : "Reorganizar Agenda Manualmente"}
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
