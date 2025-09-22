import { resolve } from 'path';
import { readFileSync } from 'fs';
import { initializeApp, cert, applicationDefault, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'gio_config';

const getCredentials = () => {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) {
    return JSON.parse(fromEnv) as ServiceAccount;
  }

  const explicitPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitPath) {
    const absolute = resolve(explicitPath);
    const raw = readFileSync(absolute, 'utf8');
    return JSON.parse(raw) as ServiceAccount;
  }

  const localPath = resolve(__dirname, '..', 'enem-planner-firebase-adminsdk-fbsvc-4ad0bb4a7c.json');
  try {
    const raw = readFileSync(localPath, 'utf8');
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
};

const run = async () => {
  const credentials = getCredentials();
  if (credentials) {
    initializeApp({ credential: cert(credentials) });
  } else {
    initializeApp({ credential: applicationDefault() });
  }

  const db = getFirestore();
  const snapshot = await db.collection(COLLECTION).get();
  const deletions = snapshot.docs.map(async (doc) => {
    await doc.ref.delete();
    console.log(`Deleted ${COLLECTION}/${doc.id}`);
  });

  await Promise.all(deletions);
  console.log(`Removed ${snapshot.size} document(s) from ${COLLECTION}.`);
};

run()
  .then(() => {
    console.log('Firestore reset completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to reset Firestore', error);
    process.exit(1);
  });
