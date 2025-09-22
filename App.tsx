import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import ambientVideo from './assets/video_telinha.mp4';
import fallbackVideo from './assets/video_background.mp4';
import {
  loadGioConfigFromFirestore,
  saveGioConfigToFirestore,
  type FirestoreDiscipline,
  type FirestoreTopic,
  type FirestoreCalendarEntry,
  type GioConfig
} from './services/firestoreService';
import { initializeFirestoreWithDefaultData } from './services/storageService';
import {
  onAuthChange,
  registerWithEmail,
  signInWithEmail,
  signOutUser,
  getCurrentUser
} from './services/firebase';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import type {
  Discipline as DomainDiscipline,
  StudyTopic as DomainStudyTopic,
  PriorityColor as DomainPriorityColor,
  CalendarEntry as DomainCalendarEntry
} from './types';

type TabId = 'today' | 'calendar' | 'settings';

type PriorityColor = DomainPriorityColor;

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

type StudyTopic = DomainStudyTopic;

type Discipline = DomainDiscipline;

type CalendarEntry = DomainCalendarEntry;

type ReviewItem = {
  id: string;
  title: string;
  scheduled: string;
  time: string;
  status: 'due' | 'done' | 'upcoming';
  disciplineId: string;
  topicId: string;
  dueDate: string;
  sequence: number;
};

type CalendarDay = {
  type: 'day' | 'pad';
  date?: string;
  dayNumber?: number;
  status?: 'rest' | 'study' | 'review' | 'mixed';
  description?: string;
  events?: CalendarEntry[];
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

type CopiedTopicPayload = {
  disciplineId: string;
  topicId: string;
  title: string;
  disciplineName: string;
  incidence: number;
  difficulty: number;
  needsReview: boolean;
  priorityScore: number;
  priorityColor: PriorityColor;
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

const REVIEW_CADENCE = [1, 3, 7];
const REVIEW_TIMES = ['08:00', '14:00', '20:00'];

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

const toDateOnlyString = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
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
        type: entry?.type === 'review' ? 'review' as const : 'study' as const
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

const ensureCalendarEntryShape = (entry: Partial<FirestoreCalendarEntry>): CalendarEntry => {
  const fallbackTimestamp = new Date().toISOString();
  const timestamp = typeof entry.timestamp === 'string' && entry.timestamp
    ? entry.timestamp
    : entry.date
      ? new Date(`${entry.date}T00:00:00.000Z`).toISOString()
      : fallbackTimestamp;

  const normalizedDate = toDateOnlyString(timestamp) || toDateOnlyString(fallbackTimestamp);

  return {
    id: entry.id ?? createId('calendar-entry'),
    date: normalizedDate,
    timestamp,
    type: entry.type === 'review' ? 'review' : 'study',
    title: entry.title ?? 'Atividade registrada',
    disciplineId: entry.disciplineId ?? '',
    disciplineName: entry.disciplineName ?? '',
    topicId: entry.topicId ?? '',
    notes: entry.notes ?? undefined,
    reviewSequence: typeof entry.reviewSequence === 'number' ? entry.reviewSequence : undefined
  };
};

const sortCalendarEntries = (entries: CalendarEntry[]): CalendarEntry[] =>
  [...entries].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = a.timestamp.localeCompare(b.timestamp);
    if (timeCompare !== 0) return timeCompare;
    return a.id.localeCompare(b.id);
  });

const parseDateOnly = (value: string): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

const formatDateOnly = (year: number, monthIndex: number, day: number): string => {
  const paddedMonth = String(monthIndex + 1).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
};

const getCalendarDayStatus = (events: CalendarEntry[]): CalendarDay['status'] => {
  if (events.length === 0) return undefined;
  const hasStudy = events.some((event) => event.type === 'study');
  const hasReview = events.some((event) => event.type === 'review');
  if (hasStudy && hasReview) return 'mixed';
  if (hasStudy) return 'study';
  if (hasReview) return 'review';
  return undefined;
};

const summarizeCalendarEvents = (events: CalendarEntry[]): string | undefined => {
  if (events.length === 0) return undefined;
  const studyCount = events.filter((event) => event.type === 'study').length;
  const reviewCount = events.filter((event) => event.type === 'review').length;
  const parts: string[] = [];
  if (studyCount > 0) {
    parts.push(`${studyCount} ${studyCount === 1 ? 'estudo' : 'estudos'}`);
  }
  if (reviewCount > 0) {
    parts.push(`${reviewCount} ${reviewCount === 1 ? 'revisão' : 'revisões'}`);
  }
  return parts.join(' · ');
};

const isTopicCompleted = (topic: StudyTopic): boolean => Boolean(topic.completionDate);

const getDisciplineProgress = (discipline: Discipline) => {
  const total = discipline.topics.length;
  const completed = discipline.topics.reduce((acc, topic) => acc + (isTopicCompleted(topic) ? 1 : 0), 0);
  const pending = total - completed;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pending, percentage };
};

const getOverallProgress = (disciplines: Discipline[]) => {
  const aggregate = disciplines.reduce(
    (acc, discipline) => {
      const progress = getDisciplineProgress(discipline);
      return {
        total: acc.total + progress.total,
        completed: acc.completed + progress.completed,
        pending: acc.pending + progress.pending
      };
    },
    { total: 0, completed: 0, pending: 0 }
  );
  const percentage = aggregate.total === 0 ? 0 : Math.round((aggregate.completed / aggregate.total) * 100);
  return { ...aggregate, percentage };
};

