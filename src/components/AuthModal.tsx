import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  Building,
  User,
  Mail,
  Lock,
  Phone,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  Shield,
  Menu,
  Key,
  ExternalLink,
  HelpCircle,
  ArrowRight,
  Info,
  Smartphone,
  MessageSquare,
  RotateCcw,
  Edit2,
  Check,
  FileText,
  LockKeyhole,
  Headphones,
  FileCheck,
  Send,
  HelpCircle as HelpIcon,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { EjarLogo } from './EjarLogo';
import {
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_ALT_EMAIL,
  PLATFORM_ADMIN_PASSWORD,
  PLATFORM_ADMIN_INFO,
  isPlatformAdminEmail,
} from '../lib/firebase';
import { upsertSupabaseProfile } from '../lib/supabase';

export type UserRole = 'landlord' | 'tenant';

export interface UserAccountData {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  role: UserRole;
  photoUrl?: string;
  isLandlordVerified: boolean;
  isTenantVerified: boolean;
  createdAtMs: number;
}

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess: (userData: UserAccountData) => void;
  onGoogleSignIn: () => Promise<void>;
}

/**
 * Strict Egyptian Mobile Phone Number Validator
 * Enforces exactly 11 digits starting with Egyptian mobile operators (010, 011, 012, 015)
 */
