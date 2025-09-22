import { signInAnonymously } from 'firebase/auth';
import { auth } from '../services/firebase';
import { saveGioConfigToFirestore, type FirestoreDiscipline, type GioConfig } from '../services/firestoreService';
import { initializeApp as initializeAdminApp, applicationDefault, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const calculatePriority = (incidence: number, difficulty: number, needsReview: boolean) => {
  const reviewWeight = needsReview ? 2 : 1;
  const score = incidence * difficulty * reviewWeight;
  if (score <= 6) return { score, color: 'green' as const };
  if (score <= 12) return { score, color: 'yellow' as const };
  return { score, color: 'red' as const };
};

const normalizeTopic = (
  disciplineId: string,
  id: string,
  name: string,
  incidence = 3,
  difficulty = 2,
  needsReview = true
) => {
  const { score, color } = calculatePriority(incidence, difficulty, needsReview);
  return {
    id,
    disciplineId,
    name,
    description: '',
    incidence,
    difficulty,
    needsReview,
    priorityScore: score,
    priorityColor: color,
    completionDate: null,
    history: [],
    isAssigned: false
  };
};

const withPending = (discipline: Omit<FirestoreDiscipline, 'pending'> & { pending?: number }): FirestoreDiscipline => ({
  ...discipline,
  pending:
    discipline.pending ??
    discipline.topics.filter((topic) => !topic.isAssigned && !topic.completionDate).length
});

const disciplines: FirestoreDiscipline[] = [
  withPending({
    id: 'geografia',
    name: 'Geografia',
    weight: 2,
    topics: [
      normalizeTopic('geografia', 'geo-1', 'Geografia Fisica – intempérismo, solo, tipos de rocha, processos geológicos brasileiros', 3, 3, true),
      normalizeTopic('geografia', 'geo-2', 'Geografia Urbana', 2, 2, true)
    ]
  }),
  withPending({
    id: 'historia',
    name: 'Historia',
    weight: 2,
    topics: [
      normalizeTopic('historia', 'hist-1', 'Revolução Francesa', 3, 2, true),
      normalizeTopic('historia', 'hist-2', 'Era Vargas', 2, 2, true),
      normalizeTopic('historia', 'hist-3', 'Fim do Antigo Regime e Escravidão', 3, 2, true)
    ]
  }),
  withPending({
    id: 'filosofia-sociologia',
    name: 'Filosofia e Sociologia',
    weight: 2,
    topics: [
      normalizeTopic('filosofia-sociologia', 'fil-1', 'Pré-socráticos e Sofistas', 2, 2, true),
      normalizeTopic('filosofia-sociologia', 'fil-2', 'Filosofia do trabalho', 2, 2, true),
      normalizeTopic('filosofia-sociologia', 'fil-3', 'Modelos econômicos e modos de trabalho', 2, 3, true),
      normalizeTopic('filosofia-sociologia', 'fil-4', 'Modelos políticos', 2, 2, true),
      normalizeTopic('filosofia-sociologia', 'fil-5', 'Direito Civil e Social', 2, 2, true),
      normalizeTopic('filosofia-sociologia', 'fil-6', 'Filosofia moderna', 2, 3, true)
    ]
  }),
  withPending({
    id: 'matematica',
    name: 'Matematica',
    weight: 3,
    topics: [
      normalizeTopic('matematica', 'mat-1', 'Matematica financeira (Aulas Ferretto)', 3, 3, true),
      normalizeTopic('matematica', 'mat-2', 'Escala e Proporção (razão e proporção, grandezas proporcionais)', 3, 2, true),
      normalizeTopic('matematica', 'mat-3', 'Análise combinatória e probabilidade', 3, 3, true),
      normalizeTopic('matematica', 'mat-4', 'Geometria espacial (esferas, cilindros, prismas, cones)', 3, 2, true),
      normalizeTopic('matematica', 'mat-5', 'Análise de gráficos – Geo. Analítica e funções', 2, 2, true),
      normalizeTopic('matematica', 'mat-6', 'Porcentagem; juros simples e compostos', 2, 2, true),
      normalizeTopic('matematica', 'mat-7', 'Médias e medianas', 2, 1, true)
    ]
  }),
  withPending({
    id: 'quimica',
    name: 'Quimica',
    weight: 3,
    topics: [
      normalizeTopic('quimica', 'qui-1', 'Eletroquímica – propriedades coligativas; oxirredução', 3, 3, true),
      normalizeTopic('quimica', 'qui-2', 'Métodos de separação – tratamento de água; misturas homogêneas e heterogêneas', 3, 2, true),
      normalizeTopic('quimica', 'qui-3', 'pH, equilíbrio iônico, hidrólise e soluções tampão', 3, 3, true),
      normalizeTopic('quimica', 'qui-4', 'Química orgânica – introdução, hidrocarbonetos, isomeria, reações', 3, 3, true),
      normalizeTopic('quimica', 'qui-5', 'Reações ácido-base e sal', 2, 2, true),
      normalizeTopic('quimica', 'qui-6', 'Forças intermoleculares e tipos de ligação', 2, 2, true)
    ]
  }),
  withPending({
    id: 'fisica',
    name: 'Fisica',
    weight: 3,
    topics: [
      normalizeTopic('fisica', 'fis-1', 'Eletrodinâmica (Módulos 21-24)', 3, 3, true),
      normalizeTopic('fisica', 'fis-2', 'Eletrostática – campo elétrico e cargas', 3, 3, true),
      normalizeTopic('fisica', 'fis-3', 'Cinemática – lançamentos oblíquos e verticais', 3, 3, true),
      normalizeTopic('fisica', 'fis-4', 'Dinâmica – força, trabalho e potência', 3, 3, true),
      normalizeTopic('fisica', 'fis-5', 'Mecânica geral', 2, 3, true),
      normalizeTopic('fisica', 'fis-6', 'Calorimetria e termologia', 2, 2, true),
      normalizeTopic('fisica', 'fis-7', 'Ondas sonoras e propriedades', 2, 2, true)
    ]
  }),
  withPending({
    id: 'biologia',
    name: 'Biologia',
    weight: 3,
    topics: [
      normalizeTopic('biologia', 'bio-1', 'Vírus e bactérias (Módulos 17A e 16A)', 3, 2, true),
      normalizeTopic('biologia', 'bio-2', 'Botânica (Módulos 17B, 18B, 19B, 20B)', 2, 2, true),
      normalizeTopic('biologia', 'bio-3', 'Ecologia (Módulos 21A-24A, 22A)', 3, 2, true),
      normalizeTopic('biologia', 'bio-4', 'Sistema nervoso (Módulo 16C)', 3, 3, true),
      normalizeTopic('biologia', 'bio-5', 'Sangue (Módulo 13C)', 2, 2, true),
      normalizeTopic('biologia', 'bio-6', 'Biotecnologia (Módulo 09A)', 2, 3, true),
      normalizeTopic('biologia', 'bio-7', 'DNA e RNA (Módulos 05A-08A)', 3, 3, true),
      normalizeTopic('biologia', 'bio-8', 'Doenças – zoonoses, bactérias e vírus (Módulo 18A)', 3, 2, true),
      normalizeTopic('biologia', 'bio-9', 'Respiração, fermentação e fotossíntese', 3, 3, true)
    ]
  }),
  withPending({
    id: 'linguagens',
    name: 'Linguagens',
    weight: 2,
    topics: [
      normalizeTopic('linguagens', 'lin-1', 'Tipos textuais – palavras-chave e afins', 2, 2, true),
      normalizeTopic('linguagens', 'lin-2', 'Gêneros textuais', 2, 2, true),
      normalizeTopic('linguagens', 'lin-3', 'Figuras de linguagem (Módulos 16C e 17C)', 2, 2, true),
      normalizeTopic('linguagens', 'lin-4', 'Expressividade lírica', 2, 2, true),
      normalizeTopic('linguagens', 'lin-5', 'Função da linguagem (Módulo 10)', 2, 1, true)
    ]
  })
];

const buildConfig = (input: FirestoreDiscipline[]): GioConfig => ({
  disciplines: input.map((discipline) => ({
    ...discipline,
    topics: discipline.topics.map((topic) => ({ ...topic })),
    pending: discipline.topics.filter((topic) => !topic.isAssigned && !topic.completionDate).length
  })),
  calendar: [],
  lastUpdated: new Date().toISOString(),
  version: '1.0.0'
});

const SEED_USER_ID = 'seed';

const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);

