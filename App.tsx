import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import ambientVideo from './assets/video_telinha.mp4';
import fallbackVideo from './assets/video_background.mp4';
import {
  loadGioConfigFromFirestore,
  saveGioConfigToFirestore,
  type FirestoreDiscipline,
  type FirestoreTopic,
  type GioConfig
} from './services/firestoreService';
import { authenticateAnonymously, onAuthChange, isAuthenticated } from './services/firebase';

type TabId = 'today' | 'calendar' | 'settings';

type PriorityColor = 'green' | 'yellow' | 'red';

type CompletionContext = {
  slotId: string;
  disciplineId: string;
  topicId: string;
  title: string;
};

type AssignedTopic = {
  topicId: string;
  disciplineId: string;
  title: string;
  discipline: string;
  incidence: number;
  difficulty: number;
  needsReview: boolean;
  priorityScore: number;
  priorityColor: PriorityColor;
};

type StudySlot = {
  id: string;
  label: string;
  assignedTopic?: AssignedTopic;
};

type StudyTopic = FirestoreTopic;

type Discipline = FirestoreDiscipline;

type ReviewItem = {
  id: string;
  title: string;
  scheduled: string;
  status: 'due' | 'done' | 'upcoming';
};

type CalendarDay = {
  type: 'day' | 'pad';
  dayNumber?: number;
  status?: 'rest' | 'study' | 'review' | 'mixed';
  description?: string;
};

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

type DragSource = 'discipline' | 'slot';

type DraggedTopicPayload = {
  disciplineId: string;
  topicId: string;
  title: string;
  disciplineName: string;
  incidence: number;
  difficulty: number;
  needsReview: boolean;
  priorityScore: number;
  priorityColor: PriorityColor;
  source: DragSource;
  sourceSlotId?: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'calendar', label: 'Calendário' },
  { id: 'settings', label: 'Configurações' }
];

const INITIAL_STUDY_SLOTS: StudySlot[] = [
  { id: 'slot-1', label: 'Manhã' },
  { id: 'slot-2', label: 'Tarde' },
  { id: 'slot-3', label: 'Noite' },
  { id: 'slot-4', label: 'Extra' }
];

const createId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const clampPriorityValue = (value: number): number => {
  const numeric = Number.isFinite(value) ? value : 1;
  return Math.min(3, Math.max(1, Math.round(numeric)));
};

const calculatePriority = (
  incidence: number,
  difficulty: number,
  needsReview: boolean
): { score: number; color: PriorityColor } => {
  const reviewWeight = needsReview ? 2 : 1;
  const score = incidence * difficulty * reviewWeight;
  if (score <= 6) return { score, color: 'green' };
  if (score <= 12) return { score, color: 'yellow' };
  return { score, color: 'red' };
};

const priorityLabel: Record<PriorityColor, string> = {
  green: 'Prioridade baixa (Grupo Verde)',
  yellow: 'Prioridade moderada (Grupo Amarelo)',
  red: 'Alta prioridade (Grupo Vermelho)'
};

const priorityClass: Record<PriorityColor, string> = {
  green: 'topic-card priority-green',
  yellow: 'topic-card priority-yellow',
  red: 'topic-card priority-red'
};

const computePendingCount = (topics: StudyTopic[]): number =>
  topics.filter((topic) => !topic.isAssigned && !topic.completionDate).length;

const createTopic = (
  disciplineId: string,
  id: string,
  name: string,
  incidence: number,
  difficulty: number,
  needsReview: boolean
): StudyTopic => {
  const normalizedIncidence = clampPriorityValue(incidence);
  const normalizedDifficulty = clampPriorityValue(difficulty);
  const { score, color } = calculatePriority(normalizedIncidence, normalizedDifficulty, needsReview);
  return {
    id,
    disciplineId,
    name,
    description: '',
    incidence: normalizedIncidence,
    difficulty: normalizedDifficulty,
    needsReview,
    priorityScore: score,
    priorityColor: color,
    completionDate: null,
    history: [],
    isAssigned: false
  };
};

const ensureTopicShape = (disciplineId: string, topic: Partial<FirestoreTopic>): StudyTopic => {
  const incidence = clampPriorityValue(topic?.incidence ?? 1);
  const difficulty = clampPriorityValue(topic?.difficulty ?? 1);
  const needsReview = Boolean(topic?.needsReview);
  const { score, color } = calculatePriority(incidence, difficulty, needsReview);

  const history = Array.isArray(topic?.history)
    ? topic!.history.map((entry) => ({
        date: entry?.date ?? new Date().toISOString(),
        notes: entry?.notes ?? '',
        type: entry?.type === 'review' ? 'review' : 'study'
      }))
    : [];

  return {
    id: topic?.id ?? createId('topic'),
    disciplineId,
    name: topic?.name ?? 'Tópico sem nome',
    description: topic?.description ?? '',
    incidence,
    difficulty,
    needsReview,
    priorityScore: topic?.priorityScore ?? score,
    priorityColor: topic?.priorityColor ?? color,
    completionDate: topic?.completionDate ?? null,
    history,
    isAssigned: Boolean(topic?.isAssigned)
  };
};

const ensureDisciplineShape = (discipline: Partial<FirestoreDiscipline>): Discipline => {
  const id = discipline?.id ?? createId('discipline');
  const topicsArray = Array.isArray(discipline?.topics)
    ? (discipline!.topics as FirestoreTopic[])
    : [];
  const topics = topicsArray.map((topic) => ensureTopicShape(id, topic));

  return {
    id,
    name: discipline?.name ?? 'Disciplina sem nome',
    weight: typeof discipline?.weight === 'number' && !Number.isNaN(discipline!.weight)
      ? discipline!.weight
      : 1,
    topics,
    pending: computePendingCount(topics)
  };
};

const toFirestorePayload = (input: Discipline[]): GioConfig => ({
  disciplines: input.map((discipline) => ({
    ...discipline,
    pending: computePendingCount(discipline.topics),
    topics: discipline.topics.map((topic) => ({ ...topic }))
  })),
  lastUpdated: new Date().toISOString(),
  version: '1.0.0'
});

const extractDisciplinesFromJson = (data: unknown): Discipline[] => {
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.disciplines)
      ? (data as any).disciplines
      : null;

  if (!candidates) {
    throw new Error('Formato inválido: esperado "disciplines" ou lista de disciplinas.');
  }

  return (candidates as Array<Partial<FirestoreDiscipline>>).map((discipline) =>
    ensureDisciplineShape(discipline)
  );
};