const buildReviewItems = (disciplines: Discipline[], todayKey: string, cadence: number[]): ReviewItem[] => {
  const reviewItems: ReviewItem[] = [];

  disciplines.forEach((discipline) => {
    discipline.topics.forEach((topic) => {
      if (!topic.needsReview) return;
      const studyHistory = topic.history
        .filter((entry) => entry.type === 'study')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (studyHistory.length === 0) return;

      const lastStudyEntry = studyHistory[studyHistory.length - 1];
      const lastStudyDate = new Date(lastStudyEntry.date);
      if (Number.isNaN(lastStudyDate.getTime())) return;

      const reviewHistory = new Set(
        topic.history
          .filter((entry) => entry.type === 'review')
          .map((entry) => toDateOnlyString(entry.date))
      );

      for (let index = 0; index < cadence.length; index += 1) {
        const offset = cadence[index]!;
        const dueDate = addDays(lastStudyDate, offset);
        const dueKey = toDateOnlyString(dueDate);
        if (!dueKey) {
          continue;
        }

        if (reviewHistory.has(dueKey)) {
          continue;
        }

        const status: ReviewItem['status'] = dueKey <= todayKey ? 'due' : 'upcoming';
        const time = REVIEW_TIMES[index % REVIEW_TIMES.length];
        const scheduledLabel = dueKey === todayKey ? `Hoje · ${time}` : `${dueKey} · ${time}`;

        reviewItems.push({
          id: `${topic.id}-review-${offset}`,
          title: topic.name,
          scheduled: scheduledLabel,
          time,
          status,
          disciplineId: discipline.id,
          topicId: topic.id,
          dueDate: dueKey,
          sequence: index + 1
        });
        break;
      }
    });
  });

  reviewItems.sort((a, b) => {
    const dateCompare = a.dueDate.localeCompare(b.dueDate);
    if (dateCompare !== 0) return dateCompare;
    return a.sequence - b.sequence;
  });

  return reviewItems;
};

const serializeCalendarEntry = (entry: CalendarEntry): FirestoreCalendarEntry => {
  const payload: FirestoreCalendarEntry = {
    id: entry.id,
    date: entry.date,
    timestamp: entry.timestamp,
    type: entry.type,
    title: entry.title,
    disciplineId: entry.disciplineId,
    disciplineName: entry.disciplineName,
    topicId: entry.topicId
  };

  if (entry.notes && entry.notes.trim().length > 0) {
    payload.notes = entry.notes.trim();
  }
  if (typeof entry.reviewSequence === 'number') {
    payload.reviewSequence = entry.reviewSequence;
  }

  return payload;
};

const toFirestorePayload = (input: Discipline[], calendar: CalendarEntry[]): GioConfig => ({
  disciplines: input.map((discipline) => ({
    ...discipline,
    pending: computePendingCount(discipline.topics),
    topics: discipline.topics.map((topic) => ({ ...topic }))
  })),
  calendar: calendar.map((entry) => serializeCalendarEntry(entry)),
  lastUpdated: new Date().toISOString(),
  version: '1.0.0'
});

const extractConfigFromJson = (data: unknown): { disciplines: Discipline[]; calendar: CalendarEntry[] } => {
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.disciplines)
      ? (data as any).disciplines
      : null;

  if (!candidates) {
    throw new Error('Formato inválido: esperado "disciplines" ou lista de disciplinas.');
  }

  const normalizedDisciplines = (candidates as Array<Partial<FirestoreDiscipline>>).map((discipline) =>
    ensureDisciplineShape(discipline)
  );

  const calendarCandidates = Array.isArray((data as any)?.calendar) ? (data as any).calendar : [];
  const normalizedCalendar = (calendarCandidates as Array<Partial<FirestoreCalendarEntry>>).map((entry) =>
    ensureCalendarEntryShape(entry)
  );

  return {
    disciplines: normalizedDisciplines,
    calendar: sortCalendarEntries(normalizedCalendar)
  };
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

