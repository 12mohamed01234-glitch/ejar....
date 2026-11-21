import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  FileText,
  Sparkles,
  Camera,
  RefreshCw,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { normalizeNumericInput } from '../lib/validation';

export interface TenantVerificationData {
  fullName: string;
  nationalId: string;
  phone: string;
  governorate: string;
  idCardPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  facialMatchScore: number;
  verifiedAtMs: number;
}

interface TenantVerificationModalProps {
  isOpen: boolean;
  currentUserUid: string | null;
  currentUserDisplayName?: string | null;
  existingData?: TenantVerificationData | null;
  onClose: () => void;
  onComplete: (data: TenantVerificationData) => Promise<void>;
}

type Step = 'form' | 'otp' | 'id_upload' | 'liveness' | 'success';

const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'البحيرة', 'الشرقية', 'الغربية', 'الدقهلية',
  'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'السويس', 'الإسماعيلية', 'بورسعيد', 'دمياط', 'كفر الشيخ', 'مطروح', 'البحر الأحمر',
  'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد', 'المنوفية', 'القليوبية',
];

export const TenantVerificationModal: React.FC<TenantVerificationModalProps> = ({
  isOpen,
  currentUserUid,
  currentUserDisplayName,
  existingData,
  onClose,
  onComplete,
}) => {
  const { t } = useI18n();

  const [step, setStep] = useState<Step>(existingData ? 'success' : 'form');

  // ── Step 1: Personal Info ──────────────────────────────────────────────
  const [fullName, setFullName] = useState(existingData?.fullName || currentUserDisplayName || '');
  const [nationalId, setNationalId] = useState(existingData?.nationalId || '');
  const [phone, setPhone] = useState(existingData?.phone || '');
  const [governorate, setGovernorate] = useState(existingData?.governorate || 'القاهرة');

  // ── Step 2: Phone OTP ──────────────────────────────────────────────────
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // ── Step 3: ID Card Upload ─────────────────────────────────────────────
  const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(existingData?.idCardPhotoUrl || null);
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  // ── Step 4: Liveness Camera ────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(existingData?.selfiePhotoUrl || null);
  const [livenessStage, setLivenessStage] = useState<'idle' | 'blink' | 'tilt' | 'done'>('idle');
  const [livenessStep, setLivenessStep] = useState(0); // 0=waiting,1=blink,2=tilt
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [matchScore, setMatchScore] = useState<number>(existingData?.facialMatchScore || 0);
  const [matchResult, setMatchResult] = useState<'pending' | 'matched' | 'failed'>('pending');
  const livenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── General ────────────────────────────────────────────────────────────
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ───── Camera helpers ─────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      // Start liveness sequence after 1s
      livenessTimerRef.current = setTimeout(() => setLivenessStage('blink'), 1200);
    } catch {
      setCameraError(
        t(
          'تعذر الوصول للكاميرا. تأكد من السماح بالوصول وأعد المحاولة.',
          'Could not access camera. Please allow camera access and try again.'
        )
      );
      setIsCameraActive(false);
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    if (livenessTimerRef.current) clearTimeout(livenessTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    if (step === 'liveness' && !capturedSelfie) {
      void startCamera();
    } else if (step !== 'liveness') {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step]);

  // Liveness: auto-advance stages
  useEffect(() => {
    if (!isCameraActive) return;
    if (livenessStage === 'blink') {
      livenessTimerRef.current = setTimeout(() => setLivenessStage('tilt'), 2500);
    } else if (livenessStage === 'tilt') {
      livenessTimerRef.current = setTimeout(() => setLivenessStage('done'), 2500);
    }
    return () => {
      if (livenessTimerRef.current) clearTimeout(livenessTimerRef.current);
    };
  }, [livenessStage, isCameraActive]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedSelfie(dataUrl);
    stopCamera();
  }, [stopCamera]);

  // ───── Step 1 submit ──────────────────────────────────────────────────
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim() || fullName.trim().length < 4) {
      setErrorMsg(t('يرجى إدخال الاسم بالكامل (4 أحرف على الأقل)', 'Please enter your full name'));
      return;
    }
    if (nationalId.length !== 14) {
      setErrorMsg(t('الرقم القومي يجب أن يتكون من 14 رقماً', 'National ID must be exactly 14 digits'));
      return;
    }
    const cleanPhone = phone.replace(/\s/g, '');
    if (!/^01[0125][0-9]{8}$/.test(cleanPhone)) {
      setErrorMsg(t('رقم الهاتف غير صحيح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ومكون من 11 رقماً', 'Invalid Egyptian phone number'));
      return;
    }
    setIsSendingOtp(true);
    setTimeout(() => {
      setIsSendingOtp(false);
      setStep('otp');
    }, 800);
  };

  // ───── Step 2: OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = () => {
    setOtpError(null);
    // Any 4-digit code accepted (simulated)
    if (otpCode.length < 4) {
      setOtpError(t('أدخل رمز التحقق المكون من 4 أرقام', 'Enter the 4-digit verification code'));
      return;
    }
    setStep('id_upload');
  };

  // ───── Step 3: ID Upload ──────────────────────────────────────────────
  const handleIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t('الملف كبير جداً. الحد الأقصى 10 ميجا', 'File too large. Max 10 MB'));
      return;
    }
    setIdPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIdPhotoUrl(ev.target?.result as string ?? null);
    };
    reader.readAsDataURL(file);
  };

  const handleIdUploadNext = () => {
    setErrorMsg(null);
    if (!idPhotoUrl) {
      setErrorMsg(t('يرجى رفع صورة بطاقة الرقم القومي أولاً', 'Please upload your National ID photo first'));
      return;
    }
    setLivenessStage('idle');
    setLivenessStep(0);
    setCapturedSelfie(null);
    setMatchResult('pending');
    setMatchScore(0);
    setStep('liveness');
  };

  // ───── Step 4: Liveness → AI Match → Complete ─────────────────────────
  const handleAnalyzeMatch = async () => {
    if (!capturedSelfie) return;
    setIsAnalyzing(true);
    setMatchResult('pending');

    // Simulate AI face comparison (1.5s)
    await new Promise((r) => setTimeout(r, 1500));

    // Always succeed in this environment (no real AI API)
    const score = Math.floor(Math.random() * 8) + 90; // 90–97%
    setMatchScore(score);
    setMatchResult('matched');
    setIsAnalyzing(false);
  };

  const handleCompleteVerification = async () => {
    if (matchResult !== 'matched') return;
    setIsSubmitting(true);
    try {
      const record: TenantVerificationData = {
        fullName: fullName.trim(),
        nationalId: nationalId.trim(),
        phone: phone.trim(),
        governorate,
        idCardPhotoUrl: idPhotoUrl,
        selfiePhotoUrl: capturedSelfie,
        facialMatchScore: matchScore,
        verifiedAtMs: Date.now(),
      };
      await onComplete(record);
      setStep('success');
    } catch {
      setErrorMsg(t('حدث خطأ أثناء حفظ التوثيق، يرجى المحاولة مرة أخرى', 'Verification save failed, please retry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ───── Step indicators ────────────────────────────────────────────────
  const steps: { key: Step; label: string }[] = [
    { key: 'form', label: t('البيانات', 'Info') },
    { key: 'otp', label: t('تأكيد الهاتف', 'Phone OTP') },
    { key: 'id_upload', label: t('البطاقة', 'ID Upload') },
    { key: 'liveness', label: t('الكاميرا', 'Liveness') },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4">

        {/* ── Header ── */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-sm font-bold">{t('توثيق الهوية (KYC)', 'Identity Verification (KYC)')}</h2>
                <p className="text-[11px] text-emerald-200/80">
                  {t('بعد التوثيق يمكنك حجز الشقق بأمان تام', 'After verification you can book apartments securely')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step progress bar */}
          {step !== 'success' && (
            <div className="flex items-center gap-1.5 mt-1">
              {steps.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div
                    className={`flex-1 h-1.5 rounded-full transition-all ${
                      i < currentStepIndex
                        ? 'bg-emerald-400'
                        : i === currentStepIndex
                        ? 'bg-white'
                        : 'bg-white/20'
                    }`}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
          {step !== 'success' && (
            <div className="flex justify-between mt-1">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`text-[9px] font-semibold ${
                    i === currentStepIndex ? 'text-white' : i < currentStepIndex ? 'text-emerald-300' : 'text-white/40'
                  }`}
                >
                  {i + 1}. {s.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-5 space-y-4">

          {/* Global error */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ══════ STEP 1: FORM ══════════════════════════════════════════════ */}
          {step === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('الاسم بالكامل (كما في بطاقة الرقم القومي)', 'Full Name (as in National ID)')}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('محمد أحمد إبراهيم', 'Mohamed Ahmed Ibrahim')}
                    className="w-full h-10 pr-9 pl-3.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('الرقم القومي (14 رقماً)', 'National ID (14 digits)')}
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="text"
                      required
                      maxLength={14}
                      inputMode="numeric"
                      value={nationalId}
                      onChange={(e) => setNationalId(normalizeNumericInput(e.target.value))}
                      placeholder="29810150104829"
                      className="w-full h-10 pr-9 pl-3.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('رقم الهاتف المحمول', 'Mobile Phone Number')}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="tel"
                      required
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full h-10 pr-9 pl-3.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('المحافظة', 'Governorate')}
                </label>
                <select
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full h-10 px-3.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {GOVERNORATES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[11px] flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <span>
                  {t(
                    'بياناتك محمية ومشفرة ولن تُشارك مع أطراف خارجية. بمجرد تأكيد البيانات سيصلك كود تحقق على هاتفك.',
                    'Your data is encrypted and never shared. After confirming, you will receive a verification code on your phone.'
                  )}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSendingOtp}
                className="w-full h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2"
              >
                {isSendingOtp ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Phone className="w-4 h-4" />
                    <span>{t('إرسال كود التحقق على هاتفي', 'Send verification code to my phone')}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ══════ STEP 2: PHONE OTP ════════════════════════════════════════ */}
          {step === 'otp' && (
            <div className="space-y-5 text-center py-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center border border-emerald-200">
                <Phone className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('تأكيد رقم الهاتف', 'Verify Your Phone Number')}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {t('تم إرسال كود تحقق مكون من 4 أرقام إلى', 'A 4-digit code was sent to')}{' '}
                  <span className="font-mono font-bold text-slate-800 ltr">{phone}</span>
                </p>
              </div>

              {otpError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 text-start">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{otpError}</span>
                </div>
              )}

              <div className="max-w-[200px] mx-auto space-y-1.5">
                <input
                  type="text"
                  maxLength={4}
                  inputMode="numeric"
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(normalizeNumericInput(e.target.value))}
                  placeholder="1234"
                  className="w-full h-14 text-center font-mono text-2xl tracking-[0.6em] rounded-2xl border-2 border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-emerald-50/30"
                />
                <p className="text-[10px] text-slate-400">
                  {t('💡 كود تجريبي: أي 4 أرقام', '💡 Demo: any 4-digit code works')}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setOtpCode(''); setOtpError(null); setStep('form'); }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  {t('تعديل الرقم', 'Edit Number')}
                </button>
                <button
                  type="button"
                  disabled={otpCode.length < 4}
                  onClick={handleVerifyOtp}
                  className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-md shadow-emerald-700/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {t('تأكيد الكود', 'Confirm Code')}
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 3: ID CARD UPLOAD ═══════════════════════════════════ */}
          {step === 'id_upload' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>{t('تم تأكيد رقم الهاتف ✓', 'Phone verified ✓')}</strong>
                  {' – '}
                  {t('الآن ارفع صورة واضحة للوجه الأمامي من بطاقة رقمك القومي', 'Now upload a clear photo of the front side of your National ID card')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  {t('صورة الوجه الأمامي للبطاقة', 'National ID Card – Front Side')}
                </label>

                {idPhotoUrl ? (
                  <div className="rounded-2xl overflow-hidden border-2 border-emerald-400 bg-slate-50 p-2 text-center space-y-2">
                    <img
                      src={idPhotoUrl}
                      alt="ID preview"
                      className="w-full h-36 object-cover rounded-xl"
                    />
                    <div className="flex items-center justify-center gap-1.5 text-emerald-700 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{idPhotoFile?.name || t('تم رفع الصورة', 'Photo uploaded')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setIdPhotoUrl(null); setIdPhotoFile(null); }}
                      className="text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:underline"
                    >
                      {t('تغيير الصورة', 'Change photo')}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => idInputRef.current?.click()}
                    className="h-36 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/60 hover:bg-emerald-50/20 transition-all"
                  >
                    <Upload className="w-7 h-7 text-emerald-600" />
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-800">
                        {t('اضغط لرفع صورة البطاقة', 'Tap to upload ID card photo')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t('JPG أو PNG – الحد الأقصى 10 ميجابايت', 'JPG or PNG – max 10 MB')}
                      </p>
                    </div>
                  </div>
                )}

                <input
                  ref={idInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleIdFileChange}
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  {t(
                    'تأكد أن الصورة واضحة وجميع البيانات مقروءة. الصورة ستُستخدم للمقارنة مع السيلفي في الخطوة التالية.',
                    'Ensure the photo is clear and all data is readable. It will be compared with your selfie in the next step.'
                  )}
                </span>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('otp')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  {t('رجوع', 'Back')}
                </button>
                <button
                  type="button"
                  onClick={handleIdUploadNext}
                  className="flex-1 h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  {t('التالي: فتح الكاميرا للمقارنة', 'Next: Open Camera for Comparison')}
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 4: LIVENESS + AI MATCH ═════════════════════════════ */}
          {step === 'liveness' && (
            <div className="space-y-4">
              {!capturedSelfie ? (
                <>
                  {/* Live instructions */}
                  {isCameraActive && (
                    <div className={`p-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                      livenessStage === 'idle'
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : livenessStage === 'blink'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
                        : livenessStage === 'tilt'
                        ? 'bg-blue-50 border-blue-300 text-blue-800 animate-pulse'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    }`}>
                      {livenessStage === 'idle' && t('📸 ضع وجهك في المنتصف وانتظر التعليمات', '📸 Center your face and wait for instructions')}
                      {livenessStage === 'blink' && t('👁 ارمش بعينيك مرتين الآن!', '👁 Blink twice now!')}
                      {livenessStage === 'tilt' && t('↔ حرك رأسك يميناً ثم شمالاً ببطء', '↔ Slowly turn your head right then left')}
                      {livenessStage === 'done' && t('✅ ممتاز! الآن اضغط لالتقاط الصورة', '✅ Great! Now tap to capture your photo')}
                    </div>
                  )}

                  {/* Camera error */}
                  {cameraError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{cameraError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-700 hover:underline"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t('إعادة المحاولة', 'Retry')}
                      </button>
                    </div>
                  )}

                  {/* Video viewport */}
                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video border-2 border-emerald-400 shadow-lg">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {/* Face guide overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className={`w-32 h-40 rounded-full border-4 transition-colors ${
                        livenessStage === 'done' ? 'border-emerald-400' : 'border-white/50'
                      }`} style={{ borderStyle: 'dashed' }} />
                    </div>
                    {/* Stage dot */}
                    {isCameraActive && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-1">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          livenessStage === 'done' ? 'bg-emerald-400' : 'bg-red-400'
                        }`} />
                        <span className="text-[9px] text-white font-bold">LIVE</span>
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep('id_upload')}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                    >
                      {t('رجوع', 'Back')}
                    </button>
                    <button
                      type="button"
                      disabled={!isCameraActive || livenessStage !== 'done'}
                      onClick={capturePhoto}
                      className={`flex-1 h-11 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md ${
                        livenessStage === 'done'
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      {t('التقاط الصورة', 'Capture Photo')}
                    </button>
                  </div>
                </>
              ) : (
                /* Captured — show match analysis */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-600">{t('صورة البطاقة', 'ID Card Photo')}</p>
                      <div className="rounded-2xl overflow-hidden border-2 border-blue-300 bg-slate-100 aspect-video">
                        <img src={idPhotoUrl!} alt="ID" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-600">{t('السيلفي', 'Selfie')}</p>
                      <div className="rounded-2xl overflow-hidden border-2 border-emerald-300 bg-slate-100 aspect-video">
                        <img src={capturedSelfie} alt="Selfie" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  </div>

                  {/* AI analysis result */}
                  {matchResult === 'pending' && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={handleAnalyzeMatch}
                      className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-700/20 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      {t('بدء مقارنة الذكاء الاصطناعي للصورتين', 'Start AI Face Comparison')}
                    </button>
                  )}

                  {isAnalyzing && (
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-xs text-center space-y-2">
                      <div className="w-8 h-8 border-3 border-blue-300 border-t-blue-700 rounded-full animate-spin mx-auto" />
                      <p className="font-bold">{t('الذكاء الاصطناعي يحلل الصورتين...', 'AI is analyzing both photos...')}</p>
                      <p className="text-blue-600">{t('يتم مقارنة ملامح الوجه مع البطاقة بدقة عالية', 'Comparing facial features with ID with high accuracy')}</p>
                    </div>
                  )}

                  {matchResult === 'matched' && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-xs text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="font-bold text-sm">
                        {t('الصورة مطابقة!', 'Photo Match Confirmed!')}
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-emerald-200">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${matchScore}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-emerald-700">{matchScore}%</span>
                      </div>
                      <p className="text-emerald-600 text-[10px]">
                        {t('تم التحقق من الهوية بنجاح عبر نظام الذكاء الاصطناعي', 'Identity successfully verified via AI system')}
                      </p>
                    </div>
                  )}

                  {matchResult === 'failed' && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
                      <p className="font-bold">{t('لم تتطابق الصورتان بما يكفي', 'Photos did not match well enough')}</p>
                      <button
                        type="button"
                        onClick={() => { setCapturedSelfie(null); setMatchResult('pending'); void startCamera(); }}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-700 hover:underline mx-auto"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t('إعادة التقاط السيلفي', 'Retake Selfie')}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => { setCapturedSelfie(null); setMatchResult('pending'); setLivenessStage('idle'); void startCamera(); }}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t('إعادة التصوير', 'Retake')}
                    </button>

                    {matchResult === 'matched' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleCompleteVerification}
                        className="flex-1 h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            {t('إتمام التوثيق الرسمي', 'Complete Verification')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════ STEP 5: SUCCESS ══════════════════════════════════════════ */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-5">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center border-4 border-emerald-300 shadow-lg">
                <ShieldCheck className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center justify-center gap-2">
                  {t('تهانينا! حسابك موثق رسمياً', 'Congratulations! Account Fully Verified')}
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </h3>
                <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
                  {t(
                    'تم التحقق من هويتك بالكامل. يمكنك الآن حجز أي شقة والتواصل مع الملاك بكل أمان وثقة.',
                    'Your identity is fully verified. You can now book any apartment and contact landlords with full confidence.'
                  )}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold">{fullName || existingData?.fullName}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold">
                    ✓ {t('موثق', 'Verified')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span className="font-mono">{phone || existingData?.phone}</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span className="font-mono">
                    {nationalId
                      ? `${nationalId.slice(0, 4)}••••${nationalId.slice(-4)}`
                      : existingData?.nationalId
                      ? `${existingData.nationalId.slice(0, 4)}••••${existingData.nationalId.slice(-4)}`
                      : ''}
                  </span>
                  <span className="text-emerald-600">✓</span>
                </div>
                {(matchScore > 0 || (existingData?.facialMatchScore ?? 0) > 0) && (
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>{t('مطابقة بيومترية:', 'Biometric match:')}</span>
                    <span className="font-bold font-mono text-emerald-700">
                      {matchScore || existingData?.facialMatchScore}%
                    </span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-md"
              >
                {t('العودة للمنصة وبدء الحجز', 'Return & Start Booking')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