const INITIAL_DISCIPLINES: Discipline[] = [
  (() => {
    const id = 'math';
    const topics = [
      createTopic(id, 'math-1', 'Funções Exponenciais', 3, 3, true),
      createTopic(id, 'math-2', 'Probabilidade Básica', 2, 2, false),
      createTopic(id, 'math-3', 'Geometria Espacial', 2, 1, false)
    ];
    return {
      id,
      name: 'Matemática',
      weight: 3,
      topics,
      pending: computePendingCount(topics)
    };
  })(),
  (() => {
    const id = 'history';
    const topics = [
      createTopic(id, 'history-1', 'Brasil República', 3, 2, true),
      createTopic(id, 'history-2', 'Revoluções Burguesas', 2, 2, true)
    ];
    return {
      id,
      name: 'História',
      weight: 2,
      topics,
      pending: computePendingCount(topics)
    };
  })(),
  (() => {
    const id = 'chem';
    const topics = [createTopic(id, 'chem-1', 'Eletroquímica', 3, 2, true)];
    return {
      id,
      name: 'Química',
      weight: 2,
      topics,
      pending: computePendingCount(topics)
    };
  })()
];

const REVIEWS: ReviewItem[] = [
  { id: 'rev-1', title: 'Revisar Termodinâmica', scheduled: '08:00', status: 'due' },
  { id: 'rev-2', title: 'Resumo de Biologia Celular', scheduled: '14:00', status: 'upcoming' },
  { id: 'rev-3', title: 'Flashcards de Literatura', scheduled: '20:00', status: 'upcoming' }
];

const STATUS_LABEL: Record<NonNullable<CalendarDay['status']>, string> = {
  rest: 'Dia livre',
  study: 'Estudo concluído',
  review: 'Revisões agendadas',
  mixed: 'Estudo + Revisão'
};

const CalendarLegend: React.FC = () => (
  <div className="calendar-legend">
    <span className="legend-item legend-study">Estudo</span>
    <span className="legend-item legend-review">Revisão</span>
    <span className="legend-item legend-mixed">Estudo + Revisão</span>
    <span className="legend-item legend-rest">Descanso</span>
  </div>
);

const RemovalZone: React.FC<{
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  isActive: boolean;
}> = ({ onDrop, onDragEnter, onDragLeave, isActive }) => (
  <div
    className={isActive ? 'removal-zone removal-zone--active' : 'removal-zone'}
    onDragEnter={(event) => {
      event.preventDefault();
      onDragEnter(event);
    }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={onDragLeave}
    onDrop={(event) => {
      event.preventDefault();
      onDrop(event);
    }}
  >
    <span>Solte aqui para remover do plano de hoje</span>
  </div>
);

const Modal: React.FC<ModalProps> = ({ title, onClose, children, actions }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-card">
      <header className="modal-header">
        <h2>{title}</h2>
        <button type="button" className="ghost-button" onClick={onClose} aria-label="Fechar modal">✕</button>
      </header>
      <div className="modal-body">{children}</div>
      {actions && <footer className="modal-footer">{actions}</footer>}
    </div>
  </div>
);

const ClockPanel: React.FC = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="header-card clock-card">
      <span className="clock-time">{formattedTime}</span>
      <span className="clock-date">{formattedDate}</span>
    </div>
  );
};

const MediaSlot: React.FC = () => (
  <div className="header-card media-card">
    <video className="media-video" autoPlay loop muted playsInline aria-label="Ambiente visual">
      <source src={ambientVideo} type="video/mp4" />
      <source src={fallbackVideo} type="video/mp4" />
      Seu navegador não suporta reprodução de vídeo.
    </video>
  </div>
);

const FidgetCube: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="cube-button" onClick={onClick} aria-label="Abrir progresso">
    <div className="cube" aria-hidden="true">
      <span className="cube-face front">G</span>
      <span className="cube-face back">O</span>
      <span className="cube-face right">I</span>
      <span className="cube-face left">O</span>
      <span className="cube-face top">+</span>
      <span className="cube-face bottom">%</span>
    </div>
    <span className="cube-caption">Progresso</span>
  </button>
);

const StudySlotColumn: React.FC<{
  slots: StudySlot[];
  draggedTopic: DraggedTopicPayload | null;
  activeDropSlot: string | null;
  onOpenCompletion: (slotId: string, topic: AssignedTopic) => void;
  onDropTopic: (slotId: string) => void;
  onDragOverSlot: (slotId: string) => void;
  onDragLeaveSlot: (slotId: string) => void;
  onSlotTopicDragStart: (event: React.DragEvent<HTMLElement>, slotId: string, topic: AssignedTopic) => void;
  onSlotTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onRemoveTopic: (slotId: string) => void;
}> = ({
  slots,
  draggedTopic,
  activeDropSlot,
  onOpenCompletion,
  onDropTopic,
  onDragOverSlot,
  onDragLeaveSlot,
  onSlotTopicDragStart,
  onSlotTopicDragEnd,
  onRemoveTopic
}) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Plano de hoje</h2>
      <p>Arraste tópicos para preencher cada slot.</p>
    </header>
    <div className="study-slots">
      {slots.map((slot) => {
        const hasAssignment = Boolean(slot.assignedTopic);
        const isOriginSlot = draggedTopic?.source === 'slot' && draggedTopic.sourceSlotId === slot.id;
        const canReceiveDrop = (() => {
          if (!draggedTopic) return false;
          if (draggedTopic.source === 'slot') return true;
          return !hasAssignment;
        })();

        const shouldBlockDrop = Boolean(
          draggedTopic && draggedTopic.source === 'discipline' && hasAssignment
        );

        const slotClasses = [
          'study-slot',
          hasAssignment ? 'study-slot--filled' : '',
          activeDropSlot === slot.id && canReceiveDrop ? 'study-slot--active' : '',
          shouldBlockDrop ? 'study-slot--blocked' : '',
          isOriginSlot ? 'study-slot--origin' : ''
        ].filter(Boolean).join(' ');

        return (
          <article
            key={slot.id}
            className={slotClasses}
            onDragEnter={(event) => {
              if (!draggedTopic) return;
              if (!canReceiveDrop) return;
              event.preventDefault();
              onDragOverSlot(slot.id);
            }}
            onDragOver={(event) => {
              if (!draggedTopic) return;
              event.preventDefault();
              if (canReceiveDrop) {
                event.dataTransfer.dropEffect = 'move';
                onDragOverSlot(slot.id);
              } else {
                event.dataTransfer.dropEffect = 'none';
              }
            }}
            onDragLeave={() => {
              if (activeDropSlot === slot.id) {
                onDragLeaveSlot(slot.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!canReceiveDrop) return;
              onDropTopic(slot.id);
            }}
          >
            <div className="study-slot__label">{slot.label}</div>
            {slot.assignedTopic ? (
              <div
                className="study-slot__body"
                draggable
                onDragStart={(event) => onSlotTopicDragStart(event, slot.id, slot.assignedTopic!)}
                onDragEnd={onSlotTopicDragEnd}
              >
                <div className={`priority-tag priority-${slot.assignedTopic.priorityColor}`}>
                  {priorityLabel[slot.assignedTopic.priorityColor]}
                </div>
                <h3>{slot.assignedTopic.title}</h3>
                <p>
                  {slot.assignedTopic.discipline} · Incidência {slot.assignedTopic.incidence} · Dificuldade {slot.assignedTopic.difficulty}
                </p>
                <small>
                  Pontuação {slot.assignedTopic.priorityScore} · Revisão {slot.assignedTopic.needsReview ? 'sim' : 'não'}
                </small>
                <div className="study-slot__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onOpenCompletion(slot.id, slot.assignedTopic!)}
                  >
                    Marcar como concluído
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveTopic(slot.id);
                    }}
                  >
                    Remover do plano
                  </button>
                </div>
              </div>
            ) : (
              <div className="study-slot__empty">
                <span>Disponível</span>
                <small>Arraste um tópico para cá</small>
              </div>
            )}
          </article>
        );
      })}
    </div>
  </section>
);

