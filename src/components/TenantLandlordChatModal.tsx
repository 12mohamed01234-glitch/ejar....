import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  X,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  Phone,
  Send,
  Copy,
  Check,
  CreditCard,
  Building,
  Smartphone,
  Receipt,
  Ban,
  AlertTriangle,
  MessageSquareLock,
  CheckCircle2,
  ArrowRight,
  Wallet,
} from 'lucide-react';
import {
  db,
  logFirestoreDiagnostic,
  OperationType,
  PLATFORM_ADMIN_EMAIL,
} from '../lib/firebase';
import {
  ApartmentRecord,
  BannedUserRecord,
  ChatMessageRecord,
  ChatThreadRecord,
  ContactBypassDetectionResult,
  PaymentMethodType,
  PlatformSettingsRecord,
  SHOWCASE_APARTMENTS,
  TenantWalletRecord,
  VALIDATION_LIMITS,
  buildChatMessageId,
  buildChatThreadId,
  buildNotificationId,
  computeOneTimeCommission,
  detectContactBypassAttempt,
  formatEgp,
  getCategoryCommissionPct,
  normalizeArabicDigits,
  normalizeChatMessageRecord,
  normalizeChatThreadRecord,
  normalizeNumericInput,
  resolveChatBaseUnitPriceEgp,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';

interface TenantLandlordChatModalProps {
  isOpen: boolean;
  apartment: ApartmentRecord | null;
  initialThread?: ChatThreadRecord | null;
  currentUser: User | null;
  platformSettings?: PlatformSettingsRecord;
  banRecord?: BannedUserRecord | null;
  tenantWallet?: TenantWalletRecord | null;
  onOpenWallet?: () => void;
  onTriggerAccountBan?: (uid: string, reason: string, evidence: string) => Promise<void>;
  onRequestSignIn: () => Promise<void>;
  onClose: () => void;
  onProceedToFullEscrow?: (apt: ApartmentRecord) => void;
}

const MAX_VIOLATION_STRIKES = 3;

export const TenantLandlordChatModal: React.FC<TenantLandlordChatModalProps> = ({
  isOpen,
  apartment,
  initialThread = null,
  currentUser,
  platformSettings,
  banRecord = null,
  tenantWallet = null,
  onOpenWallet,
  onTriggerAccountBan,
  onRequestSignIn,
  onClose,
  onProceedToFullEscrow,
}) => {
  const { lang, t, formatNumber, formatTimeAgo, govLabel, categorySingularLabel } = useI18n();

  const [thread, setThread] = useState<ChatThreadRecord | null>(initialThread);
  const [threadExistsInDb, setThreadExistsInDb] = useState<boolean>(Boolean(initialThread));
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [tenantPhone, setTenantPhone] = useState<string | null>(null);
  const [landlordPhone, setLandlordPhone] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ban Warning Modal State (triggered on blocked phone/contact attempt)
  const [banWarningModal, setBanWarningModal] = useState<{
    result: ContactBypassDetectionResult;
    strikesAfter: number;
    isAccountFlagged: boolean;
  } | null>(null);

  // Commission Unlock Checkout Panel State
  const [showCommissionCheckout, setShowCommissionCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('card_meeza');
  const [payerPhoneInput, setPayerPhoneInput] = useState('01098765432');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('849201');
  const [payingCommission, setPayingCommission] = useState(false);

  // Self phone save (when unlocked and missing own phone)
  const [myPhoneDraft, setMyPhoneDraft] = useState('');
  const [savingMyPhone, setSavingMyPhone] = useState(false);
  const [copiedPhoneRole, setCopiedPhoneRole] = useState<'tenant' | 'landlord' | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeApartmentId = initialThread?.apartmentId || apartment?.id || '';
  const activeThreadId = useMemo(() => {
    if (initialThread?.id) return initialThread.id;
    if (currentUser && activeApartmentId) {
      return buildChatThreadId(currentUser.uid, activeApartmentId);
    }
    return '';
  }, [initialThread?.id, currentUser, activeApartmentId]);

  const isAdmin = Boolean(currentUser?.email === PLATFORM_ADMIN_EMAIL);
  const isBanned = Boolean(banRecord && !isAdmin);

  const computedMeta = useMemo(() => {
    if (thread) {
      return {
        apartmentId: thread.apartmentId,
        apartmentTitle: thread.apartmentTitle,
        category: thread.category,
        governorate: thread.governorate,
        district: thread.district,
        baseUnitPriceEgp: thread.baseUnitPriceEgp,
        commissionRatePct: thread.commissionRatePct,
        commissionAmountEgp: thread.commissionAmountEgp,
        landlordId: thread.landlordId,
        landlordDisplayName: thread.landlordDisplayName,
      };
    }
    if (apartment) {
      const baseUnitPriceEgp = resolveChatBaseUnitPriceEgp(apartment);
      const commissionRatePct = getCategoryCommissionPct(
        apartment.category,
        platformSettings ?? { commissionRatePct: apartment.commissionRatePct || 10 }
      );
      const commissionAmountEgp = computeOneTimeCommission(baseUnitPriceEgp, commissionRatePct);
      return {
        apartmentId: apartment.id,
        apartmentTitle: apartment.title,
        category: apartment.category,
        governorate: apartment.governorate,
        district: apartment.district,
        baseUnitPriceEgp,
        commissionRatePct,
        commissionAmountEgp,
        landlordId: apartment.ownerId,
        landlordDisplayName: apartment.ownerDisplayName,
      };
    }
    return null;
  }, [thread, apartment, platformSettings]);

  const myRole: 'tenant' | 'landlord' | 'admin' = useMemo(() => {
    if (!currentUser || !computedMeta) return 'tenant';
    if (thread) {
      if (currentUser.uid === thread.landlordId) return 'landlord';
      if (currentUser.uid === thread.tenantId) return 'tenant';
      if (isAdmin) return 'admin';
      return 'tenant';
    }
    if (currentUser.uid === computedMeta.landlordId) return 'landlord';
    return 'tenant';
  }, [currentUser, computedMeta, thread, isAdmin]);

  // Reset transient state when opening a different thread/unit
  useEffect(() => {
    if (!isOpen) return;
    setThread(initialThread || null);
    setThreadExistsInDb(Boolean(initialThread));
    setMessages([]);
    setTenantPhone(null);
    setLandlordPhone(null);
    setDraft('');
    setErrorMsg(null);
    setBanWarningModal(null);
    setShowCommissionCheckout(false);
    setOtpStep(false);
  }, [isOpen, activeThreadId, initialThread]);

  // Pre-fill Tenant phone from private KYC if available
  useEffect(() => {
    if (!isOpen || !currentUser || myRole !== 'tenant') return;
    let active = true;
    void getDoc(doc(db, 'tenantVerifications', currentUser.uid, 'privateDocs', 'kyc'))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const kycPhone = String(snap.data().tenantPhone || '').trim();
        if (VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(kycPhone)) {
          setPayerPhoneInput(kycPhone);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isOpen, currentUser, myRole]);

  // Subscribe to Thread document
  useEffect(() => {
    if (!isOpen || !currentUser || !activeThreadId) return;
    const unsub = onSnapshot(
      doc(db, 'chatThreads', activeThreadId),
      (snap) => {
        if (!snap.exists()) {
          setThread(initialThread || null);
          setThreadExistsInDb(false);
          return;
        }
        setThreadExistsInDb(true);
        setThread(normalizeChatThreadRecord(snap.data() as Record<string, unknown>, snap.id));
      },
      (err) => {
        logFirestoreDiagnostic(err, OperationType.GET, `chatThreads/${activeThreadId}`);
      }
    );
    return () => unsub();
  }, [isOpen, currentUser, activeThreadId, initialThread]);

  // Subscribe to Messages subcollection when thread exists in Firestore
  useEffect(() => {
    if (!isOpen || !currentUser || !activeThreadId || !threadExistsInDb) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'chatThreads', activeThreadId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) =>
            normalizeChatMessageRecord(d.data() as Record<string, unknown>, d.id)
          )
        );
      },
      (err) => {
        logFirestoreDiagnostic(err, OperationType.LIST, `chatThreads/${activeThreadId}/messages`);
      }
    );
    return () => unsub();
  }, [isOpen, currentUser, activeThreadId, threadExistsInDb]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isOpen]);

  // Contact Exchange Phone Loading (Strictly Gated on commissionPaid == true for counterparty!)
  useEffect(() => {
    if (!isOpen || !currentUser || !activeThreadId || !threadExistsInDb || !thread) return;
    let active = true;

    const loadPhones = async () => {
      const canReadTenant =
        thread.commissionPaid || currentUser.uid === thread.tenantId || isAdmin;
      const canReadLandlord =
        thread.commissionPaid || currentUser.uid === thread.landlordId || isAdmin;

      if (canReadTenant) {
        try {
          const tSnap = await getDoc(
            doc(db, 'chatThreads', activeThreadId, 'contactExchange', 'tenant')
          );
          if (active && tSnap.exists()) {
            setTenantPhone(String(tSnap.data().phoneNumber || ''));
          }
        } catch {
          // Expected permission gate before commission payment
        }
      }

      if (canReadLandlord) {
        try {
          const lSnap = await getDoc(
            doc(db, 'chatThreads', activeThreadId, 'contactExchange', 'landlord')
          );
          if (active && lSnap.exists()) {
            setLandlordPhone(String(lSnap.data().phoneNumber || ''));
          } else if (
            active &&
            currentUser.uid === thread.landlordId &&
            thread.landlordId !== 'showcase_owner'
          ) {
            // Auto-sync landlord's verified phone from their legal dossier if available
            const dossierSnap = await getDoc(
              doc(db, 'apartments', thread.apartmentId, 'legalDocs', 'dossier')
            ).catch(() => null);
            if (active && dossierSnap?.exists()) {
              const ownerPhone = String(dossierSnap.data().ownerPhone || '').trim();
              if (VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(ownerPhone)) {
                await setDoc(
                  doc(db, 'chatThreads', activeThreadId, 'contactExchange', 'landlord'),
                  {
                    threadId: activeThreadId,
                    tenantId: thread.tenantId,
                    landlordId: thread.landlordId,
                    userId: currentUser.uid,
                    role: 'landlord',
                    phoneNumber: ownerPhone,
                    updatedAt: serverTimestamp(),
                  }
                ).catch(() => undefined);
                if (active) setLandlordPhone(ownerPhone);
              }
            }
          }
        } catch {
          // Expected permission gate before commission payment
        }
      }
    };

    void loadPhones();
    return () => {
      active = false;
    };
  }, [
    isOpen,
    currentUser,
    activeThreadId,
    threadExistsInDb,
    thread?.commissionPaid,
    thread?.tenantId,
    thread?.landlordId,
    thread?.apartmentId,
    isAdmin,
  ]);

  const isUnlocked = Boolean(thread?.commissionPaid);
  const isFlaggedLocked = thread?.status === 'flagged_violation' && !isAdmin;
  const myViolationCount =
    myRole === 'landlord'
      ? thread?.landlordViolationCount ?? 0
      : thread?.tenantViolationCount ?? 0;

  const liveDraftCheck = useMemo(() => {
    if (isUnlocked || !draft.trim()) return null;
    const res = detectContactBypassAttempt(draft);
    return res.blocked ? res : null;
  }, [draft, isUnlocked]);

  if (!isOpen || !computedMeta) return null;

  const isOwnListingAsNonAdmin =
    Boolean(currentUser) &&
    !isAdmin &&
    !threadExistsInDb &&
    currentUser?.uid === computedMeta.landlordId;

  const ensureThreadDocument = async (initialPreview = 'تم فتح قناة المحادثة المحمية'): Promise<ChatThreadRecord | null> => {
    if (!currentUser || !activeThreadId || !computedMeta) return null;
    if (threadExistsInDb && thread) return thread;

    // Resolve authoritative landlordId from Firestore if apartment exists
    let resolvedLandlordId = computedMeta.landlordId || 'showcase_owner';
    let resolvedBasePrice = computedMeta.baseUnitPriceEgp;
    let resolvedCategory = computedMeta.category;
    let resolvedRatePct = computedMeta.commissionRatePct;

    try {
      const aptSnap = await getDoc(doc(db, 'apartments', computedMeta.apartmentId));
      if (aptSnap.exists()) {
        const d = aptSnap.data();
        resolvedLandlordId = String(d.ownerId || resolvedLandlordId);
        resolvedCategory = (d.category as ApartmentRecord['category']) || resolvedCategory;
        resolvedRatePct = getCategoryCommissionPct(resolvedCategory, platformSettings);
        const candidates = [
          Number(d.monthlyRentEgp || 0),
          Number(d.dailyRateEgp || 0),
          Number(d.studentPricePerBedEgp || 0),
        ].filter((n) => n >= 300);
        if (!candidates.includes(resolvedBasePrice) && candidates.length > 0) {
          resolvedBasePrice = Math.round(candidates[0]);
        }
      } else {
        const isShowcase = SHOWCASE_APARTMENTS.some((s) => s.id === computedMeta.apartmentId);
        if (isShowcase) {
          resolvedLandlordId = 'showcase_owner';
        }
      }
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.GET, `apartments/${computedMeta.apartmentId}`);
    }

    const commissionAmountEgp = computeOneTimeCommission(resolvedBasePrice, resolvedRatePct);
    const tenantDisplayName =
      (currentUser.displayName?.trim() || 'مستأجر موثق').slice(0, 80).length >= 2
        ? (currentUser.displayName?.trim() || 'مستأجر موثق').slice(0, 80)
        : 'مستأجر موثق';
    const landlordDisplayName =
      (computedMeta.landlordDisplayName?.trim() || 'مالك عقار موثق').slice(0, 80).length >= 2
        ? (computedMeta.landlordDisplayName?.trim() || 'مالك عقار موثق').slice(0, 80)
        : 'مالك عقار موثق';
    const safeTitle =
      computedMeta.apartmentTitle.trim().slice(0, 120).length >= 2
        ? computedMeta.apartmentTitle.trim().slice(0, 120)
        : 'وحدة عقارية موثقة';
    const safeGov =
      computedMeta.governorate.trim().slice(0, 50).length >= 2
        ? computedMeta.governorate.trim().slice(0, 50)
        : 'القاهرة';
    const safeDistrict =
      computedMeta.district.trim().slice(0, 80).length >= 2
        ? computedMeta.district.trim().slice(0, 80)
        : safeGov;

    const batch = writeBatch(db);
    const threadRef = doc(db, 'chatThreads', activeThreadId);
    const welcomeMsgId = buildChatMessageId();
    const welcomeText =
      'أهلاً بك في المحادثة المحمية بالخصوصية. يُحظر تبادل أرقام الهواتف أو روابط التواصل قبل سداد نسبة الموقع — الدفع يفتح الشات ويُظهر رقم الهاتف الموثق للطرفين.';

    batch.set(threadRef, {
      apartmentId: computedMeta.apartmentId,
      apartmentTitle: safeTitle,
      category: resolvedCategory,
      governorate: safeGov,
      district: safeDistrict,
      baseUnitPriceEgp: resolvedBasePrice,
      commissionRatePct: resolvedRatePct,
      commissionAmountEgp,
      tenantId: currentUser.uid,
      tenantDisplayName,
      landlordId: resolvedLandlordId,
      landlordDisplayName,
      status: 'restricted_pre_payment',
      commissionPaid: false,
      tenantViolationCount: 0,
      landlordViolationCount: 0,
      lastMessagePreview: initialPreview.slice(0, 160),
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chatThreads', activeThreadId, 'messages', welcomeMsgId), {
      threadId: activeThreadId,
      tenantId: currentUser.uid,
      landlordId: resolvedLandlordId,
      senderId: currentUser.uid,
      senderRole: 'system',
      senderDisplayName: 'نظام حماية إيجار',
      body: welcomeText,
      isSystemNotice: true,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    const createdLocal: ChatThreadRecord = {
      id: activeThreadId,
      apartmentId: computedMeta.apartmentId,
      apartmentTitle: safeTitle,
      category: resolvedCategory,
      governorate: safeGov,
      district: safeDistrict,
      baseUnitPriceEgp: resolvedBasePrice,
      commissionRatePct: resolvedRatePct,
      commissionAmountEgp,
      tenantId: currentUser.uid,
      tenantDisplayName,
      landlordId: resolvedLandlordId,
      landlordDisplayName,
      status: 'restricted_pre_payment',
      commissionPaid: false,
      tenantViolationCount: 0,
      landlordViolationCount: 0,
      lastMessagePreview: initialPreview.slice(0, 160),
      lastMessageAtMs: Date.now(),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    setThread(createdLocal);
    setThreadExistsInDb(true);
    return createdLocal;
  };

  const handleSendMessage = async (e?: React.FormEvent, presetBody?: string) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!currentUser) {
      await onRequestSignIn();
      return;
    }
    if (isBanned) {
      setErrorMsg(
        t(
          `حسابك مقيد من المراسلة بقرار الإدارة: ${banRecord?.reason || ''}`,
          `Your account is restricted from messaging: ${banRecord?.reason || ''}`
        )
      );
      return;
    }
    if (isOwnListingAsNonAdmin) {
      setErrorMsg(
        t(
          'أنت مالك هذه الوحدة — يمكنك متابعة رسائل المستأجرين من تبويب «المحادثات الآمنة» في عقودي.',
          'You are the owner of this unit — reply to tenant threads from Safe Chats in My Contracts.'
        )
      );
      return;
    }
    if (isFlaggedLocked) {
      setErrorMsg(
        t(
          'تم إيقاف المحادثة مؤقتاً بسبب تكرار محاولات مشاركة أرقام التواصل قبل سداد نسبة الموقع.',
          'This chat is locked due to repeated contact-sharing violations before commission payment.'
        )
      );
      return;
    }

    const bodyText = (presetBody ?? draft).trim();
    if (!bodyText) return;

    // Check Wallet Deposit Balance for Tenants
    if (myRole === 'tenant' && !isAdmin) {
      const hasDeposit = (tenantWallet?.balanceEgp ?? 0) >= 500;
      if (!hasDeposit) {
        setErrorMsg(
          t(
            'يلزم شحن رصيد جدية الحجز (1000 ج.م أو 10%) في محفظتك للتواصل مع أصحاب العقارات — الرصيد يظل محفوظاً في محفظتك ولا يُخصم إلا عند تثبيت الحجز.',
            'A booking deposit balance (1000 EGP) is required to chat with landlords. It is only deducted upon final booking confirmation.'
          )
        );
        return;
      }
    }

    // 1. Strict Privacy & Anti-Bypass Check
    const check = detectContactBypassAttempt(bodyText);
    if (check.blocked) {
      const nextStrikes = myViolationCount + 1;
      const willBan = check.isDirectBypassViolation || nextStrikes >= 2;

      // Automated platform-wide account ban trigger
      if (willBan && onTriggerAccountBan) {
        await onTriggerAccountBan(
          currentUser.uid,
          `محاولة تجاوز المنصة ومشاركة بيانات تواصل خارجية (${check.reasonAr})`,
          bodyText.slice(0, 160)
        );
      }

      // Immediately alert user with Ban Warning Modal
      setBanWarningModal({
        result: check,
        strikesAfter: nextStrikes,
        isAccountFlagged: willBan,
      });

      // Persist violation strike to Firestore so Admin sees repeated offenders
      try {
        const activeThread = await ensureThreadDocument('محاولة مخالفة سياسة الخصوصية والتحايل (محجوبة)');
        if (activeThread) {
          const isTenantActor = currentUser.uid === activeThread.tenantId;
          const updatePayload: Record<string, unknown> = {
            lastViolationSenderId: currentUser.uid,
            lastViolationReason: check.reasonAr.slice(0, 200),
            lastViolationAt: serverTimestamp(),
            status: willBan ? 'flagged_violation' : activeThread.status,
            updatedAt: serverTimestamp(),
          };
          if (isTenantActor) {
            updatePayload.tenantViolationCount = activeThread.tenantViolationCount + 1;
            updatePayload.landlordViolationCount = activeThread.landlordViolationCount;
          } else {
            updatePayload.landlordViolationCount = activeThread.landlordViolationCount + 1;
            updatePayload.tenantViolationCount = activeThread.tenantViolationCount;
          }
          await updateDoc(doc(db, 'chatThreads', activeThread.id), updatePayload);
        }
      } catch (err) {
        logFirestoreDiagnostic(err, OperationType.UPDATE, `chatThreads/${activeThreadId}`);
      }
      return;
    }

    setSending(true);
    try {
      const activeThread = await ensureThreadDocument(bodyText.slice(0, 140));
      if (!activeThread) {
        setSending(false);
        return;
      }

      const senderRole: 'tenant' | 'landlord' =
        currentUser.uid === activeThread.landlordId ? 'landlord' : 'tenant';
      const senderDisplayName =
        (currentUser.displayName?.trim() ||
          (senderRole === 'landlord'
            ? activeThread.landlordDisplayName
            : activeThread.tenantDisplayName)).slice(0, 80);
      const safeSenderName = senderDisplayName.length >= 2 ? senderDisplayName : 'مستخدم إيجار';

      const msgId = buildChatMessageId();
      const batch = writeBatch(db);
      batch.set(doc(db, 'chatThreads', activeThread.id, 'messages', msgId), {
        threadId: activeThread.id,
        tenantId: activeThread.tenantId,
        landlordId: activeThread.landlordId,
        senderId: currentUser.uid,
        senderRole,
        senderDisplayName: safeSenderName,
        body: bodyText.slice(0, 1000),
        isSystemNotice: false,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'chatThreads', activeThread.id), {
        lastMessagePreview: bodyText.slice(0, 140),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      if (!presetBody) setDraft('');
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.CREATE, `chatThreads/${activeThreadId}/messages`);
      setErrorMsg(
        t(
          'تعذر إرسال الرسالة. تأكد من عدم تضمين أرقام هاتف قبل دفع نسبة الموقع ومن استقرار جلستك.',
          'Could not send message. Ensure no phone numbers are included prior to commission payment.'
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleProceedCommissionOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(payerPhoneInput.trim())) {
      setErrorMsg(
        t(
          'يرجى إدخال رقم موبايل مصري صحيح (11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015) لإظهاره للمالك بعد الدفع.',
          'Enter a valid 11-digit Egyptian mobile number (010/011/012/015) to share upon unlock.'
        )
      );
      return;
    }
    setOtpStep(true);
  };

  const handleConfirmCommissionUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!currentUser) {
      await onRequestSignIn();
      return;
    }
    if (otpCode.trim().length < 4) {
      setErrorMsg(
        t('يرجى إدخال رمز التحقق البنكي (OTP).', 'Please enter the 6-digit bank verification OTP.')
      );
      return;
    }

    setPayingCommission(true);
    try {
      const activeThread = await ensureThreadDocument('تم سداد نسبة الموقع وفتح الشات');
      if (!activeThread) {
        setPayingCommission(false);
        return;
      }

      const cleanPhone = payerPhoneInput.trim();
      const paymentRef = `CHAT-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

      const batch = writeBatch(db);
      batch.update(doc(db, 'chatThreads', activeThread.id), {
        status: 'unlocked',
        commissionPaid: true,
        commissionPaymentMethod: paymentMethod,
        commissionPaymentRef: paymentRef,
        commissionPaidByUid: currentUser.uid,
        commissionPaidAt: serverTimestamp(),
        lastMessagePreview: 'تم دفع نسبة الموقع — الشات مفتوح وأرقام الهاتف ظاهرة للطرفين',
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'chatThreads', activeThread.id, 'contactExchange', 'tenant'), {
        threadId: activeThread.id,
        tenantId: activeThread.tenantId,
        landlordId: activeThread.landlordId,
        userId: currentUser.uid,
        role: 'tenant',
        phoneNumber: cleanPhone,
        updatedAt: serverTimestamp(),
      });

      if (activeThread.landlordId === 'showcase_owner') {
        batch.set(doc(db, 'chatThreads', activeThread.id, 'contactExchange', 'landlord'), {
          threadId: activeThread.id,
          tenantId: activeThread.tenantId,
          landlordId: 'showcase_owner',
          userId: 'showcase_owner',
          role: 'landlord',
          phoneNumber: '01000000123',
          updatedAt: serverTimestamp(),
        });
      }

      const unlockMsgId = buildChatMessageId();
      batch.set(doc(db, 'chatThreads', activeThread.id, 'messages', unlockMsgId), {
        threadId: activeThread.id,
        tenantId: activeThread.tenantId,
        landlordId: activeThread.landlordId,
        senderId: currentUser.uid,
        senderRole: 'system',
        senderDisplayName: 'بوابة الدفع والضمان',
        body: `تم سداد نسبة الموقع (${formatEgp(activeThread.commissionAmountEgp)} ج.م · مرجع ${paymentRef}) بنجاح. الشات مفتوح الآن بالكامل مع إظهار أرقام الهاتف الموثقة.`,
        isSystemNotice: true,
        createdAt: serverTimestamp(),
      });

      if (
        activeThread.landlordId !== 'showcase_owner' &&
        activeThread.landlordId !== currentUser.uid
      ) {
        const notifId = buildNotificationId('ntf_chat');
        batch.set(doc(db, 'notifications', notifId), {
          recipientId: activeThread.landlordId,
          actorId: currentUser.uid,
          actorDisplayName: activeThread.tenantDisplayName,
          recipientRole: 'landlord',
          statusType: 'chat_unlocked',
          relatedEntityType: 'chat_thread',
          relatedEntityId: activeThread.id,
          apartmentId: activeThread.apartmentId,
          apartmentTitle: activeThread.apartmentTitle.slice(0, 120),
          governorate: activeThread.governorate,
          amountEgp: activeThread.commissionAmountEgp,
          title: 'تم سداد نسبة الموقع — فتح الشات وإظهار رقم التواصل',
          message: `قام ${activeThread.tenantDisplayName} بسداد نسبة الموقع (${formatEgp(
            activeThread.commissionAmountEgp
          )} ج.م) على وحدة «${activeThread.apartmentTitle}»؛ افتح المحادثة لإظهار رقم هاتفك والتواصل مباشرة.`,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setTenantPhone(cleanPhone);
      if (activeThread.landlordId === 'showcase_owner') {
        setLandlordPhone('01000000123');
      }
      setShowCommissionCheckout(false);
      setOtpStep(false);
    } catch (err) {
      logFirestoreDiagnostic(err, OperationType.UPDATE, `chatThreads/${activeThreadId}`);
      setErrorMsg(
        t(
          'تعذر إتمام سداد نسبة الموقع حالياً. يرجى المحاولة مرة أخرى.',
          'Could not settle site commission right now. Please try again.'
        )
      );
    } finally {
      setPayingCommission(false);
    }
  };

  const handleSaveMyUnlockedPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !thread) return;
    const clean = myPhoneDraft.trim();
    if (!VALIDATION_LIMITS.EGYPT_PHONE_PATTERN.test(clean)) {
      setErrorMsg(
        t(
          'أدخل رقم موبايل مصري صحيح (11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015).',
          'Enter a valid 11-digit Egyptian mobile number.'
        )
      );
      return;
    }

    const roleDoc: 'tenant' | 'landlord' =
      currentUser.uid === thread.landlordId ? 'landlord' : 'tenant';
    setSavingMyPhone(true);
    try {
      await setDoc(doc(db, 'chatThreads', thread.id, 'contactExchange', roleDoc), {
        threadId: thread.id,
        tenantId: thread.tenantId,
        landlordId: thread.landlordId,
        userId: currentUser.uid,
        role: roleDoc,
        phoneNumber: clean,
        updatedAt: serverTimestamp(),
      });
      if (roleDoc === 'landlord') {
        setLandlordPhone(clean);
      } else {
        setTenantPhone(clean);
      }
      setMyPhoneDraft('');
      setErrorMsg(null);
    } catch (err) {
      logFirestoreDiagnostic(
        err,
        OperationType.WRITE,
        `chatThreads/${thread.id}/contactExchange/${roleDoc}`
      );
      setErrorMsg(t('تعذر حفظ رقم الهاتف.', 'Could not save phone number.'));
    } finally {
      setSavingMyPhone(false);
    }
  };

  const handleCopyPhone = async (phone: string, role: 'tenant' | 'landlord') => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhoneRole(role);
      window.setTimeout(() => setCopiedPhoneRole(null), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  const safeInquiryPresets =
    lang === 'ar'
      ? [
          'هل الوحدة متاحة للمعاينة خلال هذا الأسبوع؟',
          'هل الإيجار يشمل الصيانة والخدمات الشهرية؟',
          'ما مدة العقد المفضلة وقيمة التأمين المطلوبة؟',
        ]
      : [
          'Is the unit available for viewing this week?',
          'Does the rent include monthly building maintenance?',
          'What is the preferred lease duration & security deposit?',
        ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-modal-title"
    >
      <div className="relative bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-3xl h-[92vh] sm:h-[86vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {isUnlocked ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{t('الشات مفتوح بالكامل', 'Unlocked Chat')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t('وضع الخصوصية المحدود', 'Privacy-Locked Chat')}</span>
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span>{categorySingularLabel(computedMeta.category)}</span>
              <span aria-hidden="true">·</span>
              <span>{govLabel(computedMeta.governorate)}</span>
            </div>
            <h2
              id="chat-modal-title"
              className="text-sm sm:text-base font-bold text-slate-900 truncate mt-0.5"
            >
              {computedMeta.apartmentTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('إغلاق المحادثة', 'Close chat')}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Privacy Gate / Verified Phone Reveal Strip */}
        <div
          className={`px-5 py-3 border-b shrink-0 ${
            isUnlocked
              ? 'bg-emerald-50/80 border-emerald-200'
              : isFlaggedLocked
                ? 'bg-rose-50 border-rose-200'
                : 'bg-slate-50 border-slate-200'
          }`}
        >
          {!isUnlocked ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <MessageSquareLock className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {t(
                      'أرقام الهاتف محجوبة — يُحظر مشاركة أي رقم تواصل قبل سداد نسبة الموقع',
                      'Phone numbers hidden — sharing contact numbers before paying site commission triggers a ban warning'
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {t('هاتف المالك:', 'Landlord:')}{' '}
                    <span className="text-slate-500" dir="ltr">
                      010 •••• ••••
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t('مخالفات الخصوصية:', 'Privacy Strikes:')}{' '}
                    <strong
                      className={`font-mono tabular-nums ${
                        myViolationCount > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatNumber(myViolationCount)} / {formatNumber(MAX_VIOLATION_STRIKES)}
                    </strong>
                  </span>
                </div>
              </div>

              {myRole !== 'landlord' && !isFlaggedLocked && (
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser) {
                      void onRequestSignIn();
                      return;
                    }
                    setShowCommissionCheckout((prev) => !prev);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      `ادفع نسبة الموقع (${formatNumber(computedMeta.commissionAmountEgp)} ج.م) لفتح الشات والهاتف`,
                      `Pay Site Commission (${formatNumber(computedMeta.commissionAmountEgp)} EGP) to Unlock`
                    )}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {t(
                      'تم دفع نسبة الموقع — الشات مفتوح بالكامل وأرقام الهاتف الموثقة ظاهرة',
                      'Site commission settled — full chat & verified contact phone numbers unlocked'
                    )}
                  </span>
                </div>
                {thread?.commissionPaymentRef && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-800">
                    {thread.commissionPaymentRef}
                  </span>
                )}
              </div>

              {/* Verified Contact Numbers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Landlord Phone Card */}
                <div className="bg-white border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      {t('رقم هاتف المالك', 'Landlord Phone')} ({computedMeta.landlordDisplayName})
                    </div>
                    {landlordPhone ? (
                      <div
                        dir="ltr"
                        className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5 text-start"
                      >
                        {landlordPhone}
                      </div>
                    ) : myRole === 'landlord' ? (
                      <form onSubmit={handleSaveMyUnlockedPhone} className="flex items-center gap-1.5 mt-1">
                        <input
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          maxLength={11}
                          value={myPhoneDraft}
                          onChange={(e) =>
                            setMyPhoneDraft(normalizeNumericInput(e.target.value).slice(0, 11))
                          }
                          placeholder="010xxxxxxxx"
                          className="w-32 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                        />
                        <button
                          type="submit"
                          disabled={savingMyPhone}
                          className="px-2 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded"
                        >
                          {t('حفظ', 'Save')}
                        </button>
                      </form>
                    ) : (
                      <div className="text-xs font-semibold text-amber-700 mt-0.5">
                        {t(
                          'تم إشعار المالك — سيظهر رقمه فور دخوله',
                          'Landlord notified — number appears on reply'
                        )}
                      </div>
                    )}
                  </div>
                  {landlordPhone && (
                    <button
                      type="button"
                      onClick={() => void handleCopyPhone(landlordPhone, 'landlord')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg shrink-0"
                    >
                      {copiedPhoneRole === 'landlord' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedPhoneRole === 'landlord'
                          ? t('تم النسخ', 'Copied')
                          : t('نسخ', 'Copy')}
                      </span>
                    </button>
                  )}
                </div>

                {/* Tenant Phone Card */}
                <div className="bg-white border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">
                      {t('رقم هاتف المستأجر', 'Tenant Phone')} (
                      {thread?.tenantDisplayName || currentUser?.displayName || t('المستأجر', 'Tenant')})
                    </div>
                    {tenantPhone ? (
                      <div
                        dir="ltr"
                        className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5 text-start"
                      >
                        {tenantPhone}
                      </div>
                    ) : myRole === 'tenant' ? (
                      <form onSubmit={handleSaveMyUnlockedPhone} className="flex items-center gap-1.5 mt-1">
                        <input
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          maxLength={11}
                          value={myPhoneDraft}
                          onChange={(e) =>
                            setMyPhoneDraft(normalizeNumericInput(e.target.value).slice(0, 11))
                          }
                          placeholder="010xxxxxxxx"
                          className="w-32 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                        />
                        <button
                          type="submit"
                          disabled={savingMyPhone}
                          className="px-2 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded"
                        >
                          {t('حفظ', 'Save')}
                        </button>
                      </form>
                    ) : (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {t('لم يُضف المستأجر رقمه بعد', 'Tenant phone pending')}
                      </div>
                    )}
                  </div>
                  {tenantPhone && (
                    <button
                      type="button"
                      onClick={() => void handleCopyPhone(tenantPhone, 'tenant')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg shrink-0"
                    >
                      {copiedPhoneRole === 'tenant' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedPhoneRole === 'tenant'
                          ? t('تم النسخ', 'Copied')
                          : t('نسخ', 'Copy')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inline Commission Payment Drawer */}
        {showCommissionCheckout && !isUnlocked && (
          <div className="bg-blue-50/70 border-b border-blue-200 px-5 py-4 space-y-3 shrink-0 overflow-y-auto max-h-[48vh]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  {t(
                    'سداد نسبة الموقع (عمولة الوساطة) لفتح الشات وإظهار رقم الهاتف',
                    'Pay Site Commission to Unlock Full Chat & Phone Numbers'
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCommissionCheckout(false);
                  setOtpStep(false);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>

            <div className="bg-white border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="text-slate-500">
                  {t(
                    `نسبة الموقع المعتمدة لهذا القطاع (${formatNumber(computedMeta.commissionRatePct)}% مرة واحدة)`,
                    `Sector Commission (${formatNumber(computedMeta.commissionRatePct)}% one-time)`
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                  {t('على أساس إيجار:', 'Based on unit rate:')}{' '}
                  {formatNumber(computedMeta.baseUnitPriceEgp)} {t('ج.م', 'EGP')}
                </div>
              </div>
              <div className="text-lg font-extrabold font-mono tabular-nums text-blue-700">
                {formatNumber(computedMeta.commissionAmountEgp)} {t('ج.م', 'EGP')}
              </div>
            </div>

            {!otpStep ? (
              <form onSubmit={handleProceedCommissionOtp} className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'card_meeza', icon: CreditCard, label: t('بطاقة / ميزة', 'Card') },
                      { id: 'instapay', icon: Building, label: 'InstaPay' },
                      { id: 'mobile_wallet', icon: Smartphone, label: t('محفظة ذكية', 'Wallet') },
                      { id: 'fawry', icon: Receipt, label: 'Fawry' },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                          paymentMethod === m.id
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-7">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      {t(
                        'رقم موبايلك المصري (سيظهر للمالك فور إتمام الدفع)',
                        'Your Egyptian Mobile (shared with landlord once paid)'
                      )}
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      maxLength={11}
                      required
                      value={payerPhoneInput}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setPayerPhoneInput(normalizeNumericInput(e.target.value).slice(0, 11))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-start"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <button
                      type="submit"
                      className="w-full py-2 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>{t('متابعة لتأكيد الدفع', 'Continue to OTP')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmCommissionUnlock} className="space-y-3 bg-white border border-blue-200 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-900">
                  {t('رمز التأكيد البنكي (3D-Secure OTP)', '3D-Secure Bank OTP')}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={6}
                    required
                    value={otpCode}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => setOtpCode(normalizeNumericInput(e.target.value).slice(0, 6))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-center font-mono font-bold tracking-widest text-sm"
                  />
                  <button
                    type="submit"
                    disabled={payingCommission}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg whitespace-nowrap"
                  >
                    {payingCommission
                      ? t('جاري فتح الشات...', 'Unlocking Chat...')
                      : t('تأكيد دفع نسبة الموقع وفتح الشات', 'Confirm & Unlock Phone')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpStep(false)}
                    className="px-3 py-2 border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg"
                  >
                    {t('رجوع', 'Back')}
                  </button>
                </div>
              </form>
            )}

            {apartment && onProceedToFullEscrow && (
              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                <span>
                  {t(
                    'أو يمكنك سداد كامل عقد الإيجار بالضمان (يشمل العمولة ويفتح الشات تلقائياً):',
                    'Or complete full Escrow Booking (includes commission & auto-unlocks chat):'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onProceedToFullEscrow(apartment)}
                  className="font-bold text-blue-700 hover:underline whitespace-nowrap shrink-0 ms-2"
                >
                  {t('الانتقال لبوابة الضمان الكاملة', 'Full Escrow Checkout')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/50">
          {!currentUser ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10">
              <Lock className="w-10 h-10 text-blue-700" />
              <h3 className="text-sm font-bold text-slate-900">
                {t('سجّل الدخول لبدء المحادثة المحمية بالخصوصية', 'Sign In to Start Protected Chat')}
              </h3>
              <p className="text-xs text-slate-500 max-w-md">
                {t(
                  'تُحفظ جميع المحادثات في قناة مشفرة مع منع تبادل أرقام الهاتف حتى سداد نسبة الموقع.',
                  'All conversations are protected with strict anti-phone-leak rules until commission is paid.'
                )}
              </p>
              <button
                type="button"
                onClick={() => void onRequestSignIn()}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"
              >
                {t('تسجيل الدخول بحساب جوجل', 'Sign In with Google')}
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-8">
              <MessageSquareLock className="w-9 h-9 text-blue-700" />
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-bold text-slate-900">
                  {t(
                    'محادثة آمنة ومراقبة بالخصوصية بين المستأجر والمالك',
                    'Privacy-Protected Tenant & Landlord Chat'
                  )}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    'يمكنك الاستفسار عن تفاصيل الوحدة والمرافق وموعد المعاينة الآن. كتابة أي رقم هاتف أو وسيلة تواصل خارجية سيُمنع ويعرّض الحساب لتنبيه الحظر — ولإظهار أرقام الهاتف وفتح الشات بالكامل ادفع نسبة الموقع.',
                    'Ask about unit specs or viewing slots now. Sending any phone number or external contact app before paying site commission triggers a ban warning.'
                  )}
                </p>
              </div>
              {!isUnlocked && !isFlaggedLocked && !isOwnListingAsNonAdmin && (
                <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-lg">
                  {safeInquiryPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => void handleSendMessage(undefined, preset)}
                      className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-[11px] font-semibold text-slate-700 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                if (msg.isSystemNotice || msg.senderRole === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-slate-200/70 border border-slate-300/70 text-slate-700 text-[11px] font-medium px-3.5 py-2 rounded-xl max-w-lg text-center leading-relaxed">
                        {msg.body}
                      </div>
                    </div>
                  );
                }

                const isMine = msg.senderId === currentUser.uid;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1 px-1">
                      <span className="font-semibold text-slate-700">{msg.senderDisplayName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatTimeAgo(msg.createdAtMs)}</span>
                    </div>
                    <div
                      className={`max-w-[82%] sm:max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isMine
                          ? 'bg-blue-700 text-white rounded-ee-xs'
                          : 'bg-white border border-slate-200 text-slate-900 rounded-es-xs'
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Flagged Thread Notice */}
        {isFlaggedLocked && (
          <div className="bg-rose-50 border-t border-rose-200 px-5 py-3 flex items-center gap-3 text-xs text-rose-900 shrink-0">
            <Ban className="w-5 h-5 text-rose-700 shrink-0" />
            <div>
              <strong className="block font-bold">
                {t(
                  'تم تعليق الإرسال في هذه المحادثة وإحالة الحساب لإدارة التطبيق للحظر',
                  'Chat sending suspended — account escalated to Administration for Ban Review'
                )}
              </strong>
              <span>
                {t(
                  'تم استنفاد الحد الأقصى (3 محاولات) لإرسال أرقام تواصل قبل دفع نسبة الموقع.',
                  'Maximum limit (3 attempts) of sharing contact numbers before commission settlement reached.'
                )}
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="bg-amber-50 border-t border-amber-200 px-5 py-2.5 text-xs font-semibold text-amber-950 flex items-center justify-between gap-2 shrink-0">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-amber-800 hover:text-amber-950 font-bold"
            >
              {t('إغلاق', 'Dismiss')}
            </button>
          </div>
        )}

        {/* Live Anti-Phone Pre-Submit Warning Hint */}
        {liveDraftCheck && !isUnlocked && !isFlaggedLocked && (
          <div className="bg-rose-50 border-t border-rose-200 px-5 py-2 flex items-center gap-2 text-xs font-semibold text-rose-800 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              {t(
                'تحذير فوري: الرسالة تحتوي على رقم هاتف أو وسيلة تواصل خارجية! محاولة الإرسال ستُحظر وتسجّل إنذاراً بالحظر من التطبيق.',
                'Warning: Phone number or external contact detected! Sending will be blocked and trigger a ban strike.'
              )}
            </span>
          </div>
        )}

        {/* Owner Own-Listing Notice */}
        {isOwnListingAsNonAdmin && (
          <div className="bg-blue-50 border-t border-blue-200 px-5 py-3 text-xs font-semibold text-blue-950 shrink-0">
            {t(
              'هذه وحدتك المعروضة — ستظهر محادثات المستأجرين المهتمين مباشرة في تبويب «المحادثات الآمنة» بلوحة عقودي للرد عليهم.',
              'This is your own listing — incoming tenant conversations will appear in Safe Chats under My Contracts.'
            )}
          </div>
        )}

        {/* Tenant Deposit Guard Banner */}
        {myRole === 'tenant' && !isAdmin && (!tenantWallet || tenantWallet.balanceEgp < 500) && (
          <div className="bg-amber-50 border-t border-amber-200 px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2.5 text-amber-900">
              <Wallet className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold block">
                  {t(
                    'يلزم شحن رصيد جدية الحجز (1000 ج.م أو 10%) لبدء الدردشة مع المالك',
                    'Booking deposit balance (1000 EGP) required to chat with landlord'
                  )}
                </span>
                <span className="text-[11px] text-amber-800">
                  {t(
                    'الرصيد يظل في محفظتك بالكامل ولا يُخصم أو يُربط بالشقة إلا عند تأكيد حجزك النهائي.',
                    'The deposit stays in your wallet and is only deducted when confirming a booking.'
                  )}
                </span>
              </div>
            </div>

            {onOpenWallet && (
              <button
                type="button"
                onClick={onOpenWallet}
                className="w-full sm:w-auto px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md transition-all whitespace-nowrap"
              >
                {t('شحن المحفظة الآن (1,000 ج.م)', 'Top Up Wallet (1,000 EGP)')}
              </button>
            )}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => void handleSendMessage(e)}
          className="bg-white border-t border-slate-200 px-4 sm:px-5 py-3 flex items-end gap-2.5 shrink-0"
        >
          <textarea
            rows={2}
            value={draft}
            disabled={
              !currentUser ||
              isBanned ||
              isFlaggedLocked ||
              isOwnListingAsNonAdmin ||
              (myRole === 'tenant' && !isAdmin && (!tenantWallet || tenantWallet.balanceEgp < 500)) ||
              sending
            }
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isUnlocked
                ? t(
                    'اكتب رسالتك هنا — الشات مفتوح بالكامل...',
                    'Write your message — full chat unlocked...'
                  )
                : t(
                    'اكتب استفسارك بأمان (يُمنع كتابة أرقام الهاتف أو واتساب قبل دفع نسبة الموقع)...',
                    'Write safely (no phone numbers or WhatsApp allowed before commission payment)...'
                  )
            }
            className={`flex-1 px-3.5 py-2 border rounded-xl text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${
              liveDraftCheck
                ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                : 'border-slate-300 bg-slate-50/50 focus:ring-blue-600'
            }`}
          />
          <button
            type="submit"
            disabled={
              !currentUser || isBanned || isFlaggedLocked || isOwnListingAsNonAdmin || sending || !draft.trim()
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? t('إرسال...', 'Sending...') : t('إرسال', 'Send')}</span>
          </button>
        </form>

        {/* BAN WARNING MODAL OVERLAY (Triggered when phone/contact sharing is attempted) */}
        {banWarningModal && (
          <div
            className="absolute inset-0 z-30 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
          >
            <div className="bg-white border-2 border-rose-500 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-rose-950">
                    {banWarningModal.isAccountFlagged
                      ? t(
                          'إيقاف المحادثة وتنبيه الحظر النهائي من التطبيق!',
                          'Chat Suspended & Account Flagged for Permanent Ban!'
                        )
                      : t(
                          'تنبيه تحذيري بالحظر من التطبيق!',
                          'Final Warning: App Ban Policy Violation!'
                        )}
                  </h3>
                  <p className="text-xs font-semibold text-rose-700 font-mono tabular-nums">
                    {t(
                      `مخالفة الخصوصية رقم ${formatNumber(banWarningModal.strikesAfter)} من ${formatNumber(MAX_VIOLATION_STRIKES)}`,
                      `Privacy Strike ${formatNumber(banWarningModal.strikesAfter)} of ${formatNumber(MAX_VIOLATION_STRIKES)}`
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2 text-xs text-rose-950 leading-relaxed">
                <p className="font-bold">
                  {lang === 'ar' ? banWarningModal.result.reasonAr : banWarningModal.result.reasonEn}
                </p>
                <p className="text-rose-800">
                  {banWarningModal.isAccountFlagged
                    ? t(
                        'لقد تجاوزت الحد المسموح (3 محاولات) لمشاركة أرقام التواصل قبل سداد نسبة الموقع. تم تعليق هذه المحادثة وإرسال تنبيه لإدارة المنصة لاتخاذ قرار الحظر الدائم من التطبيق.',
                        'You reached the 3-strike limit for attempting off-platform contact before paying site commission. This chat is suspended and escalated to Administration for permanent app ban.'
                      )
                    : t(
                        'يُمنع منعاً باتاً كتابة أرقام الهواتف أو حسابات واتساب/تيليجرام للتحايل على عمولة المنصة. تكرار المحاولة (3 مخالفات) يؤدي إلى تجميد المحادثة وحظر حسابك نهائياً من التطبيق.',
                        'Sharing phone numbers or WhatsApp/Telegram handles to bypass platform commission is strictly forbidden. Reaching 3 strikes suspends the chat and triggers a permanent app ban.'
                      )}
                </p>
              </div>

              {/* Strike Meter */}
              <div className="grid grid-cols-3 gap-1.5">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`h-2 rounded-full ${
                      step <= banWarningModal.strikesAfter ? 'bg-rose-600' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {myRole !== 'landlord' && !banWarningModal.isAccountFlagged && (
                  <button
                    type="button"
                    onClick={() => {
                      setBanWarningModal(null);
                      setDraft('');
                      setShowCommissionCheckout(true);
                    }}
                    className="flex-1 py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>
                      {t(
                        `دفع نسبة الموقع (${formatNumber(computedMeta.commissionAmountEgp)} ج.م)`,
                        `Pay Commission (${formatNumber(computedMeta.commissionAmountEgp)} EGP)`
                      )}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBanWarningModal(null);
                    setDraft('');
                  }}
                  className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  {t('أفهم التحذير — مسح الرقم والمواصلة', 'I Understand — Clear & Comply')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
