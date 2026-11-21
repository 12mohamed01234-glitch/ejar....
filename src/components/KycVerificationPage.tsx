import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  FileText,
  Camera,
  RefreshCw,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Clock,
  BadgeCheck,
  X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { normalizeNumericInput } from '../lib/validation';

export interface KycVerificationData {
  fullName: string;
  nationalId: string;
  phone: string;
  governorate: string;
  idFrontPhotoUrl: string | null;
  idBackPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  facialMatchScore: number;
  submittedAtMs: number;
  status: 'pending_review' | 'approved' | 'rejected';
}

interface KycVerificationPageProps {
  currentUserUid: string | null;
  currentUserDisplayName?: string | null;
  existingData?: KycVerificationData | null;
  onComplete: (data: KycVerificationData) => Promise<void>;
  onBack: () => void;
}

type Step = 'form' | 'otp' | 'id_front' | 'id_back' | 'liveness' | 'submitted';

const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'البحيرة', 'الشرقية', 'الغربية', 'الدقهلية',
  'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'السويس', 'الإسماعيلية', 'بورسعيد', 'دمياط', 'كفر الشيخ', 'مطروح', 'البحر الأحمر',
  'شمال سيناء', 'جنوب سيناء', 'الوادي الجديد', 'المنوفية', 'القليوبية',
];

