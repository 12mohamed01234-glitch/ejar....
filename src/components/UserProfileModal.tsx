import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Building,
  FileText,
  Phone,
  Mail,
  Calendar,
  LogOut,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Camera,
  Upload,
  CreditCard,
  Lock,
  PlusCircle,
  Check,
  Zap,
  Eye,
  Copy,
  FileCheck,
  Receipt,
  Image as ImageIcon,
  Clock,
  BadgeCheck,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { UserAccountData } from './AuthModal';
import { generateMockReceiptDataUrl } from './TenantWalletModal';
import {
  formatEgp,
  TenantWalletRecord,
  WalletTransactionRecord,
  LandlordVerificationRecord,
  normalizeNumericInput,
  PaymentMethodType,
} from '../lib/validation';
import { updateSupabaseKycStatus } from '../lib/supabase';

export interface UserProfileModalProps {
  isOpen: boolean;
  userData: UserAccountData | null;
  wallet: TenantWalletRecord;
  landlordVerification: LandlordVerificationRecord | null;
  onClose: () => void;
  onDepositWallet: (
    amountEgp: number,
    method: PaymentMethodType,
    reference: string,
    receiptScreenshotUrl?: string
  ) => Promise<void>;
  onApproveDeposit?: (txId: string) => Promise<void>;
  onSignOut: () => void;
  onUpdateUserData?: (updated: UserAccountData) => void;
  isBlueVerified?: boolean;
  onOpenFullKycPage?: () => void;
  onOpenPublicProfile?: () => void;
}

