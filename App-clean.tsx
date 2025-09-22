import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  signInWithEmail,
  registerWithEmail,
  signOutUser,
  getCurrentUser,
  onAuthChange
} from './services/firebase';
import { loadGioConfigFromFirestore, saveGioConfigToFirestore, initializeFirestoreWithDefaultData } from './services/firestoreService';
import {
  Discipline,
  StudyTopic,
  StudySlot,
  ReviewItem,
  CalendarEntry,
  CalendarDay,
  DraggedTopicPayload,
  CopiedTopicPayload,
  FirestoreTopic,
  FirestoreDiscipline,
  FirestoreCalendarEntry,
  GioConfig
} from './types';
import {
  INITIAL_DISCIPLINES,
  INITIAL_STUDY_SLOTS,
  REVIEW_CADENCE,
  REVIEW_TIMES,
  createId,
  clampPriorityValue,
  calculatePriority,
  toDateOnlyString,
  addDays,
  priorityLabel,
  priorityClass,
  computePendingCount,
  createTopic,
  ensureTopicShape,
  ensureDisciplineShape,
  ensureCalendarEntryShape,
  sortCalendarEntries,
  parseDateOnly,
  formatDateOnly,
  getCalendarDayStatus,
  summarizeCalendarEvents,
  isTopicCompleted,
  getDisciplineProgress,
  getOverallProgress,
  buildReviewItems,
  serializeCalendarEntry,
  toFirestorePayload,
  extractConfigFromJson,
  STATUS_LABEL
} from './constants';
import ambientVideo from './assets/video_background.mp4';
import fallbackVideo from './assets/video_telinha.mp4';

type TabId = 'today' | 'calendar' | 'settings';
type RouteId = 'login' | 'app';

type PriorityColor = 'green' | 'yellow' | 'red';

type CompletionContext = {
  slotId: string;
  disciplineId: string;
  topicId: string;
  title: string;
};

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'calendar', label: 'Calendário' },
  { id: 'settings', label: 'Configurações' }
];