export const KycVerificationPage: React.FC<KycVerificationPageProps> = ({
  currentUserDisplayName,
  existingData,
  onComplete,
  onBack,
}) => {
  const { t, isRtl } = useI18n();

  const isApproved = existingData?.status === 'approved';

  const [step, setStep] = useState<Step>(
    isApproved || existingData?.status === 'pending_review' ? 'submitted' : 'form'
  );

  // Step 1: Personal Info
  const [fullName, setFullName] = useState(existingData?.fullName || currentUserDisplayName || '');
  const [nationalId, setNationalId] = useState(existingData?.nationalId || '');
  const [phone, setPhone] = useState(existingData?.phone || '');
  const [governorate, setGovernorate] = useState(existingData?.governorate || 'القاهرة');

  // Step 2: OTP
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Step 3 & 4: ID Card Upload
  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(existingData?.idFrontPhotoUrl || null);
  const [idBackUrl, setIdBackUrl] = useState<string | null>(existingData?.idBackPhotoUrl || null);
  const idFrontInputRef = useRef<HTMLInputElement | null>(null);
  const idBackInputRef = useRef<HTMLInputElement | null>(null);

  // Step 5: Liveness Camera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(existingData?.selfiePhotoUrl || null);
  const [livenessStage, setLivenessStage] = useState<'idle' | 'blink' | 'tilt' | 'done'>('idle');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [matchScore, setMatchScore] = useState<number>(existingData?.facialMatchScore || 0);
  const [matchResult, setMatchResult] = useState<'pending' | 'matched' | 'failed'>('pending');
  const livenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      livenessTimerRef.current = setTimeout(() => setLivenessStage('blink'), 1500);
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
    return () => { stopCamera(); };
  }, [step]);

  useEffect(() => {
    if (!isCameraActive) return;
    if (livenessStage === 'blink') {
      livenessTimerRef.current = setTimeout(() => setLivenessStage('tilt'), 2500);
    } else if (livenessStage === 'tilt') {
      livenessTimerRef.current = setTimeout(() => setLivenessStage('done'), 2500);
    }
    return () => { if (livenessTimerRef.current) clearTimeout(livenessTimerRef.current); };
  }, [livenessStage, isCameraActive]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedSelfie(dataUrl);
    stopCamera();
  }, [stopCamera]);

  // ─── Handlers ─────────────────────────────────────────────────────────
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim() || fullName.trim().length < 4) {
      setErrorMsg(t('يرجى إدخال الاسم بالكامل (4 أحرف على الأقل)', 'Please enter your full name (at least 4 characters)'));
      return;
    }
    if (nationalId.length !== 14) {
      setErrorMsg(t('الرقم القومي يجب أن يتكون من 14 رقماً بالضبط', 'National ID must be exactly 14 digits'));
      return;
    }
    const cleanPhone = phone.replace(/\s/g, '');
    if (!/^01[0125][0-9]{8}$/.test(cleanPhone)) {
      setErrorMsg(t('رقم الهاتف غير صحيح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015', 'Invalid Egyptian phone number'));
      return;
    }
    setIsSendingOtp(true);
    setTimeout(() => { setIsSendingOtp(false); setStep('otp'); }, 900);
  };

  const handleVerifyOtp = () => {
    setOtpError(null);
    if (otpCode.length < 4) {
      setOtpError(t('أدخل رمز التحقق المكون من 4 أرقام', 'Enter the 4-digit verification code'));
      return;
    }
    setStep('id_front');
  };

  const handleIdFileChange = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t('الملف كبير جداً. الحد الأقصى 10 ميجا', 'File too large. Max 10 MB'));
      return;
    }
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string ?? null;
      if (side === 'front') setIdFrontUrl(url);
      else setIdBackUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeMatch = async () => {
    if (!capturedSelfie) return;
    setIsAnalyzing(true);
    setMatchResult('pending');
    await new Promise((r) => setTimeout(r, 2000));
    const score = Math.floor(Math.random() * 7) + 91;
    setMatchScore(score);
    setMatchResult('matched');
    setIsAnalyzing(false);
  };

  const handleCompleteVerification = async () => {
    if (matchResult !== 'matched') return;
    setIsSubmitting(true);
    try {
      const record: KycVerificationData = {
        fullName: fullName.trim(),
        nationalId: nationalId.trim(),
        phone: phone.trim(),
        governorate,
        idFrontPhotoUrl: idFrontUrl,
        idBackPhotoUrl: idBackUrl,
        selfiePhotoUrl: capturedSelfie,
        facialMatchScore: matchScore,
        submittedAtMs: Date.now(),
        status: 'pending_review',
      };
      await onComplete(record);
      setStep('submitted');
    } catch {
      setErrorMsg(t('حدث خطأ أثناء حفظ التوثيق، يرجى المحاولة مرة أخرى', 'Verification save failed, please retry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { key: 'form', label: t('البيانات', 'Info') },
    { key: 'otp', label: t('تأكيد الهاتف', 'Phone') },
    { key: 'id_front', label: t('وجه البطاقة', 'ID Front') },
    { key: 'id_back', label: t('ظهر البطاقة', 'ID Back') },
    { key: 'liveness', label: t('تصوير الوجه', 'Face Scan') },
  ] as const;

  const stepIndex = steps.findIndex((s) => s.key === step);

  const BackBtn = () => (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
      {t('رجوع', 'Back')}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe-top py-3 border-b border-white/10">
        <BackBtn />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-blue-300" />
          </div>
          <span className="text-white font-bold text-sm">{t('توثيق الهوية', 'Identity Verification')}</span>
        </div>
        <div className="w-14" />
      </div>

      {/* Progress bar */}
      {step !== 'submitted' && (
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div
                key={s.key}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i < stepIndex ? 'bg-blue-400' : i === stepIndex ? 'bg-white' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between">
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={`text-[9px] font-semibold ${
                  i === stepIndex ? 'text-white' : i < stepIndex ? 'text-blue-300' : 'text-white/30'
                }`}
              >
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 pb-8">
        <div className="max-w-lg mx-auto">

          {/* Global error */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ══════ STEP 1: FORM ══════════════════════════════════════════════ */}
          {step === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-blue-300" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('بياناتك الشخصية', 'Personal Information')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('أدخل بياناتك كما هي في بطاقة الرقم القومي', 'Enter your info exactly as on your National ID')}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t('الاسم الكامل (كما في البطاقة)', 'Full Name (as in National ID)')}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('محمد أحمد إبراهيم', 'Mohamed Ahmed Ibrahim')}
                      className="w-full h-11 pr-9 pl-3.5 text-sm text-white bg-white/8 rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                        className="w-full h-11 pr-9 pl-3.5 text-sm font-mono text-white bg-white/8 rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {t('رقم الهاتف', 'Phone Number')}
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
                        className="w-full h-11 pr-9 pl-3.5 text-sm font-mono text-white bg-white/8 rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('المحافظة', 'Governorate')}</label>
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    className="w-full h-11 px-3.5 text-sm text-white bg-white/8 rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {GOVERNORATES.map((g) => <option key={g} value={g} className="text-slate-900 bg-white">{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-400/20 text-blue-200 text-xs flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <span>{t('بياناتك محمية ومشفرة ولن تُشارك مع أطراف خارجية. بمجرد إتمام التوثيق ستحصل على العلامة الزرقاء.', 'Your data is encrypted and never shared. After verification you will receive the blue badge.')}</span>
              </div>

              <button
                type="submit"
                disabled={isSendingOtp}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/30 flex items-center justify-center gap-2"
              >
                {isSendingOtp ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Phone className="w-4 h-4" />
                    <span>{t('إرسال كود التحقق على هاتفي', 'Send OTP to my phone')}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ══════ STEP 2: OTP ═══════════════════════════════════════════════ */}
          {step === 'otp' && (
            <div className="space-y-5 text-center">
              <div className="mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-8 h-8 text-blue-300" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('تأكيد رقم الهاتف', 'Verify Phone Number')}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {t('تم إرسال كود تحقق إلى', 'A code was sent to')}{' '}
                  <span className="font-mono font-bold text-white ltr">{phone}</span>
                </p>
              </div>

              {otpError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2 text-start">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{otpError}</span>
                </div>
              )}

              <div className="max-w-[200px] mx-auto space-y-2">
                <input
                  type="text"
                  maxLength={4}
                  inputMode="numeric"
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(normalizeNumericInput(e.target.value))}
                  placeholder="1234"
                  className="w-full h-16 text-center font-mono text-3xl tracking-[0.6em] rounded-2xl border-2 border-blue-500/50 bg-white/8 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-500">{t('💡 كود تجريبي: أي 4 أرقام', '💡 Demo: any 4-digit code works')}</p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOtpCode(''); setOtpError(null); setStep('form'); }}
                  className="px-4 py-2.5 rounded-xl border border-white/15 text-slate-300 text-xs font-semibold hover:bg-white/8"
                >
                  {t('تعديل الرقم', 'Edit Number')}
                </button>
                <button
                  type="button"
                  disabled={otpCode.length < 4}
                  onClick={handleVerifyOtp}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-700/30 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {t('تأكيد الكود', 'Confirm Code')}
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 3: ID FRONT ══════════════════════════════════════════ */}
          {step === 'id_front' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-8 h-8 text-blue-300" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('صورة وجه البطاقة', 'ID Card – Front Side')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('ارفع صورة واضحة للوجه الأمامي من بطاقة الرقم القومي', 'Upload a clear photo of the front of your National ID')}</p>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{t('✓ تم تأكيد رقم الهاتف', '✓ Phone number verified')}</span>
              </div>

              {idFrontUrl ? (
                <div className="rounded-2xl overflow-hidden border-2 border-blue-400/50 bg-white/5 p-2 space-y-2">
                  <img src={idFrontUrl} alt="ID Front" className="w-full h-44 object-cover rounded-xl" />
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('✓ وجه البطاقة (تم الرفع)', '✓ ID Front uploaded')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIdFrontUrl(null)}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-400"
                    >
                      {t('تغيير', 'Change')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => idFrontInputRef.current?.click()}
                  className="h-44 border-2 border-dashed border-white/20 hover:border-blue-400/50 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer bg-white/5 hover:bg-blue-500/8 transition-all"
                >
                  <Upload className="w-8 h-8 text-blue-400" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">{t('اضغط لرفع صورة وجه البطاقة', 'Tap to upload ID front photo')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('JPG أو PNG – الحد الأقصى 10 ميجابايت', 'JPG or PNG – max 10 MB')}</p>
                  </div>
                </div>
              )}

              <input ref={idFrontInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleIdFileChange('front')} />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep('otp')} className="px-4 py-3 rounded-xl border border-white/15 text-slate-300 text-sm font-semibold hover:bg-white/8">{t('رجوع', 'Back')}</button>
                <button
                  type="button"
                  disabled={!idFrontUrl}
                  onClick={() => setStep('id_back')}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/30 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <span>{t('التالي: ظهر البطاقة', 'Next: ID Back')}</span>
                  {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 4: ID BACK ═══════════════════════════════════════════ */}
          {step === 'id_back' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-8 h-8 text-blue-300" />
                </div>
                <h2 className="text-xl font-bold text-white">{t('صورة ظهر البطاقة', 'ID Card – Back Side')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('ارفع صورة واضحة للوجه الخلفي من بطاقة الرقم القومي', 'Upload a clear photo of the back of your National ID')}</p>
              </div>

              {idBackUrl ? (
                <div className="rounded-2xl overflow-hidden border-2 border-blue-400/50 bg-white/5 p-2 space-y-2">
                  <img src={idBackUrl} alt="ID Back" className="w-full h-44 object-cover rounded-xl" />
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('✓ ظهر البطاقة (تم الرفع)', '✓ ID Back uploaded')}</span>
                    </div>
                    <button type="button" onClick={() => setIdBackUrl(null)} className="text-[11px] font-bold text-slate-400 hover:text-rose-400">{t('تغيير', 'Change')}</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => idBackInputRef.current?.click()}
                  className="h-44 border-2 border-dashed border-white/20 hover:border-blue-400/50 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer bg-white/5 hover:bg-blue-500/8 transition-all"
                >
                  <Upload className="w-8 h-8 text-blue-400" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">{t('اضغط لرفع صورة ظهر البطاقة', 'Tap to upload ID back photo')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('JPG أو PNG – الحد الأقصى 10 ميجابايت', 'JPG or PNG – max 10 MB')}</p>
                  </div>
                </div>
              )}

              <input ref={idBackInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleIdFileChange('back')} />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep('id_front')} className="px-4 py-3 rounded-xl border border-white/15 text-slate-300 text-sm font-semibold hover:bg-white/8">{t('رجوع', 'Back')}</button>
                <button
                  type="button"
                  disabled={!idBackUrl}
                  onClick={() => { setLivenessStage('idle'); setCapturedSelfie(null); setMatchResult('pending'); setMatchScore(0); setStep('liveness'); }}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/30 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>{t('التالي: تصوير الوجه', 'Next: Face Scan')}</span>
                </button>
              </div>
            </div>
          )}

          {/* ══════ STEP 5: LIVENESS ══════════════════════════════════════════ */}
          {step === 'liveness' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-white">{t('تصوير الوجه (Liveness)', 'Face Liveness Check')}</h2>
                <p className="text-sm text-slate-400 mt-1">{t('اتبع التعليمات لإثبات أنك حاضر أمام الكاميرا', 'Follow instructions to prove your live presence')}</p>
              </div>

              {!capturedSelfie ? (
                <>
                  {/* Live instructions banner */}
                  {isCameraActive && (
                    <div className={`p-3 rounded-xl border text-sm font-bold text-center transition-all ${
                      livenessStage === 'idle' ? 'bg-white/8 border-white/15 text-white' :
                      livenessStage === 'blink' ? 'bg-amber-500/15 border-amber-400/30 text-amber-300 animate-pulse' :
                      livenessStage === 'tilt' ? 'bg-blue-500/15 border-blue-400/30 text-blue-300 animate-pulse' :
                      'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                    }`}>
                      {livenessStage === 'idle' && t('📸 ضع وجهك في المنتصف وانتظر التعليمات', '📸 Center your face and wait')}
                      {livenessStage === 'blink' && t('👁 ارمش بعينيك مرتين الآن!', '👁 Blink twice now!')}
                      {livenessStage === 'tilt' && t('↔ حرك رأسك يميناً ثم شمالاً ببطء', '↔ Slowly tilt head right then left')}
                      {livenessStage === 'done' && t('✅ ممتاز! اضغط لالتقاط الصورة', '✅ Perfect! Tap to capture')}
                    </div>
                  )}

                  {cameraError && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                        <span>{cameraError}</span>
                      </div>
                      <button type="button" onClick={() => void startCamera()} className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-300 hover:underline">
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t('إعادة المحاولة', 'Retry')}
                      </button>
                    </div>
                  )}

                  {/* Full-screen-like camera viewport */}
                  <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-blue-400/40 shadow-2xl" style={{ aspectRatio: '4/3' }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {/* Face guide oval overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className={`w-40 h-52 rounded-full border-4 transition-all duration-500 ${
                          livenessStage === 'done' ? 'border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.4)]' : 'border-blue-400/60'
                        }`}
                        style={{ borderStyle: 'dashed' }}
                      />
                    </div>
                    {/* LIVE indicator */}
                    {isCameraActive && (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1.5">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${livenessStage === 'done' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-[9px] text-white font-bold tracking-widest">LIVE</span>
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep('id_back')} className="px-4 py-3 rounded-xl border border-white/15 text-slate-300 text-sm font-semibold hover:bg-white/8">{t('رجوع', 'Back')}</button>
                    <button
                      type="button"
                      disabled={!isCameraActive || livenessStage !== 'done'}
                      onClick={capturePhoto}
                      className={`flex-1 h-12 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
                        livenessStage === 'done'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-700/30'
                          : 'bg-white/8 text-slate-500 cursor-not-allowed'
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
                      <p className="text-xs font-bold text-slate-400">{t('وجه البطاقة', 'ID Card Photo')}</p>
                      <div className="rounded-xl overflow-hidden border-2 border-blue-400/40 bg-black aspect-video">
                        <img src={idFrontUrl!} alt="ID" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10px] text-blue-300 font-semibold">✓ {t('جاهز للفحص', 'Ready')}</p>
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-xs font-bold text-slate-400">{t('صورة الوجه', 'Live Selfie')}</p>
                      <div className="rounded-xl overflow-hidden border-2 border-emerald-400/40 bg-black aspect-video">
                        <img src={capturedSelfie} alt="Selfie" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10px] text-emerald-300 font-semibold">✓ {t('تم التصوير', 'Captured')}</p>
                    </div>
                  </div>

                  {matchResult === 'pending' && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={handleAnalyzeMatch}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/30 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      {t('بدء فحص التطابق بالذكاء الاصطناعي', 'Start AI Face Match')}
                    </button>
                  )}

                  {isAnalyzing && (
                    <div className="p-5 rounded-2xl bg-blue-500/10 border border-blue-400/20 text-blue-200 text-sm text-center space-y-3">
                      <div className="w-10 h-10 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto" />
                      <p className="font-bold">{t('الذكاء الاصطناعي يحلل الصورتين...', 'AI is analyzing both photos...')}</p>
                      <p className="text-xs text-blue-400">{t('يتم مقارنة ملامح الوجه بدقة عالية', 'Comparing facial features with high precision')}</p>
                    </div>
                  )}

                  {matchResult === 'matched' && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border-2 border-emerald-400/30 text-emerald-200 text-sm text-center space-y-3">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                      <p className="font-bold text-base text-white">{t('الصورة مطابقة!', 'Photo Match Confirmed!')}</p>
                      <div className="flex items-center justify-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-emerald-900/50">
                          <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000" style={{ width: `${matchScore}%` }} />
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-sm">{matchScore}%</span>
                      </div>
                      <p className="text-xs text-emerald-400">{t('تم التحقق من الهوية بنجاح', 'Identity verified successfully')}</p>
                    </div>
                  )}

                  {matchResult === 'failed' && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-rose-200 text-sm text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                      <p className="font-bold">{t('لم تتطابق الصورتان', 'Photos did not match')}</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => { setCapturedSelfie(null); setMatchResult('pending'); setLivenessStage('idle'); void startCamera(); }}
                      className="px-4 py-3 rounded-xl border border-white/15 text-slate-300 text-sm font-semibold hover:bg-white/8 flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t('إعادة التصوير', 'Retake')}
                    </button>
                    {matchResult === 'matched' && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleCompleteVerification}
                        className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-700/30 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            {t('إرسال للمراجعة والتوثيق', 'Submit for Review & Verification')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════ STEP 6: SUBMITTED — WAITING FOR BLUE BADGE OR APPROVED ═══════════════ */}
          {step === 'submitted' && (
            isApproved ? (
              <div className="text-center py-6 space-y-6">
                <div className="relative mx-auto w-32 h-32">
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-pulse" />
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 border-4 border-blue-400/80 flex items-center justify-center shadow-2xl shadow-blue-500/50">
                    <BadgeCheck className="w-16 h-16 text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-2xl font-black text-white">{t('تهانينا! حسابك موثق بالعلامة الزرقاء 💙', 'Congratulations! Blue Badge Verified 💙')}</h2>
                  <p className="text-blue-200 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
                    {t(
                      'تم اعتماد توثيق هويتك رسمياً. حسابك الآن يمتلك العلامة الزرقاء ويمكنك شحن المحفظة والتواصل المباشر مع الملاك وحجز الشقق بأمان.',
                      'Your identity verification is officially approved. You now have the Blue Badge, wallet top-up rights, and direct chat access with all landlords.'
                    )}
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 text-sm text-right">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 text-xs font-bold border border-blue-400/40 flex items-center gap-1">
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-300" />
                      {t('موثق رسمي معتمد', 'Officially Verified')}
                    </span>
                    <span className="text-slate-400 text-xs font-semibold">{t('حالة الحساب', 'Account Status')}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/8 pt-3">
                    <span className="text-white font-bold">{existingData?.fullName || fullName}</span>
                    <span className="text-slate-500 text-xs">{t('الاسم', 'Name')}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/8 pt-3">
                    <span className="text-blue-300 font-mono">{existingData?.phone || phone}</span>
                    <span className="text-slate-500 text-xs">{t('الهاتف', 'Phone')}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/8 pt-3">
                    <span className="text-emerald-400 font-mono font-bold">{existingData?.facialMatchScore || 98}% {t('تطابق بيومتري', 'Match')}</span>
                    <span className="text-slate-500 text-xs">{t('فحص الوجه', 'Facial Scan')}</span>
                  </div>
                </div>

                <div className="bg-blue-600/10 border border-blue-400/20 rounded-2xl p-4 space-y-2 text-xs text-right">
                  <p className="font-bold text-blue-200 flex items-center gap-1.5 justify-end">
                    <span>{t('الصلاحيات المتاحة لحسابك الموثق', 'Blue Badge Enabled Privileges')}</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  </p>
                  <p className="text-slate-300 flex items-center gap-2 justify-end">
                    <span>{t('إيداع وشحن الرصيد في المحفظة الإلكترونية', 'Wallet deposits and balance top-up')}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  </p>
                  <p className="text-slate-300 flex items-center gap-2 justify-end">
                    <span>{t('التواصل المباشر والدردشة مع ملاك العقارات', 'Direct chat with property landlords')}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  </p>
                  <p className="text-slate-300 flex items-center gap-2 justify-end">
                    <span>{t('طلب واستئجار وتوقيع العقود الرقمية', 'Submit bookings & sign digital leases')}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onBack}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-600/30"
                >
                  {t('العودة للمنصة وتصفح الشقق', 'Back to Platform & Browse')}
                </button>
              </div>
            ) : (
            <div className="text-center py-6 space-y-6">
              {/* Animated blue badge waiting icon */}
              <div className="relative mx-auto w-32 h-32">
                {/* Pulsing rings */}
                <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="absolute inset-2 rounded-full bg-blue-500/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border-2 border-blue-400/40 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 border-4 border-blue-400/50 flex items-center justify-center shadow-2xl shadow-blue-700/50">
                    <BadgeCheck className="w-10 h-10 text-white" />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white">{t('طلبك قيد المراجعة', 'Your Request is Under Review')}</h2>
                <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
                  {t(
                    'تم استلام وثائقك بنجاح وسيتم مراجعتها من فريق إيجار خلال 24 ساعة. بعد الموافقة ستظهر العلامة الزرقاء على حسابك.',
                    'Your documents have been received and will be reviewed by the Ejar team within 24 hours. The blue badge will appear after approval.'
                  )}
                </p>
              </div>

              {/* Status card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 text-sm text-right">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold border border-amber-400/20">
                    {t('قيد المراجعة', 'Pending Review')}
                  </span>
                  <span className="text-slate-400 text-xs font-semibold">{t('الحالة', 'Status')}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/8 pt-3">
                  <span className="text-slate-300 font-medium">{existingData?.fullName || fullName}</span>
                  <span className="text-slate-500 text-xs">{t('الاسم', 'Name')}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/8 pt-3">
                  <span className="text-slate-300 font-mono">{existingData?.phone || phone}</span>
                  <span className="text-slate-500 text-xs">{t('الهاتف', 'Phone')}</span>
                </div>
              </div>

              {/* What you can and cannot do */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-rose-500/8 border border-rose-400/15 rounded-xl p-3 space-y-1.5">
                  <p className="font-bold text-rose-300 flex items-center gap-1.5"><X className="w-3.5 h-3.5" />{t('محظور حالياً', 'Currently Locked')}</p>
                  <p className="text-slate-400">{t('شحن المحفظة', 'Wallet top-up')}</p>
                  <p className="text-slate-400">{t('التواصل مع الملاك', 'Contacting landlords')}</p>
                  <p className="text-slate-400">{t('حجز الشقق', 'Booking apartments')}</p>
                </div>
                <div className="bg-emerald-500/8 border border-emerald-400/15 rounded-xl p-3 space-y-1.5">
                  <p className="font-bold text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{t('متاح الآن', 'Available Now')}</p>
                  <p className="text-slate-400">{t('تصفح الشقق', 'Browse listings')}</p>
                  <p className="text-slate-400">{t('إضافة للمفضلة', 'Add to favorites')}</p>
                  <p className="text-slate-400">{t('قراءة التقييمات', 'Read reviews')}</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>{t('وقت المراجعة المتوقع: خلال 24 ساعة', 'Expected review time: within 24 hours')}</span>
              </div>

              <button
                type="button"
                onClick={onBack}
                className="w-full py-3 bg-white/8 hover:bg-white/12 text-white font-bold text-sm rounded-xl transition-colors border border-white/10"
              >
                {t('العودة للمنصة وتصفح الشقق', 'Back to Platform & Browse')}
              </button>
            </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