const DisciplineAccordion: React.FC<{
  disciplines: Discipline[];
  expandedId: string | null;
  draggedTopic: DraggedTopicPayload | null;
  onToggle: (id: string) => void;
  onTopicDragStart: (event: React.DragEvent<HTMLElement>, disciplineId: string, topicId: string) => void;
  onTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
}> = ({ disciplines, expandedId, draggedTopic, onToggle, onTopicDragStart, onTopicDragEnd }) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Disciplinas e tópicos</h2>
      <p>Prioridades calculadas automaticamente.</p>
    </header>
    <div className="accordion">
      {disciplines.map((discipline) => {
        const isExpanded = expandedId === discipline.id;
        return (
          <div key={discipline.id} className="accordion-item">
            <button
              type="button"
              className="accordion-trigger"
              onClick={() => onToggle(discipline.id)}
              aria-expanded={isExpanded}
            >
              <div>
                <h3>{discipline.name}</h3>
                <small>{discipline.pending} tópicos pendentes · Peso {discipline.weight}</small>
              </div>
              <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
              <div className="accordion-content">
                {discipline.topics.map((topic) => {
                  const isAssigned = Boolean(topic.isAssigned);
                  const isDragging = draggedTopic?.topicId === topic.id;
                  const classes = [
                    'topic-card',
                    priorityClass[topic.priorityColor],
                    isAssigned ? 'is-disabled' : '',
                    isDragging ? 'is-dragging' : ''
                  ].filter(Boolean).join(' ');

                  return (
                    <article
                      key={topic.id}
                      className={classes}
                      draggable={!isAssigned}
                      onDragStart={(event) => onTopicDragStart(event, discipline.id, topic.id)}
                      onDragEnd={onTopicDragEnd}
                      aria-disabled={isAssigned}
                    >
                      <div className="topic-card__header">
                        <span className="topic-focus">Pontuação {topic.priorityScore}</span>
                        <span className="topic-priority">{priorityLabel[topic.priorityColor]}</span>
                      </div>
                      <h4>{topic.name}</h4>
                      <p>
                        Incidência {topic.incidence} · Dificuldade {topic.difficulty} · Revisão {topic.needsReview ? 'Sim' : 'Não'}
                      </p>
                      <button type="button" className="ghost-button" disabled={isAssigned}>
                        {isAssigned ? 'Já adicionado ao plano' : 'Arraste para o plano'}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </section>
);

const ReviewColumn: React.FC<{ onOpenDecision: () => void }> = ({ onOpenDecision }) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Revisões do dia</h2>
      <p>Geradas automaticamente pelo algoritmo.</p>
    </header>
    <ul className="review-list">
      {REVIEWS.map((review) => (
        <li key={review.id} className={`review-card review-${review.status}`}>
          <div>
            <h3>{review.title}</h3>
            <small>{review.scheduled}</small>
          </div>
          <button type="button" className="outline-button" onClick={onOpenDecision}>
            Marcar revisão
          </button>
        </li>
      ))}
    </ul>
  </section>
);

const TodayView: React.FC<{
  disciplines: Discipline[];
  studySlots: StudySlot[];
  expandedDiscipline: string | null;
  draggedTopic: DraggedTopicPayload | null;
  activeDropSlot: string | null;
  dragFeedback: string | null;
  onToggleDiscipline: (id: string) => void;
  onTopicDragStart: (event: React.DragEvent<HTMLElement>, disciplineId: string, topicId: string) => void;
  onTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onOpenCompletion: (slotId: string, topic: AssignedTopic) => void;
  onOpenDecision: () => void;
  onDropTopic: (slotId: string) => void;
  onDragOverSlot: (slotId: string) => void;
  onDragLeaveSlot: (slotId: string) => void;
  onSlotTopicDragStart: (event: React.DragEvent<HTMLElement>, slotId: string, topic: AssignedTopic) => void;
  onSlotTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onRemoveTopic: (slotId: string) => void;
  onRemovalDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  onRemovalDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onRemovalDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  isRemovalHover: boolean;
}> = ({
  disciplines,
  studySlots,
  expandedDiscipline,
  draggedTopic,
  activeDropSlot,
  dragFeedback,
  onToggleDiscipline,
  onTopicDragStart,
  onTopicDragEnd,
  onOpenCompletion,
  onOpenDecision,
  onDropTopic,
  onDragOverSlot,
  onDragLeaveSlot,
  onSlotTopicDragStart,
  onSlotTopicDragEnd,
  onRemoveTopic,
  onRemovalDragEnter,
  onRemovalDragLeave,
  onRemovalDrop,
  isRemovalHover
}) => (
  <div className="today-view">
    {dragFeedback && <div className="drag-feedback" role="status">{dragFeedback}</div>}
    <div className="today-grid">
      <StudySlotColumn
        slots={studySlots}
        draggedTopic={draggedTopic}
        activeDropSlot={activeDropSlot}
        onOpenCompletion={onOpenCompletion}
        onDropTopic={onDropTopic}
        onDragOverSlot={onDragOverSlot}
        onDragLeaveSlot={onDragLeaveSlot}
        onSlotTopicDragStart={onSlotTopicDragStart}
        onSlotTopicDragEnd={onSlotTopicDragEnd}
        onRemoveTopic={onRemoveTopic}
      />
      <DisciplineAccordion
        disciplines={disciplines}
        expandedId={expandedDiscipline}
        draggedTopic={draggedTopic}
        onToggle={onToggleDiscipline}
        onTopicDragStart={onTopicDragStart}
        onTopicDragEnd={onTopicDragEnd}
      />
      <ReviewColumn onOpenDecision={onOpenDecision} />
    </div>
    {draggedTopic?.source === 'slot' && (
      <RemovalZone
        onDrop={onRemovalDrop}
        onDragEnter={onRemovalDragEnter}
        onDragLeave={onRemovalDragLeave}
        isActive={isRemovalHover}
      />
    )}
  </div>
);

const CalendarView: React.FC<{
  days: CalendarDay[];
  onSelectDay: (day: CalendarDay) => void;
}> = ({ days, onSelectDay }) => (
  <div className="calendar-panel">
    <header className="panel-header">
      <h2>Agenda visual</h2>
      <p>Clique em um dia para visualizar detalhes.</p>
    </header>
    <CalendarLegend />
    <div className="calendar-grid">
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label) => (
        <span key={label} className="calendar-label">{label}</span>
      ))}
      {days.map((day, index) => {
        if (day.type === 'pad') {
          return <span key={`pad-${index}`} className="calendar-day calendar-day--pad" />;
        }
        const statusClass = day.status ? `calendar-day status-${day.status}` : 'calendar-day';
        return (
          <button
            key={`day-${day.dayNumber}`}
            type="button"
            className={statusClass}
            onClick={() => onSelectDay(day)}
          >
            <span className="calendar-day__number">{day.dayNumber}</span>
            {day.status && <span className="calendar-day__dot" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  </div>
);

type SettingsViewProps = {
  disciplines: Discipline[];
  onAddDiscipline: () => void;
  onUpdateDisciplineField: (disciplineId: string, field: 'name' | 'weight', value: string | number) => void;
  onAddTopic: (disciplineId: string) => void;
  onUpdateTopicField: (
    disciplineId: string,
    topicId: string,
    field: 'name' | 'incidence' | 'difficulty' | 'needsReview',
    value: string | number | boolean
  ) => void;
  onExport: () => void;
  onCopyTemplate: () => void;
  onImportFile: (file: File) => void;
  onImportJsonText: (json: string) => void;
  isPersisting: boolean;
};

const SettingsView: React.FC<SettingsViewProps> = ({
  disciplines,
  onAddDiscipline,
  onUpdateDisciplineField,
  onAddTopic,
  onUpdateTopicField,
  onExport,
  onCopyTemplate,
  onImportFile,
  onImportJsonText,
  isPersisting
}) => {
  const [importText, setImportText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileButtonClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    event.target.value = '';
  };

  const handleImportText = () => {
    if (!importText.trim()) return;
    onImportJsonText(importText);
  };

  const handleClearText = () => setImportText('');

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <header className="panel-header">
          <div className="settings-header">
            <div>
              <h2>Gerenciar disciplinas e tópicos</h2>
              <p>Construa seu banco de estudo e deixe o sistema calcular as prioridades.</p>
            </div>
            <button type="button" className="primary-button" onClick={onAddDiscipline} disabled={isPersisting}>
              Adicionar disciplina
            </button>
          </div>
        </header>

        <div className="discipline-list">
          {disciplines.length === 0 && (
            <p className="empty-hint">Nenhuma disciplina cadastrada ainda. Comece adicionando a primeira.</p>
          )}

          {disciplines.map((discipline) => (
            <article key={discipline.id} className="discipline-card">
              <div className="discipline-card__header">
                <label className="form-field">
                  <span>Nome da disciplina</span>
                  <input
                    type="text"
                    value={discipline.name}
                    placeholder="Ex.: Química"
                    onChange={(event) => onUpdateDisciplineField(discipline.id, 'name', event.target.value)}
                  />
                </label>
                <label className="form-field weight-field">
                  <span>Peso geral</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={discipline.weight}
                    onChange={(event) => onUpdateDisciplineField(discipline.id, 'weight', Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => onAddTopic(discipline.id)}
                  disabled={isPersisting}
                >
                  Adicionar tópico
                </button>
              </div>

              {discipline.topics.length === 0 ? (
                <p className="empty-hint">Nenhum tópico cadastrado nesta disciplina.</p>
              ) : (
                <div className="topic-table">
                  <div className="topic-table__head">
                    <span>Tópico</span>
                    <span>Incidência</span>
                    <span>Dificuldade</span>
                    <span>Revisão?</span>
                    <span>Prioridade</span>
                  </div>
                  {discipline.topics.map((topic) => (
                    <div key={topic.id} className="topic-row">
                      <input
                        type="text"
                        value={topic.name}
                        placeholder="Ex.: Eletroquímica"
                        onChange={(event) =>
                          onUpdateTopicField(discipline.id, topic.id, 'name', event.target.value)
                        }
                      />
                      <select
                        value={topic.incidence}
                        onChange={(event) =>
                          onUpdateTopicField(
                            discipline.id,
                            topic.id,
                            'incidence',
                            Number(event.target.value)
                          )
                        }
                      >
                        <option value={1}>1 · Baixa</option>
                        <option value={2}>2 · Média</option>
                        <option value={3}>3 · Alta</option>
                      </select>
                      <select
                        value={topic.difficulty}
                        onChange={(event) =>
                          onUpdateTopicField(
                            discipline.id,
                            topic.id,
                            'difficulty',
                            Number(event.target.value)
                          )
                        }
                      >
                        <option value={1}>1 · Fácil</option>
                        <option value={2}>2 · Média</option>
                        <option value={3}>3 · Difícil</option>
                      </select>
                      <label className="form-checkbox compact">
                        <input
                          type="checkbox"
                          checked={topic.needsReview}
                          onChange={(event) =>
                            onUpdateTopicField(
                              discipline.id,
                              topic.id,
                              'needsReview',
                              event.target.checked
                            )
                          }
                        />
                        <span>Sim</span>
                      </label>
                      <div className="topic-priority-pill">
                        <span className={`priority-tag priority-${topic.priorityColor}`}>
                          {priorityLabel[topic.priorityColor]}
                        </span>
                        <small>Pontuação {topic.priorityScore}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <header className="panel-header">
          <h2>Importação e exportação</h2>
          <p>Gerencie seus dados do jeito que preferir.</p>
        </header>
        <div className="data-actions">
          <div className="data-buttons">
            <button
              type="button"
              className="primary-button"
              onClick={handleFileButtonClick}
              disabled={isPersisting}
            >
              Importar JSON
            </button>
            <button type="button" className="outline-button" onClick={onExport} disabled={isPersisting}>
              Exportar estado
            </button>
            <button type="button" className="ghost-button" onClick={onCopyTemplate} disabled={isPersisting}>
              Copiar estrutura
            </button>
          </div>
          <label className="form-field">
            <span>Ou cole seu JSON aqui</span>
            <textarea
              rows={6}
              placeholder="Cole o conteúdo do arquivo JSON"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </label>
          <div className="settings-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleImportText}
              disabled={isPersisting || importText.trim().length === 0}
            >
              Importar texto
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={handleClearText}
              disabled={isPersisting || importText.trim().length === 0}
            >
              Limpar campo
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </section>
    </div>
  );
};

const generateCalendarDays = (): CalendarDay[] => {
  const reference = new Date();
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const highlights: Record<number, CalendarDay['status']> = {
    2: 'study',
    5: 'rest',
    7: 'review',
    10: 'mixed',
    16: 'study',
    21: 'mixed',
    25: 'review',
    28: 'study'
  };

  const days: CalendarDay[] = [];
  for (let i = 0; i < offset; i += 1) {
    days.push({ type: 'pad' });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    days.push({
      type: 'day',
      dayNumber: day,
      status: highlights[day],
      description: highlights[day] ? STATUS_LABEL[highlights[day]!] : undefined
    });
  }
  while (days.length % 7 !== 0) {
    days.push({ type: 'pad' });
  }
  return days;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [studySlots, setStudySlots] = useState<StudySlot[]>(INITIAL_STUDY_SLOTS);
  const [disciplines, setDisciplines] = useState<Discipline[]>(INITIAL_DISCIPLINES);
  const [expandedDiscipline, setExpandedDiscipline] = useState<string | null>(INITIAL_DISCIPLINES[0]?.id ?? null);
  const [draggedTopic, setDraggedTopicState] = useState<DraggedTopicPayload | null>(null);
  const draggedTopicRef = useRef<DraggedTopicPayload | null>(null);
  const dropHandledRef = useRef(false);
  const [activeDropSlot, setActiveDropSlot] = useState<string | null>(null);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);
  const [isRemovalHover, setRemovalHover] = useState(false);
  const [authReady, setAuthReady] = useState(() => (typeof window === 'undefined' ? true : isAuthenticated()));
  const [isLoadingDisciplines, setLoadingDisciplines] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [completionContext, setCompletionContext] = useState<CompletionContext | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isProgressModalOpen, setProgressModalOpen] = useState(false);
  const [isStudyModalOpen, setStudyModalOpen] = useState(false);
  const [isReviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<CalendarDay | null>(null);

  const calendarDays = useMemo(() => generateCalendarDays(), []);

  const setDragPayload = (payload: DraggedTopicPayload | null) => {
    draggedTopicRef.current = payload;
    setDraggedTopicState(payload);
  };

  const ensureAuthenticated = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;
    if (isAuthenticated()) return true;
    try {
      await authenticateAnonymously();
      const authed = isAuthenticated();
      setAuthReady(authed);
      if (!authed) {
        setDragFeedback('Não foi possível autenticar com o Firebase. Verifique as credenciais.');
      }
      return authed;
    } catch (error) {
      console.error('Anonymous authentication failed:', error);
      setDragFeedback('Não foi possível autenticar com o Firebase. Verifique as credenciais.');
      return false;
    }
  };

  const persistDisciplines = async (nextDisciplines: Discipline[], successMessage?: string) => {
    if (!(await ensureAuthenticated())) {
      return;
    }
    setIsPersisting(true);
    const payload = toFirestorePayload(nextDisciplines);
    const saved = await saveGioConfigToFirestore(payload);
    setIsPersisting(false);

    if (!saved) {
      setDragFeedback('Não foi possível sincronizar com o Firestore. Tente novamente.');
    } else if (successMessage) {
      setDragFeedback(successMessage);
    }
  };

  useEffect(() => {
    if (!dragFeedback) return;
    const timeout = setTimeout(() => setDragFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [dragFeedback]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeAuth: (() => void) | undefined;

    if (typeof window !== 'undefined') {
      unsubscribeAuth = onAuthChange((user) => {
        if (!isMounted) return;
        setAuthReady(Boolean(user));
      });

      if (!isAuthenticated()) {
        void authenticateAnonymously().catch((error) => {
          console.error('Anonymous authentication failed:', error);
          if (isMounted) {
            setDragFeedback('Não foi possível autenticar com o Firebase. Verifique as credenciais.');
          }
        });
      } else {
        setAuthReady(true);
      }
    }

    const fetchDisciplines = async () => {
      setLoadingDisciplines(true);
      const remote = await loadGioConfigFromFirestore();
      if (!isMounted) return;

      if (remote && Array.isArray(remote.disciplines) && remote.disciplines.length > 0) {
        const normalized = remote.disciplines.map((discipline) => ensureDisciplineShape(discipline));
        setDisciplines(normalized);
        setExpandedDiscipline(normalized[0]?.id ?? null);
      }
      setLoadingDisciplines(false);
    };

    void fetchDisciplines();

    return () => {
      isMounted = false;
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const toggleDiscipline = (id: string) => {
    setExpandedDiscipline((current) => (current === id ? null : id));
  };

  const handleAddDiscipline = () => {
    const id = createId('discipline');
    const topics: StudyTopic[] = [];
    const newDiscipline: Discipline = {
      id,
      name: 'Nova disciplina',
      weight: 1,
      topics,
      pending: 0
    };
    setDisciplines((prev) => {
      const next = [...prev, newDiscipline];
      void persistDisciplines(next, 'Disciplina adicionada.');
      return next;
    });
    setExpandedDiscipline(id);
  };

  const handleUpdateDisciplineField = (
    disciplineId: string,
    field: 'name' | 'weight',
    value: string | number
  ) => {
    let nextName: string | null = null;
    let nextDisciplines: Discipline[] = [];
    setDisciplines((prev) => {
      const updated = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        if (field === 'name') {
          nextName = String(value);
          return { ...discipline, name: nextName };
        }
        const numeric = Math.max(1, Number.isFinite(Number(value)) ? Number(value) : 1);
        return { ...discipline, weight: numeric };
      });
      nextDisciplines = updated;
      return updated;
    });

    if (nextName !== null) {
      const updatedName = nextName;
      setStudySlots((slots) =>
        slots.map((slot) =>
          slot.assignedTopic?.disciplineId === disciplineId
            ? {
                ...slot,
                assignedTopic: {
                  ...slot.assignedTopic,
                  discipline: updatedName
                }
              }
            : slot
        )
      );
      if (draggedTopicRef.current?.disciplineId === disciplineId) {
        const updatedPayload = {
          ...draggedTopicRef.current,
          disciplineName: updatedName
        } as DraggedTopicPayload;
        draggedTopicRef.current = updatedPayload;
        setDraggedTopicState(updatedPayload);
      }
    }

    if (nextDisciplines.length) {
      void persistDisciplines(nextDisciplines);
    }
  };

  const handleAddTopic = (disciplineId: string) => {
    const topicId = createId('topic');
    const newTopic = createTopic(disciplineId, topicId, 'Novo tópico', 1, 1, false);
    setDisciplines((prev) => {
      const next = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        const updatedTopics = [...discipline.topics, newTopic];
        return {
          ...discipline,
          topics: updatedTopics,
          pending: computePendingCount(updatedTopics)
        };
      });
      void persistDisciplines(next, 'Tópico adicionado.');
      return next;
    });
    setExpandedDiscipline(disciplineId);
  };

  const handleUpdateTopicField = (
    disciplineId: string,
    topicId: string,
    field: 'name' | 'incidence' | 'difficulty' | 'needsReview',
    value: string | number | boolean
  ) => {
    let updatedInfo: { topic: StudyTopic; disciplineName: string } | null = null;

    let nextDisciplines: Discipline[] = [];

    setDisciplines((prev) => {
      const updated = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        const updatedTopics = discipline.topics.map((topic) => {
          if (topic.id !== topicId) return topic;

          let nextTopic: StudyTopic = { ...topic };

          if (field === 'name') {
            nextTopic.name = String(value);
          } else if (field === 'incidence' || field === 'difficulty') {
            let numericValue = Number(value);
            if (!Number.isFinite(numericValue)) numericValue = 1;
            numericValue = Math.min(3, Math.max(1, Math.round(numericValue)));
            if (field === 'incidence') {
              nextTopic.incidence = numericValue;
            } else {
              nextTopic.difficulty = numericValue;
            }
          } else if (field === 'needsReview') {
            nextTopic.needsReview = Boolean(value);
          }

          const { score, color } = calculatePriority(
            nextTopic.incidence,
            nextTopic.difficulty,
            nextTopic.needsReview
          );
          nextTopic = {
            ...nextTopic,
            priorityScore: score,
            priorityColor: color
          };

          updatedInfo = { topic: nextTopic, disciplineName: discipline.name };
          return nextTopic;
        });

        return {
          ...discipline,
          topics: updatedTopics,
          pending: computePendingCount(updatedTopics)
        };
      });
      nextDisciplines = updated;
      return updated;
    });

    if (updatedInfo) {
      const { topic, disciplineName } = updatedInfo;
      setStudySlots((slots) =>
        slots.map((slot) =>
          slot.assignedTopic?.topicId === topic.id
            ? {
                ...slot,
                assignedTopic: {
                  ...slot.assignedTopic,
                  title: topic.name,
                  incidence: topic.incidence,
                  difficulty: topic.difficulty,
                  needsReview: topic.needsReview,
                  priorityScore: topic.priorityScore,
                  priorityColor: topic.priorityColor,
                  discipline: disciplineName
                }
              }
            : slot
        )
      );

      if (draggedTopicRef.current?.topicId === topic.id) {
        const updatedPayload: DraggedTopicPayload = {
          ...draggedTopicRef.current,
          title: topic.name,
          incidence: topic.incidence,
          difficulty: topic.difficulty,
          needsReview: topic.needsReview,
          priorityScore: topic.priorityScore,
          priorityColor: topic.priorityColor,
          disciplineName
        };
        draggedTopicRef.current = updatedPayload;
        setDraggedTopicState(updatedPayload);
      }
    }

    if (nextDisciplines.length) {
      void persistDisciplines(nextDisciplines);
    }
  };

  const applyImportedDisciplines = (raw: unknown) => {
    try {
      const normalized = extractDisciplinesFromJson(raw);
      setDisciplines(normalized);
      setStudySlots((slots) => slots.map((slot) => ({ ...slot, assignedTopic: undefined })));
      setExpandedDiscipline(normalized[0]?.id ?? null);
      setDragPayload(null);
      setActiveDropSlot(null);
      setRemovalHover(false);
      void persistDisciplines(normalized, 'Dados importados com sucesso!');
    } catch (error) {
      console.error('Erro ao importar JSON', error);
      setDragFeedback('JSON inválido ou estrutura desconhecida.');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyImportedDisciplines(parsed);
    } catch (error) {
      console.error('Erro ao ler arquivo JSON', error);
      setDragFeedback('Não foi possível ler ou interpretar o arquivo JSON fornecido.');
    }
  };

  const handleImportJsonText = (json: string) => {
    try {
      const parsed = JSON.parse(json);
      applyImportedDisciplines(parsed);
    } catch (error) {
      console.error('Erro ao interpretar JSON manual', error);
      setDragFeedback('JSON inválido. Verifique o texto e tente novamente.');
    }
  };

  const handleExportData = () => {
    if (typeof window === 'undefined') return;
    try {
      const payload = toFirestorePayload(disciplines);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gio-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setDragFeedback('Download iniciado.');
    } catch (error) {
      console.error('Erro ao exportar JSON', error);
      setDragFeedback('Não foi possível exportar os dados.');
    }
  };

  const handleCopyTemplate = async () => {
    try {
      const payload = toFirestorePayload(disciplines);
      const json = JSON.stringify(payload, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setDragFeedback('JSON copiado para a área de transferência.');
      } else {
        console.log('Estrutura JSON:', json);
        setDragFeedback('Recurso de copiar indisponível; JSON exibido no console.');
      }
    } catch (error) {
      console.error('Erro ao copiar JSON', error);
      setDragFeedback('Não foi possível copiar o JSON.');
    }
  };

  const handleOpenCompletion = (slotId: string, topic: AssignedTopic) => {
    setCompletionContext({
      slotId,
      disciplineId: topic.disciplineId,
      topicId: topic.topicId,
      title: topic.title
    });
    setCompletionNotes('');
    setStudyModalOpen(true);
  };

  const handleCancelCompletion = () => {
    setStudyModalOpen(false);
    setCompletionContext(null);
    setCompletionNotes('');
  };

  const handleConfirmCompletion = async () => {
    if (!completionContext) return;
    const { slotId, disciplineId, topicId, title } = completionContext;
    const timestamp = new Date().toISOString();
    const notes = completionNotes.trim();

    let updatedDisciplines: Discipline[] = [];
    setDisciplines((prev) => {
      const next = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        const updatedTopics = discipline.topics.map((topic) => {
          if (topic.id !== topicId) return topic;
          const historyEntry = {
            date: timestamp,
            notes: notes || 'Estudo concluído',
            type: 'study' as const
          };
          const newTopic: StudyTopic = {
            ...topic,
            isAssigned: false,
            completionDate: timestamp,
            history: [...(topic.history ?? []), historyEntry]
          };
          return newTopic;
        });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: computePendingCount(updatedTopics)
        };
      });
      updatedDisciplines = next;
      return next;
    });

    setStudySlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, assignedTopic: undefined } : slot))
    );

    handleCancelCompletion();

    if (updatedDisciplines.length) {
      void persistDisciplines(updatedDisciplines, `${title} concluído!`);
    }
  };

  const handleTopicDragStart = (
    event: React.DragEvent<HTMLElement>,
    disciplineId: string,
    topicId: string
  ) => {
    const discipline = disciplines.find((item) => item.id === disciplineId);
    const topic = discipline?.topics.find((item) => item.id === topicId);
    if (!discipline || !topic || topic.isAssigned) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({ disciplineId, topicId }));

    dropHandledRef.current = false;
    setRemovalHover(false);
    setDragPayload({
      disciplineId,
      topicId,
      disciplineName: discipline.name,
      title: topic.name,
      incidence: topic.incidence,
      difficulty: topic.difficulty,
      needsReview: topic.needsReview,
      priorityScore: topic.priorityScore,
      priorityColor: topic.priorityColor,
      source: 'discipline'
    });
    setDragFeedback(null);
  };

  const handleSlotTopicDragStart = (
    event: React.DragEvent<HTMLElement>,
    slotId: string,
    topic: AssignedTopic
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({ slotId, topicId: topic.topicId }));
    dropHandledRef.current = false;
    setRemovalHover(false);
    setDragFeedback(null);
    setDragPayload({
      disciplineId: topic.disciplineId,
      topicId: topic.topicId,
      disciplineName: topic.discipline,
      title: topic.title,
      incidence: topic.incidence,
      difficulty: topic.difficulty,
      needsReview: topic.needsReview,
      priorityScore: topic.priorityScore,
      priorityColor: topic.priorityColor,
      source: 'slot',
      sourceSlotId: slotId
    });
    setActiveDropSlot(slotId);
  };

  const handleTopicDragEnd = (event: React.DragEvent<HTMLElement>) => {
    setActiveDropSlot(null);
    setRemovalHover(false);
    setDragPayload(null);
    dropHandledRef.current = false;
  };

  const handleDragOverSlot = (slotId: string) => {
    if (!draggedTopic) return;
    setActiveDropSlot(slotId);
  };

  const handleDragLeaveSlot = (slotId: string) => {
    setActiveDropSlot((current) => (current === slotId ? null : current));
  };

  const restoreAssignmentToDiscipline = (slotId: string, assignment: AssignedTopic, message?: string, shouldPersist = false) => {
    setStudySlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, assignedTopic: undefined } : slot))
    );

    let nextDisciplines: Discipline[] = [];
    setDisciplines((prev) => {
      const updated = prev.map((discipline) => {
        if (discipline.id !== assignment.disciplineId) {
          return discipline;
        }
        const updatedTopics = discipline.topics.map((topic) =>
          topic.id === assignment.topicId
            ? { ...topic, isAssigned: false }
            : topic
        );
        return {
          ...discipline,
          topics: updatedTopics,
          pending: computePendingCount(updatedTopics)
        };
      });
      nextDisciplines = updated;
      return updated;
    });

    if (message) {
      setDragFeedback(message);
    } else {
      setDragFeedback(null);
    }

    if (shouldPersist && nextDisciplines.length) {
      void persistDisciplines(nextDisciplines);
    }
  };

  const handleDropTopic = (slotId: string) => {
    const payload = draggedTopicRef.current;
    if (!payload) return;

    const targetSlot = studySlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;

    let updatedDisciplines: Discipline[] = [];

    if (payload.source === 'discipline') {
      if (targetSlot.assignedTopic) {
        setDragFeedback('Este slot já está preenchido. Finalize ou mova o tópico para liberar o espaço.');
        setActiveDropSlot(null);
        return;
      }

      const hasRedPriority = studySlots.some((slot) => slot.assignedTopic?.priorityColor === 'red');
      if (payload.priorityColor === 'red' && hasRedPriority) {
        setDragFeedback('Apenas um tópico do Grupo Vermelho pode ser adicionado por dia.');
        setActiveDropSlot(null);
        return;
      }

      const assignment: AssignedTopic = {
        topicId: payload.topicId,
        disciplineId: payload.disciplineId,
        title: payload.title,
        discipline: payload.disciplineName,
        incidence: payload.incidence,
        difficulty: payload.difficulty,
        needsReview: payload.needsReview,
        priorityScore: payload.priorityScore,
        priorityColor: payload.priorityColor
      };

      setStudySlots((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, assignedTopic: assignment } : slot))
      );

      setDisciplines((prev) => {
        const next = prev.map((discipline) => {
          if (discipline.id !== payload.disciplineId) {
            return discipline;
          }
          const updatedTopics = discipline.topics.map((topic) =>
            topic.id === payload.topicId ? { ...topic, isAssigned: true } : topic
          );
          return {
            ...discipline,
            topics: updatedTopics,
            pending: computePendingCount(updatedTopics)
          };
        });
        updatedDisciplines = next;
        return next;
      });

      dropHandledRef.current = true;
      setActiveDropSlot(null);
      setRemovalHover(false);
      setDragFeedback(null);
      setDragPayload(null);

      if (updatedDisciplines.length) {
        void persistDisciplines(updatedDisciplines);
      }
      return;
    }

    const sourceSlotId = payload.sourceSlotId;
    if (!sourceSlotId) return;

    const sourceSlot = studySlots.find((slot) => slot.id === sourceSlotId);
    if (!sourceSlot || !sourceSlot.assignedTopic) return;

    if (slotId === sourceSlotId) {
      dropHandledRef.current = true;
      setActiveDropSlot(null);
      setRemovalHover(false);
      setDragPayload(null);
      return;
    }

    const targetAssignment = targetSlot.assignedTopic;

    const movingAssignment: AssignedTopic = {
      topicId: payload.topicId,
      disciplineId: payload.disciplineId,
      title: payload.title,
      discipline: payload.disciplineName,
      incidence: payload.incidence,
      difficulty: payload.difficulty,
      needsReview: payload.needsReview,
      priorityScore: payload.priorityScore,
      priorityColor: payload.priorityColor
    };

    setStudySlots((prev) =>
      prev.map((slot) => {
        if (slot.id === slotId) {
          return { ...slot, assignedTopic: movingAssignment };
        }
        if (slot.id === sourceSlotId) {
          return {
            ...slot,
            assignedTopic: targetAssignment ? { ...targetAssignment } : undefined
          };
        }
        return slot;
      })
    );

    dropHandledRef.current = true;
    setActiveDropSlot(null);
    setRemovalHover(false);
    setDragFeedback(null);
    setDragPayload(null);
  };

  const handleRemovalDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (draggedTopicRef.current?.source !== 'slot') return;
    event.dataTransfer.dropEffect = 'move';
    setRemovalHover(true);
  };

  const handleRemovalDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setRemovalHover(false);
  };

  const handleRemovalDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const payload = draggedTopicRef.current;
    if (!payload || payload.source !== 'slot' || !payload.sourceSlotId) return;

    dropHandledRef.current = true;

    restoreAssignmentToDiscipline(
      payload.sourceSlotId,
      {
        topicId: payload.topicId,
        disciplineId: payload.disciplineId,
        title: payload.title,
        discipline: payload.disciplineName,
        incidence: payload.incidence,
        difficulty: payload.difficulty,
        needsReview: payload.needsReview,
        priorityScore: payload.priorityScore,
        priorityColor: payload.priorityColor
      },
      `${payload.title} removido do plano de hoje.`,
      true
    );

    setRemovalHover(false);
    setActiveDropSlot(null);
    setDragPayload(null);
  };

  const handleRemoveSlotTopic = (slotId: string) => {
    const slot = studySlots.find((item) => item.id === slotId);
    if (!slot || !slot.assignedTopic) return;

    restoreAssignmentToDiscipline(
      slotId,
      slot.assignedTopic,
      `${slot.assignedTopic.title} removido do plano de hoje.`,
      true
    );
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <ClockPanel />
        <MediaSlot />
        <FidgetCube onClick={() => setProgressModalOpen(true)} />
      </header>

      {(isLoadingDisciplines || isPersisting) && (
        <div className="sync-banner" role="status">
          {isLoadingDisciplines ? 'Carregando disciplinas...' : 'Sincronizando com o Firestore...'}
        </div>
      )}

      <nav className="tab-strip">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? 'tab-button is-active' : 'tab-button'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {activeTab === 'today' && (
          <TodayView
            disciplines={disciplines}
            studySlots={studySlots}
            expandedDiscipline={expandedDiscipline}
            draggedTopic={draggedTopic}
            activeDropSlot={activeDropSlot}
            dragFeedback={dragFeedback}
            onToggleDiscipline={toggleDiscipline}
            onTopicDragStart={handleTopicDragStart}
            onTopicDragEnd={handleTopicDragEnd}
            onOpenCompletion={handleOpenCompletion}
            onOpenDecision={() => setReviewModalOpen(true)}
            onDropTopic={handleDropTopic}
            onDragOverSlot={handleDragOverSlot}
            onDragLeaveSlot={handleDragLeaveSlot}
            onSlotTopicDragStart={handleSlotTopicDragStart}
            onSlotTopicDragEnd={handleTopicDragEnd}
            onRemoveTopic={handleRemoveSlotTopic}
            onRemovalDragEnter={handleRemovalDragEnter}
            onRemovalDragLeave={handleRemovalDragLeave}
            onRemovalDrop={handleRemovalDrop}
            isRemovalHover={isRemovalHover}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarView
            days={calendarDays}
            onSelectDay={(day) => {
              if (day.type === 'day') {
                setSelectedCalendarDay(day);
              }
            }}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            disciplines={disciplines}
            onAddDiscipline={handleAddDiscipline}
            onUpdateDisciplineField={handleUpdateDisciplineField}
            onAddTopic={handleAddTopic}
            onUpdateTopicField={handleUpdateTopicField}
            onExport={handleExportData}
            onCopyTemplate={handleCopyTemplate}
            onImportFile={handleImportFile}
            onImportJsonText={handleImportJsonText}
            isPersisting={isPersisting}
          />
        )}
      </main>

      {isProgressModalOpen && (
        <Modal
          title="Progresso geral"
          onClose={() => setProgressModalOpen(false)}
          actions={(
            <button type="button" className="primary-button" onClick={() => setProgressModalOpen(false)}>
              Fechar
            </button>
          )}
        >
          <div className="progress-summary">
            <div className="progress-highlight">74%</div>
            <p>Dos tópicos concluídos no plano geral de estudos.</p>
            <ul>
              <li>Disciplinas completas: 3</li>
              <li>Revisões em andamento: 8</li>
              <li>Tarefas atrasadas: 2</li>
            </ul>
          </div>
        </Modal>
      )}

      {isStudyModalOpen && (
        <Modal
          title="Como foi o estudo?"
          onClose={handleCancelCompletion}
          actions={(
            <>
              <button type="button" className="ghost-button" onClick={handleCancelCompletion} disabled={isPersisting}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmCompletion}
                disabled={isPersisting || !completionContext}
              >
                Salvar registro
              </button>
            </>
          )}
        >
          <p>
            {completionContext ? `Registrar estudo para ${completionContext.title}.` : 'Selecione um tópico para concluir.'}
          </p>
          <label className="form-field full-width">
            <span>Descreva o que foi estudado</span>
            <textarea
              rows={5}
              placeholder="Anote principais pontos, dificuldades e próximos passos."
              value={completionNotes}
              onChange={(event) => setCompletionNotes(event.target.value)}
            />
          </label>
        </Modal>
      )}

      {isReviewModalOpen && (
        <Modal
          title="Revisar novamente?"
          onClose={() => setReviewModalOpen(false)}
          actions={(
            <>
              <button type="button" className="ghost-button" onClick={() => setReviewModalOpen(false)}>
                Não agora
              </button>
              <button type="button" className="primary-button" onClick={() => setReviewModalOpen(false)}>
                Sim, continuar ciclo
              </button>
            </>
          )}
        >
          <p>Deseja manter este tópico no fluxo de revisões automáticas?</p>
        </Modal>
      )}

      {selectedCalendarDay && selectedCalendarDay.type === 'day' && (
        <Modal
          title={`Detalhes do dia ${selectedCalendarDay.dayNumber}`}
          onClose={() => setSelectedCalendarDay(null)}
          actions={(
            <button type="button" className="primary-button" onClick={() => setSelectedCalendarDay(null)}>
              Entendi
            </button>
          )}
        >
          {selectedCalendarDay.status ? (
            <div className="calendar-modal">
              <span className={`status-badge status-${selectedCalendarDay.status}`}>
                {STATUS_LABEL[selectedCalendarDay.status]}
              </span>
              {selectedCalendarDay.status === 'study' && (
                <ul>
                  <li>Funções Exponenciais · Concluído</li>
                  <li>Eletroquímica · Planejado</li>
                </ul>
              )}
              {selectedCalendarDay.status === 'review' && (
                <ul>
                  <li>Revisão de Citologia · 20 min</li>
                  <li>Mapa mental de História · 15 min</li>
                </ul>
              )}
              {selectedCalendarDay.status === 'mixed' && (
                <ul>
                  <li>Probabilidade Básica · Concluído</li>
                  <li>Flashcards de Literatura · Revisão</li>
                </ul>
              )}
              {selectedCalendarDay.status === 'rest' && <p>Dia reservado para descanso e ajustes.</p>}
            </div>
          ) : (
            <p>Nenhuma atividade registrada nesta data.</p>
          )}
        </Modal>
      )}
    </div>
  );
};

export default App;
