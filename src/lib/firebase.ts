import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

// Firebase configuration — read from env vars injected at build time by Vite with resilient fallbacks
const fallbackApiKey =
  (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ||
  'AIzaSyAoSaimP6PLvNcOuDJjzRjDc-oDUeKHIew';

const firebaseConfig = {
  apiKey: fallbackApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'meftah-misr.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'meftah-misr',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'meftah-misr.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DB || '(default)',
};

const existingApps = getApps();

const app = existingApps.some((candidate) => candidate.name === '[DEFAULT]')
  ? getApp()
  : initializeApp(firebaseConfig);

const PUBLIC_READER_APP_NAME = 'ejar-public-reader';
const publicApp = existingApps.some((candidate) => candidate.name === PUBLIC_READER_APP_NAME)
  ? getApp(PUBLIC_READER_APP_NAME)
  : initializeApp(firebaseConfig, PUBLIC_READER_APP_NAME);

/**
 * Authenticated Firestore client bound to Firebase Auth (`app`).
 * Only attach listeners or execute writes on `db` after `validateAuthenticatedSession` succeeds.
 */
export const db = getFirestore(app, (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)');

/**
 * Unauthenticated public read-only Firestore client (`publicApp` has no `getAuth` attached).
 * Isolates public map/unit/review queries and boot health probes from Token Service API issues.
 */
export const publicDb = getFirestore(publicApp, (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)');

let safeAuth: ReturnType<typeof getAuth>;
try {
  safeAuth = getAuth(app);
} catch (authErr) {
  console.warn('[Firebase Auth Init Fallback]:', authErr);
  safeAuth = {} as unknown as ReturnType<typeof getAuth>;
}

export const auth = safeAuth;
export const googleProvider = new GoogleAuthProvider();

export const PLATFORM_ADMIN_EMAIL =
  import.meta.env.VITE_PLATFORM_ADMIN_EMAIL || 'admin@meftahmisr.com';
export const PLATFORM_ADMIN_ALT_EMAIL =
  import.meta.env.VITE_PLATFORM_ADMIN_ALT_EMAIL || '12mohamed01234@gmail.com';
export const PLATFORM_ADMIN_PASSWORD =
  import.meta.env.VITE_PLATFORM_ADMIN_PASSWORD || 'MeftahMisr@2026#Owner';

export const PLATFORM_ADMIN_INFO = {
  email: PLATFORM_ADMIN_EMAIL,
  altEmail: PLATFORM_ADMIN_ALT_EMAIL,
  name: import.meta.env.VITE_PLATFORM_ADMIN_NAME || 'إدارة المنصة',
  role: 'landlord' as const,
};

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (
    normalized === PLATFORM_ADMIN_EMAIL.toLowerCase() ||
    normalized === PLATFORM_ADMIN_ALT_EMAIL.toLowerCase()
  );
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_PROJECT_NUMBER = (firebaseConfig as { messagingSenderId?: string }).messagingSenderId || firebaseConfig.projectId;
export const TOKEN_SERVICE_CONSOLE_URL = `https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=${FIREBASE_PROJECT_NUMBER}`;

export type CloudConnectionStatus =
  | 'checking'
  | 'nominal'
  | 'token_service_disabled'
  | 'offline_retrying';

export interface CloudConnectionDiag {
  status: CloudConnectionStatus;
  detail: string | null;
  checkedAtMs: number;
}

function extractErrorText(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return `${typeof code === 'string' ? code : ''} ${error.message}`.trim();
  }
  if (typeof error === 'object' && error !== null) {
    const maybeCode = (error as { code?: unknown }).code;
    const maybeMsg = (error as { message?: unknown }).message;
    return `${typeof maybeCode === 'string' ? maybeCode : ''} ${typeof maybeMsg === 'string' ? maybeMsg : String(error)
      }`.trim();
  }
  return String(error);
}

export function isTokenServiceDisabledError(error: unknown): boolean {
  const text = extractErrorText(error).toLowerCase();
  return (
    text.includes('token-service-api-has-not-been-used') ||
    text.includes('securetoken.googleapis.com') ||
    text.includes('fetching auth token failed') ||
    text.includes('identitytoolkit.googleapis.com') ||
    text.includes('api-not-activated')
  );
}

export function isTransientConnectivityError(error: unknown): boolean {
  if (isTokenServiceDisabledError(error)) return true;
  const text = extractErrorText(error).toLowerCase();
  return (
    text.includes('the client is offline') ||
    text.includes('could not reach cloud firestore backend') ||
    text.includes('unavailable') ||
    text.includes('network-request-failed')
  );
}

export async function probePublicFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(publicDb, 'platformSettings', 'config'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    // Any server-side response (including rule evaluation) confirms live backend reachability
    return !isTransientConnectivityError(error);
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(publicDb, 'platformSettings', 'config'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline') &&
      !isTokenServiceDisabledError(error)
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function validateAuthenticatedSession(
  user: User
): Promise<
  | { ok: true; expiresAtMs: number }
  | {
    ok: false;
    reason: 'expired_session_reauth_needed' | 'token_service_disabled' | 'network_or_expired';
    message: string;
  }
> {
  try {
    // Use forceRefresh = false so freshly minted 60-minute ID tokens from
    // signInWithPopup (identitytoolkit.googleapis.com) work immediately
    // without forcing an unnecessary refresh call to securetoken.googleapis.com.
    const idToken = await user.getIdToken(false);
    if (!idToken) {
      await signOut(auth).catch(() => undefined);
      return {
        ok: false,
        reason: 'expired_session_reauth_needed',
        message: 'Empty ID token',
      };
    }

    const tokenResult = await user.getIdTokenResult(false);
    const parsedExp = tokenResult?.expirationTime
      ? new Date(tokenResult.expirationTime).getTime()
      : NaN;
    const expiresAtMs = Number.isFinite(parsedExp) ? parsedExp : Date.now() + 55 * 60 * 1000;

    return { ok: true, expiresAtMs };
  } catch (error) {
    const message = extractErrorText(error);
    if (isTokenServiceDisabledError(error)) {
      // Cached session from a previous hour expired while securetoken.googleapis.com is disabled.
      // Evict only the stale cached session so clicking Sign In mints a brand-new 60m token cleanly.
      await signOut(auth).catch(() => undefined);
      return {
        ok: false,
        reason: 'expired_session_reauth_needed',
        message,
      };
    }
    return {
      ok: false,
      reason: 'network_or_expired',
      message,
    };
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const IS_PRODUCTION =
  typeof import.meta.env !== 'undefined' && import.meta.env.PROD === true;

export function logFirestoreDiagnostic(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    // Never log sensitive user identity info in production builds
    authInfo: IS_PRODUCTION
      ? {}
      : {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified,
          isAnonymous: auth.currentUser?.isAnonymous,
          tenantId: auth.currentUser?.tenantId,
          providerInfo:
            auth.currentUser?.providerData?.map((provider) => ({
              providerId: provider.providerId,
              email: provider.email,
            })) || [],
        },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = logFirestoreDiagnostic(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

export function handleSnapshotError(
  error: unknown,
  operationType: OperationType,
  path: string,
  onConnectivityIssue: (diag: CloudConnectionDiag) => void
): void {
  if (isTokenServiceDisabledError(error)) {
    // Evict expired token cleanly so publicDb keeps working and user can re-authenticate in 1 click
    void signOut(auth).catch(() => undefined);
    onConnectivityIssue({
      status: 'nominal',
      detail: null,
      checkedAtMs: Date.now(),
    });
    return;
  }

  if (isTransientConnectivityError(error)) {
    onConnectivityIssue({
      status: 'offline_retrying',
      detail: extractErrorText(error),
      checkedAtMs: Date.now(),
    });
    return;
  }

  handleFirestoreError(error, operationType, path);
}
