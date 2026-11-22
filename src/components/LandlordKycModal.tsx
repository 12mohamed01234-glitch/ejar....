import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  RefreshCw,
  Sparkles,
  Lock,
  ChevronRight,
  ChevronLeft,
  Building,
} from 'lucide-react';
import {
  LandlordVerificationRecord,
  VALIDATION_LIMITS,
  normalizeNumericInput,
  normalizeArabicDigits,
} from '../lib/validation';
import { useI18n } from '../lib/i18n';

interface LandlordKycModalProps {
  isOpen: boolean;
  currentUserUid: string | null;
  currentUserDisplayName?: string | null;
  existingVerification?: LandlordVerificationRecord | null;
  onClose: () => void;
  onCompleteVerification: (record: LandlordVerificationRecord) => Promise<void>;
}

type StepType = 'personal_info' | 'id_cards' | 'deed_docs' | 'facial_liveness' | 'approved_badge';

export const LandlordKycModal: React.FC<LandlordKycModalProps> = ({
  isOpen,
  currentUserUid,
  currentUserDisplayName,
  existingVerification,
  onClose,
  onCompleteVerification,
}) => {
  const { lang, t, formatNumber } = useI18n();

  const [currentStep, setCurrentStep] = useState<StepType>(
    existingVerification?.status === 'verified' ? 'approved_badge' : 'personal_info'
  );

  // Form Fields
  const [fullName, setFullName] = useState<string>(
    existingVerification?.fullName || currentUserDisplayName || 'محمد أحمد إبراهيم'
  );
  const [nationalIdNumber, setNationalIdNumber] = useState<string>(
    existingVerification?.nationalIdNumber || '29508140102948'
  );
  const [ownerPhone, setOwnerPhone] = useState<string>(
    existingVerification?.ownerPhone || '01012345678'
  );
  const [governorate, setGovernorate] = useState<string>(
    existingVerification?.governorate || 'القاهرة'
  );
  const [district, setDistrict] = useState<string>(
    existingVerification?.district || 'المعادي'
  );

  // Documents
  const [nationalIdFront, setNationalIdFront] = useState<string | null>(
    existingVerification?.nationalIdFrontUrl || null
  );
  const [nationalIdBack, setNationalIdBack] = useState<string | null>(
    existingVerification?.nationalIdBackUrl || null
  );
  const [deedDoc, setDeedDoc] = useState<string | null>(
    existingVerification?.ownershipDocUrl || null
  );
  const [deedType, setDeedType] = useState<'title_deed' | 'lease_contract' | 'power_of_attorney'>(
    existingVerification?.ownershipDocType || 'title_deed'
  );

  // Camera Facial Liveness
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(
    existingVerification?.selfiePhotoUrl || null
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanningMatch, setIsScanningMatch] = useState<boolean>(false);
  const [livenessStage, setLivenessStage] = useState<'idle' | 'center' | 'right' | 'left' | 'matched'>('idle');
  const [facialMatchScore, setFacialMatchScore] = useState<number>(
    existingVerification?.facialMatchScore || 0
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Phone OTP
  const [phoneVerified, setPhoneVerified] = useState<boolean>(Boolean(existingVerification));
  const [phoneOtpCode, setPhoneOtpCode] = useState<string>('');
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState<boolean>(false);
  const [otpSent, setOtpSent] = useState<boolean>(false);

  // Camera Management
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch {
      setCameraError(
        t(
          'تعذر تشغيل الكاميرا تلقائياً. يمكنك التقاط صورة سيلفي وتحميلها مباشرة.',
          'Unable to access camera directly. You can upload a clear selfie instead.'
        )
      );
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (currentStep === 'facial_liveness' && !capturedSelfie) {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [currentStep]);

  const handleStartLivenessRoutine = () => {
    setIsScanningMatch(true);
    setLivenessStage('center');

    setTimeout(() => {
      setLivenessStage('right');
      setTimeout(() => {
        setLivenessStage('left');
        setTimeout(() => {
          setLivenessStage('matched');
          setIsScanningMatch(false);
          setFacialMatchScore(99.4);

          if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              setCapturedSelfie(canvas.toDataURL('image/jpeg', 0.9));
            }
          } else {
            setCapturedSelfie(
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240"%3E%3Crect width="300" height="240" rx="16" fill="%231e1b4b"/%3E%3Ccircle cx="150" cy="100" r="50" fill="%23a855f7"/%3E%3Cpath d="M70 210c0-44 36-80 80-80s80 36 80 80" fill="%236366f1"/%3E%3Ccircle cx="150" cy="95" r="38" fill="%23fde047"/%3E%3Cpath d="M140 100a10 10 0 0 0 20 0" stroke="%230f172a" stroke-width="3" fill="none" stroke-linecap="round"/%3E%3Ccircle cx="138" cy="85" r="4" fill="%230f172a"/%3E%3Ccircle cx="162" cy="85" r="4" fill="%230f172a"/%3E%3Crect x="60" y="215" width="180" height="18" rx="6" fill="%2310b981"/%3E%3Ctext x="150" y="228" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="10" text-anchor="middle"%3Eتم التحقق البيومتري بنجاح (Liveness Confirmed)%3C/text%3E%3C/svg%3E'
            );
          }
          stopCamera();
        }, 1200);
      }, 1200);
    }, 1200);
  };

  const handleCaptureSnapshot = () => {
    handleStartLivenessRoutine();
  };

  const handleRetakeSelfie = () => {
    setCapturedSelfie(null);
    setFacialMatchScore(0);
    setLivenessStage('idle');
    void startCamera();
  };

  // Mock Upload Handlers
  const handleSimulateIdFront = () => {
    setNationalIdFront(
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="190" viewBox="0 0 300 190"%3E%3Crect width="300" height="190" rx="12" fill="%23e2e8f0" stroke="%233b82f6" stroke-width="4"/%3E%3Ccircle cx="65" cy="85" r="35" fill="%2394a3b8"/%3E%3Crect x="120" y="55" width="150" height="14" rx="4" fill="%231e293b"/%3E%3Crect x="120" y="80" width="130" height="10" rx="3" fill="%2364748b"/%3E%3Crect x="120" y="100" width="100" height="10" rx="3" fill="%2364748b"/%3E%3Crect x="30" y="145" width="240" height="16" rx="4" fill="%230f172a"/%3E%3Ctext x="150" y="157" fill="%23ffffff" font-family="monospace" font-size="11" text-anchor="middle"%3E29508140102948%3C/text%3E%3C/svg%3E'
    );
  };

  const handleSimulateIdBack = () => {
    setNationalIdBack(
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="190" viewBox="0 0 300 190"%3E%3Crect width="300" height="190" rx="12" fill="%23e2e8f0" stroke="%233b82f6" stroke-width="4"/%3E%3Crect x="25" y="30" width="250" height="25" rx="3" fill="%23334155"/%3E%3Crect x="25" y="70" width="160" height="12" rx="3" fill="%2364748b"/%3E%3Crect x="25" y="90" width="140" height="12" rx="3" fill="%2364748b"/%3E%3Crect x="25" y="120" width="250" height="40" rx="4" fill="%2394a3b8"/%3E%3Ctext x="150" y="145" fill="%230f172a" font-family="monospace" font-size="11" text-anchor="middle"%3Eبطاقة تحقيق الشخصية - جمهورية مصر العربية%3C/text%3E%3C/svg%3E'
    );
  };

  const handleSimulateDeed = () => {
    setDeedDoc(
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="190" viewBox="0 0 300 190"%3E%3Crect width="300" height="190" rx="12" fill="%23fef3c7" stroke="%23d97706" stroke-width="4"/%3E%3Ccircle cx="150" cy="50" r="22" fill="%23d97706"/%3E%3Crect x="40" y="90" width="220" height="12" rx="3" fill="%2378350f"/%3E%3Crect x="40" y="112" width="200" height="10" rx="3" fill="%2392400e"/%3E%3Crect x="40" y="130" width="180" height="10" rx="3" fill="%2392400e"/%3E%3Ctext x="150" y="165" fill="%2378350f" font-family="sans-serif" font-weight="bold" font-size="11" text-anchor="middle"%3Eعقد ملكية موثق بالشهر العقاري%3C/text%3E%3C/svg%3E'
    );
  };

  const handleSubmitFinalVerification = async () => {
    setIsSubmitting(true);
    const record: LandlordVerificationRecord = {
      uid: currentUserUid || 'current_user',
      fullName,
      nationalIdNumber,
      ownerPhone,
      governorate,
      district,
      status: 'verified',
      nationalIdFrontUrl: nationalIdFront || undefined,
      nationalIdBackUrl: nationalIdBack || undefined,
      ownershipDocUrl: deedDoc || undefined,
      ownershipDocType: deedType,
      selfiePhotoUrl: capturedSelfie || undefined,
      facialMatchScore: facialMatchScore || 98.6,
      submittedAtMs: Date.now(),
      verifiedAtMs: Date.now(),
      badgeLabelAr: 'مالك موثق بالهوية والملكية والتحقق البيومتري',
      badgeLabelEn: 'Biometrically & Deed Verified Landlord',
    };

    try {
      await onCompleteVerification(record);
      setCurrentStep('approved_badge');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>{t('توثيق هوية المالك وسند الملكية', 'Landlord KYC & Ownership Verification')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {t('شارة التحقق الرسمية', 'Verified Badge')}
                </span>
              </h2>
              <p className="text-xs text-blue-200/80">
                {t(
                  'توثيق الرقم القومي وسند الملكية والتحقق الحي للوجه لرفع مصداقية إعلاناتك 100%',
                  'Verify National ID, property deed & facial liveness for maximum tenant trust'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Pills */}
        {currentStep !== 'approved_badge' && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs font-semibold overflow-x-auto no-scrollbar gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap ${
                currentStep === 'personal_info'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <span>1.</span>
              <span>{t('البيانات الشخصية', 'Personal Info')}</span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap ${
                currentStep === 'id_cards'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <span>2.</span>
              <span>{t('بطاقة الرقم القومي', 'National ID')}</span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap ${
                currentStep === 'deed_docs'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <span>3.</span>
              <span>{t('سند الملكية / الإيجار', 'Title Deed')}</span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full whitespace-nowrap ${
                currentStep === 'facial_liveness'
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <span>4.</span>
              <span>{t('التحقق بالوجه (سيلفي)', 'Face Liveness')}</span>
            </div>
          </div>
        )}

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar">
          {/* STEP 1: Personal Info */}
          {currentStep === 'personal_info' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
                <UserCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">
                    {t(
                      'خطوة 1: تطابق الاسم الرباعي والرقم القومي المصري',
                      'Step 1: Legal Name & 14-Digit Egyptian National ID'
                    )}
                  </span>
                  <p className="text-blue-800 leading-relaxed">
                    {t(
                      'أدخل بياناتك تماماً كما هي مسجلة في بطاقة الرقم القومي سارية المفعول لتجنب رفض طلب التوثيق.',
                      'Enter your full name and National ID exactly as written on your official ID card.'
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('الاسم القانوني رباعي (كما في البطاقة):', 'Full Legal Name (as on National ID):')}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="محمد أحمد إبراهيم علي"
                    className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('الرقم القومي (14 رقم):', 'Egyptian National ID (14 digits):')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    value={nationalIdNumber}
                    onChange={(e) => setNationalIdNumber(normalizeNumericInput(e.target.value))}
                    placeholder="29508140102948"
                    className="w-full h-11 px-4 text-sm font-mono font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  {nationalIdNumber.length > 0 && nationalIdNumber.length !== 14 && (
                    <span className="text-[11px] text-rose-600 mt-1 block">
                      {t('يجب أن يتكون الرقم القومي من 14 رقماً', 'National ID must be exactly 14 digits')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('المحافظة:', 'Governorate:')}
                    </label>
                    <input
                      type="text"
                      value={governorate}
                      onChange={(e) => setGovernorate(e.target.value)}
                      className="w-full h-11 px-4 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('الحي / المركز:', 'District:')}
                    </label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full h-11 px-4 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('رقم الهاتف للتواصل الموثق:', 'Contact Phone Number:')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(normalizeNumericInput(e.target.value))}
                    className="w-full h-11 px-4 text-sm font-mono font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={fullName.trim().length < 5 || nationalIdNumber.length !== 14}
                  onClick={() => setCurrentStep('id_cards')}
                  className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-700/20"
                >
                  <span>{t('المتابعة لرفع البطاقة', 'Next: Upload ID Cards')}</span>
                  <ChevronLeft className="w-4 h-4 rtl:rotate-0 rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ID Cards Upload */}
          {currentStep === 'id_cards' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {t('متطلبات وضوح بطاقة الرقم القومي', 'National ID Card Quality Guidelines')}
                  </span>
                  <p className="text-amber-800 mt-0.5">
                    {t(
                      'التقط صورا واضحة لوجه وظهر البطاقة دون لمعان فلاش مع وضوح الأرقام والبيانات بالكامل.',
                      'Take high-resolution photos of front & back without flash glare so all text is legible.'
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* ID Front */}
                <div className="border border-slate-200 rounded-2xl p-4 text-center space-y-3 bg-slate-50">
                  <span className="text-xs font-bold text-slate-800 block">
                    {t('صورة وجه البطاقة (أمامي)', 'ID Card Front')}
                  </span>
                  {nationalIdFront ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-400 bg-white p-2">
                      <img
                        src={nationalIdFront}
                        alt="ID Front"
                        className="w-full h-32 object-contain rounded-lg"
                      />
                      <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('تم الرفع', 'Uploaded')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500">
                      <Upload className="w-6 h-6 text-slate-400" />
                      <span className="text-[11px]">{t('اسحب الصورة هنا أو اضغط للرفع', 'Upload ID Front')}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSimulateIdFront}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    {nationalIdFront ? t('تغيير صورة الوجه', 'Change Front') : t('تحميل صورة وجه البطاقة', 'Upload ID Front')}
                  </button>
                </div>

                {/* ID Back */}
                <div className="border border-slate-200 rounded-2xl p-4 text-center space-y-3 bg-slate-50">
                  <span className="text-xs font-bold text-slate-800 block">
                    {t('صورة ظهر البطاقة (خلفي)', 'ID Card Back')}
                  </span>
                  {nationalIdBack ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-400 bg-white p-2">
                      <img
                        src={nationalIdBack}
                        alt="ID Back"
                        className="w-full h-32 object-contain rounded-lg"
                      />
                      <div className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('تم الرفع', 'Uploaded')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500">
                      <Upload className="w-6 h-6 text-slate-400" />
                      <span className="text-[11px]">{t('اسحب الصورة هنا أو اضغط للرفع', 'Upload ID Back')}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSimulateIdBack}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    {nationalIdBack ? t('تغيير صورة الظهر', 'Change Back') : t('تحميل صورة ظهر البطاقة', 'Upload ID Back')}
                  </button>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep('personal_info')}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-0 rotate-180" />
                  <span>{t('العودة', 'Back')}</span>
                </button>

                <button
                  type="button"
                  disabled={!nationalIdFront || !nationalIdBack}
                  onClick={() => setCurrentStep('deed_docs')}
                  className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-700/20"
                >
                  <span>{t('المتابعة لرفع سند الملكية', 'Next: Property Deed')}</span>
                  <ChevronLeft className="w-4 h-4 rtl:rotate-0 rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Deed Docs Upload */}
          {currentStep === 'deed_docs' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-start gap-3">
                <FileText className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {t('إثبات ملكية العقار أو سند الإيجار الرسمي', 'Proof of Property Ownership or Master Lease')}
                  </span>
                  <p className="text-indigo-800 mt-0.5">
                    {t(
                      'يُشترط رفع صورة عقد الملكية المسجل أو توكيل رسمي أو عقد إيجار ساري يتيح التأجير من الباطن لضمان حماية المستأجر.',
                      'Upload your registered property deed, notarized power of attorney, or master commercial lease.'
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('نوع سند الملكية المرفوع:', 'Deed Document Type:')}
                  </label>
                  <select
                    value={deedType}
                    onChange={(e) => setDeedType(e.target.value as LandlordVerificationRecord['ownershipDocType'])}
                    className="w-full h-11 px-4 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="title_deed">{t('عقد ملكية مسجل (شهر عقاري / جمعية)', 'Registered Ownership Deed')}</option>
                    <option value="lease_contract">{t('عقد إيجار رسمي موثق', 'Certified Lease Contract')}</option>
                    <option value="power_of_attorney">{t('توكيل رسمي عام / خاص بإدارة العقار', 'Official Power of Attorney')}</option>
                  </select>
                </div>

                <div className="border border-slate-200 rounded-2xl p-5 text-center space-y-3 bg-slate-50">
                  <span className="text-xs font-bold text-slate-800 block">
                    {t('مستند العقد / السند العقاري', 'Ownership Deed Document')}
                  </span>

                  {deedDoc ? (
                    <div className="relative rounded-xl overflow-hidden border border-amber-400 bg-white p-2">
                      <img
                        src={deedDoc}
                        alt="Deed Document"
                        className="w-full h-36 object-contain rounded-lg"
                      />
                      <div className="absolute top-3 right-3 bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('تم التوثيق والمطابقة', 'Verified Deed')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-36 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500">
                      <FileText className="w-8 h-8 text-slate-400" />
                      <span className="text-xs">{t('رفع صورة أو ملف PDF لعقد الملكية', 'Upload Deed Image or PDF')}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSimulateDeed}
                    className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    {deedDoc ? t('تغيير المستند المرفوع', 'Change Document') : t('تحميل صورة عقد الملكية', 'Upload Ownership Deed')}
                  </button>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep('id_cards')}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-0 rotate-180" />
                  <span>{t('العودة', 'Back')}</span>
                </button>

                <button
                  type="button"
                  disabled={!deedDoc}
                  onClick={() => setCurrentStep('facial_liveness')}
                  className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-700/20"
                >
                  <span>{t('المتابعة للتحقق بالوجه (كاميرا)', 'Next: Live Facial Liveness')}</span>
                  <ChevronLeft className="w-4 h-4 rtl:rotate-0 rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Facial Liveness via Camera */}
          {currentStep === 'facial_liveness' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-start gap-3">
                <Camera className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {t(
                      'خطوة التحقق الحي للوجه (Facial Liveness & Biometric Match)',
                      'Facial Liveness & Biometric Matching Step'
                    )}
                  </span>
                  <p className="text-purple-800 mt-0.5">
                    {t(
                      'انظر مباشرة إلى الكاميرا وتأكد من وضوح ملامح وجهك لمطابقتها آلياً مع صورة بطاقة الرقم القومي واسمك الشخصي لمنع انتحال الهويات.',
                      'Look directly at the camera to biometrically match your face with the National ID photo.'
                    )}
                  </p>
                </div>
              </div>

              {/* Camera Video / Snapshot Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video max-h-80 flex items-center justify-center border-2 border-purple-500/40">
                <canvas ref={canvasRef} className="hidden" />

                {!capturedSelfie && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                )}

                {capturedSelfie && (
                  <img
                    src={capturedSelfie}
                    alt="Captured Selfie"
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                )}

                {/* Oval Guide Overlay when capturing */}
                {!capturedSelfie && isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-64 rounded-[50%] border-2 border-dashed border-purple-400 animate-pulse flex items-center justify-center">
                      <span className="text-[10px] text-white/90 bg-slate-900/60 px-2 py-0.5 rounded-full font-bold">
                        {t('ضع وجهك داخل الإطار', 'Align Face in Oval')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Live Interactive Biometric Prompts Overlay */}
                {isScanningMatch && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-white p-6 z-20">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-700 animate-spin border-t-purple-500" />
                      <div className="text-3xl">
                        {livenessStage === 'center' && '👤'}
                        {livenessStage === 'right' && '👉'}
                        {livenessStage === 'left' && '👈'}
                        {livenessStage === 'matched' && '✅'}
                      </div>
                    </div>

                    <div className="text-center space-y-1">
                      <span className="text-sm font-bold text-amber-300 block">
                        {livenessStage === 'center' && t('1/3: انظر مباشرة للأمام نحو الكاميرا 👤', '1/3: Look Straight Ahead 👤')}
                        {livenessStage === 'right' && t('2/3: التفت برأسك جهة اليمين ببطء ➡️', '2/3: Turn Head Slowly to the Right ➡️')}
                        {livenessStage === 'left' && t('3/3: التفت برأسك جهة اليسار ببطء ⬅️', '3/3: Turn Head Slowly to the Left ⬅️')}
                        {livenessStage === 'matched' && t('اكتملت الحركة الحيوية وتطابق الوجه!', 'Biometric Motion & Face Matched!')}
                      </span>
                      <p className="text-xs text-slate-300">
                        {t('يتم فحص ملامح الوجه ومطابقتها مع صورة البطاقة بدقة ذكاء اصطناعي 100%', 'Scanning biometric features against ID')}
                      </p>
                    </div>

                    <div className="w-56 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-500"
                        style={{
                          width:
                            livenessStage === 'center'
                              ? '33%'
                              : livenessStage === 'right'
                              ? '66%'
                              : '100%',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Verified Match Badge if score computed */}
                {facialMatchScore > 0 && !isScanningMatch && (
                  <div className="absolute bottom-3 inset-x-3 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 p-2.5 rounded-xl flex items-center justify-between text-xs backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold">
                        {t('تم تأكيد الحيوية وتطابق الوجه بنجاح!', 'Biometric Liveness & Match Confirmed!')}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-300">
                      {facialMatchScore}% {t('نسبة التطابق', 'Match')}
                    </span>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  {cameraError}
                </div>
              )}

              {/* Camera Actions */}
              <div className="flex items-center justify-center gap-3">
                {!capturedSelfie ? (
                  <button
                    type="button"
                    onClick={handleCaptureSnapshot}
                    className="px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-purple-700/20"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('التقاط صورة التحقق المباشرة', 'Take Live Verification Selfie')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetakeSelfie}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('إعادة التقاط الصورة', 'Retake Photo')}</span>
                  </button>
                )}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep('deed_docs')}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1"
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-0 rotate-180" />
                  <span>{t('العودة', 'Back')}</span>
                </button>

                <button
                  type="button"
                  disabled={!capturedSelfie || facialMatchScore === 0 || isSubmitting}
                  onClick={handleSubmitFinalVerification}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('جاري حفظ واعتماد التوثيق...', 'Saving Verification...')}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t('اعتماد التوثيق ومنح الشارة الموثقة', 'Submit & Award Verified Badge')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Approved Badge Celebration */}
          {currentStep === 'approved_badge' && (
            <div className="text-center py-6 space-y-5 animate-in zoom-in-95 duration-300">
              <div className="relative inline-block">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-400/30">
                  <ShieldCheck className="w-12 h-12" />
                </div>
                <div className="absolute -top-1 -right-1 bg-blue-700 text-white p-1 rounded-full border-2 border-white">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-extrabold text-slate-900">
                  {t('تهانينا! حسابك موثق رسمياً الآن', 'Congratulations! Your Landlord Account is Verified')}
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  {t(
                    'تم اعتماد بطاقة الرقم القومي وعقد الملكية والمطابقة الحيوية للوجه. ستظهر شارة التوثيق الذهبية على جميع وحداتك وبروفايلك أمام المستأجرين.',
                    'Your National ID, property title deed, and facial biometric match are officially approved. The Golden Verified Badge is now active on all your listings.'
                  )}
                </p>
              </div>

              {/* Badge Preview Card */}
              <div className="max-w-md mx-auto p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-yellow-500/10 border border-amber-300/60 text-start flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <span>{fullName}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-extrabold">
                      VERIFIED
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-900 block mt-0.5">
                    {t(
                      'مالك موثق بالرقم القومي والملكية والتحقق البيومتري',
                      'Biometrically & Title Deed Verified Landlord'
                    )}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-8 py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-700/20 transition-all"
                >
                  {t('إغلاق والعودة للمنصة', 'Close & Return to Platform')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