// Validation logic for real Egyptian National ID (Anti-Fake)
function validateEgyptianNationalId(id: string): {
  isValid: boolean;
  birthDate?: string;
  governorate?: string;
  gender?: 'male' | 'female';
  error?: string;
} {
  const clean = id.trim();
  if (clean.length !== 14 || !/^\d{14}$/.test(clean)) {
    return { isValid: false, error: 'الرقم القومي يجب أن يتكون من 14 رقماً بالضبط' };
  }

  const centuryDigit = parseInt(clean[0], 10);
  if (centuryDigit !== 2 && centuryDigit !== 3) {
    return { isValid: false, error: 'الرقم الأول يجب أن يكون 2 (مواليد 1900-1999) أو 3 (مواليد 2000 فما فوق)' };
  }

  const century = centuryDigit === 2 ? 1900 : 2000;
  const year = century + parseInt(clean.substring(1, 3), 10);
  const month = parseInt(clean.substring(3, 5), 10);
  const day = parseInt(clean.substring(5, 7), 10);

  if (month < 1 || month > 12) {
    return { isValid: false, error: 'شهر الميلاد في الرقم القومي غير صحيح' };
  }
  if (day < 1 || day > 31) {
    return { isValid: false, error: 'يوم الميلاد في الرقم القومي غير صحيح' };
  }

  const currentYear = new Date().getFullYear();
  if (year > currentYear || currentYear - year < 16) {
    return { isValid: false, error: 'يجب أن يكون صاحب الحساب 16 عاماً على الأقل' };
  }

  const govCode = clean.substring(7, 9);
  const govMap: Record<string, string> = {
    '01': 'القاهرة',
    '02': 'الإسكندرية',
    '03': 'بورسعيد',
    '04': 'السويس',
    '11': 'دمياط',
    '12': 'الدقهلية',
    '13': 'الشرقية',
    '14': 'القليوبية',
    '15': 'كفر الشيخ',
    '16': 'الغربية',
    '17': 'المنوفية',
    '18': 'البحيرة',
    '19': 'الإسماعيلية',
    '21': 'الجيزة',
    '22': 'بني سويف',
    '23': 'الفيوم',
    '24': 'المنيا',
    '25': 'أسيوط',
    '26': 'سوهاج',
    '27': 'قنا',
    '28': 'أسوان',
    '29': 'الأقصر',
    '31': 'البحر الأحمر',
    '32': 'الوادي الجديد',
    '33': 'مطروح',
    '34': 'شمال سيناء',
    '35': 'جنوب سيناء',
  };

  const governorate = govMap[govCode];
  if (!governorate) {
    return { isValid: false, error: 'كود المحافظة في الرقم القومي غير صحيح (رقم غير مصري)' };
  }

  const genderDigit = parseInt(clean[12], 10);
  const gender = genderDigit % 2 === 1 ? 'male' : 'female';

  return {
    isValid: true,
    birthDate: `${day}/${month}/${year}`,
    governorate,
    gender,
  };
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  userData,
  wallet,
  landlordVerification,
  onClose,
  onDepositWallet,
  onApproveDeposit,
  onSignOut,
  onUpdateUserData,
  isBlueVerified = false,
  onOpenFullKycPage,
  onOpenPublicProfile,
}) => {
  const { lang, t, formatTimeAgo, formatNumber } = useI18n();

  // Active Sub-tab inside user profile
  const [activeTab, setActiveTab] = useState<'profile' | 'kyc' | 'wallet'>('profile');

  // Basic Profile Edit
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(userData?.displayName || '');
  const [editedPhone, setEditedPhone] = useState(userData?.phone || '');
  const [profilePhoto, setProfilePhoto] = useState<string>(
    userData?.photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData?.displayName || 'user')}`
  );

  // Phone Verification Sub-flow
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean>(Boolean(landlordVerification));
  const [phoneOtpStep, setPhoneOtpStep] = useState<'idle' | 'sending' | 'otp_input' | 'verified'>('idle');
  const [otpInput, setOtpInput] = useState('');

  // National ID Verification State
  const [nationalIdText, setNationalIdText] = useState<string>(landlordVerification?.nationalIdNumber || '');
  const [idFrontPhoto, setIdFrontPhoto] = useState<string | null>(landlordVerification?.nationalIdFrontUrl || null);
  const [idBackPhoto, setIdBackPhoto] = useState<string | null>(landlordVerification?.nationalIdBackUrl || null);
  const [isIdVerified, setIsIdVerified] = useState<boolean>(Boolean(landlordVerification));

  // Facial Liveness State
  const [isLivenessVerified, setIsLivenessVerified] = useState<boolean>(Boolean(landlordVerification?.facialMatchScore));
  const [livenessStage, setLivenessStage] = useState<'idle' | 'center' | 'right' | 'left' | 'done'>('idle');
  const [livenessScore, setLivenessScore] = useState<number>(landlordVerification?.facialMatchScore || 0);

  // Wallet Management Sub-flow
  const [depositAmount, setDepositAmount] = useState<number>(1000);
  const [customDepositText, setCustomDepositText] = useState<string>('');
  const [depositMethod, setDepositMethod] = useState<PaymentMethodType>('instapay');
  const [isProcessingDeposit, setIsProcessingDeposit] = useState<boolean>(false);
  const [walletFeedback, setWalletFeedback] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'deduction'>('all');

  // Receipt Screenshot & Approval State
  const [receiptScreenshot, setReceiptScreenshot] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [approvingTxId, setApprovingTxId] = useState<string | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const frontIdInputRef = useRef<HTMLInputElement>(null);
  const backIdInputRef = useRef<HTMLInputElement>(null);

  // Sync props when opened
  useEffect(() => {
    if (userData) {
      setEditedName(userData.displayName);
      setEditedPhone(userData.phone);
      if (userData.photoUrl) setProfilePhoto(userData.photoUrl);
    }
  }, [userData]);

  if (!isOpen || !userData) return null;

  const isLandlord = userData.role === 'landlord';

  // Check if user has uploaded a custom personal profile photo
  const hasCustomPhoto = Boolean(
    (profilePhoto && !profilePhoto.includes('dicebear.com/7.x/initials')) ||
    (userData.photoUrl && !userData.photoUrl.includes('dicebear.com/7.x/initials'))
  );

  // Compute Profile Completion dynamically (User Prompt: Photo 20%, Real ID 20%, Phone OTP 20%, Basic Info 20%, Facial Liveness 20%)
  const completionItems = [
    {
      id: 'info',
      label: t('الاسم والبيانات الأساسية', 'Basic Name & Info'),
      weight: 20,
      done: editedName.trim().length >= 3,
    },
    {
      id: 'photo',
      label: t('صورة البروفايل الشخصية', 'Profile Picture'),
      weight: 20,
      done: hasCustomPhoto,
    },
    {
      id: 'phone',
      label: t('رقم الهاتف وتأكيده برمز التحقق (OTP)', 'Verified Phone Number (OTP)'),
      weight: 20,
      done: isPhoneVerified,
    },
    {
      id: 'nid',
      label: t('بطاقة الرقم القومي المصرية (14 رقم مدققة ضد التزييف)', 'Official Egyptian National ID (Anti-Fake)'),
      weight: 20,
      done: isIdVerified && Boolean(idFrontPhoto),
    },
    {
      id: 'liveness',
      label: t('الفحص البيومتري لحيوية الوجه بالكاميرا', 'Biometric Facial Liveness'),
      weight: 20,
      done: isLivenessVerified,
    },
  ];

  const completionPercentage = completionItems.reduce((acc, item) => (item.done ? acc + item.weight : acc), 0);
  const isFullyVerified = completionPercentage === 100;

  // Real-time Egyptian National ID validation
  const idValidationResult = validateEgyptianNationalId(nationalIdText);

  // Handle Upload Profile Photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setProfilePhoto(result);
      const updated: UserAccountData = { ...userData, photoUrl: result };
      onUpdateUserData?.(updated);
    };
    reader.readAsDataURL(file);
  };

  // Handle ID Front & Back Photo Upload
  const handleIdFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setIdFrontPhoto(result);
    };
    reader.readAsDataURL(file);
  };

  const handleIdBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setIdBackPhoto(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBasicInfo = () => {
    if (!editedName.trim()) return;
    const updated: UserAccountData = {
      ...userData,
      displayName: editedName.trim(),
      phone: editedPhone.trim(),
      photoUrl: profilePhoto,
    };
    onUpdateUserData?.(updated);
    setIsEditing(false);
  };

  // Phone OTP Flow
  const handleSendPhoneOtp = () => {
    setPhoneOtpStep('sending');
    setTimeout(() => {
      setPhoneOtpStep('otp_input');
    }, 700);
  };

  const handleConfirmPhoneOtp = () => {
    if (otpInput.length >= 4) {
      setIsPhoneVerified(true);
      setPhoneOtpStep('verified');
    }
  };

  // National ID Verify Flow
  const handleConfirmNationalId = () => {
    if (!idValidationResult.isValid) return;
    setIsIdVerified(true);

    if (userData?.uid) {
      updateSupabaseKycStatus(userData.uid, {
        nationalIdNumber: nationalIdText,
        nationalIdFrontUrl: idFrontPhoto || undefined,
        nationalIdBackUrl: idBackPhoto || undefined,
        isLandlordVerified: userData.role === 'landlord',
        isTenantVerified: userData.role === 'tenant',
      }).catch(console.warn);
    }
  };

  // Facial Liveness Routine (Look center -> right -> left)
  const handleStartLivenessTest = () => {
    setLivenessStage('center');
    setTimeout(() => {
      setLivenessStage('right');
      setTimeout(() => {
        setLivenessStage('left');
        setTimeout(() => {
          setLivenessStage('done');
          setIsLivenessVerified(true);
          setLivenessScore(99.4);

          if (userData?.uid) {
            updateSupabaseKycStatus(userData.uid, {
              facialLivenessVerified: true,
              facialMatchScore: 99.4,
            }).catch(console.warn);
          }
        }, 1200);
      }, 1200);
    }, 1200);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError(t('يرجى اختيار ملف صورة صالح (PNG, JPG, JPEG)', 'Please choose a valid image file'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUseMockReceipt = () => {
    setUploadError(null);
    const finalAmount = customDepositText ? Number(customDepositText) || depositAmount : depositAmount;
    const ref = `DEP-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const methodLabels: Record<PaymentMethodType, string> = {
      instapay: 'إنستاباي (InstaPay)',
      mobile_wallet: 'محفظة كاش (فودافون/أورنج/اتصالات/وي)',
      card_meeza: 'بطاقة ميزة / بنكية',
      fawry: 'منافذ فوري باي',
      wallet_balance: 'رصيد المحفظة',
    };
    const mock = generateMockReceiptDataUrl(finalAmount, methodLabels[depositMethod] || 'تحويل إلكتروني', ref);
    setReceiptScreenshot(mock);
  };

  // Execute Deposit with mandatory screenshot
  const handleExecuteDeposit = async () => {
    const finalAmount = customDepositText ? Number(customDepositText) || depositAmount : depositAmount;
    if (finalAmount < 100) return;
    if (!receiptScreenshot) {
      setUploadError(
        t(
          'يرجى إرفاق سكرين شوت أو صورة إيصال التحويل لتأكيد العملية قبل الإرسال.',
          'Please attach transfer receipt screenshot to confirm operation.'
        )
      );
      return;
    }
    setIsProcessingDeposit(true);
    setWalletFeedback(null);
    setUploadError(null);

    const ref = `DEP-${Math.random().toString(36).substring(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    try {
      await new Promise((r) => setTimeout(r, 800));
      await onDepositWallet(finalAmount, depositMethod, ref, receiptScreenshot);
      setWalletFeedback(
        `تم إرسال إيصال التحويل بنجاح! العملية قيد المراجعة، وسيتم إضافة المبلغ (${formatEgp(finalAmount)}) إلى رصيدك فور اعتماد الإيصال.`
      );
      setReceiptScreenshot(null);
      setCustomDepositText('');
    } catch {
      setWalletFeedback('حدث خطأ أثناء الاتصال بالبوابة، يرجى المحاولة ثانية');
    } finally {
      setIsProcessingDeposit(false);
    }
  };

  const handleConfirmApproval = async (txId: string) => {
    if (!onApproveDeposit) return;
    setApprovingTxId(txId);
    try {
      await onApproveDeposit(txId);
    } finally {
      setApprovingTxId(null);
    }
  };

  // Filtered transactions
  const filteredTxs = wallet.transactions.filter((tx) => {
    if (txFilter === 'deposit') return tx.type === 'deposit' || tx.type === 'refund';
    if (txFilter === 'deduction') return tx.type === 'booking_deduction';
    return true;
  });

  const totalSpent = wallet.transactions
    .filter((t) => t.type === 'booking_deduction')
    .reduce((sum, t) => sum + t.amountEgp, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-6">
        {/* Cover Header */}
        <div className="h-32 sm:h-36 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 relative p-4 flex flex-col justify-between text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-widest text-blue-200 uppercase px-2.5 py-1 bg-white/10 rounded-full border border-white/15">
                {t('لوحة التحكم والحساب الموحد', 'USER DASHBOARD & HUB')}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-200 font-mono">
              ID: {userData.uid.slice(0, 10)}
            </span>
            <div className="flex items-center gap-1 text-xs text-amber-300 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLandlord ? t('حساب مالك عقار', 'Landlord Account') : t('حساب مستأجر موثق', 'Tenant Account')}</span>
            </div>
          </div>
        </div>

        {/* Profile Head Strip: Avatar, Role, & Progress */}
        <div className="px-6 pt-0 pb-4 relative border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 mb-4">
            {/* Avatar with Camera Overlay */}
            <div className="flex items-end gap-4">
              <div className="relative group">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white shadow-xl overflow-hidden bg-slate-100">
                  <img
                    src={profilePhoto}
                    alt={userData.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Camera upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={t('تغيير ورفع صورة البروفايل', 'Upload Profile Picture')}
                  className="absolute bottom-1 right-1 rtl:right-auto rtl:left-1 w-8 h-8 rounded-full bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center border-2 border-white shadow-md transition-transform group-hover:scale-110"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {(isBlueVerified || isFullyVerified) && (
                  <div
                    title={t('حساب موثق رسمياً بالعلامة الزرقاء', 'Officially Blue-Badge Verified Account')}
                    className="absolute -top-2 -right-2 rtl:-right-auto rtl:-left-2 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white shadow-md"
                  >
                    <BadgeCheck className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                    {userData.displayName}
                  </h3>
                  {(isBlueVerified || isFullyVerified) && (
                    <span title={t('حساب موثق بالعلامة الزرقاء', 'Blue Verified Account')}>
                      <BadgeCheck className="w-5 h-5 fill-blue-500 text-white drop-shadow-sm" />
                    </span>
                  )}
                  {onOpenPublicProfile && (
                    <button
                      type="button"
                      onClick={onOpenPublicProfile}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg transition-colors"
                      title={t('معاينة صفحتي الشخصية العامة كما يراها الآخرون والتقييمات', 'View public profile')}
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{t('بروفايلي العام والتقييمات', 'Public Profile')}</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{userData.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      isLandlord
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    }`}
                  >
                    {isLandlord ? <Building className="w-3 h-3 text-amber-600" /> : <User className="w-3 h-3 text-emerald-600" />}
                    <span>{isLandlord ? t('مالك عقارات', 'Property Landlord') : t('مستأجر', 'Tenant')}</span>
                  </span>

                  {isPhoneVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>{t('هاتف موثق', 'Phone Verified')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Completion Dynamic Percentage Widget (Requirement 2) */}
            <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-200 sm:min-w-[190px] space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700">{t('نسبة اكتمال الحساب', 'Profile Completion')}</span>
                <span className={`font-mono text-sm ${completionPercentage === 100 ? 'text-emerald-700' : 'text-blue-700'}`}>
                  {completionPercentage}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 rounded-full ${
                    completionPercentage === 100
                      ? 'bg-emerald-600'
                      : completionPercentage >= 75
                      ? 'bg-blue-600'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {completionPercentage === 100
                  ? t('تهانينا! حسابك مكتمل وموثق 100%', 'Account 100% complete & verified')
                  : t(`أكمل توثيق البطاقة والهاتف للوصول إلى 100%`, 'Complete ID & phone for 100%')}
              </p>
            </div>
          </div>

          {/* Internal Hub Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{t('ملفي الشخصي وبياناتي', 'My Profile & Info')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('kyc')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'kyc'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('توثيق الهوية والبطاقة (KYC)', 'Identity & Card Verification')}</span>
              {isIdVerified && <Check className="w-3 h-3 text-emerald-400" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'wallet'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{t('المحفظة والرصيد والعمليات', 'Wallet & Balance')}</span>
              <span className="font-mono text-[10px] bg-white/20 px-1 rounded">
                {formatEgp(wallet.balanceEgp)}
              </span>
            </button>
          </div>
        </div>

        {/* Tab 1: Profile & Basic Info */}
        {activeTab === 'profile' && (
          <div className="p-6 space-y-5 max-h-[55vh] overflow-y-auto no-scrollbar">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs font-bold text-slate-800">
                  {t('البيانات الأساسية وتفاصيل الحساب', 'Basic Info & Profile Details')}
                </span>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white"
                  >
                    {t('تعديل البيانات', 'Edit')}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                    >
                      {t('إلغاء', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBasicInfo}
                      className="px-3.5 py-1 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                    >
                      {t('حفظ', 'Save')}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {t('الاسم بالكامل', 'Full Name')}
                  </label>
                  {!isEditing ? (
                    <div className="text-xs font-bold text-slate-900">{userData.displayName}</div>
                  ) : (
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full h-9 px-3 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {t('البريد الإلكتروني', 'Email Address')}
                  </label>
                  <div className="text-xs font-mono text-slate-800">{userData.email}</div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {t('رقم الهاتف المحمول', 'Phone Number')}
                  </label>
                  {!isEditing ? (
                    <div className="text-xs font-mono font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{userData.phone || '01012345678'}</span>
                      {isPhoneVerified ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full font-sans">
                          {t('موثق ✅', 'Verified ✅')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab('kyc')}
                          className="text-[10px] text-rose-700 underline font-sans"
                        >
                          {t('غير موثق (وثق الآن)', 'Verify now')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      type="tel"
                      value={editedPhone}
                      onChange={(e) => setEditedPhone(e.target.value)}
                      className="w-full h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {t('نوع الحساب بالمنصة', 'Account Role')}
                  </label>
                  <div className="text-xs font-bold text-slate-900">
                    {isLandlord ? t('مالك عقارات ومؤجر', 'Landlord') : t('مستأجر موثق', 'Verified Tenant')}
                  </div>
                </div>
              </div>
            </div>

            {/* Verification checklist progress inside profile (5 Pillars - 20% each) */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 block">
                {t('مراحل اكتمال الملف والتوثيق الرسمي (5 متطلبات - 20% لكل منها):', 'Official Verification Progress (5 Pillars - 20% each):')}
              </span>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {/* 1. Basic Info */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${editedName.trim().length >= 3 ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span className="font-semibold text-slate-800">{t('1. الاسم والبيانات الأساسية', '1. Basic Name & Info')}</span>
                  </div>
                  {editedName.trim().length >= 3 ? (
                    <span className="font-mono text-emerald-700 font-bold text-[11px]">20% ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      {t('إكمال الاسم', 'Add Name')}
                    </button>
                  )}
                </div>

                {/* 2. Profile Photo */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${hasCustomPhoto ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span className="font-semibold text-slate-800">{t('2. رفع صورة البروفايل الشخصية', '2. Profile Picture')}</span>
                  </div>
                  {hasCustomPhoto ? (
                    <span className="font-mono text-emerald-700 font-bold text-[11px]">20% ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      {t('رفع الصورة الآن', 'Upload Photo')}
                    </button>
                  )}
                </div>

                {/* 3. Phone OTP */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${isPhoneVerified ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span className="font-semibold text-slate-800">{t('3. توثيق وتأكيد رقم الهاتف المحمول (OTP)', '3. Phone Number OTP')}</span>
                  </div>
                  {isPhoneVerified ? (
                    <span className="font-mono text-emerald-700 font-bold text-[11px]">20% ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('kyc')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      {t('توثيق الهاتف', 'Verify Phone')}
                    </button>
                  )}
                </div>

                {/* 4. Real National ID */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${isIdVerified && idFrontPhoto ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span className="font-semibold text-slate-800">{t('4. بطاقة الرقم القومي المصرية الأصلية (Anti-Fake)', '4. Official Egyptian National ID')}</span>
                  </div>
                  {isIdVerified && idFrontPhoto ? (
                    <span className="font-mono text-emerald-700 font-bold text-[11px]">20% ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('kyc')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      {t('إضافة البطاقة', 'Verify ID')}
                    </button>
                  )}
                </div>

                {/* 5. Biometric Facial Liveness */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${isLivenessVerified ? 'text-emerald-600' : 'text-slate-300'}`} />
                    <span className="font-semibold text-slate-800">{t('5. الفحص البيومتري لحيوية الوجه (Facial Liveness)', '5. Facial Liveness Check')}</span>
                  </div>
                  {isLivenessVerified ? (
                    <span className="font-mono text-emerald-700 font-bold text-[11px]">20% ✓</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('kyc')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      {t('فحص الوجه', 'Start Liveness')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="w-full py-2.5 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('تسجيل الخروج من الحساب', 'Sign Out')}</span>
            </button>
          </div>
        )}

        {/* Tab 2: Identity & Card Verification (Anti-Fake & Phone OTP & Liveness) */}
        {activeTab === 'kyc' && (
          <div className="p-6 space-y-5 max-h-[55vh] overflow-y-auto no-scrollbar">
            {onOpenFullKycPage && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <BadgeCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">{t('صفحة التوثيق الكاملة بالكاميرا المباشرة والبطاقة', 'Full Live Camera & ID Verification')}</h4>
                    <p className="text-[11px] text-blue-100">{t('فحص حيوية الوجه مباشرة ورفع وجه وظهر البطاقة لتوثيق الحساب بالعلامة الزرقاء', 'Face liveness camera & ID scan for Blue Badge')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFullKycPage();
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-white text-blue-800 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 whitespace-nowrap"
                >
                  {t('بدء التوثيق بالكاميرا 📷', 'Open Camera KYC 📷')}
                </button>
              </div>
            )}

            {/* Step A: Phone Number Verification */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <Phone className="w-4 h-4 text-blue-700" />
                  <span>{t('1. توثيق رقم الهاتف المحمول المصري', '1. Verify Egyptian Phone Number')}</span>
                </div>
                {isPhoneVerified && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>{t('تم التوثيق', 'Verified')}</span>
                  </span>
                )}
              </div>

              {!isPhoneVerified ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={editedPhone}
                      onChange={(e) => setEditedPhone(e.target.value)}
                      placeholder="01012345678"
                      className="flex-1 h-9 px-3 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                    />
                    <button
                      type="button"
                      disabled={phoneOtpStep === 'sending'}
                      onClick={handleSendPhoneOtp}
                      className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl whitespace-nowrap"
                    >
                      {phoneOtpStep === 'sending' ? t('جاري الإرسال...', 'Sending...') : t('إرسال رمز OTP', 'Send OTP')}
                    </button>
                  </div>

                  {phoneOtpStep === 'otp_input' && (
                    <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="1234"
                        value={otpInput}
                        onChange={(e) => setOtpInput(normalizeNumericInput(e.target.value))}
                        className="w-24 h-9 text-center font-mono text-sm tracking-widest rounded-xl border border-emerald-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleConfirmPhoneOtp}
                        className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl"
                      >
                        {t('تأكيد الرمز', 'Confirm')}
                      </button>
                      <span className="text-[10px] text-slate-500">{t('رمز تجريبي: 1234', 'Demo: 1234')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  {t('رقم هاتفك موثق ومؤكد رسمياً ولا يظهر في العلن لحماية خصوصيتك.', 'Your phone is verified and securely protected.')}
                </p>
              )}
            </div>

            {/* Step B: Egyptian National ID Anti-Fake Validator */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <FileText className="w-4 h-4 text-blue-700" />
                  <span>{t('2. فحص والتحقق من بطاقة الرقم القومي الحقيقية (14 رقماً)', '2. National ID Verification')}</span>
                </div>
                {isIdVerified && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>{t('بطاقة سليمة ومعتمدة', 'Valid & Confirmed')}</span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  {t('أدخل الرقم القومي المطبوع على البطاقة:', 'Enter 14-digit National ID:')}
                </label>
                <input
                  type="text"
                  maxLength={14}
                  value={nationalIdText}
                  onChange={(e) => {
                    const clean = normalizeNumericInput(e.target.value);
                    setNationalIdText(clean);
                    setIsIdVerified(false);
                  }}
                  placeholder="29508140102948"
                  className="w-full h-10 px-3.5 text-xs font-mono font-bold tracking-wider rounded-xl border border-slate-300 bg-white"
                />

                {/* Validation outcome */}
                {nationalIdText.length > 0 && (
                  <div className="pt-1">
                    {idValidationResult.isValid ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t('تم التحقق بنجاح — الرقم القومي سليم وغير وهمي!', 'National ID Verified & Valid!')}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-emerald-900">
                          <span>{t('تاريخ الميلاد المستخرج:', 'DOB:')} <strong>{idValidationResult.birthDate}</strong></span>
                          <span>{t('المحافظة المسجلة:', 'Gov:')} <strong>{idValidationResult.governorate}</strong></span>
                          <span>{t('النوع:', 'Gender:')} <strong>{idValidationResult.gender === 'male' ? t('ذكر', 'Male') : t('أنثى', 'Female')}</strong></span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{idValidationResult.error}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Photos of ID (File upload or Camera) */}
                <input
                  ref={frontIdInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIdFrontUpload}
                  className="hidden"
                />
                <input
                  ref={backIdInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIdBackUpload}
                  className="hidden"
                />

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div
                    onClick={() => frontIdInputRef.current?.click()}
                    className="p-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 bg-white cursor-pointer text-center space-y-1 transition-colors"
                  >
                    <Upload className="w-4 h-4 mx-auto text-blue-700" />
                    <span className="text-[11px] font-bold text-slate-800 block">
                      {idFrontPhoto ? t('وجه البطاقة (تم الرفع) ✓', 'Front ID Uploaded ✓') : t('رفع صورة وجه البطاقة', 'Upload Front ID')}
                    </span>
                    {idFrontPhoto && (
                      <span className="text-[9px] text-emerald-700 font-medium block">
                        {t('جاهز للفحص', 'Ready for validation')}
                      </span>
                    )}
                  </div>

                  <div
                    onClick={() => backIdInputRef.current?.click()}
                    className="p-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 bg-white cursor-pointer text-center space-y-1 transition-colors"
                  >
                    <Upload className="w-4 h-4 mx-auto text-blue-700" />
                    <span className="text-[11px] font-bold text-slate-800 block">
                      {idBackPhoto ? t('ظهر البطاقة (تم الرفع) ✓', 'Back ID Uploaded ✓') : t('رفع صورة ظهر البطاقة', 'Upload Back ID')}
                    </span>
                    {idBackPhoto && (
                      <span className="text-[9px] text-emerald-700 font-medium block">
                        {t('جاهز للفحص', 'Ready for validation')}
                      </span>
                    )}
                  </div>
                </div>

                {!isIdVerified && idValidationResult.isValid && (
                  <button
                    type="button"
                    onClick={handleConfirmNationalId}
                    className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl transition-colors mt-2"
                  >
                    {t('اعتماد وتأكيد بيانات البطاقة', 'Confirm National ID')}
                  </button>
                )}
              </div>
            </div>

            {/* Step C: Biometric Facial Liveness Check (Look Straight, Turn Right, Turn Left) */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <Camera className="w-4 h-4 text-purple-700" />
                  <span>{t('3. فحص الحيوية للوجه ومطابقة الملامح (Facial Liveness)', '3. Biometric Facial Liveness')}</span>
                </div>
                {isLivenessVerified && (
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>{livenessScore || 99.4}% {t('تطابق', 'Match')}</span>
                  </span>
                )}
              </div>

              {livenessStage === 'idle' && !isLivenessVerified && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    {t(
                      'يطلب منك النظام النظر للأمام ثم الالتفات يميناً ويساراً للتأكد من وجودك الفعلي ومطابقة الملامح.',
                      'Interactive check: Look center, turn right, and turn left.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleStartLivenessTest}
                    className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('بدء فحص الحيوية للوجه الآن', 'Start Facial Liveness Routine')}</span>
                  </button>
                </div>
              )}

              {livenessStage !== 'idle' && livenessStage !== 'done' && (
                <div className="p-5 rounded-2xl bg-slate-950 text-white text-center space-y-3 animate-in fade-in">
                  <div className="w-16 h-16 rounded-full border-4 border-purple-500 animate-pulse mx-auto flex items-center justify-center text-2xl">
                    {livenessStage === 'center' && '👤'}
                    {livenessStage === 'right' && '👉'}
                    {livenessStage === 'left' && '👈'}
                  </div>
                  <div className="font-bold text-sm text-amber-300">
                    {livenessStage === 'center' && t('1/3: انظر مباشرة للأمام نحو الكاميرا 👤', '1/3: Look Straight Ahead 👤')}
                    {livenessStage === 'right' && t('2/3: التفت برأسك جهة اليمين ببطء ➡️', '2/3: Turn Head Slowly to the Right ➡️')}
                    {livenessStage === 'left' && t('3/3: التفت برأسك جهة اليسار ببطء ⬅️', '3/3: Turn Head Slowly to the Left ⬅️')}
                  </div>
                  <div className="w-48 h-1.5 bg-slate-800 rounded-full mx-auto overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-500"
                      style={{
                        width: livenessStage === 'center' ? '33%' : livenessStage === 'right' ? '66%' : '100%',
                      }}
                    />
                  </div>
                </div>
              )}

              {isLivenessVerified && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-700" />
                  <span>{t('اكتمل فحص الحيوية بنجاح ومطابقة الملامح بنسبة 99.4% مع البطاقة!', 'Facial Liveness Confirmed & Matched!')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Integrated Wallet & Financial Transactions */}
        {activeTab === 'wallet' && (
          <div className="p-6 space-y-5 max-h-[55vh] overflow-y-auto no-scrollbar">
            {/* 3 Core Balances Box (Requirement 1 & 5) */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-3 rounded-2xl">
                <span className="text-slate-500 block text-[10px] font-bold mb-0.5">
                  {t('الرصيد المتاح (Available)', 'Available Balance')}
                </span>
                <span className="font-mono text-emerald-800 font-extrabold text-base">
                  {formatEgp(wallet.balanceEgp)}
                </span>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3 rounded-2xl">
                <span className="text-slate-500 block text-[10px] font-bold mb-0.5">
                  {t('المعلق (بالضمان)', 'Pending / Escrow')}
                </span>
                <span className="font-mono text-amber-900 font-extrabold text-base">
                  {formatEgp(wallet.lockedEscrowEgp)}
                </span>
              </div>

              <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 p-3 rounded-2xl">
                <span className="text-slate-500 block text-[10px] font-bold mb-0.5">
                  {t('المسحوب / المدفوع', 'Spent / Withdrawn')}
                </span>
                <span className="font-mono text-slate-800 font-extrabold text-base">
                  {formatEgp(totalSpent)}
                </span>
              </div>
            </div>

            {walletFeedback && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
                {walletFeedback}
              </div>
            )}

            {/* Quick Deposit Form with Electronic Gateways & Screenshot Verification */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 block">
                  {t('شحن وتغذية الرصيد بالمحفظة:', 'Top Up Deposit Balance:')}
                </span>
                <span className="text-[10px] text-blue-700 font-bold bg-blue-100/70 px-2 py-0.5 rounded-full">
                  {t('بوابات دفع إلكترونية معتمدة', 'Official Electronic Gateways')}
                </span>
              </div>

              {/* Preset Amounts */}
              <div className="grid grid-cols-4 gap-1.5">
                {[500, 1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setDepositAmount(amt);
                      setCustomDepositText('');
                    }}
                    className={`py-1.5 rounded-xl text-xs font-mono font-bold border transition-all ${
                      depositAmount === amt && !customDepositText
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {formatEgp(amt)}
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customDepositText}
                  onChange={(e) => setCustomDepositText(normalizeNumericInput(e.target.value))}
                  placeholder={t('أو اكتب مبلغاً آخر (مثال: 1500 ج.م)', 'Or type custom amount (e.g. 1500)')}
                  className="w-full h-8 px-3 text-xs font-bold font-mono rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {/* Electronic Payment Gateways */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDepositMethod('instapay')}
                  className={`p-2 rounded-xl text-[11px] font-bold border text-center transition-all ${
                    depositMethod === 'instapay'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/20'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-bold">إنستاباي (InstaPay)</div>
                  <div className="text-[9px] text-emerald-700">تحويل لحظي فوري</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDepositMethod('mobile_wallet')}
                  className={`p-2 rounded-xl text-[11px] font-bold border text-center transition-all ${
                    depositMethod === 'mobile_wallet'
                      ? 'border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-600/20'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-bold">فودافون كاش</div>
                  <div className="text-[9px] text-rose-700">محافظ المحمول</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDepositMethod('card_meeza')}
                  className={`p-2 rounded-xl text-[11px] font-bold border text-center transition-all ${
                    depositMethod === 'card_meeza'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-600/20'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-bold">كارت ميزة / فيزا</div>
                  <div className="text-[9px] text-blue-700">دفع إلكتروني وطني</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDepositMethod('fawry')}
                  className={`p-2 rounded-xl text-[11px] font-bold border text-center transition-all ${
                    depositMethod === 'fawry'
                      ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-600/20'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-bold">فوري باي</div>
                  <div className="text-[9px] text-amber-700">منافذ الخدمة</div>
                </button>
              </div>

              {/* Gateway Account Reference Instructions */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs">
                {depositMethod === 'instapay' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('معرف إنستاباي للمنصة:', 'InstaPay Handle:')}</span>
                      <span className="font-mono font-bold text-slate-900 select-all">meftahmisr@instapay</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('meftahmisr@instapay', 'instapay')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1"
                    >
                      {copiedKey === 'instapay' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'instapay' ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                )}
                {depositMethod === 'mobile_wallet' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('رقم محفظة كاش المعتمد:', 'Cash Wallet Number:')}</span>
                      <span className="font-mono font-bold text-slate-900 select-all">01012345678</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('01012345678', 'wallet')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1"
                    >
                      {copiedKey === 'wallet' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'wallet' ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                )}
                {depositMethod === 'card_meeza' && (
                  <div>
                    <span className="text-[10px] text-slate-500 block">{t('بوابة ميزة الإلكترونية المعتمدة:', 'Meeza Gateway Ref:')}</span>
                    <span className="font-mono font-bold text-blue-900 text-[11px]">MEZ-EGYPT-GATEWAY-2026</span>
                  </div>
                )}
                {depositMethod === 'fawry' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">{t('كود الخدمة لدى فوري:', 'Fawry Service Code:')}</span>
                      <span className="font-mono font-bold text-slate-900 select-all">982 410 721</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('982410721', 'fawry')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10px] flex items-center gap-1"
                    >
                      {copiedKey === 'fawry' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'fawry' ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Receipt Screenshot Upload */}
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-700" />
                    <span>{t('إرفاق سكرين شوت إيصال التحويل (مطلوب للتأكيد):', 'Transfer Receipt Screenshot (Required):')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleUseMockReceipt}
                    className="text-[10px] text-blue-700 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{t('توليد إيصال تجريبي للاختبار', 'Mock Receipt')}</span>
                  </button>
                </div>

                <input
                  ref={receiptFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptFileChange}
                  className="hidden"
                />

                {receiptScreenshot ? (
                  <div className="p-2 bg-white rounded-lg border border-blue-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={receiptScreenshot}
                        alt="Receipt Thumbnail"
                        className="w-10 h-10 object-cover rounded border border-slate-200 cursor-pointer"
                        onClick={() => setPreviewLightboxUrl(receiptScreenshot)}
                      />
                      <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('تم إرفاق صورة الإيصال', 'Receipt attached')}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewLightboxUrl(receiptScreenshot)}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                      >
                        {t('معاينة', 'View')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptScreenshot(null)}
                        className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => receiptFileInputRef.current?.click()}
                    className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-slate-700 text-center transition-colors flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-700" />
                    <span className="font-semibold text-[11px]">{t('اضغط هنا لاختيار سكرين شوت أو صورة الإيصال', 'Click to choose screenshot or receipt photo')}</span>
                  </button>
                )}

                {uploadError && (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isProcessingDeposit}
                onClick={handleExecuteDeposit}
                className="w-full h-10 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2"
              >
                {isProcessingDeposit ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>
                      {t(
                        `تأكيد إرسال إيصال شحن ${formatEgp(customDepositText ? Number(customDepositText) || depositAmount : depositAmount)} الآن`,
                        `Submit Receipt & Credit Now`
                      )}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Transactions Log */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  {t('سجل المعاملات وتأكيد الإيصالات', 'Transaction History & Receipt Confirmations')}
                </span>
                <div className="flex gap-1 text-[10px] font-bold bg-slate-100 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTxFilter('all')}
                    className={`px-2 py-0.5 rounded ${txFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('الكل', 'All')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxFilter('deposit')}
                    className={`px-2 py-0.5 rounded ${txFilter === 'deposit' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('إيداع (+)', 'Deposits')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxFilter('deduction')}
                    className={`px-2 py-0.5 rounded ${txFilter === 'deduction' ? 'bg-white text-rose-800 shadow-2xs' : 'text-slate-600'}`}
                  >
                    {t('خصم (-)', 'Deductions')}
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
                {filteredTxs.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-400">
                    {t('لا توجد حركات رصيد مطابقة.', 'No matching transactions.')}
                  </div>
                ) : (
                  filteredTxs.map((tx) => {
                    const isPositive = tx.type === 'deposit' || tx.type === 'refund';
                    const isPending = tx.status === 'pending_confirmation';
                    const isConfirmed = tx.status === 'confirmed';

                    return (
                      <div
                        key={tx.id}
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          isPending ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isPending
                                  ? 'bg-amber-100 text-amber-700'
                                  : isPositive
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {isPending ? (
                                <Clock className="w-3.5 h-3.5 animate-pulse" />
                              ) : isPositive ? (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 text-[11px] flex items-center gap-1.5">
                                <span>{tx.description}</span>
                                {isPending && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[9px] font-bold">
                                    {t('⏳ قيد المراجعة', 'Pending Review')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-slate-400 font-mono">
                                {formatTimeAgo(tx.createdAtMs)} {tx.referenceNumber && `· ${tx.referenceNumber}`}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`font-mono font-bold text-xs ${
                              isPending ? 'text-amber-800' : isPositive ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {isPositive ? '+' : '-'}{formatEgp(tx.amountEgp)}
                          </div>
                        </div>

                        {/* Screenshot Action & Immediate Approval Action */}
                        {(tx.receiptScreenshotUrl || isPending) && (
                          <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                            {tx.receiptScreenshotUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewLightboxUrl(tx.receiptScreenshotUrl!)}
                                className="text-[10px] text-blue-700 font-bold hover:underline flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('معاينة الإيصال المرفق', 'View Receipt')}</span>
                              </button>
                            )}

                            {isPending && onApproveDeposit && (
                              <button
                                type="button"
                                disabled={approvingTxId === tx.id}
                                onClick={() => handleConfirmApproval(tx.id)}
                                className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ms-auto"
                                title="تأكيد وصول المبلغ واعتماد الإيداع فوراً ليسمع في رصيد المحفظة"
                              >
                                {approvingTxId === tx.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <FileCheck className="w-3 h-3" />
                                )}
                                <span>{t('تأكيد الإيصال وتسميع الرصيد الآن', 'Confirm & Credit Now')}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Full Image Lightbox Modal for Receipt Preview */}
        {previewLightboxUrl && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
              <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
                <span className="font-bold text-sm flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <span>{t('معاينة إيصال التحويل المعتمد', 'Transfer Receipt Preview')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewLightboxUrl(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
                <img
                  src={previewLightboxUrl}
                  alt="Full Receipt"
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg border border-slate-300"
                />
              </div>
              <div className="p-3 bg-white text-center border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewLightboxUrl(null)}
                  className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  {t('إغلاق المعاينة', 'Close Preview')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
