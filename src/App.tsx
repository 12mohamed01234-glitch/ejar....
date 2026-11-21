import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Globe,
  Map as MapIcon,
  PlusCircle,
  FileText,
  Shield,
  LogOut,
  LogIn,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Ban,
  Megaphone,
  Wallet,
  ShieldCheck,
  Sparkles,
  BadgeCheck,
} from 'lucide-react';
import {
  auth,
  CloudConnectionDiag,
  db,
  FIREBASE_PROJECT_NUMBER,
  googleProvider,
  handleSnapshotError,
  isTokenServiceDisabledError,
  logFirestoreDiagnostic,
  OperationType,
  PLATFORM_ADMIN_EMAIL,
  isPlatformAdminEmail,
  PLATFORM_ADMIN_PASSWORD,
  probePublicFirestoreConnection,
  publicDb,
  TOKEN_SERVICE_CONSOLE_URL,
  validateAuthenticatedSession,
} from './lib/firebase';
import {
  AdminActivityLogRecord,
  ApartmentRecord,
  BannedUserRecord,
  BookingDemandSignalRecord,
  BookingRecord,
  ChatThreadRecord,
  DEFAULT_PLATFORM_SETTINGS,
  FavoriteRecord,
  NotificationRecord,
  PaymentMethodType,
  PlatformSettingsRecord,
  RentalRequestRecord,
  ReviewRecord,
  SHOWCASE_APARTMENTS,
  SHOWCASE_REVIEWS,
  TenantVerificationRecord,
  TenantWalletRecord,
  WalletTransactionRecord,
  LandlordVerificationRecord,
  bookingToDemandSignalRecord,
  buildBookingDemandSignalWritePayload,
  buildFavoriteDocId,
  buildNotificationId,
  computeTextSha256,
  formatEgp,
  getCategoryCommissionPct,
  normalizeAdminActivityLogRecord,
  normalizeApartmentRecord,
  normalizeBannedUserRecord,
  normalizeBookingDemandSignalRecord,
  normalizeBookingRecord,
  normalizeChatThreadRecord,
  normalizeNotificationRecord,
  normalizePlatformSettings,
  normalizeRentalRequestRecord,
  normalizeWalletRecord,
} from './lib/validation';
import { useI18n } from './lib/i18n';
import { EjarLogo } from './components/EjarLogo';
import { EgyptMapExplorer } from './components/EgyptMapExplorer';
import { ListApartmentWizard } from './components/ListApartmentWizard';
import { ApartmentDetailModal } from './components/ApartmentDetailModal';
import { EscrowCheckoutModal } from './components/EscrowCheckoutModal';
import { MyContractsView } from './components/MyContractsView';
import { PlatformAdminConsole } from './components/PlatformAdminConsole';
import { TenantReviewModal } from './components/TenantReviewModal';
import { TenantLandlordChatModal } from './components/TenantLandlordChatModal';
import { TenantWalletModal } from './components/TenantWalletModal';
import { LandlordKycModal } from './components/LandlordKycModal';
import { AuthModal, UserAccountData } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { TenantVerificationModal, TenantVerificationData } from './components/TenantVerificationModal';
import { KycVerificationPage, KycVerificationData } from './components/KycVerificationPage';
import { PublicProfilePage, PublicProfileUser } from './components/PublicProfilePage';
import {
  supabase,
  fetchSupabaseApartments,
  autoSeedSupabaseApartments,
  fetchSupabaseBookings,
  fetchSupabaseWallet,
  recordSupabaseDeposit,
  approveSupabaseDeposit,
  lockSupabaseEscrow,
  updateSupabaseKycStatus,
  upsertSupabaseProfile,
  checkSupabaseConnection,
  SupabaseHealth,
  emptyWallet,
} from './lib/supabase';

type AppTab = 'explore' | 'list_unit' | 'my_contracts' | 'admin' | 'kyc';

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

class FirestoreErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', stack: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected error',
      stack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[FirestoreErrorBoundary caught error]:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              حدث خطأ أثناء مزامنة البيانات / Data Sync Error
            </h2>
            <p className="text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 break-all">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="text-[11px] font-mono text-slate-600 bg-slate-100 p-3 rounded-lg overflow-x-auto max-h-60 whitespace-pre-wrap">
                {this.state.stack}
              </pre>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '', stack: '' })}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                إعادة المحاولة / Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg border border-slate-300 transition-colors"
              >
                إعادة تحميل الصفحة / Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function buildShowcaseSeedPayload(
  item: ApartmentRecord,
  ownerUid: string,
  settings: PlatformSettingsRecord
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ownerId: ownerUid,
    ownerDisplayName: item.ownerDisplayName,
    category: item.category,
    billingMode: item.billingMode,
    dailyRateEgp: item.dailyRateEgp,
    monthlyRentEgp: item.monthlyRentEgp,
    studentBedsCount: item.studentBedsCount,
    studentPricePerBedEgp: item.studentPricePerBedEgp,
    title: item.title,
    description: item.description,
    governorate: item.governorate,
    district: item.district,
    lat: item.lat,
    lng: item.lng,
    bedrooms: item.bedrooms,
    bathrooms: item.bathrooms,
    areaSqm: item.areaSqm,
    furnishing: item.furnishing,
    imageKey: item.imageKey,
    verificationStatus: 'verified',
    availabilityStatus: 'available',
    commissionRatePct: getCategoryCommissionPct(item.category, settings),
    mandateAccepted: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof item.houseApartmentsCount === 'number' && item.houseApartmentsCount > 0) {
    payload.houseApartmentsCount = item.houseApartmentsCount;
  }
  if (typeof item.houseFloorsCount === 'number' && item.houseFloorsCount > 0) {
    payload.houseFloorsCount = item.houseFloorsCount;
  }
  if (typeof item.houseHasGardenOrRoof === 'boolean') {
    payload.houseHasGardenOrRoof = item.houseHasGardenOrRoof;
  }
  if (typeof item.houseHasPrivateGarage === 'boolean') {
    payload.houseHasPrivateGarage = item.houseHasPrivateGarage;
  }
  if (item.houseSpecsSummary) {
    payload.houseSpecsSummary = item.houseSpecsSummary.slice(0, 240);
  }
  if (item.baseCurrency) payload.baseCurrency = item.baseCurrency;
  if (typeof item.baseMonthlyPrice === 'number') payload.baseMonthlyPrice = item.baseMonthlyPrice;
  if (typeof item.baseDailyPrice === 'number') payload.baseDailyPrice = item.baseDailyPrice;
  if (typeof item.baseStudentBedPrice === 'number') {
    payload.baseStudentBedPrice = item.baseStudentBedPrice;
  }
  if (typeof item.hasVirtualTour === 'boolean') payload.hasVirtualTour = item.hasVirtualTour;
  if (item.panorama360Key) payload.panorama360Key = item.panorama360Key;
  if (item.virtualTourUrl) payload.virtualTourUrl = item.virtualTourUrl;

  return payload;
}