const App: React.FC = () => {
  // Estados de roteamento
  const [currentRoute, setCurrentRoute] = useState<RouteId>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Estados de autenticação
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Estados da aplicação
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
  const [dragPayload, setDragPayload] = useState<DraggedTopicPayload | null>(null);

  // Função para persistir estado da aplicação
  const persistAppState = async (newDisciplines: Discipline[], newCalendar: CalendarEntry[], message: string) => {
    if (!currentUser || isPersisting) return;

    setIsPersisting(true);
    try {
      await saveGioConfigToFirestore(currentUser.uid, toFirestorePayload(newDisciplines, newCalendar));
      setDragFeedback(message);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setAuthError('Erro ao salvar dados');
    } finally {
      setIsPersisting(false);
    }
  };

  // Função para traduzir erros de autenticação
  const translateAuthError = (error: unknown): string => {
    if (error instanceof Error) {
      if (error.message.includes('auth/user-not-found')) return 'Usuário não encontrado';
      if (error.message.includes('auth/wrong-password')) return 'Senha incorreta';
      if (error.message.includes('auth/email-already-in-use')) return 'E-mail já cadastrado';
      if (error.message.includes('auth/weak-password')) return 'Senha muito fraca';
      if (error.message.includes('auth/invalid-email')) return 'E-mail inválido';
      return error.message;
    }
    return 'Não foi possível concluir a operação. Tente novamente.';
  };

  // Handler de autenticação
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
      } else {
        user = await registerWithEmail(trimmedEmail, password);
      }
      if (user) {
        setCurrentUser(user);
        setCurrentRoute('app');
        setAuthReady(true);
        setAuthEmail(user.email ?? trimmedEmail);
        setAuthPassword('');
        setAuthError(null);
      }
    } catch (error) {
      console.error('Email auth error', error);
      setAuthError(translateAuthError(error));
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handler de logout
  const handleSignOut = async () => {
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await signOutUser();
      setCurrentUser(null);
      setCurrentRoute('login');
      setAuthReady(true);
      setDragFeedback('Sessão encerrada. Até logo!');
      // Reset dos dados
      setDisciplines(INITIAL_DISCIPLINES);
      setExpandedDiscipline(INITIAL_DISCIPLINES[0]?.id ?? null);
      setStudySlots(INITIAL_STUDY_SLOTS);
      setCalendarEntries([]);
      setCopiedTopic(null);
      setDragPayload(null);
      setCompletionContext(null);
      setCompletionNotes('');
      setActiveTab('today');
      setSelectedReview(null);
      setSelectedCalendarDay(null);
      setLoadingDisciplines(false);
      setIsPersisting(false);
    } catch (error) {
      console.error('Sign-out error', error);
      setAuthError('Não foi possível sair da conta. Tente novamente.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handler para alternar modo de autenticação
  const handleToggleAuthMode = () => {
    setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setAuthError(null);
    setAuthPassword('');
  };

  // Efeito para validar usuário inicial e controlar rotas
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
        try {
          const remote = await loadGioConfigFromFirestore(user.uid);
          console.log('📊 Firestore data loaded:', remote ? {
            hasDisciplines: Array.isArray(remote.disciplines),
            disciplinesCount: remote.disciplines?.length || 0,
            hasCalendar: Array.isArray(remote.calendar),
            calendarCount: remote.calendar?.length || 0
          } : 'null');

          if (remote && Array.isArray(remote.disciplines) && remote.disciplines.length > 0) {
            console.log('✅ User has valid data, proceeding with authentication');
            setCurrentUser(user);
            setCurrentRoute('app');
            setAuthReady(true);
            if (user.email) {
              setAuthEmail(user.email);
            }
          } else {
            console.log('❌ User found but no valid disciplines data, forcing logout');
            await signOutUser();
            setCurrentRoute('login');
            setAuthReady(true);
          }
        } catch (error) {
          console.error('❌ Error validating initial user:', error);
          await signOutUser();
          setCurrentRoute('login');
          setAuthReady(true);
        }
      } else {
        console.log('✅ No user found, staying on login route');
        setCurrentRoute('login');
        setAuthReady(true);
      }
    };

    void validateInitialUser();
  }, []);

  // Efeito para ouvir mudanças de autenticação
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const unsubscribe = onAuthChange(async (user) => {
      console.log('🔄 Auth state changed:', user ? {
        uid: user.uid,
        email: user.email,
        isAnonymous: user.isAnonymous
      } : 'null');

      setCurrentUser(user);

      if (user) {
        try {
          const remote = await loadGioConfigFromFirestore(user.uid);
          if (remote && Array.isArray(remote.disciplines) && remote.disciplines.length > 0) {
            console.log('✅ Valid user with data, redirecting to app');
            setCurrentRoute('app');
            setAuthError(null);
          } else {
            console.log('❌ User logged in but no valid data, forcing logout');
            await signOutUser();
            setCurrentRoute('login');
            setAuthError('Dados de usuário não encontrados. Faça login novamente.');
          }
        } catch (error) {
          console.error('❌ Error validating logged in user:', error);
          await signOutUser();
          setCurrentRoute('login');
          setAuthError('Erro ao validar dados do usuário.');
        }
      } else {
        console.log('✅ User logged out, redirecting to login');
        setCurrentRoute('login');
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Só carregar dados da aplicação quando estiver na rota 'app' e usuário estiver logado
  useEffect(() => {
    let isMounted = true;

    if (currentRoute !== 'app' || !currentUser) {
      console.log('🔄 Skipping data load - not on app route or no user');
      setLoadingDisciplines(false);
      return () => {
        isMounted = false;
      };
    }

    const fetch = async () => {
      console.log('📊 Loading application data for user:', currentUser.uid);
      setLoadingDisciplines(true);

      try {
        let remote = await loadGioConfigFromFirestore(currentUser.uid);
        console.log('📋 Firestore data loaded:', remote ? 'success' : 'failed');

        if (!remote) {
          console.log('📝 Initializing default data...');
          const initialized = await initializeFirestoreWithDefaultData(currentUser.uid);
          if (initialized) {
            remote = await loadGioConfigFromFirestore(currentUser.uid);
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
          console.log('❌ No valid data found, redirecting to login');
          setCurrentRoute('login');
          setAuthError('Dados não encontrados. Faça login novamente.');
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

      } catch (error) {
        console.error('❌ Error loading application data:', error);
        setCurrentRoute('login');
        setAuthError('Erro ao carregar dados da aplicação.');
        setLoadingDisciplines(false);
      }
    };

    void fetch();

    return () => {
      isMounted = false;
    };
  }, [currentRoute, currentUser]);

  // Funções básicas da aplicação
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
    setDisciplines((prev) => [...prev, newDiscipline]);
    setExpandedDiscipline(id);
  };

  const handleUpdateDisciplineField = (disciplineId: string, field: 'name' | 'weight', value: string | number) => {
    setDisciplines((prev) =>
      prev.map((discipline) =>
        discipline.id === disciplineId
          ? { ...discipline, [field]: field === 'name' ? String(value) : Number(value) }
          : discipline
      )
    );
  };

  const handleAddTopic = (disciplineId: string) => {
    const topicId = createId('topic');
    const newTopic = createTopic(disciplineId, topicId, 'Novo tópico', 1, 1, false);
    setDisciplines((prev) =>
      prev.map((discipline) =>
        discipline.id === disciplineId
          ? { ...discipline, topics: [...discipline.topics, newTopic] }
          : discipline
      )
    );
    setExpandedDiscipline(disciplineId);
  };

  const handleUpdateTopicField = (
    disciplineId: string,
    topicId: string,
    field: 'name' | 'incidence' | 'difficulty' | 'needsReview',
    value: string | number | boolean
  ) => {
    setDisciplines((prev) =>
      prev.map((discipline) =>
        discipline.id === disciplineId
          ? {
              ...discipline,
              topics: discipline.topics.map((topic) =>
                topic.id === topicId
                  ? { ...topic, [field]: field === 'name' ? String(value) : value }
                  : topic
              )
            }
          : discipline
      )
    );
  };

  const handleRemoveTopic = (disciplineId: string, topicId: string) => {
    setDisciplines((prev) =>
      prev.map((discipline) =>
        discipline.id === disciplineId
          ? {
              ...discipline,
              topics: discipline.topics.filter((topic) => topic.id !== topicId)
            }
          : discipline
      )
    );
  };

  // Funções de placeholder para evitar erros
  const handleExportData = () => console.log('Export');
  const handleCopyTemplate = () => console.log('Copy template');
  const handleImportFile = (file: File) => console.log('Import file', file);
  const handleImportJsonText = (json: string) => console.log('Import JSON', json);
  const handleTopicDragStart = (event: React.DragEvent<HTMLElement>, disciplineId: string, topicId: string) => {};
  const handleTopicDragEnd = (event: React.DragEvent<HTMLElement>) => {};
  const handleOpenCompletion = (slotId: string, topic: any) => {};
  const handleOpenReviewDecision = (review: ReviewItem) => {};
  const handleDropTopic = (slotId: string) => {};
  const handleDragOverSlot = (slotId: string) => {};
  const handleDragLeaveSlot = (slotId: string) => {};
  const handleSlotTopicDragStart = (event: React.DragEvent<HTMLElement>, slotId: string, topic: any) => {};
  const handleRemoveSlotTopic = (slotId: string) => {};
  const handleRemovalDragEnter = (event: React.DragEvent<HTMLDivElement>) => {};
  const handleRemovalDragLeave = (event: React.DragEvent<HTMLDivElement>) => {};
  const handleRemovalDrop = (event: React.DragEvent<HTMLDivElement>) => {};
  const handleCopyTopic = (disciplineId: string, topicId: string) => {};
  const handlePasteCopiedTopic = (slotId: string) => {};
  const handleClearCopiedTopic = () => {};
  const handleCancelCompletion = () => {};
  const handleConfirmCompletion = () => {};

  // Estados computados
  const reviewItems: ReviewItem[] = [];
  const calendarDays: CalendarDay[] = [];
  const overallProgress = { percentage: 0, completed: 0, total: 0, pending: 0 };
  const perDisciplineProgress = [];

  // Componente de loading
  const LoadingComponent = () => (
    <div className="auth-shell">
      <div className="auth-card auth-card--loading">
        <p>Carregando...</p>
      </div>
    </div>
  );

  // Componente de redirecionamento
  const RedirectComponent = () => (
    <div className="auth-shell">
      <div className="auth-card auth-card--loading">
        <p>Redirecionando...</p>
      </div>
    </div>
  );

  // Componente de autenticação
  const AuthView: React.FC = () => (
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
            void handleAuthSubmit();
          }}
        >
          <label className="form-field">
            <span>E-mail</span>
            <input
              type="email"
              value={authEmail}
              autoComplete="email"
              placeholder="voce@exemplo.com"
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />
          </label>

          <label className="form-field">
            <span>Senha</span>
            <input
              type="password"
              value={authPassword}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              onChange={(event) => setAuthPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>

          {authError && <p className="auth-error" role="alert">{authError}</p>}

          <button type="submit" className="primary-button" disabled={authSubmitting}>
            {authSubmitting ? 'Processando...' : authMode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <footer className="auth-footer">
          <span>{authMode === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}</span>
          <button type="button" className="ghost-button" onClick={handleToggleAuthMode} disabled={authSubmitting}>
            {authMode === 'login' ? 'Criar uma conta' : 'Fazer login'}
          </button>
        </footer>
      </div>
    </div>
  );

  // Sistema de roteamento
  if (!authReady) {
    return <LoadingComponent />;
  }

  // Rota de login
  if (currentRoute === 'login') {
    return <AuthView />;
  }

  // Rota da aplicação - só renderiza se usuário estiver logado
  if (currentRoute === 'app' && currentUser) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="header-card clock-card">
            <span className="clock-time">12:00</span>
            <span className="clock-date">Hoje</span>
          </div>
          <div className="header-card pomodoro-card">
            <h3>Foco</h3>
            <div className="pomodoro-timer">25:00</div>
          </div>
          <div className="header-card media-card">
            <video className="media-video" autoPlay loop muted playsInline>
              <source src={ambientVideo} type="video/mp4" />
              <source src={fallbackVideo} type="video/mp4" />
            </video>
          </div>
          <button type="button" className="cube-button" onClick={() => setProgressModalOpen(true)}>
            <div className="cube">
              <span className="cube-face front">G</span>
              <span className="cube-face back">O</span>
              <span className="cube-face right">I</span>
              <span className="cube-face left">O</span>
              <span className="cube-face top">+</span>
              <span className="cube-face bottom">%</span>
            </div>
            <span className="cube-caption">Progresso</span>
          </button>
        </header>

        {currentUser?.email && (
          <div className="user-bar">
            <span>{currentUser.email}</span>
            <button type="button" className="ghost-button" onClick={handleSignOut} disabled={authSubmitting || isPersisting}>
              Sair
            </button>
          </div>
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
            <div className="today-view">
              <section className="panel">
                <header className="panel-header">
                  <h2>Plano de hoje</h2>
                  <p>Arraste tópicos ou cole o que estiver copiado.</p>
                </header>
                <div className="panel-scroll-area study-slots">
                  {studySlots.map((slot) => (
                    <article key={slot.id} className="study-slot">
                      <div className="study-slot__label">{slot.label}</div>
                      <div className="study-slot__empty">
                        <span>Disponível</span>
                        <small>Arraste um tópico para cá</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <header className="panel-header">
                  <h2>Disciplinas e tópicos</h2>
                  <p>Prioridades calculadas automaticamente.</p>
                </header>
                <div className="panel-scroll-area accordion-scroll">
                  <div className="accordion">
                    {disciplines.map((discipline) => {
                      const isExpanded = expandedDiscipline === discipline.id;
                      const progress = getDisciplineProgress(discipline);
                      return (
                        <div key={discipline.id} className="accordion-item">
                          <button
                            type="button"
                            className="accordion-trigger"
                            onClick={() => toggleDiscipline(discipline.id)}
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
                              {discipline.topics.map((topic) => (
                                <article
                                  key={topic.id}
                                  className={`topic-card ${priorityClass[topic.priorityColor]}`}
                                  draggable
                                  onDragStart={(event) => handleTopicDragStart(event, discipline.id, topic.id)}
                                  onDragEnd={handleTopicDragEnd}
                                >
                                  <div className="topic-card__header">
                                    <span className="topic-focus">Pontuação {topic.priorityScore}</span>
                                    <span className="topic-priority">{priorityLabel[topic.priorityColor]}</span>
                                  </div>
                                  <div className="topic-card__badges">
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
                                    className="ghost-button copy-button"
                                    onClick={() => handleCopyTopic(discipline.id, topic.id)}
                                  >
                                    Copiar para colar
                                  </button>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="panel">
                <header className="panel-header">
                  <h2>Revisões do dia</h2>
                  <p>Geradas automaticamente pelo algoritmo.</p>
                </header>
                <div className="panel-scroll-area">
                  {reviewItems.length === 0 ? (
                    <p className="empty-hint">Nenhuma revisão pendente.</p>
                  ) : (
                    <ul className="review-list">
                      {reviewItems.map((review) => (
                        <li key={review.id} className={`review-card review-${review.status}`}>
                          <div>
                            <h3>{review.title}</h3>
                            <small>{review.scheduled}</small>
                          </div>
                          <button
                            type="button"
                            className="outline-button"
                            onClick={() => handleOpenReviewDecision(review)}
                          >
                            Marcar revisão
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="calendar-panel">
              <header className="panel-header">
                <h2>Agenda visual</h2>
                <p>Clique em um dia para visualizar detalhes.</p>
              </header>
              <div className="calendar-legend">
                <span className="legend-item legend-study">Estudo</span>
                <span className="legend-item legend-review">Revisão</span>
                <span className="legend-item legend-mixed">Estudo + Revisão</span>
                <span className="legend-item legend-rest">Descanso</span>
              </div>
              <div className="calendar-grid">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label) => (
                  <span key={label} className="calendar-label">{label}</span>
                ))}
                {calendarDays.map((day, index) => {
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
                      onClick={() => setSelectedCalendarDay(day)}
                    >
                      <span className="calendar-day__number">{day.dayNumber}</span>
                      {day.status && <span className="calendar-day__dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-grid">
              <section className="settings-card">
                <header className="panel-header">
                  <div className="settings-header">
                    <div>
                      <h2>Gerenciar disciplinas e tópicos</h2>
                      <p>Construa seu banco de estudo e deixe o sistema calcular as prioridades.</p>
                    </div>
                    <button type="button" className="primary-button" onClick={handleAddDiscipline} disabled={isPersisting}>
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
                            onChange={(event) => handleUpdateDisciplineField(discipline.id, 'name', event.target.value)}
                          />
                        </label>
                        <label className="form-field weight-field">
                          <span>Peso geral</span>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={discipline.weight}
                            onChange={(event) => handleUpdateDisciplineField(discipline.id, 'weight', Number(event.target.value))}
                          />
                        </label>
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => handleAddTopic(discipline.id)}
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
                                  handleUpdateTopicField(discipline.id, topic.id, 'name', event.target.value)
                                }
                              />
                              <select
                                value={topic.incidence}
                                onChange={(event) =>
                                  handleUpdateTopicField(
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
                                  handleUpdateTopicField(
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
                                    handleUpdateTopicField(
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
                                onClick={() => handleRemoveTopic(discipline.id, topic.id)}
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
                      onClick={() => {}}
                      disabled={isPersisting}
                    >
                      Importar JSON
                    </button>
                    <button type="button" className="outline-button" onClick={handleExportData} disabled={isPersisting}>
                      Exportar estado
                    </button>
                    <button type="button" className="ghost-button" onClick={handleCopyTemplate} disabled={isPersisting}>
                      Copiar estrutura
                    </button>
                  </div>
                  <label className="form-field">
                    <span>Ou cole seu JSON aqui</span>
                    <textarea
                      rows={6}
                      placeholder="Cole o conteúdo do arquivo JSON"
                    />
                  </label>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {}}
                      disabled={isPersisting}
                    >
                      Importar texto
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {}}
                      disabled={isPersisting}
                    >
                      Limpar campo
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>

        {isProgressModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <header className="modal-header">
                <h2>Progresso geral</h2>
                <button type="button" className="ghost-button" onClick={() => setProgressModalOpen(false)}>✕</button>
              </header>
              <div className="modal-body">
                <div className="progress-summary">
                  <div className="progress-highlight">{overallProgress.percentage}%</div>
                  <p>
                    {overallProgress.completed} de {overallProgress.total} tópicos concluídos · {overallProgress.pending} pendentes
                  </p>
                </div>
              </div>
              <footer className="modal-footer">
                <button type="button" className="primary-button" onClick={() => setProgressModalOpen(false)}>
                  Fechar
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    console.log('❌ Unexpected state, redirecting to login');
    setCurrentRoute('login');
    return <RedirectComponent />;
  }

  // Esta linha nunca será executada
  return null;
};

export default App;