const runWithAdminSdk = async () => {
  console.log('Usando Firebase Admin SDK para executar o seed.');

  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountEnv) {
    const credentials: ServiceAccount = JSON.parse(serviceAccountEnv);
    initializeAdminApp({ credential: cert(credentials) });
  } else {
    initializeAdminApp({ credential: applicationDefault() });
  }

  const adminDb = getAdminFirestore();
  const docRef = adminDb.collection('gio_config').doc('disciplines');

  console.log('Limpando banco de dados do Firestore...');
  await docRef.set(buildConfig([]));

  console.log('Populando com novos dados...');
  await docRef.set(buildConfig(disciplines));
  console.log('Concluido.');
};

const runWithClientSdk = async () => {
  try {
    console.log('Executando seed com SDK cliente (auth anonima).');
    await signInAnonymously(auth);

    console.log('Limpando banco de dados do Firestore...');
    await saveGioConfigToFirestore(SEED_USER_ID, buildConfig([]));

    console.log('Populando com novos dados...');
    await saveGioConfigToFirestore(SEED_USER_ID, buildConfig(disciplines));
    console.log('Concluido.');
  } catch (error: any) {
    if (error?.code === 'auth/admin-restricted-operation') {
      console.error(
        [
          '',
          'A autenticacao anonima esta desativada para este projeto Firebase.',
          'Ative em Authentication > Sign-in method ou defina as credenciais de servico',
          'via FIREBASE_SERVICE_ACCOUNT/GOOGLE_APPLICATION_CREDENTIALS e rode novamente.'
        ].join('\n')
      );
    }
    throw error;
  }
};

const run = async () => {
  if (hasServiceAccount) {
    await runWithAdminSdk();
  } else {
    await runWithClientSdk();
  }
};

run().catch((error) => {
  console.error('Erro ao executar seed do Firestore:', error);
  process.exit(1);
});