export function App() {
  const { lang, isRtl, toggleLang, t, formatNumber } = useI18n();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionTokenReady, setSessionTokenReady] = useState(false);
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState<number | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('explore');

  const [cloudDiag, setCloudDiag] = useState<CloudConnectionDiag>({
    status: 'nominal',
    detail: null,
    checkedAtMs: Date.now(),
  });
  const [diagDismissed, setDiagDismissed] = useState(false);
  const [retryingConnection, setRetryingConnection] = useState(false);
  const [copiedConsoleUrl, setCopiedConsoleUrl] = useState(false);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsRecord>(() => {
    try {
      const raw = localStorage.getItem('meftah_platform_settings') || localStorage.getItem('ejar_platform_settings');
      if (raw) return normalizePlatformSettings(JSON.parse(raw) as Record<string, unknown>);
    } catch {}
    return DEFAULT_PLATFORM_SETTINGS;
  });
  const commissionRatePct = platformSettings.commissionRatePct;

  const [verifiedDbApartments, setVerifiedDbApartments] = useState<ApartmentRecord[]>([]);
  const [myDbApartments, setMyDbApartments] = useState<ApartmentRecord[]>([]);
  const [publishedDbReviews, setPublishedDbReviews] = useState<ReviewRecord[]>([]);
  const [publicBannedUsers, setPublicBannedUsers] = useState<BannedUserRecord[]>([]);
  const [publicDemandSignals, setPublicDemandSignals] = useState<BookingDemandSignalRecord[]>([]);

  const [myTenantBookings, setMyTenantBookings] = useState<BookingRecord[]>([]);
  const [myLandlordBookings, setMyLandlordBookings] = useState<BookingRecord[]>([]);
  const [myTenantRequests, setMyTenantRequests] = useState<RentalRequestRecord[]>([]);
  const [myLandlordRequests, setMyLandlordRequests] = useState<RentalRequestRecord[]>([]);
  const [myNotifications, setMyNotifications] = useState<NotificationRecord[]>([]);
  const [myFavorites, setMyFavorites] = useState<FavoriteRecord[]>([]);
  const [myTenantVerification, setMyTenantVerification] =
    useState<TenantVerificationRecord | null>(null);
  const [myBanRecord, setMyBanRecord] = useState<BannedUserRecord | null>(null);
  const [myTenantChatThreads, setMyTenantChatThreads] = useState<ChatThreadRecord[]>([]);
  const [myLandlordChatThreads, setMyLandlordChatThreads] = useState<ChatThreadRecord[]>([]);

  const [allAdminApartments, setAllAdminApartments] = useState<ApartmentRecord[]>([]);
  const [allAdminBookings, setAllAdminBookings] = useState<BookingRecord[]>([]);
  const [allAdminRentalRequests, setAllAdminRentalRequests] = useState<RentalRequestRecord[]>([]);
  const [allAdminReviews, setAllAdminReviews] = useState<ReviewRecord[]>([]);
  const [allAdminTenantVerifications, setAllAdminTenantVerifications] = useState<
    TenantVerificationRecord[]
  >([]);
  const [allAdminBannedUsers, setAllAdminBannedUsers] = useState<BannedUserRecord[]>([]);
  const [allAdminActivityLogs, setAllAdminActivityLogs] = useState<AdminActivityLogRecord[]>([]);
  const [allAdminChatThreads, setAllAdminChatThreads] = useState<ChatThreadRecord[]>([]);

  const [rentedDeletedIds, setRentedDeletedIds] = useState<Set<string>>(new Set());
  const [togglingFavoriteId, setTogglingFavoriteId] = useState<string | null>(null);

  const [selectedApartment, setSelectedApartment] = useState<ApartmentRecord | null>(null);
  const [checkoutApartment, setCheckoutApartment] = useState<ApartmentRecord | null>(null);
  const [activeCheckoutRequest, setActiveCheckoutRequest] =
    useState<RentalRequestRecord | null>(null);
  const [reviewModalBooking, setReviewModalBooking] = useState<BookingRecord | null>(null);
  const [chatModalTarget, setChatModalTarget] = useState<{
    apartment: ApartmentRecord | null;
    thread: ChatThreadRecord | null;
  } | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const [supabaseNotice, setSupabaseNotice] = useState<string | null>(null);
  const [supabaseLive, setSupabaseLive] = useState(false);
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState<number>(() => Date.now());

  const adminAutoSeedRef = useRef(false);
  const backfilledSignalIdsRef = useRef<Set<string>>(new Set());
  const alertedPriceKeysRef = useRef<Set<string>>(new Set());

  const [userAccountData, setUserAccountData] = useState<UserAccountData | null>(null);

  const isAdmin = Boolean(
    (currentUser?.email && isPlatformAdminEmail(currentUser.email)) ||
    (userAccountData?.email && isPlatformAdminEmail(userAccountData.email))
  );

  const effectiveUser = useMemo(() => {
    if (currentUser) return currentUser;
    if (userAccountData) {
      return {
        uid: userAccountData.uid,
        email: userAccountData.email,
        displayName: userAccountData.displayName,
        phoneNumber: userAccountData.phone,
        photoURL: userAccountData.photoUrl || null,
      } as unknown as User;
    }
    return null;
  }, [currentUser, userAccountData]);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isLandlordKycModalOpen, setIsLandlordKycModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isTenantVerificationModalOpen, setIsTenantVerificationModalOpen] = useState(false);

  const [myTenantVerificationData, setMyTenantVerificationData] = useState<TenantVerificationData | null>(null);

  const [myKycData, setMyKycData] = useState<KycVerificationData | null>(null);

  const [selectedProfileUser, setSelectedProfileUser] = useState<PublicProfileUser | UserAccountData | null>(null);

  const [myLandlordVerification, setMyLandlordVerification] =
    useState<LandlordVerificationRecord | null>(null);

  const [wallet, setWallet] = useState<TenantWalletRecord>(() => emptyWallet('current_user'));

  // Automatically reset to explore if user is not admin and activeTab is admin
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('explore');
    }
  }, [activeTab, isAdmin]);

  // Compute profile completion percentage dynamically (Anti-fake ID, Phone OTP, Liveness, Info)
  const profileCompletionPct = useMemo(() => {
    let count = 0;
    const name = userAccountData?.displayName || currentUser?.displayName || '';
    if (name.trim().length >= 3) count += 1;
    const isPhone = Boolean(myLandlordVerification);
    if (isPhone) count += 1;
    const isId =
      Boolean(myLandlordVerification) ||
      Boolean(myTenantVerificationData) ||
      Boolean(myKycData?.status === 'approved') ||
      Boolean(userAccountData?.isLandlordVerified) ||
      Boolean(userAccountData?.isTenantVerified);
    if (isId) count += 1;
    const isLiveness =
      Boolean(myLandlordVerification?.facialMatchScore) ||
      Boolean(myKycData?.facialMatchScore);
    if (isLiveness) count += 1;
    return count * 25;
  }, [userAccountData, currentUser, myLandlordVerification, myTenantVerificationData, myKycData, isProfileModalOpen]);

  // Blue badge verified status: Official approval by admin, DB verification, or KYC approved
  const isBlueVerified = useMemo(() => {
    return Boolean(
      myKycData?.status === 'approved' ||
      myTenantVerification?.verificationStatus === 'verified' ||
      userAccountData?.isTenantVerified ||
      userAccountData?.isLandlordVerified ||
      myLandlordVerification?.status === 'verified'
    );
  }, [myKycData, myTenantVerification, userAccountData, myLandlordVerification]);

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 5000);
  }, []);

  const handleWalletDeposit = useCallback(
    async (
      amountEgp: number,
      method: PaymentMethodType,
      reference: string,
      receiptScreenshotUrl?: string
    ) => {
      if (!isBlueVerified) {
        showToast(
          t(
            'عفواً، لا يمكنك شحن المحفظة إلا بعد توثيق حسابك بالعلامة الزرقاء.',
            'You must be verified with the Blue Badge to deposit or top up your wallet.'
          )
        );
        setIsProfileModalOpen(false);
        setIsWalletModalOpen(false);
        setActiveTab('kyc');
        return;
      }
      const activeUid = userAccountData?.uid || currentUser?.uid;
      if (!activeUid) {
        showToast('سجّل الدخول أولاً حتى يُحفظ الإيداع في Supabase');
        return;
      }
      try {
        await recordSupabaseDeposit(activeUid, amountEgp, method, reference, receiptScreenshotUrl);
        setWallet(await fetchSupabaseWallet(activeUid));
        if (receiptScreenshotUrl) {
          showToast(
            `تم حفظ إيصال التحويل في Supabase. سيُضاف مبلغ ${formatEgp(amountEgp)} بعد الاعتماد.`
          );
        } else {
          showToast(`تم إيداع ${formatEgp(amountEgp)} في محفظتك على Supabase`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'تعذر حفظ الإيداع في Supabase');
      }
    },
    [showToast, currentUser?.uid, userAccountData?.uid, isBlueVerified, t]
  );

  const handleApproveDeposit = useCallback(
    async (txId: string) => {
      const activeUid = userAccountData?.uid || currentUser?.uid;
      const target = wallet.transactions.find((t) => t.id === txId);
      if (!activeUid || !target || target.status === 'confirmed') return;
      try {
        await approveSupabaseDeposit(txId, activeUid, target.amountEgp);
        setWallet(await fetchSupabaseWallet(activeUid));
        showToast('تم اعتماد الإيصال وإضافة المبلغ إلى الرصيد في Supabase');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'تعذر اعتماد الإيداع في Supabase');
      }
    },
    [showToast, wallet.transactions, currentUser?.uid, userAccountData?.uid]
  );

  const handleWalletDeduct = useCallback(
    async (amountEgp: number, apartmentId: string, apartmentTitle: string) => {
      const activeUid = userAccountData?.uid || currentUser?.uid;
      if (!activeUid) {
        throw new Error('سجّل الدخول أولاً لخصم وديعة الضمان من المحفظة');
      }
      await lockSupabaseEscrow(activeUid, amountEgp, apartmentId, apartmentTitle);
      setWallet(await fetchSupabaseWallet(activeUid));
    },
    [currentUser?.uid, userAccountData?.uid]
  );

  const handleCompleteLandlordKyc = useCallback(
    async (record: LandlordVerificationRecord) => {
      setMyLandlordVerification(record);
      if (currentUser && sessionTokenReady) {
        try {
          await setDoc(doc(db, 'landlordVerifications', currentUser.uid), {
            ...record,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          logFirestoreDiagnostic(err, OperationType.WRITE, `landlordVerifications/${currentUser.uid}`);
        }
      }
      showToast('تهانينا! تم اعتماد توثيق هويتك وسند الملكية ومنح الشارة الموثقة');
    },
    [currentUser, sessionTokenReady, showToast]
  );

  const handleTriggerAccountBan = useCallback(
    async (targetUid: string, reason: string, evidence: string) => {
      const nowMs = Date.now();
      const banRecord: BannedUserRecord = {
        userId: targetUid,
        displayName: currentUser?.displayName || 'مستخدم مخالف',
        reason,
        hideListings: true,
        bannedByUid: currentUser?.uid || 'system',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      setMyBanRecord(banRecord);
      showToast(`تم تجميد الحساب لمخالفة سياسة المنصة: ${reason}`);
      if (currentUser && sessionTokenReady) {
        try {
          await setDoc(doc(db, 'bannedUsers', targetUid), {
            ...banRecord,
            evidence,
            bannedAt: serverTimestamp(),
          });
        } catch (err) {
          logFirestoreDiagnostic(err, OperationType.WRITE, `bannedUsers/${targetUid}`);
        }
      }
    },
    [currentUser, sessionTokenReady, showToast]
  );

  const reportConnectivityIssue = useCallback((diag: CloudConnectionDiag) => {
    setCloudDiag(diag);
    setDiagDismissed(false);
  }, []);

  // Ensure iframe window acquires physical keyboard focus when tapping/clicking any form input
  useEffect(() => {
    const ensureFrameKeyboardFocus = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        try {
          window.focus();
        } catch {
          // Ignore cross-origin frame focus restrictions
        }
      }
    };
    document.addEventListener('pointerdown', ensureFrameKeyboardFocus, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', ensureFrameKeyboardFocus);
    };
  }, []);

  // Authenticated Session Guard: validate token health before exposing user to Firestore `db`
  useEffect(() => {
    let active = true;
    let validationSeq = 0;

    const unsub = onAuthStateChanged(auth, (user) => {
      const seq = ++validationSeq;

      if (!user) {
        if (!active) return;
        setCurrentUser(null);
        setSessionTokenReady(false);
        setSessionExpiresAtMs(null);
        setAuthReady(true);
        return;
      }

      void validateAuthenticatedSession(user).then((res) => {
        if (!active || seq !== validationSeq) return;
        if (res.ok) {
          setCurrentUser(user);
          setSessionTokenReady(true);
          setSessionExpiresAtMs(res.expiresAtMs);
          setCloudDiag({
            status: 'nominal',
            detail: null,
            checkedAtMs: Date.now(),
          });
          setAuthReady(true);
        } else if (res.reason === 'expired_session_reauth_needed') {
          // Stale >60m session was evicted cleanly; fresh signInWithPopup works immediately
          setCurrentUser(null);
          setSessionTokenReady(false);
          setSessionExpiresAtMs(null);
          setCloudDiag({
            status: 'nominal',
            detail: null,
            checkedAtMs: Date.now(),
          });
          setAuthReady(true);
        } else {
          setCurrentUser(null);
          setSessionTokenReady(false);
          setSessionExpiresAtMs(null);
          setAuthReady(true);
          setDiagDismissed(false);
          setCloudDiag({
            status:
              res.reason === 'token_service_disabled'
                ? 'token_service_disabled'
                : 'offline_retrying',
            detail: res.message,
            checkedAtMs: Date.now(),
          });
        }
      });
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Graceful Session Renewal Guard: renew before 60-minute JWT expiry or cleanly prompt 1-click re-auth
  useEffect(() => {
    if (!currentUser || !sessionTokenReady || !sessionExpiresAtMs) return;

    const msUntilRenewal = Math.max(5_000, sessionExpiresAtMs - Date.now() - 60_000);
    const timer = window.setTimeout(async () => {
      try {
        await currentUser.getIdToken(true);
        const refreshed = await currentUser.getIdTokenResult(false);
        const nextExp = refreshed?.expirationTime
          ? new Date(refreshed.expirationTime).getTime()
          : Date.now() + 55 * 60 * 1000;
        setSessionExpiresAtMs(nextExp);
      } catch {
        // Token Service API cannot silently refresh; cleanly detach before expiry so Firestore never errors
        setSessionTokenReady(false);
        setCurrentUser(null);
        setSessionExpiresAtMs(null);
        await signOut(auth).catch(() => undefined);
        showToast(
          t(
            'انتهت مدة الجلسة الآمنة (60 دقيقة) — اضغط «تسجيل الدخول» لتجديد الجلسة بنقرة واحدة',
            'Your 60-minute secure session ended — click Sign In to renew immediately'
          )
        );
      }
    }, msUntilRenewal);

    return () => window.clearTimeout(timer);
  }, [currentUser, sessionTokenReady, sessionExpiresAtMs, showToast, t]);

  // Global Platform Settings Listener (Isolated on Unauthenticated `publicDb`)
  useEffect(() => {
    const configRef = doc(publicDb, 'platformSettings', 'config');
    const unsub = onSnapshot(
      configRef,
      (snap) => {
        setPlatformSettings(
          snap.exists()
            ? normalizePlatformSettings(snap.data() as Record<string, unknown>)
            : DEFAULT_PLATFORM_SETTINGS
        );
        setCloudDiag((prev) =>
          prev.status === 'offline_retrying'
            ? { status: 'nominal', detail: null, checkedAtMs: Date.now() }
            : prev
        );
      },
      (err) => {
        handleSnapshotError(
          err,
          OperationType.GET,
          'platformSettings/config',
          reportConnectivityIssue
        );
      }
    );
    return () => unsub();
  }, [reportConnectivityIssue]);

  // Live Sync for Platform Admin Settings & Listing Modifications
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<PlatformSettingsRecord>;
      if (customEvent.detail) {
        setPlatformSettings(
          normalizePlatformSettings(customEvent.detail as unknown as Record<string, unknown>)
        );
      }
    };

    const handleApartmentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; deleted?: boolean; [key: string]: unknown }>;
      if (customEvent.detail) {
        const { id, deleted, ...patch } = customEvent.detail;
        if (deleted) {
          setAllAdminApartments((prev) => prev.filter((a) => a.id !== id));
          setVerifiedDbApartments((prev) => prev.filter((a) => a.id !== id));
        } else {
          setAllAdminApartments((prev) =>
            prev.map((a) => (a.id === id ? ({ ...a, ...patch } as ApartmentRecord) : a))
          );
          setVerifiedDbApartments((prev) =>
            prev.map((a) => (a.id === id ? ({ ...a, ...patch } as ApartmentRecord) : a))
          );
        }
      }
    };

    window.addEventListener('meftah_settings_update', handleSettingsUpdate);
    window.addEventListener('apartment_updated', handleApartmentUpdate);
    return () => {
      window.removeEventListener('meftah_settings_update', handleSettingsUpdate);
      window.removeEventListener('apartment_updated', handleApartmentUpdate);
    };
  }, []);

  // Public Verified Apartments, Published Reviews & Active Ban Filters (Isolated on `publicDb`)
  useEffect(() => {
    const aptsQuery = query(
      collection(publicDb, 'apartments'),
      where('verificationStatus', '==', 'verified')
    );
    const unsubApts = onSnapshot(
      aptsQuery,
      (snap) => {
        if (snap.docs.length > 0) {
          const list = snap.docs.map((d) =>
            normalizeApartmentRecord(d.data() as Record<string, unknown>, d.id, true)
          );
          setVerifiedDbApartments(list);
        }
      },
      (err) => {
        handleSnapshotError(err, OperationType.LIST, 'apartments', reportConnectivityIssue);
      }
    );

    const revsQuery = query(
      collection(publicDb, 'reviews'),
      where('visibilityStatus', '==', 'published')
    );
    const unsubRevs = onSnapshot(
      revsQuery,
      (snap) => {
        const list: ReviewRecord[] = snap.docs.map((d) => {
          const raw = d.data();
          const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            bookingId: String(raw.bookingId || d.id),
            apartmentId: String(raw.apartmentId || ''),
            apartmentTitle: String(raw.apartmentTitle || ''),
            governorate: String(raw.governorate || 'القاهرة'),
            landlordId: String(raw.landlordId || ''),
            landlordDisplayName: String(raw.landlordDisplayName || ''),
            tenantId: String(raw.tenantId || ''),
            tenantDisplayName: String(raw.tenantDisplayName || ''),
            rating: typeof raw.rating === 'number' ? raw.rating : 5,
            landlordRating: typeof raw.landlordRating === 'number' ? raw.landlordRating : 5,
            landlordVerdict: raw.landlordVerdict || 'trusted',
            comment: String(raw.comment || ''),
            visibilityStatus: raw.visibilityStatus || 'published',
            createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
            isPersistedInDb: true,
          };
        });
        setPublishedDbReviews(list);
      },
      (err) => {
        handleSnapshotError(err, OperationType.LIST, 'reviews', reportConnectivityIssue);
      }
    );

    const bannedQuery = query(
      collection(publicDb, 'bannedUsers'),
      where('hideListings', '==', true)
    );
    const unsubBanned = onSnapshot(
      bannedQuery,
      (snap) => {
        setPublicBannedUsers(
          snap.docs.map((d) =>
            normalizeBannedUserRecord(d.data() as Record<string, unknown>, d.id)
          )
        );
      },
      (err) => {
        handleSnapshotError(err, OperationType.LIST, 'bannedUsers', reportConnectivityIssue);
      }
    );

    const demandQuery = query(
      collection(publicDb, 'bookingDemandSignals'),
      where('status', '==', 'completed')
    );
    const unsubDemand = onSnapshot(
      demandQuery,
      (snap) => {
        setPublicDemandSignals(
          snap.docs
            .map((d) =>
              normalizeBookingDemandSignalRecord(d.data() as Record<string, unknown>, d.id)
            )
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) => {
        handleSnapshotError(
          err,
          OperationType.LIST,
          'bookingDemandSignals',
          reportConnectivityIssue
        );
      }
    );

    return () => {
      unsubApts();
      unsubRevs();
      unsubBanned();
      unsubDemand();
    };
  }, [reportConnectivityIssue]);

  // Supabase Database Connection & Real-Time Sync (Live Backend)
  useEffect(() => {
    let isMounted = true;

    async function initSupabase() {
      try {
        const health = await checkSupabaseConnection();
        if (!isMounted) return;
        if (health.status === 'connected') {
          setSupabaseLive(true);
          setSupabaseNotice(null);
          await autoSeedSupabaseApartments();
          const supabaseApts = await fetchSupabaseApartments();
          if (isMounted) setVerifiedDbApartments(supabaseApts);
        } else {
          setSupabaseLive(false);
          setSupabaseNotice(health.message);
          const cached = await fetchSupabaseApartments();
          if (isMounted && cached.length > 0) setVerifiedDbApartments(cached);
        }
      } catch (err) {
        console.warn('[Supabase Sync] Background sync warning:', err);
      }
    }

    initSupabase();

    // Supabase Real-Time Broadcast Channel for Apartments
    const channel = supabase
      .channel('public:apartments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'apartments' },
        async () => {
          const fresh = await fetchSupabaseApartments();
          if (isMounted && fresh && fresh.length > 0) {
            setVerifiedDbApartments(fresh);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Supabase User Data Sync (Wallet & Bookings)
  useEffect(() => {
    const activeUid = userAccountData?.uid || currentUser?.uid;
    if (!activeUid) return;

    let isMounted = true;
    async function syncUserData(uid: string) {
      try {
        const liveWallet = await fetchSupabaseWallet(uid);
        if (isMounted && liveWallet) {
          setWallet(liveWallet);
        }

        const liveBookings = await fetchSupabaseBookings(uid);
        if (isMounted && liveBookings && liveBookings.length > 0) {
          if (userAccountData?.role === 'landlord') {
            setMyLandlordBookings(liveBookings);
          } else {
            setMyTenantBookings(liveBookings);
          }
        }
      } catch (err) {
        console.warn('[Supabase User Sync] Notice:', err);
      }
    }

    syncUserData(activeUid);
  }, [userAccountData?.uid, currentUser?.uid, userAccountData?.role]);

  // Signed-in User Scoped Listeners (Gated strictly on verified `sessionTokenReady`)
  useEffect(() => {
    if (!authReady || !sessionTokenReady || !currentUser) {
      setMyDbApartments([]);
      setMyTenantBookings([]);
      setMyLandlordBookings([]);
      setMyTenantRequests([]);
      setMyLandlordRequests([]);
      setMyNotifications([]);
      setMyFavorites([]);
      setMyTenantVerification(null);
      setMyBanRecord(null);
      setMyTenantChatThreads([]);
      setMyLandlordChatThreads([]);
      return;
    }

    const uid = currentUser.uid;

    const unsubMyApts = onSnapshot(
      query(collection(db, 'apartments'), where('ownerId', '==', uid)),
      (snap) => {
        setMyDbApartments(
          snap.docs.map((d) =>
            normalizeApartmentRecord(d.data() as Record<string, unknown>, d.id, true)
          )
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'apartments (owner)', reportConnectivityIssue)
    );

    const unsubTenantBookings = onSnapshot(
      query(collection(db, 'bookings'), where('tenantId', '==', uid)),
      (snap) => {
        setMyTenantBookings(
          snap.docs
            .map((d) => normalizeBookingRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'bookings (tenant)', reportConnectivityIssue)
    );

    const unsubLandlordBookings = onSnapshot(
      query(collection(db, 'bookings'), where('landlordId', '==', uid)),
      (snap) => {
        setMyLandlordBookings(
          snap.docs
            .map((d) => normalizeBookingRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'bookings (landlord)', reportConnectivityIssue)
    );

    const unsubTenantRequests = onSnapshot(
      query(collection(db, 'rentalRequests'), where('tenantId', '==', uid)),
      (snap) => {
        setMyTenantRequests(
          snap.docs
            .map((d) => normalizeRentalRequestRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'rentalRequests (tenant)',
          reportConnectivityIssue
        )
    );

    const unsubLandlordRequests = onSnapshot(
      query(collection(db, 'rentalRequests'), where('landlordId', '==', uid)),
      (snap) => {
        setMyLandlordRequests(
          snap.docs
            .map((d) => normalizeRentalRequestRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'rentalRequests (landlord)',
          reportConnectivityIssue
        )
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', uid)),
      (snap) => {
        setMyNotifications(
          snap.docs
            .map((d) => normalizeNotificationRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'notifications', reportConnectivityIssue)
    );

    const unsubFavorites = onSnapshot(
      query(collection(db, 'favorites'), where('userId', '==', uid)),
      (snap) => {
        const list: FavoriteRecord[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdObj = data.createdAt as { toMillis?: () => number } | undefined;
            return {
              id: d.id,
              userId: String(data.userId || uid),
              apartmentId: String(data.apartmentId || ''),
              category: data.category || 'family_apartment',
              title: String(data.title || ''),
              governorate: String(data.governorate || 'القاهرة'),
              district: String(data.district || ''),
              dailyRateEgp: typeof data.dailyRateEgp === 'number' ? data.dailyRateEgp : 0,
              monthlyRentEgp: typeof data.monthlyRentEgp === 'number' ? data.monthlyRentEgp : 0,
              studentBedsCount:
                typeof data.studentBedsCount === 'number' ? data.studentBedsCount : 0,
              studentPricePerBedEgp:
                typeof data.studentPricePerBedEgp === 'number' ? data.studentPricePerBedEgp : 0,
              priceAlertEnabled: Boolean(data.priceAlertEnabled ?? false),
              baselineMonthlyRentEgp:
                typeof data.baselineMonthlyRentEgp === 'number'
                  ? data.baselineMonthlyRentEgp
                  : typeof data.monthlyRentEgp === 'number'
                    ? data.monthlyRentEgp
                    : 0,
              baselineDailyRateEgp:
                typeof data.baselineDailyRateEgp === 'number'
                  ? data.baselineDailyRateEgp
                  : typeof data.dailyRateEgp === 'number'
                    ? data.dailyRateEgp
                    : 0,
              lastAlertedRentEgp:
                typeof data.lastAlertedRentEgp === 'number' ? data.lastAlertedRentEgp : undefined,
              bedrooms: typeof data.bedrooms === 'number' ? data.bedrooms : 2,
              bathrooms: typeof data.bathrooms === 'number' ? data.bathrooms : 1,
              areaSqm: typeof data.areaSqm === 'number' ? data.areaSqm : 120,
              furnishing: data.furnishing || 'furnished',
              imageKey: data.imageKey || 'zamalek_nile',
              ownerId: String(data.ownerId || ''),
              ownerDisplayName: String(data.ownerDisplayName || ''),
              createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setMyFavorites(list);
      },
      (err) => handleSnapshotError(err, OperationType.LIST, 'favorites', reportConnectivityIssue)
    );

    const unsubKyc = onSnapshot(
      doc(db, 'tenantVerifications', uid),
      (snap) => {
        if (!snap.exists()) {
          setMyTenantVerification(null);
          return;
        }
        const raw = snap.data();
        const subObj = raw.submittedAt as { toMillis?: () => number } | undefined;
        const updObj = raw.updatedAt as { toMillis?: () => number } | undefined;
        setMyTenantVerification({
          userId: uid,
          tenantDisplayName: String(raw.tenantDisplayName || ''),
          tenantCategory: raw.tenantCategory || 'family',
          verificationStatus: raw.verificationStatus || 'pending_review',
          reviewNote: String(raw.reviewNote || ''),
          submittedAtMs: subObj?.toMillis?.() ?? Date.now(),
          updatedAtMs: updObj?.toMillis?.() ?? Date.now(),
        });
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.GET,
          `tenantVerifications/${uid}`,
          reportConnectivityIssue
        )
    );

    const unsubMyBan = onSnapshot(
      doc(db, 'bannedUsers', uid),
      (snap) => {
        if (!snap.exists()) {
          setMyBanRecord(null);
          return;
        }
        setMyBanRecord(
          normalizeBannedUserRecord(snap.data() as Record<string, unknown>, snap.id)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.GET,
          `bannedUsers/${uid}`,
          reportConnectivityIssue
        )
    );

    const unsubTenantChats = onSnapshot(
      query(collection(db, 'chatThreads'), where('tenantId', '==', uid)),
      (snap) => {
        setMyTenantChatThreads(
          snap.docs
            .map((d) => normalizeChatThreadRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'chatThreads (tenant)', reportConnectivityIssue)
    );

    const unsubLandlordChats = onSnapshot(
      query(collection(db, 'chatThreads'), where('landlordId', '==', uid)),
      (snap) => {
        setMyLandlordChatThreads(
          snap.docs
            .map((d) => normalizeChatThreadRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'chatThreads (landlord)',
          reportConnectivityIssue
        )
    );

    return () => {
      unsubMyApts();
      unsubTenantBookings();
      unsubLandlordBookings();
      unsubTenantRequests();
      unsubLandlordRequests();
      unsubNotifications();
      unsubFavorites();
      unsubKyc();
      unsubMyBan();
      unsubTenantChats();
      unsubLandlordChats();
    };
  }, [authReady, sessionTokenReady, currentUser, reportConnectivityIssue]);

  // Platform Admin Listeners & Showcase Seeding
  const [adminAptsLoaded, setAdminAptsLoaded] = useState(false);
  const [adminBookingsLoaded, setAdminBookingsLoaded] = useState(false);

  useEffect(() => {
    if (!authReady || !sessionTokenReady || !currentUser || !isAdmin) {
      setAdminAptsLoaded(false);
      setAdminBookingsLoaded(false);
      setAllAdminApartments([]);
      setAllAdminBookings([]);
      setAllAdminRentalRequests([]);
      setAllAdminReviews([]);
      setAllAdminTenantVerifications([]);
      setAllAdminBannedUsers([]);
      setAllAdminActivityLogs([]);
      setAllAdminChatThreads([]);
      return;
    }

    const unsubAllApts = onSnapshot(
      collection(db, 'apartments'),
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeApartmentRecord(d.data() as Record<string, unknown>, d.id, true)
        );
        setAllAdminApartments(list);
        setAdminAptsLoaded(true);
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'apartments (admin)', reportConnectivityIssue)
    );

    const unsubAllBookings = onSnapshot(
      collection(db, 'bookings'),
      (snap) => {
        setAllAdminBookings(
          snap.docs
            .map((d) => normalizeBookingRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
        setAdminBookingsLoaded(true);
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'bookings (admin)', reportConnectivityIssue)
    );

    const unsubAllRequests = onSnapshot(
      collection(db, 'rentalRequests'),
      (snap) => {
        setAllAdminRentalRequests(
          snap.docs
            .map((d) => normalizeRentalRequestRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'rentalRequests (admin)',
          reportConnectivityIssue
        )
    );

    const unsubAllReviews = onSnapshot(
      collection(db, 'reviews'),
      (snap) => {
        setAllAdminReviews(
          snap.docs
            .map((d) => {
              const raw = d.data();
              const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
              return {
                id: d.id,
                bookingId: String(raw.bookingId || d.id),
                apartmentId: String(raw.apartmentId || ''),
                apartmentTitle: String(raw.apartmentTitle || ''),
                governorate: String(raw.governorate || 'القاهرة'),
                landlordId: String(raw.landlordId || ''),
                landlordDisplayName: String(raw.landlordDisplayName || ''),
                tenantId: String(raw.tenantId || ''),
                tenantDisplayName: String(raw.tenantDisplayName || ''),
                rating: typeof raw.rating === 'number' ? raw.rating : 5,
                landlordRating: typeof raw.landlordRating === 'number' ? raw.landlordRating : 5,
                landlordVerdict: raw.landlordVerdict || 'trusted',
                comment: String(raw.comment || ''),
                visibilityStatus: raw.visibilityStatus || 'published',
                createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
                isPersistedInDb: true,
              } as ReviewRecord;
            })
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'reviews (admin)', reportConnectivityIssue)
    );

    const unsubAllKyc = onSnapshot(
      collection(db, 'tenantVerifications'),
      (snap) => {
        setAllAdminTenantVerifications(
          snap.docs
            .map((d) => {
              const raw = d.data();
              const subObj = raw.submittedAt as { toMillis?: () => number } | undefined;
              const updObj = raw.updatedAt as { toMillis?: () => number } | undefined;
              return {
                userId: d.id,
                tenantDisplayName: String(raw.tenantDisplayName || ''),
                tenantCategory: raw.tenantCategory || 'family',
                verificationStatus: raw.verificationStatus || 'pending_review',
                reviewNote: String(raw.reviewNote || ''),
                submittedAtMs: subObj?.toMillis?.() ?? Date.now(),
                updatedAtMs: updObj?.toMillis?.() ?? Date.now(),
              } as TenantVerificationRecord;
            })
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'tenantVerifications (admin)',
          reportConnectivityIssue
        )
    );

    const unsubAllBanned = onSnapshot(
      collection(db, 'bannedUsers'),
      (snap) => {
        setAllAdminBannedUsers(
          snap.docs
            .map((d) => normalizeBannedUserRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        );
      },
      (err) =>
        handleSnapshotError(err, OperationType.LIST, 'bannedUsers (admin)', reportConnectivityIssue)
    );

    const unsubAllActivityLogs = onSnapshot(
      collection(db, 'adminActivityLogs'),
      (snap) => {
        setAllAdminActivityLogs(
          snap.docs
            .map((d) => normalizeAdminActivityLogRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'adminActivityLogs (admin)',
          reportConnectivityIssue
        )
    );

    const unsubAllChats = onSnapshot(
      collection(db, 'chatThreads'),
      (snap) => {
        setAllAdminChatThreads(
          snap.docs
            .map((d) => normalizeChatThreadRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs)
        );
      },
      (err) =>
        handleSnapshotError(
          err,
          OperationType.LIST,
          'chatThreads (admin)',
          reportConnectivityIssue
        )
    );

    return () => {
      unsubAllApts();
      unsubAllBookings();
      unsubAllRequests();
      unsubAllReviews();
      unsubAllKyc();
      unsubAllBanned();
      unsubAllActivityLogs();
      unsubAllChats();
    };
  }, [authReady, sessionTokenReady, currentUser, isAdmin, reportConnectivityIssue]);

  // Auto-seed missing showcase units when Admin signs in (after snapshots load & verifying server state)
  useEffect(() => {
    if (
      !authReady ||
      !sessionTokenReady ||
      !currentUser ||
      !isAdmin ||
      !adminAptsLoaded ||
      !adminBookingsLoaded ||
      adminAutoSeedRef.current
    ) {
      return;
    }
    if (allAdminApartments.length === 0 && allAdminBookings.length === 0) {
      adminAutoSeedRef.current = true;
      void (async () => {
        try {
          const [aptSnap, bookingSnap, settingsSnap] = await Promise.all([
            getDocsFromServer(collection(db, 'apartments')),
            getDocsFromServer(collection(db, 'bookings')),
            getDocFromServer(doc(db, 'platformSettings', 'config')).catch(() => null),
          ]);
          const existingIds = new Set(aptSnap.docs.map((d) => d.id));
          const bookedIds = new Set(bookingSnap.docs.map((d) => d.id));
          const liveSettings =
            settingsSnap && settingsSnap.exists()
              ? normalizePlatformSettings(settingsSnap.data() as Record<string, unknown>)
              : platformSettings;
          const removedSet = new Set(liveSettings.removedShowcaseIds);
          const missing = SHOWCASE_APARTMENTS.filter(
            (s) => !existingIds.has(s.id) && !bookedIds.has(s.id) && !removedSet.has(s.id)
          );
          if (missing.length === 0) return;

          const batch = writeBatch(db);
          for (const item of missing) {
            const hash = await computeTextSha256(item.id);
            batch.set(
              doc(db, 'apartments', item.id),
              buildShowcaseSeedPayload(item, currentUser.uid, liveSettings)
            );
            batch.set(doc(db, 'apartments', item.id, 'legalDocs', 'dossier'), {
              ownerId: currentUser.uid,
              apartmentId: item.id,
              nationalIdNumber: '28801010104455',
              ownerPhone: '01022334455',
              exactAddress: `${item.district} — وحدة موثقة بسجل منصة إيجار`,
              propertyRegistryNumber: `REG-${item.id.slice(-6).toUpperCase()}`,
              titleDeedFileName: `${item.id}_deed.pdf`,
              titleDeedSha256: hash,
              utilityBillFileName: `${item.id}_utility.pdf`,
              utilityBillSha256: hash,
              ownerIbanOrInstapay: 'verified.landlord@instapay',
              digitalSignatureName: `${item.ownerDisplayName} الموثق`.slice(0, 80),
              exclusivityClauseAccepted: true,
              createdAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          console.warn('Admin showcase auto-sync skipped:', err);
        }
      })();
    }
  }, [
    authReady,
    sessionTokenReady,
    currentUser,
    isAdmin,
    adminAptsLoaded,
    adminBookingsLoaded,
    allAdminApartments.length,
    allAdminBookings.length,
    platformSettings,
  ]);

  // Auto-backfill anonymized /bookingDemandSignals for any historical completed bookings when Admin is active
  useEffect(() => {
    if (!authReady || !sessionTokenReady || !currentUser || !isAdmin) return;
    if (allAdminBookings.length === 0) return;

    const existingSignalIds = new Set(publicDemandSignals.map((s) => s.bookingId));
    const missingCompleted = allAdminBookings.filter(
      (b) =>
        b.status === 'completed' &&
        !existingSignalIds.has(b.id) &&
        !backfilledSignalIdsRef.current.has(b.id)
    );
    if (missingCompleted.length === 0) return;

    const aptLookup = new Map<string, ApartmentRecord>();
    allAdminApartments.forEach((a) => aptLookup.set(a.id, a));
    verifiedDbApartments.forEach((a) => aptLookup.set(a.id, a));

    missingCompleted.slice(0, 25).forEach((b) => {
      backfilledSignalIdsRef.current.add(b.id);
    });

    const timer = window.setTimeout(async () => {
      try {
        const batch = writeBatch(db);
        missingCompleted.slice(0, 25).forEach((b) => {
          batch.set(
            doc(db, 'bookingDemandSignals', b.id),
            buildBookingDemandSignalWritePayload(
              b,
              {
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              aptLookup
            )
          );
        });
        await batch.commit();
      } catch (err) {
        console.warn('Completed demand signal backfill skipped:', err);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    authReady,
    sessionTokenReady,
    currentUser,
    isAdmin,
    allAdminBookings,
    allAdminApartments,
    verifiedDbApartments,
    publicDemandSignals,
  ]);

  const removedShowcaseSet = useMemo(
    () => new Set(platformSettings.removedShowcaseIds),
    [platformSettings.removedShowcaseIds]
  );

  const bannedListingOwnerIds = useMemo(() => {
    const ids = new Set<string>();
    publicBannedUsers.forEach((b) => {
      if (b.hideListings) ids.add(b.userId);
    });
    allAdminBannedUsers.forEach((b) => {
      if (b.hideListings) ids.add(b.userId);
    });
    if (myBanRecord?.hideListings && currentUser) {
      ids.add(currentUser.uid);
    }
    return ids;
  }, [publicBannedUsers, allAdminBannedUsers, myBanRecord, currentUser]);

  const mergedExploreApartments = useMemo(() => {
    const dbById = new Map<string, ApartmentRecord>();
    const addDbApartment = (apt: ApartmentRecord) => {
      if (
        apt.verificationStatus !== 'rejected' &&
        !rentedDeletedIds.has(apt.id) &&
        !removedShowcaseSet.has(apt.id) &&
        !bannedListingOwnerIds.has(apt.ownerId)
      ) {
        dbById.set(apt.id, {
          ...apt,
          commissionRatePct: getCategoryCommissionPct(apt.category, platformSettings),
        });
      }
    };

    verifiedDbApartments.forEach(addDbApartment);
    myDbApartments.forEach((apt) => {
      if (!dbById.has(apt.id)) {
        addDbApartment(apt);
      }
    });
    if (isAdmin) {
      allAdminApartments.forEach((apt) => {
        if (!dbById.has(apt.id)) {
          addDbApartment(apt);
        }
      });
    }

    const bookedSet = new Set<string>([
      ...Array.from(rentedDeletedIds),
      ...myTenantBookings.map((b) => b.apartmentId),
      ...myLandlordBookings.map((b) => b.apartmentId),
      ...allAdminBookings.map((b) => b.apartmentId),
    ]);

    const result: ApartmentRecord[] = Array.from(dbById.values());

    SHOWCASE_APARTMENTS.forEach((showcase) => {
      if (
        !dbById.has(showcase.id) &&
        !bookedSet.has(showcase.id) &&
        !removedShowcaseSet.has(showcase.id) &&
        !bannedListingOwnerIds.has(showcase.ownerId)
      ) {
        result.push({
          ...showcase,
          commissionRatePct: getCategoryCommissionPct(showcase.category, platformSettings),
          isPersistedInDb: false,
        });
      }
    });

    let customEdits: Record<string, Partial<ApartmentRecord>> = {};
    try {
      const rawEdits = localStorage.getItem('ejar_custom_apartment_edits');
      if (rawEdits) customEdits = JSON.parse(rawEdits);
    } catch {}

    const finalResult = result.map((apt) => {
      if (customEdits[apt.id]) {
        return { ...apt, ...customEdits[apt.id] };
      }
      return apt;
    });

    return finalResult;
  }, [
    verifiedDbApartments,
    myDbApartments,
    allAdminApartments,
    isAdmin,
    rentedDeletedIds,
    removedShowcaseSet,
    bannedListingOwnerIds,
    myTenantBookings,
    myLandlordBookings,
    allAdminBookings,
    platformSettings,
    supabaseLive,
  ]);

  const mergedReviews = useMemo(() => {
    const visiblePublished = publishedDbReviews.filter(
      (r) =>
        !bannedListingOwnerIds.has(r.tenantId) &&
        !bannedListingOwnerIds.has(r.landlordId) &&
        !removedShowcaseSet.has(r.apartmentId)
    );
    const dbIds = new Set(publishedDbReviews.map((r) => r.id));
    const visibleShowcase = SHOWCASE_REVIEWS.filter(
      (sr) =>
        !dbIds.has(sr.id) &&
        !bannedListingOwnerIds.has(sr.tenantId) &&
        !bannedListingOwnerIds.has(sr.landlordId) &&
        !removedShowcaseSet.has(sr.apartmentId)
    );
    return [...visiblePublished, ...visibleShowcase];
  }, [publishedDbReviews, bannedListingOwnerIds, removedShowcaseSet]);

  const completedDemandSignals = useMemo<BookingDemandSignalRecord[]>(() => {
    const aptLookup = new Map<string, ApartmentRecord>();
    verifiedDbApartments.forEach((a) => aptLookup.set(a.id, a));
    myDbApartments.forEach((a) => aptLookup.set(a.id, a));
    allAdminApartments.forEach((a) => aptLookup.set(a.id, a));

    const byBookingId = new Map<string, BookingDemandSignalRecord>();

    publicDemandSignals.forEach((sig) => {
      if (sig.status === 'completed') {
        byBookingId.set(sig.bookingId, sig);
      }
    });

    const mergeCompletedBookings = (bookings: BookingRecord[]) => {
      bookings.forEach((b) => {
        if (b.status === 'completed' && !byBookingId.has(b.id)) {
          byBookingId.set(b.id, bookingToDemandSignalRecord(b, aptLookup));
        }
      });
    };

    mergeCompletedBookings(allAdminBookings);
    mergeCompletedBookings(myTenantBookings);
    mergeCompletedBookings(myLandlordBookings);

    return Array.from(byBookingId.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }, [
    publicDemandSignals,
    allAdminBookings,
    myTenantBookings,
    myLandlordBookings,
    verifiedDbApartments,
    myDbApartments,
    allAdminApartments,
  ]);

  const favoriteApartmentIds = useMemo(
    () => new Set(myFavorites.map((f) => f.apartmentId)),
    [myFavorites]
  );

  const priceAlertApartmentIds = useMemo(
    () => new Set(myFavorites.filter((f) => f.priceAlertEnabled).map((f) => f.apartmentId)),
    [myFavorites]
  );

  const unreadNotificationsCount = useMemo(
    () => myNotifications.filter((n) => !n.isRead).length,
    [myNotifications]
  );

  const myChatThreads = useMemo(() => {
    const byId = new Map<string, ChatThreadRecord>();
    myTenantChatThreads.forEach((th) => byId.set(th.id, th));
    myLandlordChatThreads.forEach((th) => byId.set(th.id, th));
    return Array.from(byId.values()).sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
  }, [myTenantChatThreads, myLandlordChatThreads]);

  // Real-Time Price Drop Watcher on Saved Favorites with Active Price Alert
  useEffect(() => {
    if (!currentUser || !sessionTokenReady || myFavorites.length === 0) return;

    const liveMap = new Map<string, ApartmentRecord>();
    mergedExploreApartments.forEach((a) => liveMap.set(a.id, a));
    myDbApartments.forEach((a) => liveMap.set(a.id, a));

    myFavorites.forEach((fav) => {
      if (!fav.priceAlertEnabled) return;
      const liveApt = liveMap.get(fav.apartmentId);
      if (!liveApt) return;

      const baseMonthly = fav.baselineMonthlyRentEgp ?? fav.monthlyRentEgp;
      const baseDaily = fav.baselineDailyRateEgp ?? fav.dailyRateEgp ?? 0;

      const monthlyDropped = baseMonthly > 0 && liveApt.monthlyRentEgp < baseMonthly;
      const dailyDropped =
        baseDaily > 0 && liveApt.dailyRateEgp > 0 && liveApt.dailyRateEgp < baseDaily;

      if (!monthlyDropped && !dailyDropped) return;

      const newPrimaryPrice = dailyDropped ? liveApt.dailyRateEgp : liveApt.monthlyRentEgp;
      const oldPrimaryPrice = dailyDropped ? baseDaily : baseMonthly;
      const dedupKey = `${fav.id}_${liveApt.monthlyRentEgp}_${liveApt.dailyRateEgp}`;

      if (alertedPriceKeysRef.current.has(dedupKey)) return;
      if (fav.lastAlertedRentEgp === newPrimaryPrice) return;

      alertedPriceKeysRef.current.add(dedupKey);

      const dropDiff = oldPrimaryPrice - newPrimaryPrice;
      const dropPct = Math.max(1, Math.round((dropDiff / oldPrimaryPrice) * 100));

      const safeActorName = (currentUser.displayName?.trim() || 'منصة إيجار').slice(0, 80);
      const actorName = safeActorName.length >= 2 ? safeActorName : 'منصة إيجار';
      const safeTitle =
        liveApt.title.trim().slice(0, 120).length >= 2
          ? liveApt.title.trim().slice(0, 120)
          : 'وحدة عقارية موثقة';
      const safeGov =
        liveApt.governorate.trim().slice(0, 50).length >= 2
          ? liveApt.governorate.trim().slice(0, 50)
          : 'القاهرة';

      const notifId = buildNotificationId('ntf_pd');
      const unitDescAr = dailyDropped ? 'اليومي' : 'الشهري';
      const batch = writeBatch(db);

      batch.update(doc(db, 'favorites', fav.id), {
        priceAlertEnabled: true,
        baselineMonthlyRentEgp: liveApt.monthlyRentEgp,
        baselineDailyRateEgp: liveApt.dailyRateEgp || 0,
        monthlyRentEgp: liveApt.monthlyRentEgp,
        dailyRateEgp: liveApt.dailyRateEgp || 0,
        lastAlertedRentEgp: newPrimaryPrice,
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'notifications', notifId), {
        recipientId: currentUser.uid,
        actorId: currentUser.uid,
        actorDisplayName: actorName,
        recipientRole: 'tenant',
        statusType: 'price_drop',
        relatedEntityType: 'favorite',
        relatedEntityId: fav.id,
        apartmentId: liveApt.id,
        apartmentTitle: safeTitle,
        governorate: safeGov,
        amountEgp: newPrimaryPrice,
        title: `تنبيه انخفاض السعر (${dropPct}%-) — ${safeTitle}`.slice(0, 140),
        message: `انخفض سعر الإيجار ${unitDescAr} لوحدة «${safeTitle}» المحفوظة بالمفضلة من ${formatEgp(
          oldPrimaryPrice
        )} ج.م إلى ${formatEgp(newPrimaryPrice)} ج.م (وفر ${formatEgp(dropDiff)} ج.م).`.slice(
          0,
          500
        ),
        isRead: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      void batch
        .commit()
        .then(() => {
          showToast(
            t(
              `انخفض سعر «${safeTitle}» إلى ${formatEgp(newPrimaryPrice)} ج.م — تم إرسال تنبيه في عقودي`,
              `Price dropped on "${safeTitle}" to ${formatNumber(newPrimaryPrice)} EGP!`
            )
          );
        })
        .catch((err) => {
          alertedPriceKeysRef.current.delete(dedupKey);
          handleSnapshotError(
            err,
            OperationType.WRITE,
            `favorites/${fav.id}`,
            reportConnectivityIssue
          );
        });
    });
  }, [
    currentUser,
    sessionTokenReady,
    myFavorites,
    mergedExploreApartments,
    myDbApartments,
    showToast,
    reportConnectivityIssue,
    t,
    formatNumber,
  ]);

  // Keep selectedApartment & checkoutApartment synced with live Admin edits, hides, deletions, or bans
  useEffect(() => {
    if (!selectedApartment) return;
    const updated =
      mergedExploreApartments.find((a) => a.id === selectedApartment.id) ||
      (!bannedListingOwnerIds.has(selectedApartment.ownerId)
        ? myDbApartments.find((a) => a.id === selectedApartment.id)
        : undefined);
    if (!updated) {
      setSelectedApartment(null);
      return;
    }
    if (updated !== selectedApartment) {
      setSelectedApartment(updated);
    }
  }, [mergedExploreApartments, myDbApartments, bannedListingOwnerIds, selectedApartment]);

  useEffect(() => {
    if (!checkoutApartment) return;
    // Do not auto-close the checkout modal right after a successful escrow booking completes,
    // so the user can inspect their payment receipt before dismissing or navigating to My Contracts.
    if (rentedDeletedIds.has(checkoutApartment.id)) return;
    const updated =
      mergedExploreApartments.find((a) => a.id === checkoutApartment.id) ||
      (activeCheckoutRequest && !bannedListingOwnerIds.has(checkoutApartment.ownerId)
        ? myDbApartments.find((a) => a.id === checkoutApartment.id)
        : undefined);
    if (!updated && !activeCheckoutRequest) {
      setCheckoutApartment(null);
      return;
    }
    if (updated && updated !== checkoutApartment) {
      setCheckoutApartment(updated);
    }
  }, [
    mergedExploreApartments,
    myDbApartments,
    bannedListingOwnerIds,
    rentedDeletedIds,
    checkoutApartment,
    activeCheckoutRequest,
  ]);

  const handleSignIn = async () => {
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const sessionCheck = await validateAuthenticatedSession(credential.user);
      if (sessionCheck.ok) {
        setCurrentUser(credential.user);
        setSessionTokenReady(true);
        setSessionExpiresAtMs(sessionCheck.expiresAtMs);
        setCloudDiag({ status: 'nominal', detail: null, checkedAtMs: Date.now() });

        const googleUserAccount: UserAccountData = {
          uid: credential.user.uid,
          displayName:
            credential.user.displayName || credential.user.email?.split('@')[0] || 'مستخدم جوجل',
          email: credential.user.email || '',
          phone: credential.user.phoneNumber || '',
          role: 'tenant',
          photoUrl: credential.user.photoURL || undefined,
          isLandlordVerified: false,
          isTenantVerified: false,
          createdAtMs: Date.now(),
        };
        setUserAccountData(googleUserAccount);
        void upsertSupabaseProfile(googleUserAccount).catch(() => undefined);

        showToast(
          t(
            `مرحباً ${credential.user.displayName || credential.user.email || ''} — تم تسجيل الدخول بنجاح`,
            `Welcome ${credential.user.displayName || credential.user.email || ''} — Signed in`
          )
        );
      } else {
        setCurrentUser(null);
        setSessionTokenReady(false);
        setSessionExpiresAtMs(null);
        showToast(
          t(
            'يرجى إعادة الضغط على «تسجيل الدخول» لتأكيد الجلسة',
            'Please click Sign In again to confirm your session'
          )
        );
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (isTokenServiceDisabledError(err)) {
        setDiagDismissed(false);
        setCloudDiag({
          status: 'token_service_disabled',
          detail: err instanceof Error ? err.message : String(err),
          checkedAtMs: Date.now(),
        });
        const msg = t(
          'خدمة المصادقة السحابية قيد التفعيل في المشروع — راجع شريط الحالة بالأعلى',
          'Cloud Auth API is propagating — see status bar above'
        );
        showToast(msg);
        throw new Error(msg);
      }

      let errorMsg = t(
        'تعذر تسجيل الدخول بحساب Google. يمكنك تسجيل الدخول بالبريد الإلكتروني وكلمة المرور أدناه وسيدخل فوراً!',
        'Google Sign-In unavailable on this domain. Please use email & password below!'
      );

      if (code === 'auth/unauthorized-domain' || code === 'auth/popup-blocked') {
        throw new Error(code);
      }

      showToast(errorMsg);
      throw new Error(errorMsg);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } finally {
      setCurrentUser(null);
      setUserAccountData(null);
      setSessionTokenReady(false);
      setSessionExpiresAtMs(null);
      setActiveTab('explore');
    }
  };

  const handleSwitchAccount = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setSessionTokenReady(false);
      setSessionExpiresAtMs(null);
    } catch {
      // Proceed to Google popup sign-in
    }
    await handleSignIn();
  };

  const handleRetryCloudConnection = async () => {
    setRetryingConnection(true);
    try {
      const publicOk = await probePublicFirestoreConnection();
      if (!publicOk) {
        setCloudDiag({
          status: 'offline_retrying',
          detail: 'Firestore backend unreachable',
          checkedAtMs: Date.now(),
        });
        showToast(
          t(
            'لا يزال الاتصال السحابي غير مستقر — تأكد من الإنترنت وأعد المحاولة',
            'Cloud backend is still unreachable — check connection and retry'
          )
        );
        return;
      }

      if (auth.currentUser) {
        const res = await validateAuthenticatedSession(auth.currentUser);
        if (res.ok) {
          setCurrentUser(auth.currentUser);
          setSessionTokenReady(true);
          setSessionExpiresAtMs(res.expiresAtMs);
        } else {
          setCurrentUser(null);
          setSessionTokenReady(false);
          setSessionExpiresAtMs(null);
        }
      }

      setCloudDiag({
        status: 'nominal',
        detail: null,
        checkedAtMs: Date.now(),
      });
      showToast(
        t(
          'تم التحقق من سلامة الاتصال السحابي بنجاح — اضغط «تسجيل الدخول» للمتابعة',
          'Cloud connection verified — click Sign In to continue'
        )
      );
    } finally {
      setRetryingConnection(false);
    }
  };

  const handleRefreshExploreData = useCallback(async () => {
    const aptsQuery = query(
      collection(publicDb, 'apartments'),
      where('verificationStatus', '==', 'verified')
    );
    const revsQuery = query(
      collection(publicDb, 'reviews'),
      where('visibilityStatus', '==', 'published')
    );
    const bannedQuery = query(
      collection(publicDb, 'bannedUsers'),
      where('hideListings', '==', true)
    );
    const demandQuery = query(
      collection(publicDb, 'bookingDemandSignals'),
      where('status', '==', 'completed')
    );
    const configRef = doc(publicDb, 'platformSettings', 'config');

    try {
      const [configSnap, aptsSnap, revsSnap, bannedSnap, demandSnap] = await Promise.all([
        getDocFromServer(configRef),
        getDocsFromServer(aptsQuery),
        getDocsFromServer(revsQuery),
        getDocsFromServer(bannedQuery),
        getDocsFromServer(demandQuery),
      ]);

      setPlatformSettings(
        configSnap.exists()
          ? normalizePlatformSettings(configSnap.data() as Record<string, unknown>)
          : DEFAULT_PLATFORM_SETTINGS
      );

      if (aptsSnap.docs.length > 0) {
        setVerifiedDbApartments(
          aptsSnap.docs.map((d) =>
            normalizeApartmentRecord(d.data() as Record<string, unknown>, d.id, true)
          )
        );
      } else {
        const freshSupabase = await fetchSupabaseApartments();
        if (freshSupabase.length > 0) {
          setVerifiedDbApartments(freshSupabase);
        }
      }

      setPublicBannedUsers(
        bannedSnap.docs.map((d) =>
          normalizeBannedUserRecord(d.data() as Record<string, unknown>, d.id)
        )
      );

      setPublicDemandSignals(
        demandSnap.docs
          .map((d) =>
            normalizeBookingDemandSignalRecord(d.data() as Record<string, unknown>, d.id)
          )
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );

      setPublishedDbReviews(
        revsSnap.docs.map((d) => {
          const raw = d.data();
          const createdObj = raw.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            bookingId: String(raw.bookingId || d.id),
            apartmentId: String(raw.apartmentId || ''),
            apartmentTitle: String(raw.apartmentTitle || ''),
            governorate: String(raw.governorate || 'القاهرة'),
            landlordId: String(raw.landlordId || ''),
            landlordDisplayName: String(raw.landlordDisplayName || ''),
            tenantId: String(raw.tenantId || ''),
            tenantDisplayName: String(raw.tenantDisplayName || ''),
            rating: typeof raw.rating === 'number' ? raw.rating : 5,
            landlordRating: typeof raw.landlordRating === 'number' ? raw.landlordRating : 5,
            landlordVerdict: raw.landlordVerdict || 'trusted',
            comment: String(raw.comment || ''),
            visibilityStatus: raw.visibilityStatus || 'published',
            createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
            isPersistedInDb: true,
          };
        })
      );

      if (sessionTokenReady && currentUser) {
        const uid = currentUser.uid;
        const [favSnap, tenantBookingSnap] = await Promise.all([
          getDocsFromServer(query(collection(db, 'favorites'), where('userId', '==', uid))),
          getDocsFromServer(query(collection(db, 'bookings'), where('tenantId', '==', uid))),
        ]);

        setMyFavorites(
          favSnap.docs
            .map((d) => {
              const data = d.data();
              const createdObj = data.createdAt as { toMillis?: () => number } | undefined;
              return {
                id: d.id,
                userId: String(data.userId || uid),
                apartmentId: String(data.apartmentId || ''),
                category: data.category || 'family_apartment',
                title: String(data.title || ''),
                governorate: String(data.governorate || 'القاهرة'),
                district: String(data.district || ''),
                dailyRateEgp: typeof data.dailyRateEgp === 'number' ? data.dailyRateEgp : 0,
                monthlyRentEgp: typeof data.monthlyRentEgp === 'number' ? data.monthlyRentEgp : 0,
                studentBedsCount:
                  typeof data.studentBedsCount === 'number' ? data.studentBedsCount : 0,
                studentPricePerBedEgp:
                  typeof data.studentPricePerBedEgp === 'number' ? data.studentPricePerBedEgp : 0,
                priceAlertEnabled: Boolean(data.priceAlertEnabled ?? false),
                baselineMonthlyRentEgp:
                  typeof data.baselineMonthlyRentEgp === 'number'
                    ? data.baselineMonthlyRentEgp
                    : typeof data.monthlyRentEgp === 'number'
                      ? data.monthlyRentEgp
                      : 0,
                baselineDailyRateEgp:
                  typeof data.baselineDailyRateEgp === 'number'
                    ? data.baselineDailyRateEgp
                    : typeof data.dailyRateEgp === 'number'
                      ? data.dailyRateEgp
                      : 0,
                lastAlertedRentEgp:
                  typeof data.lastAlertedRentEgp === 'number' ? data.lastAlertedRentEgp : undefined,
                bedrooms: typeof data.bedrooms === 'number' ? data.bedrooms : 2,
                bathrooms: typeof data.bathrooms === 'number' ? data.bathrooms : 1,
                areaSqm: typeof data.areaSqm === 'number' ? data.areaSqm : 120,
                furnishing: data.furnishing || 'furnished',
                imageKey: data.imageKey || 'zamalek_nile',
                ownerId: String(data.ownerId || ''),
                ownerDisplayName: String(data.ownerDisplayName || ''),
                createdAtMs: createdObj?.toMillis?.() ?? Date.now(),
              } as FavoriteRecord;
            })
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );

        setMyTenantBookings(
          tenantBookingSnap.docs
            .map((d) => normalizeBookingRecord(d.data() as Record<string, unknown>, d.id))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      }

      setCloudDiag({
        status: 'nominal',
        detail: null,
        checkedAtMs: Date.now(),
      });
      setLastRefreshedAtMs(Date.now());
    } catch (err) {
      handleSnapshotError(
        err,
        OperationType.LIST,
        'apartments/pull-to-refresh',
        reportConnectivityIssue
      );
      setLastRefreshedAtMs(Date.now());
    }
  }, [sessionTokenReady, currentUser, reportConnectivityIssue]);

  const handleCopyActivationUrl = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_SERVICE_CONSOLE_URL);
      setCopiedConsoleUrl(true);
      window.setTimeout(() => setCopiedConsoleUrl(false), 2500);
      showToast(
        t(
          'تم نسخ رابط تفعيل خدمة Token Service API إلى الحافظة',
          'Token Service API activation link copied to clipboard'
        )
      );
    } catch {
      showToast(TOKEN_SERVICE_CONSOLE_URL);
    }
  };

  const buildFavoriteCreatePayload = (uid: string, apt: ApartmentRecord) => {
    const safeTitle =
      apt.title.trim().slice(0, 120).length >= 5
        ? apt.title.trim().slice(0, 120)
        : 'وحدة سكنية موثقة على إيجار';
    const safeGov =
      apt.governorate.trim().slice(0, 50).length >= 2
        ? apt.governorate.trim().slice(0, 50)
        : 'القاهرة';
    const safeDistrict =
      apt.district.trim().slice(0, 80).length >= 2
        ? apt.district.trim().slice(0, 80)
        : 'وسط البلد';
    const safeOwnerName =
      apt.ownerDisplayName.trim().slice(0, 80).length >= 2
        ? apt.ownerDisplayName.trim().slice(0, 80)
        : 'مالك موثق';

    return {
      userId: uid,
      apartmentId: apt.id,
      category: apt.category,
      title: safeTitle,
      governorate: safeGov,
      district: safeDistrict,
      dailyRateEgp: apt.dailyRateEgp || 0,
      monthlyRentEgp: apt.monthlyRentEgp,
      studentBedsCount: apt.studentBedsCount || 0,
      studentPricePerBedEgp: apt.studentPricePerBedEgp || 0,
      priceAlertEnabled: true,
      baselineMonthlyRentEgp: apt.monthlyRentEgp,
      baselineDailyRateEgp: apt.dailyRateEgp || 0,
      bedrooms: apt.bedrooms,
      bathrooms: apt.bathrooms,
      areaSqm: apt.areaSqm,
      furnishing: apt.furnishing,
      imageKey: apt.imageKey,
      ownerId: apt.ownerId,
      ownerDisplayName: safeOwnerName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  };

  const handleToggleFavorite = async (apt: ApartmentRecord) => {
    if (!currentUser || !sessionTokenReady) {
      await handleSignIn();
      return;
    }

    const favId = buildFavoriteDocId(currentUser.uid, apt.id);
    const exists = favoriteApartmentIds.has(apt.id);
    setTogglingFavoriteId(apt.id);

    try {
      if (exists) {
        await deleteDoc(doc(db, 'favorites', favId));
      } else {
        await setDoc(
          doc(db, 'favorites', favId),
          buildFavoriteCreatePayload(currentUser.uid, apt)
        );
        showToast(
          t(
            'تم حفظ الوحدة في المفضلة مع تفعيل تنبيه انخفاض السعر تلقائياً',
            'Saved to Favorites with Price Drop Alert enabled'
          )
        );
      }
    } catch (err) {
      handleSnapshotError(
        err,
        exists ? OperationType.DELETE : OperationType.CREATE,
        `favorites/${favId}`,
        reportConnectivityIssue
      );
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const handleTogglePriceAlert = async (apt: ApartmentRecord) => {
    if (!currentUser || !sessionTokenReady) {
      await handleSignIn();
      return;
    }

    const favId = buildFavoriteDocId(currentUser.uid, apt.id);
    const existingFav = myFavorites.find((f) => f.apartmentId === apt.id);
    setTogglingFavoriteId(apt.id);

    try {
      if (!existingFav) {
        await setDoc(
          doc(db, 'favorites', favId),
          buildFavoriteCreatePayload(currentUser.uid, apt)
        );
        showToast(
          t(
            'تم حفظ الوحدة في المفضلة وتفعيل تنبيه انخفاض السعر بنجاح',
            'Unit saved to Favorites & Price Drop Alert enabled'
          )
        );
      } else {
        const nextEnabled = !existingFav.priceAlertEnabled;
        await updateDoc(doc(db, 'favorites', favId), {
          priceAlertEnabled: nextEnabled,
          baselineMonthlyRentEgp: apt.monthlyRentEgp,
          baselineDailyRateEgp: apt.dailyRateEgp || 0,
          monthlyRentEgp: apt.monthlyRentEgp,
          dailyRateEgp: apt.dailyRateEgp || 0,
          updatedAt: serverTimestamp(),
        });
        showToast(
          nextEnabled
            ? t(
                'تم تفعيل تنبيه انخفاض السعر لهذه الوحدة',
                'Price Drop Alert enabled for this unit'
              )
            : t(
                'تم إيقاف تنبيه انخفاض السعر لهذه الوحدة',
                'Price Drop Alert paused for this unit'
              )
        );
      }
    } catch (err) {
      handleSnapshotError(
        err,
        existingFav ? OperationType.UPDATE : OperationType.CREATE,
        `favorites/${favId}`,
        reportConnectivityIssue
      );
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const handleRemoveFavoriteById = async (fav: FavoriteRecord) => {
    if (!currentUser || !sessionTokenReady) return;
    setTogglingFavoriteId(fav.apartmentId);
    try {
      await deleteDoc(doc(db, 'favorites', fav.id));
    } catch (err) {
      handleSnapshotError(
        err,
        OperationType.DELETE,
        `favorites/${fav.id}`,
        reportConnectivityIssue
      );
    } finally {
      setTogglingFavoriteId(null);
    }
  };

  const existingReviewForModal = useMemo(() => {
    if (!reviewModalBooking || !currentUser) return null;
    return (
      mergedReviews.find(
        (r) => r.bookingId === reviewModalBooking.id && r.tenantId === currentUser.uid
      ) || null
    );
  }, [reviewModalBooking, mergedReviews, currentUser]);

  return (
    <FirestoreErrorBoundary>
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="ar"
        region="EG"
        libraries={['marker', 'places']}
      >
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0"
        >
          {/* Sticky Top Navigation Bar (Strict 3-Zone Architectural Budget) */}
          <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
              {/* Zone 1: Brand Identity */}
              <button
                type="button"
                onClick={() => setActiveTab('explore')}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
              >
                <EjarLogo size="md" />
              </button>

              {/* Zone 2: Clean Typographic Primary Navigation Links */}
              <nav
                aria-label={t('التنقل الرئيسي', 'Main Navigation')}
                className="hidden md:flex items-center gap-6"
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  className={`py-5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'explore'
                      ? 'border-blue-700 text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('خريطة الوحدات', 'Explore Map')}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('list_unit')}
                  className={`py-5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'list_unit'
                      ? 'border-blue-700 text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('اعرض وحدتك', 'List Your Unit')}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('my_contracts')}
                  className={`py-5 text-sm font-semibold border-b-2 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    activeTab === 'my_contracts'
                      ? 'border-blue-700 text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{t('عقودي والمفضلة', 'My Contracts')}</span>
                  {unreadNotificationsCount > 0 && (
                    <span className="font-mono tabular-nums text-xs font-bold text-blue-700">
                      ({formatNumber(unreadNotificationsCount)})
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('admin')}
                    className={`py-5 text-sm font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeTab === 'admin'
                        ? 'border-blue-700 text-blue-700'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 shrink-0 text-blue-700" />
                    <span>{t('لوحة الأدمن', 'Admin Console')}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800">
                      {t('المالك', 'Owner')}
                    </span>
                  </button>
                )}
              </nav>

              {/* Zone 3: Language Switcher & Unified Personal Account Hub */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={toggleLang}
                  title={t('Switch interface to English', 'التبديل إلى اللغة العربية')}
                  aria-label={t('Switch to English', 'التبديل إلى العربية')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Globe className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
                </button>

                {/* Unified Profile Hub Button (Contains Wallet, KYC, Photo & Account Completion) */}
                {currentUser || userAccountData ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsProfileModalOpen(true)}
                      className="inline-flex items-center gap-2.5 p-1.5 pe-3 text-xs font-semibold text-slate-800 bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-xl transition-all shadow-xs group"
                      title={t('فتح لوحة الحساب الشخصي، المحفظة والتوثيق', 'Open Account Hub, Wallet & Verification')}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-bold text-xs relative shadow-xs shrink-0">
                        {userAccountData?.photoUrl || currentUser?.photoURL ? (
                          <img
                            src={userAccountData?.photoUrl || currentUser?.photoURL || ''}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{(userAccountData?.displayName || currentUser?.displayName || 'م')[0]}</span>
                        )}
                        {isBlueVerified ? (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white shadow-xs" />
                        ) : profileCompletionPct === 100 ? (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                        ) : null}
                      </div>
                      <div className="flex flex-col text-start">
                        <span className="max-w-[120px] truncate font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {userAccountData?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0]}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isBlueVerified ? (
                            <span title={t('حساب موثق بالعلامة الزرقاء', 'Blue Verified')}>
                              <BadgeCheck className="w-4 h-4 fill-blue-500 text-white drop-shadow-sm" />
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-md ${
                                profileCompletionPct === 100
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : profileCompletionPct >= 50
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {profileCompletionPct === 100
                                ? t('100% موثق ✨', '100% Verified ✨')
                                : `${profileCompletionPct}% ${t('مكتمل', 'done')}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      title={t('تسجيل الخروج', 'Sign Out')}
                      className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 rounded-xl transition-all shadow-xs whitespace-nowrap shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t('تسجيل الدخول / حساب جديد', 'Sign In / Register')}</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          {supabaseNotice && (
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3">
              <div
                role="status"
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-950 text-xs sm:text-sm"
              >
                {supabaseNotice}
              </div>
            </div>
          )}

          {/* Non-blocking Live Toast Notification Banner */}
          {toastBanner && (
            <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%]">
              <div className="bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center justify-between gap-3">
                <span>{toastBanner}</span>
                <button
                  type="button"
                  onClick={() => setToastBanner(null)}
                  className="text-slate-400 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  {t('إغلاق', 'Dismiss')}
                </button>
              </div>
            </div>
          )}

          {/* Main Application Workspace */}
          <main className="flex-1">
            {(cloudDiag.status === 'token_service_disabled' ||
              cloudDiag.status === 'offline_retrying') &&
              !diagDismissed && (
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3">
                  <div
                    role="status"
                    className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs sm:text-sm">
                        <p className="font-semibold text-amber-950">
                          {cloudDiag.status === 'token_service_disabled'
                            ? t(
                                'تصفح الخريطة والوحدات يعمل بكامل كفاءته — خدمة رموز المصادقة السحابية قيد التفعيل',
                                'Map & unit browsing are fully active — Cloud Token Service API is disabled or propagating'
                              )
                            : t(
                                'الاتصال السحابي في وضع التصفح المرن — جاري انتظار استقرار الشبكة',
                                'Cloud sync is operating in resilient mode — waiting for network stability'
                              )}
                        </p>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          {cloudDiag.status === 'token_service_disabled' ? (
                            <>
                              {t(
                                'لاستكمال تسجيل الدخول وإدارة العقود في المشروع رقم ',
                                'To enable sign-in and contracts on Google Cloud project '
                              )}
                              <span className="font-mono tabular-nums font-semibold">
                                {FIREBASE_PROJECT_NUMBER}
                              </span>
                              {t(
                                '، تأكد من تفعيل خدمة Token Service API (securetoken.googleapis.com) ثم اضغط «إعادة فحص الاتصال» بعد بضع دقائق من الانتشار.',
                                ', ensure Token Service API (securetoken.googleapis.com) is enabled, then click Retry Connection once propagated.'
                              )}
                            </>
                          ) : (
                            t(
                              'يمكنك الاستمرار في استكشاف جميع المحافظات والفلاتر والجولات الافتراضية دون انقطاع، ثم إعادة فحص الاتصال في أي وقت.',
                              'You can continue exploring all governorates, filters, and 360° virtual tours uninterrupted, and retry connection anytime.'
                            )
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {cloudDiag.status === 'token_service_disabled' && (
                        <button
                          type="button"
                          onClick={() => void handleCopyActivationUrl()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          {copiedConsoleUrl ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          )}
                          <span>
                            {copiedConsoleUrl
                              ? t('تم نسخ رابط التفعيل', 'Activation URL Copied')
                              : t('نسخ رابط التفعيل السحابي', 'Copy Cloud API URL')}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={retryingConnection}
                        onClick={() => void handleRetryCloudConnection()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 shrink-0 ${
                            retryingConnection ? 'animate-spin' : ''
                          }`}
                        />
                        <span>
                          {retryingConnection
                            ? t('جاري الفحص...', 'Checking...')
                            : t('إعادة فحص الاتصال', 'Retry Connection')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDiagDismissed(true)}
                        className="px-3 py-2 text-xs font-semibold text-amber-800 hover:text-amber-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        {t('إخفاء', 'Dismiss')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            {/* Live Account Restriction Banner (When Admin Bans Current User) */}
            {myBanRecord && !isAdmin && (
              <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3">
                <div
                  role="alert"
                  className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-950 flex items-start gap-3"
                >
                  <Ban className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs sm:text-sm">
                    <p className="font-bold text-rose-950">
                      {t(
                        'تم تقييد صلاحيات هذا الحساب بقرار من إدارة الموقع',
                        'This account has been restricted by the Site Owner'
                      )}
                    </p>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      {t('السبب المسجل:', 'Reason:')} {myBanRecord.reason} —{' '}
                      {t(
                        'تم إيقاف نشر الإعلانات الجديدة وإرسال طلبات الحجز وإخفاء الإعلانات المرتبطة بالحساب.',
                        'Publishing new listings and submitting booking requests are disabled.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Site-Owner Broadcast, Promo Discount & Master Switch Banner */}
            {activeTab !== 'admin' &&
              (platformSettings.announcementText.trim() !== '' ||
                platformSettings.tenantDiscountPct > 0 ||
                !platformSettings.allowNewListings ||
                !platformSettings.allowNewBookings) && (
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3">
                  <div className="bg-blue-50/90 border border-blue-200 rounded-xl px-4 py-3 text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-2.5 text-xs sm:text-sm">
                      <Megaphone className="w-4 h-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {platformSettings.announcementText.trim() !== '' && (
                          <span className="font-semibold text-slate-900">
                            {platformSettings.announcementText.trim()}
                          </span>
                        )}
                        {platformSettings.announcementText.trim() !== '' &&
                          platformSettings.tenantDiscountPct > 0 && (
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                          )}
                        {platformSettings.tenantDiscountPct > 0 && (
                          <span className="text-emerald-800 font-semibold">
                            {t('خصم مباشر للمستأجرين:', 'Live Tenant Discount:')}{' '}
                            <span className="font-mono tabular-nums font-bold">
                              {formatNumber(platformSettings.tenantDiscountPct)}%
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {(!platformSettings.allowNewListings || !platformSettings.allowNewBookings) && (
                      <div className="text-xs font-medium text-amber-900 shrink-0">
                        {!platformSettings.allowNewListings && !platformSettings.allowNewBookings
                          ? t(
                              'الإعلانات والحجوزات الجديدة متوقفة مؤقتاً للصيانة الإدارية',
                              'New listings & bookings are temporarily paused by Admin'
                            )
                          : !platformSettings.allowNewListings
                            ? t(
                                'استقبال الإعلانات الجديدة متوقف مؤقتاً',
                                'New listings temporarily paused'
                              )
                            : t(
                                'طلبات الحجز الجديدة متوقفة مؤقتاً',
                                'New bookings temporarily paused'
                              )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            {activeTab === 'explore' && (
              <EgyptMapExplorer
                apartments={mergedExploreApartments}
                reviews={mergedReviews}
                completedDemandSignals={completedDemandSignals}
                commissionRatePct={commissionRatePct}
                platformSettings={platformSettings}
                favoriteApartmentIds={favoriteApartmentIds}
                priceAlertApartmentIds={priceAlertApartmentIds}
                togglingFavoriteId={togglingFavoriteId}
                lastRefreshedAtMs={lastRefreshedAtMs}
                onRefreshData={handleRefreshExploreData}
                onToggleFavorite={handleToggleFavorite}
                onTogglePriceAlert={handleTogglePriceAlert}
                onSelectApartment={(apt) => setSelectedApartment(apt)}
                onRentApartment={(apt) => {
                  setActiveCheckoutRequest(null);
                  setCheckoutApartment(apt);
                }}
                onOpenListingWizard={() => setActiveTab('list_unit')}
              />
            )}

            {activeTab === 'list_unit' && (
              <ListApartmentWizard
                currentUser={effectiveUser}
                commissionRatePct={commissionRatePct}
                platformSettings={platformSettings}
                banRecord={myBanRecord}
                onRequestSignIn={handleSignIn}
                onSuccess={() => {
                  setActiveTab('my_contracts');
                  showToast(
                    t(
                      'تم إرسال الوحدة وملف الملكية للمراجعة بنجاح',
                      'Unit & legal dossier submitted successfully'
                    )
                  );
                }}
              />
            )}

            {activeTab === 'my_contracts' && (
              <MyContractsView
                currentUser={effectiveUser}
                commissionRatePct={commissionRatePct}
                platformSettings={platformSettings}
                myNotifications={myNotifications}
                myTenantRequests={myTenantRequests}
                myLandlordRequests={myLandlordRequests}
                myTenantVerification={myTenantVerification}
                myApartments={myDbApartments}
                myTenantBookings={myTenantBookings}
                myLandlordBookings={myLandlordBookings}
                myFavorites={myFavorites}
                myChatThreads={myChatThreads}
                priceAlertApartmentIds={priceAlertApartmentIds}
                availableApartments={mergedExploreApartments}
                allReviews={mergedReviews}
                togglingFavoriteId={togglingFavoriteId}
                onRequestSignIn={handleSignIn}
                onOpenListingWizard={() => setActiveTab('list_unit')}
                onExploreMap={() => setActiveTab('explore')}
                onOpenReviewModal={(booking) => setReviewModalBooking(booking)}
                onRemoveFavorite={handleRemoveFavoriteById}
                onTogglePriceAlert={handleTogglePriceAlert}
                onSelectApartment={(apt) => setSelectedApartment(apt)}
                onRentApartment={(apt, req) => {
                  setActiveCheckoutRequest(req || null);
                  setCheckoutApartment(apt);
                }}
                onOpenChatForApartment={(apt) => {
                  if (!isBlueVerified) {
                    showToast(
                      t(
                        'عفواً، يجب توثيق هويتك بالعلامة الزرقاء أولاً للتواصل مع الملاك.',
                        'You must be verified with the Blue Badge to contact landlords.'
                      )
                    );
                    setActiveTab('kyc');
                    return;
                  }
                  setChatModalTarget({ apartment: apt, thread: null });
                }}
                onOpenChatThread={(thread) => {
                  if (!isBlueVerified) {
                    showToast(
                      t(
                        'عفواً، يجب توثيق هويتك بالعلامة الزرقاء أولاً للتواصل مع الملاك.',
                        'You must be verified with the Blue Badge to contact landlords.'
                      )
                    );
                    setActiveTab('kyc');
                    return;
                  }
                  const matchedApt =
                    mergedExploreApartments.find((a) => a.id === thread.apartmentId) ||
                    SHOWCASE_APARTMENTS.find((a) => a.id === thread.apartmentId) ||
                    null;
                  setChatModalTarget({ apartment: matchedApt, thread });
                }}
              />
            )}

            {activeTab === 'admin' && (
              <PlatformAdminConsole
                currentUser={effectiveUser}
                platformSettings={platformSettings}
                allApartments={allAdminApartments}
                allBookings={allAdminBookings}
                allRentalRequests={allAdminRentalRequests}
                allReviews={allAdminReviews.length > 0 ? allAdminReviews : mergedReviews}
                allTenantVerifications={allAdminTenantVerifications}
                allBannedUsers={allAdminBannedUsers}
                allAdminActivityLogs={allAdminActivityLogs}
                allChatThreads={allAdminChatThreads}
                onRequestSignIn={handleSignIn}
                onSwitchAccount={handleSwitchAccount}
              />
            )}

            {activeTab === 'kyc' && (
              <KycVerificationPage
                currentUserUid={currentUser?.uid || userAccountData?.uid || null}
                currentUserDisplayName={userAccountData?.displayName || currentUser?.displayName || null}
                existingData={myKycData}
                onComplete={async (data) => {
                  setMyKycData(data);
                  const activeUid = currentUser?.uid || userAccountData?.uid;
                  if (activeUid) {
                    try {
                      await setDoc(doc(db, 'tenantVerifications', activeUid), {
                        userId: activeUid,
                        tenantDisplayName: data.fullName || userAccountData?.displayName || 'مستأجر',
                        tenantCategory: 'family',
                        verificationStatus: 'pending_review',
                        reviewNote: 'طلب توثيق هوية عبر الكاميرا والبطاقة (في انتظار اعتماد العلامة الزرقاء)',
                        nationalId: data.nationalId,
                        phone: data.phone,
                        facialMatchScore: data.facialMatchScore,
                        submittedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                      }, { merge: true });
                    } catch (dbErr) {
                      console.warn('Could not save KYC to Firestore:', dbErr);
                    }
                  }
                  showToast(
                    t(
                      'تم إرسال طلب التوثيق بنجاح! في انتظار اعتماد الإدارة لمنحك العلامة الزرقاء.',
                      'Verification submitted! Awaiting admin review for the Blue Badge.'
                    )
                  );
                }}
                onBack={() => setActiveTab('explore')}
              />
            )}

            {selectedProfileUser && (
              <PublicProfilePage
                user={selectedProfileUser}
                reviews={mergedReviews}
                apartments={mergedExploreApartments}
                isBlueVerified={
                  selectedProfileUser.uid === (currentUser?.uid || userAccountData?.uid)
                    ? isBlueVerified
                    : Boolean(('isVerified' in selectedProfileUser && selectedProfileUser.isVerified) || (selectedProfileUser as UserAccountData).isTenantVerified || (selectedProfileUser as UserAccountData).isLandlordVerified)
                }
                onClose={() => setSelectedProfileUser(null)}
                onContactUser={() => {
                  if (!isBlueVerified) {
                    showToast(
                      t(
                        'عفواً، يجب توثيق هويتك بالعلامة الزرقاء أولاً للتواصل مع المستخدمين.',
                        'You must be verified with the Blue Badge to contact users.'
                      )
                    );
                    setSelectedProfileUser(null);
                    setActiveTab('kyc');
                    return;
                  }
                  const userApt = mergedExploreApartments.find((a) => a.ownerId === selectedProfileUser.uid) || SHOWCASE_APARTMENTS[0];
                  setSelectedProfileUser(null);
                  setChatModalTarget({ apartment: userApt, thread: null });
                }}
                onSelectApartment={(apt) => {
                  setSelectedProfileUser(null);
                  setSelectedApartment(apt);
                }}
              />
            )}
          </main>

          {/* Architectural Footer */}
          <footer className="bg-white border-t border-slate-200 py-6">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{t('منصة إيجار', 'Ejar Platform')}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {t(
                    'منصة عقارية موثقة الملكية والهوية في جميع محافظات مصر الـ 27',
                    'Verified real-estate escrow platform across all 27 Egyptian governorates'
                  )}
                </span>
              </div>
              <div className="font-mono tabular-nums text-slate-500">
                {t(
                  `عمولة الوساطة حسب التصنيف: شقق ${formatNumber(platformSettings.familyApartmentCommissionPct)}% · منازل كاملة ${formatNumber(platformSettings.wholeHouseCommissionPct)}% · فندقي ${formatNumber(platformSettings.hotelRoomCommissionPct)}% · مصانع ${formatNumber(platformSettings.industrialFactoryCommissionPct)}% · طلاب ${formatNumber(platformSettings.studentHousingCommissionPct)}%`,
                  `Commission by sector: Flats ${formatNumber(platformSettings.familyApartmentCommissionPct)}% · Houses ${formatNumber(platformSettings.wholeHouseCommissionPct)}% · Hotel ${formatNumber(platformSettings.hotelRoomCommissionPct)}% · Factories ${formatNumber(platformSettings.industrialFactoryCommissionPct)}% · Student ${formatNumber(platformSettings.studentHousingCommissionPct)}%`
                )}
              </div>
            </div>
          </footer>

          {/* Mobile Sticky Bottom Tab Navigation */}
          <nav
            aria-label={t('تنقل الجوال', 'Mobile Navigation')}
            className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 h-16"
          >
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                activeTab === 'explore' ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <MapIcon className="w-4 h-4" />
              <span>{t('الخريطة', 'Explore')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list_unit')}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                activeTab === 'list_unit' ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('اعرض وحدتك', 'List Unit')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('my_contracts')}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                activeTab === 'my_contracts' ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span className="whitespace-nowrap">
                {t('عقودي', 'Contracts')}
                {unreadNotificationsCount > 0 ? (
                  <span className="font-mono tabular-nums font-bold text-blue-700">
                    {' '}
                    ({formatNumber(unreadNotificationsCount)})
                  </span>
                ) : null}
              </span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  activeTab === 'admin' ? 'text-blue-700' : 'text-slate-500'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{t('لوحة الأدمن', 'Admin')}</span>
              </button>
            )}
          </nav>

          {/* Apartment Detail Modal (with 360° Tour & Price Alert Toggle) */}
          <ApartmentDetailModal
            apartment={selectedApartment}
            currentUserUid={currentUser?.uid || userAccountData?.uid || null}
            commissionRatePct={commissionRatePct}
            platformSettings={platformSettings}
            reviews={mergedReviews}
            myTenantBookings={myTenantBookings}
            tenantWallet={wallet}
            onOpenWallet={() => {
              if (!isBlueVerified) {
                showToast(
                  t(
                    'عفواً، لا يمكنك شحن المحفظة إلا بعد توثيق حسابك بالعلامة الزرقاء.',
                    'You must be verified with the Blue Badge to deposit or top up your wallet.'
                  )
                );
                setSelectedApartment(null);
                setActiveTab('kyc');
                return;
              }
              setIsWalletModalOpen(true);
            }}
            isFavorite={
              selectedApartment ? favoriteApartmentIds.has(selectedApartment.id) : false
            }
            isPriceAlertEnabled={
              selectedApartment ? priceAlertApartmentIds.has(selectedApartment.id) : false
            }
            togglingFavorite={
              selectedApartment ? togglingFavoriteId === selectedApartment.id : false
            }
            onToggleFavorite={handleToggleFavorite}
            onTogglePriceAlert={handleTogglePriceAlert}
            onClose={() => setSelectedApartment(null)}
            onProceedToRent={(apt) => {
              setSelectedApartment(null);
              setActiveCheckoutRequest(null);
              setCheckoutApartment(apt);
            }}
            onOpenChat={(apt) => {
              if (!isBlueVerified) {
                showToast(
                  t(
                    'عفواً، يجب توثيق هويتك بالعلامة الزرقاء أولاً للتواصل مع الملاك.',
                    'You must be verified with the Blue Badge to contact landlords.'
                  )
                );
                setSelectedApartment(null);
                setActiveTab('kyc');
                return;
              }
              setSelectedApartment(null);
              setChatModalTarget({ apartment: apt, thread: null });
            }}
            onOpenReviewForBooking={(booking) => {
              setSelectedApartment(null);
              setReviewModalBooking(booking);
            }}
            onViewLandlordProfile={(ownerUid, ownerDisplayName) => {
              setSelectedApartment(null);
              setSelectedProfileUser({
                uid: ownerUid,
                displayName: ownerDisplayName,
                role: 'landlord',
                isVerified: true,
              });
            }}
          />

          {/* Escrow Checkout & Multi-Currency Modal */}
          <EscrowCheckoutModal
            apartment={checkoutApartment}
            activeRentalRequest={activeCheckoutRequest}
            commissionRatePct={commissionRatePct}
            platformSettings={platformSettings}
            banRecord={myBanRecord}
            currentUser={effectiveUser}
            tenantWallet={wallet}
            onDeductWallet={handleWalletDeduct}
            onRequestSignIn={async () => setIsAuthModalOpen(true)}
            onClose={() => {
              setCheckoutApartment(null);
              setActiveCheckoutRequest(null);
            }}
            onApartmentRentedAndDeleted={(aptId) => {
              setRentedDeletedIds((prev) => new Set(prev).add(aptId));
            }}
            onBookingCompleted={() => {
              setCheckoutApartment(null);
              setActiveCheckoutRequest(null);
              setActiveTab('my_contracts');
            }}
            onRentalRequestSubmitted={() => {
              setCheckoutApartment(null);
              setActiveCheckoutRequest(null);
              setActiveTab('my_contracts');
              showToast(
                t(
                  'تم تسجيل طلب الإيجار وتفعيل إشعارات الحالة في لوحة عقودي',
                  'Rental request created with live notifications in My Contracts'
                )
              );
            }}
          />

          {/* Privacy-Gated Tenant & Landlord Chat Modal */}
          <TenantLandlordChatModal
            isOpen={Boolean(chatModalTarget)}
            apartment={chatModalTarget?.apartment || null}
            initialThread={chatModalTarget?.thread || null}
            currentUser={effectiveUser}
            platformSettings={platformSettings}
            banRecord={myBanRecord}
            tenantWallet={wallet}
            onOpenWallet={() => {
              if (!isBlueVerified) {
                showToast(
                  t(
                    'عفواً، لا يمكنك شحن المحفظة إلا بعد توثيق حسابك بالعلامة الزرقاء.',
                    'You must be verified with the Blue Badge to deposit or top up your wallet.'
                  )
                );
                setActiveTab('kyc');
                return;
              }
              setIsWalletModalOpen(true);
            }}
            onRequestSignIn={async () => setIsAuthModalOpen(true)}
            onClose={() => setChatModalTarget(null)}
            onProceedToFullEscrow={(apt) => {
              setChatModalTarget(null);
              setActiveCheckoutRequest(null);
              setCheckoutApartment(apt);
            }}
          />

          {/* Verified Tenant Post-Rental Review Modal */}
          <TenantReviewModal
            booking={reviewModalBooking}
            existingReview={existingReviewForModal}
            currentUser={effectiveUser}
            onClose={() => setReviewModalBooking(null)}
            onSubmitted={() => {
              setReviewModalBooking(null);
              showToast(
                t(
                  'شكراً لك — تم نشر تقييمك الموثق بنجاح',
                  'Thank you — your verified review has been published'
                )
              );
            }}
          />

          {/* 1. Auth Modal: Login & Registration with Role Selection (Landlord / Tenant) */}
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onSuccess={(data) => {
              setUserAccountData(data);
              showToast(
                t(
                  `مرحباً بك يا ${data.displayName} — تم الدخول بنجاح كـ (${data.role === 'landlord' ? 'مالك عقار' : 'مستأجر'})`,
                  `Welcome ${data.displayName} — Signed in as (${data.role === 'landlord' ? 'Landlord' : 'Tenant'})`
                )
              );
            }}
            onGoogleSignIn={handleSignIn}
          />

          {/* 2. User Profile & Dashboard Modal */}
          <UserProfileModal
            isOpen={isProfileModalOpen}
            userData={
              userAccountData ||
              (currentUser
                ? {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'مستخدم إيجار',
                    email: currentUser.email || 'user@example.com',
                    phone: '01012345678',
                    role: myLandlordVerification?.status === 'verified' ? 'landlord' : 'tenant',
                    photoUrl: currentUser.photoURL || undefined,
                    isLandlordVerified: myLandlordVerification?.status === 'verified',
                    isTenantVerified: isBlueVerified,
                    createdAtMs: Date.now(),
                  }
                : null)
            }
            wallet={wallet}
            landlordVerification={myLandlordVerification}
            isBlueVerified={isBlueVerified}
            onClose={() => setIsProfileModalOpen(false)}
            onDepositWallet={handleWalletDeposit}
            onApproveDeposit={handleApproveDeposit}
            onSignOut={handleSignOut}
            onUpdateUserData={(updated) => {
              setUserAccountData(updated);
            }}
            onOpenFullKycPage={() => {
              setIsProfileModalOpen(false);
              setActiveTab('kyc');
            }}
            onOpenPublicProfile={() => {
              setIsProfileModalOpen(false);
              setSelectedProfileUser(
                userAccountData || {
                  uid: currentUser?.uid || 'me',
                  displayName: currentUser?.displayName || 'مستخدم مفتاح مصر',
                  email: currentUser?.email || '',
                  phone: '01012345678',
                  role: 'tenant',
                  isVerified: isBlueVerified,
                  createdAtMs: Date.now(),
                }
              );
            }}
          />

          {/* 3. Tenant Verification Modal (Fast & Smooth KYC) */}
          <TenantVerificationModal
            isOpen={isTenantVerificationModalOpen}
            currentUserUid={currentUser?.uid || userAccountData?.uid || null}
            currentUserDisplayName={userAccountData?.displayName || currentUser?.displayName || null}
            existingData={myTenantVerificationData}
            onClose={() => setIsTenantVerificationModalOpen(false)}
            onComplete={async (data) => {
              setMyTenantVerificationData(data);
              if (userAccountData) {
                const nextUser = { ...userAccountData, isTenantVerified: true };
                setUserAccountData(nextUser);
              }
              showToast(t('تم توثيق حسابك كمستأجر بنجاح!', 'Tenant verified successfully!'));
            }}
          />

          {/* 4. Landlord Advanced KYC Modal (Biometric Facial Liveness & Deed) */}
          <LandlordKycModal
            isOpen={isLandlordKycModalOpen}
            currentUserUid={currentUser?.uid || userAccountData?.uid || null}
            currentUserDisplayName={userAccountData?.displayName || currentUser?.displayName || null}
            existingVerification={myLandlordVerification}
            onClose={() => setIsLandlordKycModalOpen(false)}
            onCompleteVerification={handleCompleteLandlordKyc}
          />

          {/* 5. User Financial Wallet Modal (Balance, Escrow & Transaction History) */}
          <TenantWalletModal
            isOpen={isWalletModalOpen}
            wallet={wallet}
            currentUserUid={currentUser?.uid || userAccountData?.uid || null}
            currentUserDisplayName={userAccountData?.displayName || currentUser?.displayName || null}
            onClose={() => setIsWalletModalOpen(false)}
            onDeposit={handleWalletDeposit}
            onApproveDeposit={handleApproveDeposit}
          />
        </div>
      </APIProvider>
    </FirestoreErrorBoundary>
  );
}

export default App;