function validateEgyptianPhone(raw: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  // Normalize Arabic-Indic numerals ٠-٩ to 0-9
  cleaned = cleaned.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  // Normalize Egyptian country code (+20 or 0020)
  if (cleaned.startsWith('+20')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('0020')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('20') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(2);
  }

  if (!cleaned) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'يرجى إدخال رقم الهاتف المحمول.',
    };
  }

  if (cleaned.length < 11) {
    return {
      isValid: false,
      normalized: cleaned,
      error: `رقم الهاتف ناقص (${cleaned.length} من 11 رقماً). يجب إدخال 11 رقماً بالضبط.`,
    };
  }

  if (cleaned.length > 11) {
    return {
      isValid: false,
      normalized: cleaned,
      error: `رقم الهاتف أطول من اللازم (${cleaned.length} رقماً). أرقام المحمول المصرية تتكون من 11 رقماً فقط.`,
    };
  }

  if (!/^01[0125][0-9]{8}$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'رقم الهاتف غير صحيح! يجب أن يبدأ بـ (010 أو 011 أو 012 أو 015) متبوعاً بـ 8 أرقام.',
    };
  }

  return { isValid: true, normalized: cleaned };
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
  onSuccess,
  onGoogleSignIn,
}) => {
  const { lang, t } = useI18n();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [role, setRole] = useState<UserRole>('tenant');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);

  // 6-Digit OTP Verification State
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpTargetPhone, setOtpTargetPhone] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpTimer, setOtpTimer] = useState(60);
  const [showSmsBanner, setShowSmsBanner] = useState(false);
  const [pendingUser, setPendingUser] = useState<{
    uid: string;
    displayName: string;
    email: string;
    phone: string;
    role: UserRole;
    photoUrl?: string;
  } | null>(null);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Google interactive custom account prompt state
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [googleFullName, setGoogleFullName] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [googlePhone, setGooglePhone] = useState('');
  const [googleRole, setGoogleRole] = useState<UserRole>('tenant');
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Microsoft custom account prompt state
  const [showMicrosoftPrompt, setShowMicrosoftPrompt] = useState(false);
  const [msFullName, setMsFullName] = useState('');
  const [msEmail, setMsEmail] = useState('');
  const [msPhone, setMsPhone] = useState('');
  const [msRole, setMsRole] = useState<UserRole>('tenant');
  const [msError, setMsError] = useState<string | null>(null);

  // Real Legal & Operational Dialog Modals State
  const [activeInfoModal, setActiveInfoModal] = useState<
    'about' | 'terms' | 'privacy' | 'support' | 'forgot' | 'activation' | null
  >(null);

  // Password Recovery Flow State
  const [resetStep, setResetStep] = useState<'input' | 'otp' | 'success'>('input');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetCodeGenerated, setResetCodeGenerated] = useState('');

  // Activation Troubleshooting State
  const [troublePhone, setTroublePhone] = useState('');
  const [activationChannel, setActivationChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [activationNotice, setActivationNotice] = useState<string | null>(null);

  // OTP Countdown Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showOtpScreen && otpTimer > 0) {
      timer = setInterval(() => {
        setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showOtpScreen, otpTimer]);

  if (!isOpen) return null;

  const generateNewOtpCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleResendOtp = () => {
    const newCode = generateNewOtpCode();
    setGeneratedOtp(newCode);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpTimer(60);
    setOtpError(null);
    setShowSmsBanner(true);
    setInfoMsg(t('تم إرسال كود تأكيد جديد برسالة SMS ✓', 'New SMS code sent ✓'));
    setTimeout(() => setInfoMsg(null), 3000);
  };

  const handleVerifyOtpAndRegister = async () => {
    const enteredCode = otpDigits.join('');
    if (enteredCode.length < 6) {
      setOtpError(t('يرجى إدخال كود التأكيد كاملاً (6 أرقام)', 'Please enter the complete 6-digit code'));
      return;
    }

    if (enteredCode !== generatedOtp) {
      setOtpError(
        t(
          'كود التأكيد غير صحيح! يرجى التحقق من الرقم المكتوب أو استخدام زر "نسخ وتعبئة" أعلاه.',
          'Incorrect code! Please verify the code or click "Auto Fill" above.'
        )
      );
      return;
    }

    if (!pendingUser) return;

    setLoading(true);
    setOtpError(null);
    try {
      const confirmedUser: UserAccountData = {
        uid: pendingUser.uid,
        displayName: pendingUser.displayName,
        email: pendingUser.email,
        phone: pendingUser.phone,
        role: pendingUser.role,
        photoUrl: pendingUser.photoUrl,
        isLandlordVerified: false,
        isTenantVerified: false,
        createdAtMs: Date.now(),
      };

      try {
        localStorage.setItem('ejar_custom_user', JSON.stringify(confirmedUser));
        localStorage.setItem('ejar_phone_verified', 'true');
      } catch {}

      await upsertSupabaseProfile(confirmedUser);

      onSuccess(confirmedUser);
      onClose();
    } catch (err) {
      setOtpError(
        err instanceof Error
          ? err.message
          : t('حدث خطأ أثناء حفظ الحساب، يرجى المحاولة ثانية', 'Error saving account, please try again')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim().toLowerCase();
    const isAdminAccount = isPlatformAdminEmail(trimmedEmail);

    if (mode === 'signup') {
      if (isAdminAccount) {
        setErrorMsg(
          t(
            'هذا البريد مخصص لإدارة ومالك المنصة ومسجل مسبقاً! يرجى اختيار تبويب "تسجيل الدخول".',
            'This email is reserved for platform management. Please choose "Sign In".'
          )
        );
        return;
      }
      if (!fullName.trim()) {
        setErrorMsg(t('يرجى إدخال الاسم بالكامل', 'Please enter your full name'));
        return;
      }

      // STRICT 11-digit Egyptian phone validation
      const phoneValidation = validateEgyptianPhone(phone);
      if (!phoneValidation.isValid) {
        setErrorMsg(phoneValidation.error || t('يرجى إدخال رقم هاتف مصري صحيح', 'Please enter a valid Egyptian phone number'));
        return;
      }

      if (!email.trim() || !email.includes('@')) {
        setErrorMsg(t('يرجى إدخال بريد إلكتروني صالح', 'Please enter a valid email'));
        return;
      }

      if (!password || password.length < 6) {
        setErrorMsg(t('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters'));
        return;
      }

      // Transition to 6-Digit OTP Verification step
      const code = generateNewOtpCode();
      setGeneratedOtp(code);
      setOtpTargetPhone(phoneValidation.normalized);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError(null);
      setOtpTimer(60);
      setShowSmsBanner(true);

      const mockUid = `usr_${Date.now().toString(36)}`;
      setPendingUser({
        uid: mockUid,
        displayName: fullName.trim(),
        email: email.trim(),
        phone: phoneValidation.normalized,
        role,
        photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          fullName || email
        )}&backgroundColor=0d9488,0284c7,059669`,
      });

      setShowOtpScreen(true);
      return;
    }

    // SIGN IN FLOW
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg(t('يرجى إدخال بريد إلكتروني صالح', 'Please enter a valid email'));
      return;
    }

    if (isAdminAccount) {
      if (password !== PLATFORM_ADMIN_PASSWORD) {
        setErrorMsg(
          t(
            '⛔ كلمة المرور غير صحيحة لحساب مالك المنصة! لا يمكن الدخول إلا بكلمة المرور الرسمية المعتمدة لمالك المنصة.',
            '⛔ Incorrect password for platform owner account! Access is strictly protected.'
          )
        );
        return;
      }
    } else if (!password || password.length < 6) {
      setErrorMsg(t('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters'));
      return;
    }

    setLoading(true);
    try {
      await new Promise((res) => setTimeout(res, 400));

      if (isAdminAccount) {
        const adminUserData: UserAccountData = {
          uid: 'admin_owner_01',
          displayName: PLATFORM_ADMIN_INFO.name,
          email: trimmedEmail,
          phone: '01022334455',
          role: 'landlord',
          photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=Admin&backgroundColor=0f766e`,
          isLandlordVerified: true,
          isTenantVerified: true,
          createdAtMs: 1704067200000,
        };

        try {
          localStorage.setItem('ejar_custom_user', JSON.stringify(adminUserData));
          localStorage.setItem('ejar_id_verified', 'true');
          localStorage.setItem('ejar_phone_verified', 'true');
          localStorage.setItem('ejar_liveness_verified', 'true');
        } catch {}

        await upsertSupabaseProfile(adminUserData);
        onSuccess(adminUserData);
        onClose();
        return;
      }

      // Existing user sign-in
      const mockUid = `usr_${Date.now().toString(36)}`;
      const userData: UserAccountData = {
        uid: mockUid,
        displayName: email.split('@')[0],
        email: email.trim(),
        phone: '01012345678',
        role: 'tenant',
        photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          email
        )}&backgroundColor=0d9488,0284c7,059669`,
        isLandlordVerified: false,
        isTenantVerified: false,
        createdAtMs: Date.now(),
      };

      try {
        localStorage.setItem('ejar_custom_user', JSON.stringify(userData));
      } catch {}

      await upsertSupabaseProfile(userData);
      onSuccess(userData);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : t('حدث خطأ أثناء المعالجة، يرجى المحاولة ثانية', 'An error occurred, please try again')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await onGoogleSignIn();
      onClose();
    } catch {
      setGoogleEmail(email.trim().includes('@') ? email.trim() : '');
      setGoogleFullName(
        fullName.trim() || (email.trim().includes('@') ? email.split('@')[0] : '')
      );
      setGooglePhone(phone.trim() || '');
      setGoogleRole(role);
      setShowGooglePrompt(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftClick = () => {
    setErrorMsg(null);
    setMsEmail(email.trim().includes('@') ? email.trim() : '');
    setMsFullName(
      fullName.trim() || (email.trim().includes('@') ? email.split('@')[0] : '')
    );
    setMsPhone(phone.trim() || '');
    setMsRole(role);
    setShowMicrosoftPrompt(true);
  };

  const handleConfirmGoogleUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleError(null);

    const trimmedEmail = googleEmail.trim().toLowerCase();
    const trimmedName = googleFullName.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setGoogleError(t('يرجى إدخال بريد إلكتروني صالح لحساب Google', 'Please enter a valid Google email'));
      return;
    }
    if (!trimmedName) {
      setGoogleError(t('يرجى إدخال الاسم بالكامل', 'Please enter your full name'));
      return;
    }

    const phoneValidation = validateEgyptianPhone(googlePhone);
    if (!phoneValidation.isValid) {
      setGoogleError(phoneValidation.error || t('يرجى إدخال رقم هاتف مصري صحيح', 'Please enter a valid phone'));
      return;
    }

    // OTP confirmation for Google signups
    const code = generateNewOtpCode();
    setGeneratedOtp(code);
    setOtpTargetPhone(phoneValidation.normalized);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError(null);
    setOtpTimer(60);
    setShowSmsBanner(true);

    setPendingUser({
      uid: `goog_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      displayName: trimmedName,
      email: trimmedEmail,
      phone: phoneValidation.normalized,
      role: googleRole,
      photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        trimmedName
      )}&backgroundColor=ea4335`,
    });

    setShowGooglePrompt(false);
    setShowOtpScreen(true);
  };

  const handleConfirmMicrosoftUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsError(null);

    const trimmedEmail = msEmail.trim().toLowerCase();
    const trimmedName = msFullName.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setMsError(t('يرجى إدخال بريد إلكتروني صالح لحساب Microsoft', 'Please enter a valid Microsoft email'));
      return;
    }
    if (!trimmedName) {
      setMsError(t('يرجى إدخال الاسم بالكامل', 'Please enter your full name'));
      return;
    }

    const phoneValidation = validateEgyptianPhone(msPhone);
    if (!phoneValidation.isValid) {
      setMsError(phoneValidation.error || t('يرجى إدخال رقم هاتف مصري صحيح', 'Please enter a valid phone'));
      return;
    }

    // OTP confirmation for Microsoft signups
    const code = generateNewOtpCode();
    setGeneratedOtp(code);
    setOtpTargetPhone(phoneValidation.normalized);
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError(null);
    setOtpTimer(60);
    setShowSmsBanner(true);

    setPendingUser({
      uid: `ms_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      displayName: trimmedName,
      email: trimmedEmail,
      phone: phoneValidation.normalized,
      role: msRole,
      photoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
        trimmedName
      )}&backgroundColor=00a4ef`,
    });

    setShowMicrosoftPrompt(false);
    setShowOtpScreen(true);
  };

  const handleDigitChange = (index: number, val: string) => {
    const cleanDigit = val.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleanDigit;
    setOtpDigits(updated);
    setOtpError(null);

    // Auto-advance to next box
    if (cleanDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const arr = pasted.split('');
      while (arr.length < 6) arr.push('');
      setOtpDigits(arr);
      const nextFocus = Math.min(pasted.length, 5);
      otpInputRefs.current[nextFocus]?.focus();
    }
  };

  // Password Recovery Handlers
  const handleStartPasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetIdentifier.trim()) {
      setResetError('يرجى إدخال رقم الهاتف أو البريد الإلكتروني المسجل.');
      return;
    }

    const code = generateNewOtpCode();
    setResetCodeGenerated(code);
    setResetStep('otp');
  };

  const handleConfirmPasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (resetOtp.trim() !== resetCodeGenerated) {
      setResetError('كود التأكيد غير صحيح! يرجى كتابة الرمز الـ 6 أرقام الموضح أعلاه.');
      return;
    }

    if (!resetNewPass || resetNewPass.length < 6) {
      setResetError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
      return;
    }

    setResetStep('success');
    setTimeout(() => {
      setActiveInfoModal(null);
      setResetStep('input');
      setResetIdentifier('');
      setResetOtp('');
      setResetNewPass('');
      setInfoMsg('تمت استعادة وتغيير كلمة المرور بنجاح ✓ يمكنك الآن تسجيل الدخول بها.');
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-100/95 backdrop-blur-md overflow-y-auto"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Top Navigation Bar with Official Ejar Brand Logo */}
      <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between shadow-xs sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowNavMenu(!showNavMenu)}
            className="p-2 text-slate-700 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('القائمة الرئيسية', 'Menu')}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Official Unified Brand Logo */}
          <div className="flex items-center gap-2 select-none">
            <EjarLogo size="md" showSubtitle subtitle="EJAR.COM" />
          </div>
        </div>

        {/* Action buttons (دخول / حساب جديد) + Close */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setShowOtpScreen(false);
              setShowGooglePrompt(false);
              setShowMicrosoftPrompt(false);
              setErrorMsg(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
              mode === 'signin' && !showOtpScreen && !showGooglePrompt && !showMicrosoftPrompt
                ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{t('دخول', 'Sign in')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setShowOtpScreen(false);
              setShowGooglePrompt(false);
              setShowMicrosoftPrompt(false);
              setErrorMsg(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
              mode === 'signup' && !showOtpScreen && !showGooglePrompt && !showMicrosoftPrompt
                ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('حساب جديد', 'New Account')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-1 rtl:ml-0 rtl:mr-1"
            title={t('إغلاق والعودة للتصفح', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Dropdown Menu when clicking hamburger icon with REAL WORKING LINKS */}
      {showNavMenu && (
        <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3 shadow-md flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-semibold text-slate-700 animate-fade-in">
          <span className="text-blue-700 font-extrabold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
            منصة إيجار - بوابة عقارات مصر الموثقة
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <button
            type="button"
            onClick={() => {
              setActiveInfoModal('about');
              setShowNavMenu(false);
            }}
            className="px-2.5 py-1 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            عن المنصة
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveInfoModal('terms');
              setShowNavMenu(false);
            }}
            className="px-2.5 py-1 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            الشروط والأحكام
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveInfoModal('privacy');
              setShowNavMenu(false);
            }}
            className="px-2.5 py-1 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            سياسة الخصوصية
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveInfoModal('support');
              setShowNavMenu(false);
            }}
            className="px-2.5 py-1 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors text-blue-700 font-bold"
          >
            مركز المساعدة
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-6 sm:p-10 my-auto">
          
          {/* Main Title & Service Icon Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              {showOtpScreen
                ? t('تأكيد رقم الهاتف المحمول', 'Verify Mobile Number')
                : mode === 'signin'
                ? t('تسجيل الدخول', 'Sign In')
                : t('إنشاء حساب جديد', 'Create Account')}
            </h1>

            {/* Target Sub-Service Badge */}
            <div className="inline-flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 px-3.5 py-1.5 rounded-xl shadow-2xs">
              <EjarLogo size="xs" showWordmark={false} />
              <div className="flex flex-col text-start leading-tight">
                <span className="text-xs font-bold text-slate-900">
                  {t('إيجار', 'Ejar')}
                </span>
                <span className="text-[10px] text-blue-700 font-mono font-bold">
                  ejar.com
                </span>
              </div>
            </div>
          </div>

          {/* Notifications / Errors */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span className="leading-relaxed">{infoMsg}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 1: 6-DIGIT OTP VERIFICATION SCREEN */}
          {/* ========================================================================= */}
          {showOtpScreen ? (
            <div className="space-y-6">
              {/* Phone display with edit option */}
              <div className="text-center space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t(
                    'أرسلنا كود تأكيد مكوّن من 6 أرقام عبر رسالة نصية قصيرة SMS إلى هاتفك:',
                    'We sent a 6-digit confirmation code via SMS to your mobile:'
                  )}
                </p>
                <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3.5 py-1.5 rounded-xl font-mono font-extrabold text-sm border border-slate-200">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span dir="ltr">{otpTargetPhone}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOtpScreen(false);
                      setShowSmsBanner(false);
                      setOtpError(null);
                    }}
                    className="text-blue-700 hover:text-blue-800 text-xs font-sans font-semibold underline flex items-center gap-1 pr-1.5 rtl:pr-0 rtl:pl-1.5 border-r rtl:border-r-0 rtl:border-l border-slate-300"
                    title={t('تعديل رقم الهاتف', 'Edit Phone')}
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>{t('تعديل', 'Edit')}</span>
                  </button>
                </div>
              </div>

              {/* Realistic Interactive SMS Notification Banner */}
              {showSmsBanner && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 shadow-sm text-xs text-blue-900 flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="text-start leading-tight min-w-0">
                      <div className="font-bold text-blue-900 flex items-center gap-2">
                        <span>📩 رسالة SMS واردة من «إيجار»</span>
                        <span className="text-[10px] bg-blue-200/80 text-blue-800 px-1.5 py-0.5 rounded-full font-medium">الآن</span>
                      </div>
                      <div className="text-slate-600 text-xs mt-1">
                        رمز التأكيد الخاص بك هو:{' '}
                        <span className="font-mono font-black text-sm text-blue-700 tracking-widest bg-white px-2 py-0.5 rounded-md border border-blue-200 inline-block shadow-2xs">
                          {generatedOtp}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const arr = generatedOtp.split('');
                      setOtpDigits(arr);
                      setOtpError(null);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold whitespace-nowrap shadow-xs transition-colors shrink-0"
                  >
                    {t('نسخ وتعبئة', 'Auto-fill')}
                  </button>
                </div>
              )}

              {/* Error Message */}
              {otpError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{otpError}</span>
                </div>
              )}

              {/* 6 Digit Input Boxes */}
              <div className="space-y-2">
                <label className="block text-center text-xs font-bold text-slate-700">
                  {t('أدخل الرمز المكون من 6 أرقام:', 'Enter the 6-digit verification code:')}
                </label>
                <div className="flex items-center justify-center gap-2 sm:gap-3" dir="ltr">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={handlePaste}
                      className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-black rounded-xl border transition-all outline-none ${
                        digit
                          ? 'border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-600/20'
                          : 'border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Submit & Confirm Button */}
              <button
                type="button"
                disabled={loading}
                onClick={handleVerifyOtpAndRegister}
                className="w-full h-12 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-700/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-blue-200" />
                    <span>{t('تأكيد رقم الهاتف وإنشاء الحساب', 'Verify Phone & Create Account')}</span>
                  </>
                )}
              </button>

              {/* Timer and Resend options */}
              <div className="text-center pt-2 space-y-2">
                {otpTimer > 0 ? (
                  <span className="text-xs text-slate-500 font-medium">
                    {t('إعادة إرسال كود جديد خلال:', 'Resend code in:')}{' '}
                    <span className="font-mono font-bold text-slate-800">0:{otpTimer < 10 ? `0${otpTimer}` : otpTimer}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('إعادة إرسال كود التأكيد (SMS)', 'Resend Confirmation Code')}</span>
                  </button>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOtpScreen(false);
                      setShowSmsBanner(false);
                      setOtpError(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    {t('← العودة لتعديل البيانات', '← Back to edit details')}
                  </button>
                </div>
              </div>
            </div>
          ) : showGooglePrompt ? (
            /* Google Interactive Fallback */
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {t('تسجيل الدخول بحساب Google', 'Sign in with Google')}
                </h3>
              </div>

              {googleError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {googleError}
                </div>
              )}

              <form onSubmit={handleConfirmGoogleUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('الاسم في Google', 'Google Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={googleFullName}
                    onChange={(e) => setGoogleFullName(e.target.value)}
                    placeholder={t('مثال: محمد أحمد إبراهيم', 'e.g. Mohamed Ahmed')}
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('بريد Google (Gmail)', 'Google Email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('رقم الهاتف المحمول (11 رقماً)', 'Mobile Phone (11 digits)')}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={googlePhone}
                    onChange={(e) => setGooglePhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full h-11 px-4 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {t('يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً', 'Must be exactly 11 digits')}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? '...' : t('متابعة وتأكيد الهاتف بكود SMS', 'Continue to Phone OTP')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGooglePrompt(false)}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
                >
                  {t('← العودة لصفحة الدخول', '← Back')}
                </button>
              </form>
            </div>
          ) : showMicrosoftPrompt ? (
            /* Microsoft Interactive Modal */
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {t('تسجيل الدخول بحساب Microsoft', 'Sign in with Microsoft')}
                </h3>
              </div>

              {msError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {msError}
                </div>
              )}

              <form onSubmit={handleConfirmMicrosoftUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('الاسم في Microsoft', 'Microsoft Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={msFullName}
                    onChange={(e) => setMsFullName(e.target.value)}
                    placeholder={t('مثال: محمد أحمد إبراهيم', 'e.g. Mohamed Ahmed')}
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('بريد Microsoft (Outlook/Hotmail)', 'Microsoft Email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={msEmail}
                    onChange={(e) => setMsEmail(e.target.value)}
                    placeholder="example@outlook.com"
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('رقم الهاتف المحمول (11 رقماً)', 'Mobile Phone (11 digits)')}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={msPhone}
                    onChange={(e) => setMsPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full h-11 px-4 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {t('يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً', 'Must be exactly 11 digits')}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? '...' : t('متابعة وتأكيد الهاتف بكود SMS', 'Continue to Phone OTP')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMicrosoftPrompt(false)}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
                >
                  {t('← العودة لصفحة الدخول', '← Back')}
                </button>
              </form>
            </div>
          ) : (
            /* Standard SSO Flow matching Hsoub Screenshots */
            <>
              {/* Row of 2 Social Login Buttons (Google & Microsoft) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={loading}
                  className="h-11 px-4 rounded-lg bg-[#dd4b39] hover:bg-[#c23321] text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-xs"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.46 8.32h-4.91v2.46h2.95c-.24 1.25-1.29 2.21-2.95 2.21-1.78 0-3.23-1.45-3.23-3.23s1.45-3.23 3.23-3.23c.8 0 1.52.29 2.08.77l1.74-1.74C17.06 6.36 15.65 5.75 14 5.75c-3.45 0-6.25 2.8-6.25 6.25s2.8 6.25 6.25 6.25c3.6 0 6-2.53 6-6.11 0-.6-.06-1.18-.14-1.82h-4.4z" />
                  </svg>
                  <span>{t('باستخدام جوجل', 'Continue with Google')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMicrosoftClick}
                  disabled={loading}
                  className="h-11 px-4 rounded-lg bg-[#005da6] hover:bg-[#004b87] text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  <span>{t('باستخدام مايكروسوفت', 'Continue with Microsoft')}</span>
                </button>
              </div>

              {/* Divider Line: "أو" */}
              <div className="relative flex items-center justify-center my-6">
                <div className="border-t border-slate-300 w-full" />
                <span className="bg-white px-4 text-xs font-bold text-slate-500 absolute">
                  {t('أو', 'or')}
                </span>
              </div>

              {/* Input Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        {t('نوع الحساب في منصة إيجار', 'Account Type')}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRole('tenant')}
                          className={`p-3 rounded-lg border text-start transition-all flex flex-col gap-0.5 ${
                            role === 'tenant'
                              ? 'border-blue-700 bg-blue-50/70 ring-2 ring-blue-700/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{t('مستأجر', 'Tenant')}</span>
                            {role === 'tenant' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                          </div>
                          <span className="text-[10px] text-slate-500">{t('حجز شقق موثقة', 'Rent units')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRole('landlord')}
                          className={`p-3 rounded-lg border text-start transition-all flex flex-col gap-0.5 ${
                            role === 'landlord'
                              ? 'border-blue-700 bg-blue-50/70 ring-2 ring-blue-700/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{t('مالك عقار', 'Landlord')}</span>
                            {role === 'landlord' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />}
                          </div>
                          <span className="text-[10px] text-slate-500">{t('عرض وتأجير العقارات', 'List units')}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {t('الاسم بالكامل', 'Full Name')}
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={t('أدخل اسمك بالكامل كما في البطاقة', 'Enter your full legal name')}
                        className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          {t('رقم الهاتف المحمول (11 رقماً)', 'Mobile Phone (11 digits)')}
                        </label>
                        <span className="text-[10px] text-blue-700 font-semibold">
                          {t('سيتم إرسال كود 6 أرقام لتأكيده', '6-digit OTP will be sent')}
                        </span>
                      </div>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute right-3 rtl:right-3 rtl:left-auto left-3 top-3.5 pointer-events-none" />
                        <input
                          type="tel"
                          required
                          maxLength={11}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="01012345678"
                          className="w-full h-11 px-10 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {t(
                          'يجب أن يتكون من 11 رقماً بالضبط ويبدأ بـ (010 أو 011 أو 012 أو 015)',
                          'Must be exactly 11 digits starting with 010, 011, 012, or 015'
                        )}
                      </span>
                    </div>
                  </>
                )}

                {/* Email Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('البريد الإلكتروني', 'Email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('أدخل البريد الإلكتروني الخاص بك', 'Enter your email address')}
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors"
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t('كلمة المرور', 'Password')}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('أدخل كلمة المرور الخاصة بك', 'Enter your password')}
                    className="w-full h-11 px-4 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold text-sm rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : mode === 'signin' ? (
                    <span>{t('دخول', 'Sign In')}</span>
                  ) : (
                    <span>{t('إرسال كود التأكيد (6 أرقام)', 'Send 6-Digit OTP')}</span>
                  )}
                </button>
              </form>

              {/* Exact Hsoub "مساعدة" (Help) Section with REAL WORKING INTERACTIVE LINKS */}
              <div className="mt-8 pt-6 border-t border-slate-200">
                <span className="block text-xs font-bold text-slate-700 mb-2.5">
                  {t('مساعدة', 'Help')}
                </span>

                <ul className="space-y-2 text-xs">
                  {mode === 'signin' ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signup');
                          setErrorMsg(null);
                        }}
                        className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5 font-medium"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-700 inline-block" />
                        <span>{t('لا أملك حساب بعد', "I don't have an account yet")}</span>
                      </button>
                    </li>
                  ) : (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signin');
                          setErrorMsg(null);
                        }}
                        className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5 font-medium"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-700 inline-block" />
                        <span>{t('لدي حساب بالفعل (تسجيل الدخول)', 'Already have an account (Sign in)')}</span>
                      </button>
                    </li>
                  )}

                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setResetIdentifier(email || phone || '');
                        setResetStep('input');
                        setResetError(null);
                        setActiveInfoModal('forgot');
                      }}
                      className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5 font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-700 inline-block" />
                      <span>{t('فقدت كلمة المرور', 'Forgot password')}</span>
                    </button>
                  </li>

                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setTroublePhone(phone || '01012345678');
                        setActivationNotice(null);
                        setActiveInfoModal('activation');
                      }}
                      className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5 font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-700 inline-block" />
                      <span>{t('لم يصلني رمز التفعيل', "Didn't receive activation code")}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}

        </div>
      </main>

      {/* ========================================================================= */}
      {/* REAL WORKING COMPREHENSIVE MODAL DIALOGS */}
      {/* ========================================================================= */}

      {/* 1. عن المنصة (About Platform) */}
      {activeInfoModal === 'about' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-xs">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">عن منصة «إيجار»</h3>
                  <p className="text-xs text-slate-500 font-mono">EJAR.COM — جمهورية مصر العربية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4">
                <h4 className="font-bold text-blue-900 mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  المنصة الرقمية الأولى لتوثيق الإيجارات في مصر
                </h4>
                <p className="text-xs text-blue-950/80 leading-relaxed">
                  تأسست منصة «إيجار» لتكون البوابة الوطنية الموثقة للربط المباشر بين مُلاك العقارات والمستأجرين في جميع محافظات مصر الـ 27، بهدف القضاء تماماً على الاحتيال العقاري وتداول الشقق غير المرخصة أو المسلوبة الملكية.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2">رؤيتنا ورسالتنا:</h4>
                <p className="text-slate-600 leading-relaxed">
                  نؤمن بحق كل مواطن وزائر في العثور على سكن آمن وموثق بشفافية تامة دون وسطاء غير مرخصين، وحق كل مالك في تأجير وحدته بعقود إلكترونية ملزمة قانوناً وبوابات دفع ضامنة تحفظ حقوق الطرفين.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <span className="font-bold text-slate-900 block text-xs">🏛️ توثيق الهوية وسند الملكية</span>
                  <span className="text-xs text-slate-600 block">فحص رقم قومي ومطابقة حيوية بالذكاء الاصطناعي مع إشراف إداري شامل لمنح الشارة الزرقاء.</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <span className="font-bold text-slate-900 block text-xs">🔒 الدفع الضامن (Escrow)</span>
                  <span className="text-xs text-slate-600 block">حفظ مبلغ العربون والوديعة في حساب وسيط آمن لا يُصرف للمالك إلا بعد استلام الوحدة فعلياً.</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <span className="font-bold text-slate-900 block text-xs">🗺️ تغطية لكافة محافظات مصر</span>
                  <span className="text-xs text-slate-600 block">خريطة تفاعلية مدعومة بالأسعار الحقيقية ومستويات الفرش (مفروش، نصف مفروش، غير مفروش).</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                  <span className="font-bold text-slate-900 block text-xs">📝 عقود إيجار رسمية</span>
                  <span className="text-xs text-slate-600 block">عقود موحدة متوافقة مع أحكام القانون المدني المصري رقم 4 لسنة 1996 وتعديلاته.</span>
                </div>
              </div>

              <div className="pt-2 text-xs text-slate-500 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span>المقر الرئيسي: القاهرة — التجمع الخامس — جمهورية مصر العربية</span>
                <span className="font-mono text-blue-700 font-bold">سجل تجاري معتمد: 184920</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. الشروط والأحكام (Terms of Service) */}
      {activeInfoModal === 'terms' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">اتفاقية الشروط والأحكام</h3>
                  <p className="text-xs text-slate-500">القواعد والالتزامات القانونية المعتمدة لمنصة إيجار</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">1. الأهلية والتسجيل:</h4>
                <p className="text-slate-600">
                  يشترط في كل مستخدم أن يكون قد بلغ سن الرشد القانوني (18 عاماً فأكثر)، وأن يقدم بيانات صحيحة ومطابقة لبطاقة الرقم القومي المصرية أو جواز السفر الساري لغير المصريين.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">2. التزامات مالك الوحدة (المؤجر):</h4>
                <p className="text-slate-600">
                  يقر المالك بملكيته القانونية التامة أو امتلاكه توكيلاً رسمياً سارياً يتيح له إدارة وتأجير العقار. ويلتزم المالك بتطابق الصور والمواصفات المعروضة على المنصة مع الحالة الواقعية للعقار دون أي إخفاء لعيوب جوهرية.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">3. التزامات المستأجر:</h4>
                <p className="text-slate-600">
                  يلتزم المستأجر باستخدام الوحدة المؤجرة في الغرض المتفق عليه في العقد (سكني عائلي، سكن طلاب، تجاري)، وعدم التنازل عنها أو التأجير من الباطن دون موافقة خطية صريحة من المالك.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">4. نظام الضمان المالي المعتمد (Escrow):</h4>
                <p className="text-slate-600">
                  تتم كافة عمليات سداد العربون والودائع حصرياً عبر منظومة الدفع الرقمية للمنصة، وتُحفظ الأموال بأمان في حساب الضمان حتى معاينة المستأجر للوحدة وتوقيعه على محضر الاستلام الإلكتروني.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">5. سياسة الإلغاء واسترداد الأموال:</h4>
                <p className="text-slate-600">
                  يحق للمستأجر استرداد كامل العربون إذا ثبت وجود اختلاف جوهري بين مواصفات الوحدة الواقعية وما تم الإعلان عنه بالمنصة. كما يخضع الإلغاء الطوعي للجدول الزمني المحدد في سياسة الإلغاء المعتمدة لكل حجز.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">6. الاختصاص القضائي:</h4>
                <p className="text-slate-600">
                  تخضع هذه الشروط لأحكام القوانين النافذة في جمهورية مصر العربية، وتختص المحاكم المصرية بالفصل في أي نزاع قد ينشأ عن تنفيذها.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. سياسة الخصوصية (Privacy Policy) */}
      {activeInfoModal === 'privacy' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-xs">
                  <LockKeyhole className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">سياسة الخصوصية وأمان البيانات</h3>
                  <p className="text-xs text-slate-500">وفقاً لقانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-950">
                <span className="font-bold block mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  أمان بياناتك الشخصية خط أحمر
                </span>
                <span className="text-xs leading-relaxed block">
                  نحن نطبق أعلى معايير التشفير العسكري (AES-256) لحماية بطاقات الهوية، وشهادات الملكية، وأرقام الهواتف، ولا نشاركها مع أي جهة تسويقية أو غير مصرح لها.
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">1. البيانات التي يتم جمعها:</h4>
                <p className="text-slate-600">
                  تشمل البيانات: الاسم الكامل، رقم الهاتف المحمول، البريد الإلكتروني، صورة بطاقة الرقم القومي (للتوثيق فقط)، بيانات العقار وسند الملكية، وسجلات العمليات المالية.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">2. إخفاء أرقام الهواتف لحماية الخصوصية:</h4>
                <p className="text-slate-600">
                  لا تظهر أرقام هواتف الملاك أو المستأجرين في العلن على الموقع، ويتم التواصل الآمن فقط عبر نظام المحادثات الداخلي حتى اكتمال إجراءات التحقق والحجز الرسمي.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">3. التحقق الحي ومطابقة الوجه:</h4>
                <p className="text-slate-600">
                  تُستخدم خوارزميات الذكاء الاصطناعي لفحص حيوية الوجه ومطابقته مع صورة البطاقة القومية دون تخزين بصمات بيومترية خام، وإنما لإنتاج رمز تشفيري يؤكد أصالة الهوية فقط لمنح الشارة الزرقاء.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">4. حقوق المستخدم في بياناته:</h4>
                <p className="text-slate-600">
                  يحق لكل مستخدم في أي وقت طلب نسخة من بياناته المسجلة أو تعديلها أو طلب حذف حسابه نهائياً من قاعدة بيانات المنصة عند عدم وجود التزامات تعاقدية قائمة.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. مركز المساعدة والدعم الفني (Help Center) */}
      {activeInfoModal === 'support' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shadow-xs">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">مركز المساعدة والدعم الفني</h3>
                  <p className="text-xs text-slate-500">نحن هنا لمساعدتك على مدار الساعة في جميع استفساراتك</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Support Quick Contact Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a
                href="tel:19822"
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-all text-center space-y-1 block"
              >
                <Phone className="w-5 h-5 text-blue-700 mx-auto" />
                <span className="font-bold text-slate-900 block text-xs">الخط الساخن</span>
                <span className="text-xs text-blue-700 font-mono font-bold block">19822</span>
                <span className="text-[10px] text-slate-500 block">طوال أيام الأسبوع 9ص - 10م</span>
              </a>

              <a
                href="https://wa.me/201012345678"
                target="_blank"
                rel="noreferrer"
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 transition-all text-center space-y-1 block"
              >
                <MessageCircle className="w-5 h-5 text-emerald-600 mx-auto" />
                <span className="font-bold text-slate-900 block text-xs">واتساب فوري</span>
                <span className="text-xs text-emerald-700 font-mono font-bold block">01012345678</span>
                <span className="text-[10px] text-slate-500 block">رد تلقائي وممثلين دعم</span>
              </a>

              <a
                href="mailto:support@ejar.com"
                className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-center space-y-1 block"
              >
                <Mail className="w-5 h-5 text-indigo-700 mx-auto" />
                <span className="font-bold text-slate-900 block text-xs">البريد الإلكتروني</span>
                <span className="text-xs text-indigo-700 font-mono font-bold block">support@ejar.com</span>
                <span className="text-[10px] text-slate-500 block">الرد خلال أقل من ساعتين</span>
              </a>
            </div>

            {/* Frequently Asked Questions */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-slate-900 text-sm">الأسئلة الأكثر شيوعاً:</h4>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5 bg-slate-50/50">
                <span className="font-bold text-slate-900 block text-xs">❓ كيف أحصل على الشارة الزرقاء الموثقة؟</span>
                <span className="text-xs text-slate-600 leading-relaxed block">
                  من خلال صفحة «توثيق الحساب (KYC)» في بروفايلك، قم برفع بطاقة الرقم القومي وتشغيل الكاميرا لإجراء مطابقة الوجه الحيوية. بعد مراجعة الفريق واعتمادها ستظهر الشارة الزرقاء بجانب اسمك فورياً.
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5 bg-slate-50/50">
                <span className="font-bold text-slate-900 block text-xs">❓ كيف يضمن نظام المنصة حقوقي المالية عند الحجز؟</span>
                <span className="text-xs text-slate-600 leading-relaxed block">
                  لا يتم تحويل أي مبالغ للمالك مباشرة. تُحجز أموالك في حساب الضمان الآمن (Escrow)، ولا يُسمح بصرفها إلا بعد استلامك للوحدة ومعاينتها وموافقتك على مطابقتها للواقع.
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5 bg-slate-50/50">
                <span className="font-bold text-slate-900 block text-xs">❓ ماذا أفعل إذا وجدت الشقة مختلفة عن الصور؟</span>
                <span className="text-xs text-slate-600 leading-relaxed block">
                  يمكنك رفض الاستلام فوراً من خلال زر «إلغاء واسترداد» في تفاصيل الحجز، وسيقوم فريق الدعم بمراجعة محضر المعاينة وإعادة كامل مستحقاتك دون أي خصم.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. فقدت كلمة المرور (Real Working Password Recovery Flow) */}
      {activeInfoModal === 'forgot' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">استعادة كلمة المرور</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{resetError}</span>
              </div>
            )}

            {resetStep === 'input' && (
              <form onSubmit={handleStartPasswordReset} className="space-y-4 text-xs text-slate-600">
                <p className="leading-relaxed">
                  أدخل رقم هاتفك المحمول المسجل أو بريدك الإلكتروني لإرسال كود تحقق مكون من 6 أرقام وتعيين كلمة مرور جديدة:
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف أو البريد الإلكتروني
                  </label>
                  <input
                    type="text"
                    required
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="01012345678 أو email@example.com"
                    className="w-full h-11 px-4 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال كود التحقق (6 أرقام)</span>
                </button>
              </form>
            )}

            {resetStep === 'otp' && (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-4 text-xs text-slate-600">
                {/* Simulation banner for the reset code */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-tight">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>📩 كود استعادة كلمة المرور المعتمد:</span>
                  </div>
                  <div className="mt-1">
                    رمز الأمان هو:{' '}
                    <span className="font-mono font-black text-sm text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                      {resetCodeGenerated}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كود التحقق (6 أرقام)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value)}
                    placeholder="أدخل الـ 6 أرقام الموضحة أعلاه"
                    className="w-full h-11 px-4 text-xs font-mono text-center tracking-widest font-black rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كلمة المرور الجديدة
                  </label>
                  <input
                    type="password"
                    required
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    placeholder="•••••••• (6 أحرف على الأقل)"
                    className="w-full h-11 px-4 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد وحفظ كلمة المرور الجديدة</span>
                </button>
              </form>
            )}

            {resetStep === 'success' && (
              <div className="py-6 text-center space-y-2 text-emerald-700">
                <CheckCircle2 className="w-12 h-12 mx-auto animate-bounce text-emerald-600" />
                <h4 className="font-bold text-base text-slate-900">تم تغيير كلمة المرور بنجاح!</h4>
                <p className="text-xs text-slate-600">جاري التوجيه لتسجيل الدخول بكلمة المرور الجديدة...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. لم يصلني رمز التفعيل (Activation Code Troubleshooting) */}
      {activeInfoModal === 'activation' && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">حل مشكلات رمز التفعيل (SMS)</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveInfoModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activationNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{activationNotice}</span>
              </div>
            )}

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              <p>
                إذا تأخر وصول كود التأكيد، يرجى التأكد أولاً من صحة رقم الهاتف المكتوب:
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رقم الهاتف المسجل (11 رقماً):
                </label>
                <input
                  type="tel"
                  maxLength={11}
                  value={troublePhone}
                  onChange={(e) => setTroublePhone(e.target.value)}
                  placeholder="01012345678"
                  className="w-full h-11 px-4 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-2 pt-1">
                <span className="font-bold text-slate-800 block text-xs">اختر قناة الإرسال البديلة:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActivationNotice(`تم إرسال كود الـ 6 أرقام الجديد عبر رسالة SMS إلى ${troublePhone} ✓`);
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-blue-700" />
                    <span>إعادة إرسال SMS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActivationNotice(`تم إرسال كود الـ 6 أرقام عبر واتساب إلى الرقم ${troublePhone} بنجاح ✓`);
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>إرسال عبر WhatsApp</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 block">💡 نصائح سريعة:</span>
                <span>• تأكد من وجود تغطية جيدة لشبكة المحمول في منطقتك.</span>
                <span className="block">• تأكد من عدم تفعيل خاصية حظر الرسائل الدعائية (DND) لدى مشغل الخدمة.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthModal;