const PomodoroTimer: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutos em segundos
  const [isRunning, setIsRunning] = useState(false);
  const [isWorkSession, setIsWorkSession] = useState(true);
  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const WORK_TIME = 25 * 60; // 25 minutos
  const SHORT_BREAK = 5 * 60; // 5 minutos
  const LONG_BREAK = 15 * 60; // 15 minutos

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    if (!isRunning) {
      setIsRunning(true);
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            // Alternar entre trabalho e pausa
            if (isWorkSession) {
              setIsWorkSession(false);
              setCompletedSessions(prevSessions => prevSessions + 1);
              // Pausa longa a cada 4 sessões de trabalho
              const nextBreakTime = (completedSessions + 1) % 4 === 0 ? LONG_BREAK : SHORT_BREAK;
              return nextBreakTime;
            } else {
              setIsWorkSession(true);
              return WORK_TIME;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const pauseTimer = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsWorkSession(true);
    setTimeLeft(WORK_TIME);
    // Não resetar completedSessions para manter o histórico
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getSessionText = () => {
    if (isWorkSession) return 'Foco';
    const isLongBreak = completedSessions > 0 && completedSessions % 4 === 0;
    return isLongBreak ? 'Pausa Longa' : 'Pausa Curta';
  };

  const getProgressPercentage = () => {
    let totalTime;
    if (isWorkSession) {
      totalTime = WORK_TIME;
    } else {
      totalTime = completedSessions > 0 && completedSessions % 4 === 0 ? LONG_BREAK : SHORT_BREAK;
    }
    return ((totalTime - timeLeft) / totalTime) * 100;
  };

  return (
    <div className="header-card pomodoro-card">
      <div className="pomodoro-header">
        <h3 className="pomodoro-title">{getSessionText()}</h3>
        <span className="pomodoro-subtitle">
          {isWorkSession ? 'Tempo de estudo' : 'Tempo de descanso'}
        </span>
        {completedSessions > 0 && (
          <div className="pomodoro-sessions">
            <small>Sessões: {completedSessions}</small>
          </div>
        )}
      </div>

      <div className="pomodoro-timer">
        <div className="pomodoro-display">
          {formatTime(timeLeft)}
        </div>
        <div className="pomodoro-progress">
          <div
            className="pomodoro-progress-bar"
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      </div>

      <div className="pomodoro-controls">
        <button
          type="button"
          className="ghost-button pomodoro-button"
          onClick={isRunning ? pauseTimer : startTimer}
        >
          {isRunning ? 'Pausar' : 'Iniciar'}
        </button>
        <button
          type="button"
          className="ghost-button pomodoro-button"
          onClick={resetTimer}
        >
          Resetar
        </button>
      </div>
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
  copiedTopic: CopiedTopicPayload | null;
  onOpenCompletion: (slotId: string, topic: AssignedTopic) => void;
  onDropTopic: (slotId: string) => void;
  onDragOverSlot: (slotId: string) => void;
  onDragLeaveSlot: (slotId: string) => void;
  onSlotTopicDragStart: (event: React.DragEvent<HTMLElement>, slotId: string, topic: AssignedTopic) => void;
  onSlotTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onRemoveTopic: (slotId: string) => void;
  onPasteCopiedTopic: (slotId: string) => void;
}> = ({
  slots,
  draggedTopic,
  activeDropSlot,
  copiedTopic,
  onOpenCompletion,
  onDropTopic,
  onDragOverSlot,
  onDragLeaveSlot,
  onSlotTopicDragStart,
  onSlotTopicDragEnd,
  onRemoveTopic,
  onPasteCopiedTopic
}) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Plano de hoje</h2>
      <p>Arraste tópicos ou cole o que estiver copiado.</p>
    </header>
    <div className="panel-scroll-area study-slots">
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
                {copiedTopic && (
                  <button type="button" className="ghost-button study-slot__paste" disabled>
                    Libere o slot para colar
                  </button>
                )}
              </div>
            ) : (
              <div className="study-slot__empty">
                <span>Disponível</span>
                <small>{copiedTopic ? 'Clique no botão para colar ou arraste um tópico' : 'Arraste um tópico para cá'}</small>
                {copiedTopic && (
                  <button
                    type="button"
                    className="ghost-button study-slot__paste"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPasteCopiedTopic(slot.id);
                    }}
                  >
                    Colar {copiedTopic.title}
                  </button>
                )}
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
  copiedTopic: CopiedTopicPayload | null;
  onToggle: (id: string) => void;
  onTopicDragStart: (event: React.DragEvent<HTMLElement>, disciplineId: string, topicId: string) => void;
  onTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onCopyTopic: (disciplineId: string, topicId: string) => void;
}> = ({ disciplines, expandedId, draggedTopic, copiedTopic, onToggle, onTopicDragStart, onTopicDragEnd, onCopyTopic }) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Disciplinas e tópicos</h2>
      <p>Prioridades calculadas automaticamente.</p>
    </header>
    <div className="panel-scroll-area accordion-scroll">
      <div className="accordion">
      {disciplines.map((discipline) => {
        const isExpanded = expandedId === discipline.id;
        const progress = getDisciplineProgress(discipline);
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
                <small>
                  {progress.completed} de {progress.total} concluídos · {progress.pending} pendentes · Peso {discipline.weight}
                </small>
              </div>
              <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
              <div className="accordion-content">
                {discipline.topics.map((topic) => {
                  const isAssigned = Boolean(topic.isAssigned);
                  const isDragging = draggedTopic?.topicId === topic.id;
                  const isCopied = copiedTopic?.topicId === topic.id;
                  const classes = [
                    'topic-card',
                    priorityClass[topic.priorityColor],
                    isAssigned ? 'is-disabled' : '',
                    isDragging ? 'is-dragging' : '',
                    isCopied ? 'is-copied' : ''
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
                      <div className={topic.completionDate ? 'topic-card__badges topic-card--completed' : 'topic-card__badges'}>
                        <span className={`priority-tag priority-${topic.priorityColor}`}>
                          {priorityLabel[topic.priorityColor]}
                        </span>
                        {isTopicCompleted(topic) && <span className="topic-card__check">✓ Concluído</span>}
                      </div>
                      <h4>{topic.name}</h4>
                      <p>
                        Incidência {topic.incidence} · Dificuldade {topic.difficulty} · Revisão {topic.needsReview ? 'Sim' : 'Não'}
                      </p>
                      <button
                        type="button"
                        className={isCopied ? 'ghost-button copy-button is-active' : 'ghost-button copy-button'}
                        onClick={() => onCopyTopic(discipline.id, topic.id)}
                        disabled={isAssigned}
                      >
                        {isCopied ? 'Copiado · clique em um slot' : 'Copiar para colar'}
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
    </div>
  </section>
);

const ReviewColumn: React.FC<{ reviews: ReviewItem[]; onOpenDecision: (review: ReviewItem) => void }> = ({ reviews, onOpenDecision }) => (
  <section className="panel">
    <header className="panel-header">
      <h2>Revisões do dia</h2>
      <p>Geradas automaticamente pelo algoritmo.</p>
    </header>
    <div className="panel-scroll-area">
      {reviews.length === 0 ? (
        <p className="empty-hint">Nenhuma revisão pendente.</p>
      ) : (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id} className={`review-card review-${review.status}`}>
              <div>
                <h3>{review.title}</h3>
                <small>{review.scheduled}</small>
              </div>
              <button
                type="button"
                className="outline-button"
                onClick={() => onOpenDecision(review)}
                disabled={review.status === 'done'}
              >
                Marcar revisão
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);

const TodayView: React.FC<{
  disciplines: Discipline[];
  studySlots: StudySlot[];
  reviews: ReviewItem[];
  expandedDiscipline: string | null;
  draggedTopic: DraggedTopicPayload | null;
  activeDropSlot: string | null;
  copiedTopic: CopiedTopicPayload | null;
  dragFeedback: string | null;
  onToggleDiscipline: (id: string) => void;
  onTopicDragStart: (event: React.DragEvent<HTMLElement>, disciplineId: string, topicId: string) => void;
  onTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onOpenCompletion: (slotId: string, topic: AssignedTopic) => void;
  onOpenDecision: (review: ReviewItem) => void;
  onDropTopic: (slotId: string) => void;
  onDragOverSlot: (slotId: string) => void;
  onDragLeaveSlot: (slotId: string) => void;
  onSlotTopicDragStart: (event: React.DragEvent<HTMLElement>, slotId: string, topic: AssignedTopic) => void;
  onSlotTopicDragEnd: (event: React.DragEvent<HTMLElement>) => void;
  onRemoveTopic: (slotId: string) => void;
  onRemovalDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  onRemovalDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onRemovalDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onCopyTopic: (disciplineId: string, topicId: string) => void;
  onPasteCopiedTopic: (slotId: string) => void;
  onClearCopiedTopic: () => void;
  isRemovalHover: boolean;
}> = ({
  disciplines,
  studySlots,
  reviews,
  expandedDiscipline,
  draggedTopic,
  activeDropSlot,
  copiedTopic,
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
  onCopyTopic,
  onPasteCopiedTopic,
  onClearCopiedTopic,
  isRemovalHover
}) => (
  <div className="today-view">
    {copiedTopic && (
      <div className="clipboard-banner" role="status">
        <span>
          <strong>{copiedTopic.title}</strong> copiado de {copiedTopic.disciplineName}. Clique em um slot vazio para colar.
        </span>
        <button type="button" className="ghost-button" onClick={onClearCopiedTopic}>
          Cancelar cópia
        </button>
      </div>
    )}
    {dragFeedback && <div className="drag-feedback" role="status">{dragFeedback}</div>}
    <div className="today-grid">
      <StudySlotColumn
        slots={studySlots}
        draggedTopic={draggedTopic}
        activeDropSlot={activeDropSlot}
        copiedTopic={copiedTopic}
        onOpenCompletion={onOpenCompletion}
        onDropTopic={onDropTopic}
        onDragOverSlot={onDragOverSlot}
        onDragLeaveSlot={onDragLeaveSlot}
        onSlotTopicDragStart={onSlotTopicDragStart}
        onSlotTopicDragEnd={onSlotTopicDragEnd}
        onRemoveTopic={onRemoveTopic}
        onPasteCopiedTopic={onPasteCopiedTopic}
      />
      <DisciplineAccordion
        disciplines={disciplines}
        expandedId={expandedDiscipline}
        draggedTopic={draggedTopic}
        copiedTopic={copiedTopic}
        onToggle={onToggleDiscipline}
        onTopicDragStart={onTopicDragStart}
        onTopicDragEnd={onTopicDragEnd}
        onCopyTopic={onCopyTopic}
      />
      <ReviewColumn reviews={reviews} onOpenDecision={onOpenDecision} />
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
        const dayLabel = day.description
          ? `Dia ${day.dayNumber}: ${day.description}`
          : `Dia ${day.dayNumber}: sem registros`;
        return (
          <button
            key={`day-${day.dayNumber}`}
            type="button"
            className={statusClass}
            title={dayLabel}
            aria-label={dayLabel}
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

type AuthViewProps = {
  mode: 'login' | 'register';
  email: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onToggleMode: () => void;
};

const AuthView: React.FC<AuthViewProps> = ({
  mode,
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onToggleMode
}) => (
  <div className="auth-shell">
    <div className="auth-card">
      <header className="auth-header">
        <h1>GIO · Organizador de Estudos</h1>
        <p>Mantenha seus dados sincronizados em qualquer dispositivo.</p>
      </header>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="form-field">
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            autoComplete="email"
            placeholder="voce@exemplo.com"
            onChange={(event) => onEmailChange(event.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            onChange={(event) => onPasswordChange(event.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      <footer className="auth-footer">
        <span>{mode === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}</span>
        <button type="button" className="ghost-button" onClick={onToggleMode} disabled={isSubmitting}>
          {mode === 'login' ? 'Criar uma conta' : 'Fazer login'}
        </button>
      </footer>
    </div>
  </div>
);

const UserBar: React.FC<{ email: string; onSignOut: () => void; disabled?: boolean }> = ({ email, onSignOut, disabled }) => (
  <div className="user-bar">
    <span>{email}</span>
    <button type="button" className="ghost-button" onClick={onSignOut} disabled={disabled}>
      Sair
    </button>
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
  onRemoveTopic: (disciplineId: string, topicId: string) => void;
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
  onRemoveTopic,
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
                    <span>Ações</span>
                  </div>
                  {discipline.topics.map((topic) => (
                    <div
                      key={topic.id}
                      className={topic.completionDate ? 'topic-row topic-row--completed' : 'topic-row'}
                    >
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
                      {topic.completionDate && (
                        <div className="topic-card__check">
                          ✓ Concluído
                        </div>
                      )}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onRemoveTopic(discipline.id, topic.id)}
                        disabled={isPersisting}
                        title="Remover tópico"
                      >
                        Remover
                      </button>
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

const generateCalendarDays = (entries: CalendarEntry[], referenceKey: string): CalendarDay[] => {
  const referenceDate = parseDateOnly(referenceKey) ?? new Date();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const eventsByDay = entries.reduce((acc, entry) => {
    const parsed = parseDateOnly(entry.date);
    if (!parsed) return acc;
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month) return acc;
    const dayNumber = parsed.getDate();
    if (!acc[dayNumber]) {
      acc[dayNumber] = [];
    }
    acc[dayNumber]!.push(entry);
    return acc;
  }, {} as Record<number, CalendarEntry[]>);

  const days: CalendarDay[] = [];
  for (let i = 0; i < offset; i += 1) {
    days.push({ type: 'pad' });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dayEvents = sortCalendarEntries(eventsByDay[day] ?? []);
    const status = getCalendarDayStatus(dayEvents);
    days.push({
      type: 'day',
      dayNumber: day,
      date: formatDateOnly(year, month, day),
      status,
      description: status ? summarizeCalendarEvents(dayEvents) : undefined,
      events: dayEvents
    });
  }

  while (days.length % 7 !== 0) {
    days.push({ type: 'pad' });
  }

  return days;
};

const App: React.FC = () => {
  // Não usar getCurrentUser() diretamente - deixar a validação no useEffect
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [studySlots, setStudySlots] = useState<StudySlot[]>(INITIAL_STUDY_SLOTS);
  const [disciplines, setDisciplines] = useState<Discipline[]>(INITIAL_DISCIPLINES);
  const [expandedDiscipline, setExpandedDiscipline] = useState<string | null>(INITIAL_DISCIPLINES[0]?.id ?? null);
  const [draggedTopic, setDraggedTopicState] = useState<DraggedTopicPayload | null>(null);
  const draggedTopicRef = useRef<DraggedTopicPayload | null>(null);
  const dropHandledRef = useRef(false);
  const [activeDropSlot, setActiveDropSlot] = useState<string | null>(null);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);
  const [copiedTopic, setCopiedTopic] = useState<CopiedTopicPayload | null>(null);
  const [isRemovalHover, setRemovalHover] = useState(false);
  const [today, setToday] = useState(() => toDateOnlyString(new Date()));
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionValidationError, setSessionValidationError] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);
  const [isLoadingDisciplines, setLoadingDisciplines] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [completionContext, setCompletionContext] = useState<CompletionContext | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isProgressModalOpen, setProgressModalOpen] = useState(false);
  const [isStudyModalOpen, setStudyModalOpen] = useState(false);
  const [isReviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<CalendarDay | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);

  const calendarDays = useMemo(
    () => generateCalendarDays(calendarEntries, today),
    [calendarEntries, today]
  );
  const overallProgress = useMemo(() => getOverallProgress(disciplines), [disciplines]);
  const perDisciplineProgress = useMemo(
    () => disciplines.map((discipline) => ({ id: discipline.id, name: discipline.name, ...getDisciplineProgress(discipline) })),
    [disciplines]
  );
  const reviewItems = useMemo(
    () => buildReviewItems(disciplines, today, REVIEW_CADENCE),
    [disciplines, today]
  );

  const setDragPayload = (payload: DraggedTopicPayload | null) => {
    draggedTopicRef.current = payload;
    setDraggedTopicState(payload);
  };

  const persistAppState = async (
    nextDisciplines: Discipline[],
    nextCalendar: CalendarEntry[] = calendarEntries,
    successMessage?: string
  ) => {
    if (!currentUser) {
      const message = 'Faça login para sincronizar seu progresso.';
      setAuthError(message);
      setDragFeedback(message);
      return;
    }
    setIsPersisting(true);
    const payload = toFirestorePayload(nextDisciplines, nextCalendar);
    const saved = await saveGioConfigToFirestore(currentUser.uid, payload);
    setIsPersisting(false);

    if (!saved) {
      setDragFeedback('Não foi possível sincronizar com o Firestore. Tente novamente.');
    } else if (successMessage) {
      setDragFeedback(successMessage);
    }
  };

  const translateAuthError = (error: unknown): string => {
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/invalid-email':
          return 'E-mail inválido. Confira o endereço digitado.';
        case 'auth/email-already-in-use':
          return 'Já existe uma conta com este e-mail. Experimente fazer login.';
        case 'auth/weak-password':
          return 'A senha deve ter pelo menos 6 caracteres.';
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          return 'Credenciais inválidas. Verifique e tente novamente.';
        case 'auth/too-many-requests':
          return 'Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.';
        default:
          return 'Não foi possível concluir a operação. Tente novamente.';
      }
    }
    return 'Não foi possível concluir a operação. Tente novamente.';
  };

  const handleAuthSubmit = async () => {
    if (authSubmitting) return;
    const trimmedEmail = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    if (!trimmedEmail || password.length < 6) {
      setAuthError('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.');
      return;
    }

    setAuthSubmitting(true);
    setAuthError(null);
    try {
      let user: User | null = null;
      if (authMode === 'login') {
        user = await signInWithEmail(trimmedEmail, password);
        setDragFeedback('Login realizado com sucesso.');
      } else {
        user = await registerWithEmail(trimmedEmail, password);
        setDragFeedback('Conta criada com sucesso!');
      }
      if (user) {
        setCurrentUser(user);
        setAuthReady(true);
        setAuthEmail(user.email ?? trimmedEmail);
        setAuthPassword('');
      }
    } catch (error) {
      console.error('Email auth error', error);
      setAuthError(translateAuthError(error));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleToggleAuthMode = () => {
    setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setAuthError(null);
    setAuthPassword('');
  };

  const handleSignOut = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await signOutUser();
      setCurrentUser(null);
      setDisciplines(INITIAL_DISCIPLINES);
      setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
      setStudySlots(INITIAL_STUDY_SLOTS);
      setCalendarEntries([]);
      setCopiedTopic(null);
      setDragFeedback('Sessão encerrada. Até logo!');
    } catch (error) {
      console.error('Sign-out error', error);
      setAuthError('Não foi possível sair da conta. Tente novamente.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  useEffect(() => {
    if (!dragFeedback) return;
    const timeout = setTimeout(() => setDragFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [dragFeedback]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = toDateOnlyString(new Date());
      setToday((prev) => (prev === current ? prev : current));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Efeito para validar usuário inicial
  useEffect(() => {
    const validateInitialUser = async () => {
      console.log('🔍 Starting initial user validation...');

      if (typeof window === 'undefined') {
        console.log('🏃‍♂️ Server-side rendering, skipping validation');
        setAuthReady(true);
        return;
      }

      const user = getCurrentUser();
      console.log('👤 Current user from Firebase Auth:', user ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        isAnonymous: user.isAnonymous
      } : 'null');

      if (user) {
        console.log('✅ User found in Firebase Auth, validating Firestore data...');

        // Verificar se o usuário tem dados válidos no Firestore
        try {
          const remote = await loadGioConfigFromFirestore(user.uid);
          console.log('📊 Firestore data loaded:', remote ? {
            hasDisciplines: Array.isArray(remote.disciplines),
            disciplinesCount: remote.disciplines?.length || 0,
            hasCalendar: Array.isArray(remote.calendar),
            calendarCount: remote.calendar?.length || 0
          } : 'null');

          if (remote && Array.isArray(remote.disciplines)) {
            // Verificar se os dados são realmente válidos
            const hasValidDisciplines = remote.disciplines.length > 0;
            console.log('🔍 Data validation:', {
              hasValidDisciplines,
              disciplines: remote.disciplines.slice(0, 2) // Log apenas os 2 primeiros
            });

            if (hasValidDisciplines) {
              // Usuário válido com dados reais
              console.log('✅ User has valid data, proceeding with authentication');
              setCurrentUser(user);
              setAuthReady(true);
              if (user.email) {
                setAuthEmail(user.email);
              }
            } else {
              // Usuário existe mas não tem dados válidos - sessão inválida
              console.log('❌ User found but no valid disciplines data, forcing complete session reset');
              await signOutUser();

              // Reset completo do estado da aplicação
              setCurrentUser(null);
              setAuthEmail('');
              setAuthError(null);
              setSessionValidationError('Sessão inválida detectada. Faça login novamente.');

              // Reset dos dados da aplicação
              setDisciplines(INITIAL_DISCIPLINES);
              setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
              setStudySlots(INITIAL_STUDY_SLOTS);
              setCalendarEntries([]);
              setCopiedTopic(null);
              setDragPayload(null);
              setCompletionContext(null);
              setCompletionNotes('');

              setAuthReady(true);
            }
          } else {
            // Usuário existe mas não tem dados válidos - sessão inválida
            console.log('❌ User found but no valid Firestore data structure, forcing complete session reset');
            await signOutUser();

            // Reset completo do estado da aplicação
            setCurrentUser(null);
            setAuthEmail('');
            setAuthError(null);
            setSessionValidationError('Sessão inválida detectada. Faça login novamente.');

            // Reset dos dados da aplicação
            setDisciplines(INITIAL_DISCIPLINES);
            setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
            setStudySlots(INITIAL_STUDY_SLOTS);
            setCalendarEntries([]);
            setCopiedTopic(null);
            setDragPayload(null);
            setCompletionContext(null);
            setCompletionNotes('');

            setAuthReady(true);
          }
        } catch (error) {
          console.error('❌ Error validating initial user:', error);
          // Em caso de erro, considerar inválido
          await signOutUser();

          // Reset completo do estado da aplicação
          setCurrentUser(null);
          setAuthEmail('');
          setAuthError(null);
          setSessionValidationError('Erro ao validar sessão. Faça login novamente.');

          // Reset dos dados da aplicação
          setDisciplines(INITIAL_DISCIPLINES);
          setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
          setStudySlots(INITIAL_STUDY_SLOTS);
          setCalendarEntries([]);
          setCopiedTopic(null);
          setDragPayload(null);
          setCompletionContext(null);
          setCompletionNotes('');

          setAuthReady(true);
        }
      } else {
        // Nenhum usuário encontrado
        console.log('✅ No user found, auth ready');
        setAuthReady(true);
      }
    };

    void validateInitialUser();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const unsubscribe = onAuthChange(async (user) => {
      console.log('🔄 Auth state changed:', user ? {
        uid: user.uid,
        email: user.email,
        isAnonymous: user.isAnonymous
      } : 'null');

      setCurrentUser(user);
      if (user?.email) {
        setAuthEmail(user.email);
      }
      if (user) {
        setAuthError(null);
        // Se um usuário foi definido, mas ainda não validamos, deixar o useEffect de currentUser lidar com isso
      } else {
        // Reset dos dados quando usuário é removido
        setDisciplines(INITIAL_DISCIPLINES);
        setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
        setStudySlots(INITIAL_STUDY_SLOTS);
        setCalendarEntries([]);
        setCopiedTopic(null);
        setDragPayload(null);
        setCompletionContext(null);
        setCompletionNotes('');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!currentUser) {
      setLoadingDisciplines(false);
      return () => {
        isMounted = false;
      };
    }

    const fetch = async () => {
      setLoadingDisciplines(true);
      let remote = await loadGioConfigFromFirestore(currentUser.uid);

      // Se não conseguiu carregar dados do Firestore, pode ser uma sessão inválida
      if (!remote) {
        console.log('No Firestore data found for user, this might be an invalid session');
        // Tentar inicializar dados padrão
        const initialized = await initializeFirestoreWithDefaultData(currentUser.uid);
        if (initialized) {
          remote = await loadGioConfigFromFirestore(currentUser.uid);
        }

        // Se ainda não conseguiu carregar, considerar sessão inválida
        if (!remote && isMounted) {
          console.log('Failed to load or initialize data, session might be invalid');
          setLoadingDisciplines(false);
          return;
        }
      }

      if (!isMounted) return;

      if (remote) {
        if (Array.isArray(remote.disciplines) && remote.disciplines.length > 0) {
          const normalized = remote.disciplines.map((discipline) => ensureDisciplineShape(discipline));
          setDisciplines(normalized);
          setExpandedDiscipline(normalized[0]?.id ?? null);
        } else {
          setDisciplines(INITIAL_DISCIPLINES);
          setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
        }

        const normalizedCalendar = Array.isArray(remote.calendar)
          ? sortCalendarEntries(remote.calendar.map((entry) => ensureCalendarEntryShape(entry)))
          : [];
        setCalendarEntries(normalizedCalendar);
      } else {
        // Se chegou aqui sem dados, forçar logout
        console.log('No valid data found, forcing logout');
        await signOutUser();
        setCurrentUser(null);
        setAuthReady(true);
        setLoadingDisciplines(false);
        return;
      }

      setStudySlots(INITIAL_STUDY_SLOTS);
      setCopiedTopic(null);
      setActiveTab('today');
      setSelectedReview(null);
      setSelectedCalendarDay(null);
      setDragPayload(null);
      setCompletionContext(null);
      setCompletionNotes('');
      setLoadingDisciplines(false);
    };

    void fetch();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card--loading">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthView
        mode={authMode}
        email={authEmail}
        password={authPassword}
        error={authError}
        isSubmitting={authSubmitting}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onSubmit={handleAuthSubmit}
        onToggleMode={handleToggleAuthMode}
      />
    );
  }

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
      void persistAppState(next, calendarEntries, 'Disciplina adicionada.');
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
      void persistAppState(nextDisciplines, calendarEntries);
    }
  };

  const handleAddTopic = (disciplineId: string) => {
    const topicId = createId('topic');
    const newTopic = createTopic(disciplineId, topicId, 'Novo tópico', 1, 1, false);
    setDisciplines((prev) => {
      const next = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        const updatedTopics = [...discipline.topics, newTopic];
        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
        };
      });
      void persistAppState(next, calendarEntries, 'Tópico adicionado.');
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

        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
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
      void persistAppState(nextDisciplines, calendarEntries);
    }
  };

  const handleRemoveTopic = (disciplineId: string, topicId: string) => {
    let topicToRemove: StudyTopic | null = null;
    let disciplineName = '';

    setDisciplines((prev) => {
      const updated = prev.map((discipline) => {
        if (discipline.id !== disciplineId) return discipline;
        const updatedTopics = discipline.topics.filter((topic) => {
          if (topic.id === topicId) {
            topicToRemove = topic;
            return false;
          }
          return true;
        });

        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
        };
      });

      if (topicToRemove) {
        const discipline = prev.find(d => d.id === disciplineId);
        disciplineName = discipline?.name ?? '';
      }

      return updated;
    });

    if (topicToRemove) {
      // Remove assignments from study slots if this topic was assigned
      setStudySlots((slots) =>
        slots.map((slot) =>
          slot.assignedTopic?.topicId === topicId
            ? { ...slot, assignedTopic: undefined }
            : slot
        )
      );

      // Update dragged topic if it's the one being removed
      if (draggedTopicRef.current?.topicId === topicId) {
        setDragPayload(null);
      }

      // Update copied topic if it's the one being removed
      if (copiedTopic?.topicId === topicId) {
        setCopiedTopic(null);
      }

      // Persist changes
      setDisciplines((current) => {
        void persistAppState(current, calendarEntries, `Tópico "${topicToRemove!.name}" removido.`);
        return current;
      });
    }
  };

  const applyImportedConfiguration = (raw: unknown) => {
    try {
      const { disciplines: importedDisciplines, calendar: importedCalendar } = extractConfigFromJson(raw);
      setDisciplines(importedDisciplines);
      setCalendarEntries(sortCalendarEntries(importedCalendar));
      setStudySlots((slots) => slots.map((slot) => ({ ...slot, assignedTopic: undefined })));
      setExpandedDiscipline(importedDisciplines[0]?.id ?? null);
      setDragPayload(null);
      setActiveDropSlot(null);
      setRemovalHover(false);
      void persistAppState(importedDisciplines, importedCalendar, 'Dados importados com sucesso!');
    } catch (error) {
      console.error('Erro ao importar JSON', error);
      setDragFeedback('JSON inválido ou estrutura desconhecida.');
    }
  };

  const handleOpenReviewDecision = (review: ReviewItem) => {
    setSelectedReview(review);
    setReviewModalOpen(true);
  };

  const handleReviewDecision = (continueCycle: boolean) => {
    if (!selectedReview) {
      setReviewModalOpen(false);
      return;
    }

    let updatedDisciplines: Discipline[] = disciplines;
    let nextCalendarEntries: CalendarEntry[] = calendarEntries;

    if (continueCycle) {
      const reviewDateIso = new Date(`${selectedReview.dueDate}T00:00:00.000Z`).toISOString();
      const reviewEntry = {
        date: reviewDateIso,
        notes: `Revisão ${selectedReview.sequence}`,
        type: 'review' as const
      };

      const disciplineInfo = disciplines.find((item) => item.id === selectedReview.disciplineId);
      const reviewEvent: CalendarEntry = {
        id: createId('calendar-entry'),
        date: selectedReview.dueDate,
        timestamp: new Date().toISOString(),
        type: 'review',
        title: selectedReview.title,
        disciplineId: selectedReview.disciplineId,
        disciplineName: disciplineInfo?.name ?? '',
        topicId: selectedReview.topicId,
        notes: `Revisão ${selectedReview.sequence}`,
        reviewSequence: selectedReview.sequence
      };

      setDisciplines((prev) => {
        const next = prev.map((discipline) => {
          if (discipline.id !== selectedReview.disciplineId) return discipline;
          const updatedTopics = discipline.topics.map((topic) =>
            topic.id === selectedReview.topicId
              ? { ...topic, history: [...topic.history, reviewEntry] }
              : topic
          );
          return { ...discipline, topics: updatedTopics };
        });
        updatedDisciplines = next;
        return next;
      });

      setCalendarEntries((prev) => {
        const next = sortCalendarEntries([...prev, reviewEvent]);
        nextCalendarEntries = next;
        return next;
      });
    }

    setReviewModalOpen(false);
    setSelectedReview(null);

    if (continueCycle) {
      void persistAppState(updatedDisciplines, nextCalendarEntries, 'Revisão registrada.');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyImportedConfiguration(parsed);
    } catch (error) {
      console.error('Erro ao ler arquivo JSON', error);
      setDragFeedback('Não foi possível ler ou interpretar o arquivo JSON fornecido.');
    }
  };

  const handleImportJsonText = (json: string) => {
    try {
      const parsed = JSON.parse(json);
      applyImportedConfiguration(parsed);
    } catch (error) {
      console.error('Erro ao interpretar JSON manual', error);
      setDragFeedback('JSON inválido. Verifique o texto e tente novamente.');
    }
  };

  const handleExportData = () => {
    if (typeof window === 'undefined') return;
    try {
      const payload = toFirestorePayload(disciplines, calendarEntries);
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
      const payload = toFirestorePayload(disciplines, calendarEntries);
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
    const disciplineInfo = disciplines.find((item) => item.id === disciplineId);
    const studyEvent: CalendarEntry = {
      id: createId('calendar-entry'),
      date: toDateOnlyString(timestamp),
      timestamp,
      type: 'study',
      title,
      disciplineId,
      disciplineName: disciplineInfo?.name ?? '',
      topicId,
      notes: notes || 'Estudo concluído'
    };

    let updatedDisciplines: Discipline[] = [];
    let nextCalendarEntries: CalendarEntry[] = calendarEntries;
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
        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
        };
      });
      updatedDisciplines = next;
      return next;
    });

    setCalendarEntries((prev) => {
      const next = sortCalendarEntries([...prev, studyEvent]);
      nextCalendarEntries = next;
      return next;
    });

    setStudySlots((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, assignedTopic: undefined } : slot))
    );

    handleCancelCompletion();

    if (updatedDisciplines.length) {
      void persistAppState(updatedDisciplines, nextCalendarEntries, `${title} concluído!`);
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

  const handleCopyTopic = (disciplineId: string, topicId: string) => {
    const discipline = disciplines.find((item) => item.id === disciplineId);
    const topic = discipline?.topics.find((item) => item.id === topicId);
    if (!discipline || !topic) {
      setDragFeedback('Não foi possível copiar este tópico.');
      return;
    }
    if (topic.isAssigned) {
      setDragFeedback('Este tópico já está no plano de hoje. Remova-o antes de copiar.');
      return;
    }

    const payload: CopiedTopicPayload = {
      disciplineId,
      topicId,
      title: topic.name,
      disciplineName: discipline.name,
      incidence: topic.incidence,
      difficulty: topic.difficulty,
      needsReview: topic.needsReview,
      priorityScore: topic.priorityScore,
      priorityColor: topic.priorityColor
    };

    setCopiedTopic(payload);
    setDragFeedback(`${topic.name} copiado. Vá até os slots e clique em um vazio para colar.`);
  };

  const handleClearCopiedTopic = () => {
    setCopiedTopic(null);
    setDragFeedback('Cópia cancelada.');
  };

  const handlePasteCopiedTopic = (slotId: string) => {
    if (!copiedTopic) return;
    const slot = studySlots.find((item) => item.id === slotId);
    if (!slot) return;

    if (slot.assignedTopic) {
      setDragFeedback('Este slot já está preenchido. Libere o espaço antes de colar.');
      return;
    }

    const hasRedPriority = studySlots.some((item) => item.assignedTopic?.priorityColor === 'red');
    if (copiedTopic.priorityColor === 'red' && hasRedPriority) {
      setDragFeedback('Apenas um tópico do Grupo Vermelho pode ser adicionado por dia.');
      return;
    }

    const assignment: AssignedTopic = {
      topicId: copiedTopic.topicId,
      disciplineId: copiedTopic.disciplineId,
      title: copiedTopic.title,
      discipline: copiedTopic.disciplineName,
      incidence: copiedTopic.incidence,
      difficulty: copiedTopic.difficulty,
      needsReview: copiedTopic.needsReview,
      priorityScore: copiedTopic.priorityScore,
      priorityColor: copiedTopic.priorityColor
    };

    setStudySlots((prev) =>
      prev.map((slotItem) => (slotItem.id === slotId ? { ...slotItem, assignedTopic: assignment } : slotItem))
    );

    let updatedDisciplines: Discipline[] = [];
    setDisciplines((prev) => {
      const next = prev.map((discipline) => {
        if (discipline.id !== copiedTopic.disciplineId) {
          return discipline;
        }
        const updatedTopics = discipline.topics.map((topic) =>
          topic.id === copiedTopic.topicId ? { ...topic, isAssigned: true } : topic
        );
        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
        };
      });
      updatedDisciplines = next;
      return next;
    });

    setCopiedTopic(null);
    setDragFeedback(`${assignment.title} adicionado ao plano.`);

    if (updatedDisciplines.length) {
      void persistAppState(updatedDisciplines, calendarEntries);
    }
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
        const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
        return {
          ...discipline,
          topics: updatedTopics,
          pending: progress.pending
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
      void persistAppState(nextDisciplines, calendarEntries);
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
          const progress = getDisciplineProgress({ ...discipline, topics: updatedTopics });
          return {
            ...discipline,
            topics: updatedTopics,
            pending: progress.pending
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
      if (copiedTopic?.topicId === payload.topicId) {
        setCopiedTopic(null);
      }

      if (updatedDisciplines.length) {
        void persistAppState(updatedDisciplines, calendarEntries);
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
        <PomodoroTimer />
        <MediaSlot />
        <FidgetCube onClick={() => setProgressModalOpen(true)} />
      </header>

      {currentUser?.email && (
        <UserBar email={currentUser.email} onSignOut={handleSignOut} disabled={authSubmitting || isPersisting} />
      )}

      {(isLoadingDisciplines || isPersisting) && (
        <div className="sync-banner" role="status">
          {isLoadingDisciplines ? 'Carregando disciplinas...' : 'Sincronizando com o Firestore...'}
        </div>
      )}

      {authError && (
        <div className="auth-alert" role="alert">
          {authError}
        </div>
      )}

      {sessionValidationError && (
        <div className="auth-alert" role="alert">
          {sessionValidationError}
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSessionValidationError(null)}
            style={{ marginLeft: '1rem', fontSize: '0.8rem' }}
          >
            ✕
          </button>
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
            reviews={reviewItems}
            expandedDiscipline={expandedDiscipline}
            draggedTopic={draggedTopic}
            activeDropSlot={activeDropSlot}
            copiedTopic={copiedTopic}
            dragFeedback={dragFeedback}
            onToggleDiscipline={toggleDiscipline}
            onTopicDragStart={handleTopicDragStart}
            onTopicDragEnd={handleTopicDragEnd}
            onOpenCompletion={handleOpenCompletion}
            onOpenDecision={handleOpenReviewDecision}
            onDropTopic={handleDropTopic}
            onDragOverSlot={handleDragOverSlot}
            onDragLeaveSlot={handleDragLeaveSlot}
            onSlotTopicDragStart={handleSlotTopicDragStart}
            onSlotTopicDragEnd={handleTopicDragEnd}
            onRemoveTopic={handleRemoveSlotTopic}
            onRemovalDragEnter={handleRemovalDragEnter}
            onRemovalDragLeave={handleRemovalDragLeave}
            onRemovalDrop={handleRemovalDrop}
            onCopyTopic={handleCopyTopic}
            onPasteCopiedTopic={handlePasteCopiedTopic}
            onClearCopiedTopic={handleClearCopiedTopic}
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
            onRemoveTopic={handleRemoveTopic}
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
            <div className="progress-highlight">{overallProgress.percentage}%</div>
            <p>
              {overallProgress.completed} de {overallProgress.total} tópicos concluídos · {overallProgress.pending} pendentes
            </p>
            {perDisciplineProgress.length > 0 ? (
              <ul>
                {perDisciplineProgress.map((progress) => (
                  <li key={progress.id}>
                    {progress.name}: {progress.completed}/{progress.total} concluídos ({progress.percentage}%)
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma disciplina cadastrada ainda.</p>
            )}
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
          onClose={() => handleReviewDecision(false)}
          actions={(
            <>
              <button type="button" className="ghost-button" onClick={() => handleReviewDecision(false)}>
                Não agora
              </button>
              <button type="button" className="primary-button" onClick={() => handleReviewDecision(true)}>
                Sim, continuar ciclo
              </button>
            </>
          )}
        >
          <p>
            {selectedReview
              ? `Registrar revisão para ${selectedReview.title} (${selectedReview.scheduled}).`
              : 'Selecione uma revisão para decidir.'}
          </p>
        </Modal>
      )}

      {selectedCalendarDay && selectedCalendarDay.type === 'day' && (() => {
        const events = selectedCalendarDay.events ?? [];
        const parsed = selectedCalendarDay.date ? parseDateOnly(selectedCalendarDay.date) : null;
        const readableDate = parsed
          ? parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
          : `dia ${selectedCalendarDay.dayNumber}`;
        const statusLabel = selectedCalendarDay.status ? STATUS_LABEL[selectedCalendarDay.status] : null;

        return (
          <Modal
            title={`Detalhes de ${readableDate}`}
            onClose={() => setSelectedCalendarDay(null)}
            actions={(
              <button type="button" className="primary-button" onClick={() => setSelectedCalendarDay(null)}>
                Entendi
              </button>
            )}
          >
            <div className="calendar-modal">
              {statusLabel && (
                <span className={`status-badge status-${selectedCalendarDay.status}`}>
                  {statusLabel}
                </span>
              )}

              {events.length > 0 ? (
                <ul className="calendar-modal__list">
                  {events.map((event) => {
                    const timeLabel = new Date(event.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    const badgeClass = event.type === 'study' ? 'status-study' : 'status-review';
                    const badgeLabel = event.type === 'study' ? 'Estudo' : 'Revisão';
                    return (
                      <li key={event.id}>
                        <span className={`status-badge ${badgeClass}`}>{badgeLabel}</span>
                        <div className="calendar-modal__details">
                          <strong>{event.title}</strong>
                          <small>
                            {event.disciplineName ? `${event.disciplineName} · ${timeLabel}` : timeLabel}
                          </small>
                          {event.type === 'review' && event.reviewSequence && (
                            <small>{`Revisão ${event.reviewSequence}`}</small>
                          )}
                          {event.notes && <p>{event.notes}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>Nenhuma atividade registrada nesta data.</p>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default App;
