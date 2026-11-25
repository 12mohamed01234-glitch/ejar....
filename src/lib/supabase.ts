import { createClient } from '@supabase/supabase-js';
import {
  ApartmentRecord,
  BookingRecord,
  TenantWalletRecord,
  WalletTransactionRecord,
  PaymentMethodType,
  SHOWCASE_APARTMENTS,
  normalizeApartmentRecord,
  normalizeWalletRecord,
  normalizeBookingRecord,
  PlatformSettingsRecord,
  normalizePlatformSettings,
  BannedUserRecord,
  computeEjarEscrowPricing,
} from './validation';
import { UserAccountData } from '../components/AuthModal';

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  'https://kaajbwzqamhaqvusiivm.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  'sb_publishable_g6yc8lyz7SIrdOfOgJuomA_djg99wiK';

function safeCreateSupabaseClient() {
  const targetUrl = SUPABASE_URL && SUPABASE_URL.startsWith('http')
    ? SUPABASE_URL
    : 'https://kaajbwzqamhaqvusiivm.supabase.co';
  const targetKey = SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_g6yc8lyz7SIrdOfOgJuomA_djg99wiK';

  try {
    return createClient(targetUrl, targetKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('[Supabase Init Fallback]:', err);
    return createClient('https://kaajbwzqamhaqvusiivm.supabase.co', 'sb_publishable_g6yc8lyz7SIrdOfOgJuomA_djg99wiK', {
      auth: {
        persistSession: false,
      },
    });
  }
}

export const supabase = safeCreateSupabaseClient();

/**
 * Browser-side image compressor:
 * Scales down large images to max dimensions and converts to optimized JPEG.
 * Reduces 5MB+ phone camera images to ~50KB-100KB for fast uploads and reliable local persistence.
 */
export async function compressImageBlob(
  file: File | Blob,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.72
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      const reader = new FileReader();
      reader.onload = () => resolve({ blob: file, dataUrl: (reader.result as string) || '' });
      reader.onerror = () => resolve({ blob: file, dataUrl: '' });
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const fallbackDataUrl = (e.target?.result as string) || '';
          resolve({ blob: file, dataUrl: fallbackDataUrl });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            resolve({ blob: blob || file, dataUrl });
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        const fallbackDataUrl = (e.target?.result as string) || '';
        resolve({ blob: file, dataUrl: fallbackDataUrl });
      };
      img.src = (e.target?.result as string) || '';
    };
    reader.onerror = () => resolve({ blob: file, dataUrl: '' });
    reader.readAsDataURL(file);
  });
}

export const STORAGE_BUCKETS = {
  APARTMENTS: 'apartments',
  AVATARS: 'avatars',
  KYC_DOCUMENTS: 'kyc-documents',
} as const;
export type StorageBucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface UploadStorageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  contentType?: string;
}

/**
 * Converts a Base64 Data URL (e.g. webcam canvas capture) to a binary Blob
 * so it can be uploaded directly to Supabase Storage.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length !== 2) {
    throw new Error('صيغة الصورة المؤقتة غير صالحة للرفع');
  }
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Universal Supabase Storage Upload Helper
 * Uploads images (compressed), videos, or PDFs directly to Supabase Storage
 * and returns the real public CDN URL via getPublicUrl.
 * Throws a descriptive error (and logs to console.error) if upload fails — never silently falls back to Base64.
 */
export async function uploadSupabaseFile(
  bucket: StorageBucketName | string,
  filePath: string,
  file: File | Blob,
  options?: UploadStorageOptions
): Promise<{ publicUrl: string; path: string; error: null; isFallback: false }> {
  let cleanPath = filePath.replace(/^\/+/, '');
  if (cleanPath.startsWith(bucket + '/')) {
    cleanPath = cleanPath.slice(bucket.length + 1);
  }

  if (!file || file.size === 0) {
    const emptyErr = new Error('الملف المختار فارغ ولا يمكن رفعه.');
    console.error('[Supabase Storage Upload Error]', { bucket, cleanPath, error: emptyErr });
    throw emptyErr;
  }

  const fileName = file instanceof File ? file.name : '';
  const mime = (options?.contentType || file.type || '').toLowerCase();
  const isVideo =
    mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv|avi|m4v)$/i.test(fileName);
  const isPdfOrDoc =
    mime === 'application/pdf' || /\.(pdf|doc|docx)$/i.test(fileName);
  const isSvg = mime.includes('svg') || /\.svg$/i.test(fileName);
  const isRasterImage =
    !isVideo &&
    !isPdfOrDoc &&
    !isSvg &&
    (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|avif)$/i.test(fileName));

  let uploadBlob: Blob = file;
  let contentType = mime || (isVideo ? 'video/mp4' : isPdfOrDoc ? 'application/pdf' : 'application/octet-stream');

  if (isRasterImage) {
    const compressed = await compressImageBlob(
      file,
      options?.maxWidth ?? 1400,
      options?.maxHeight ?? 1400,
      options?.quality ?? 0.8
    );
    uploadBlob = compressed.blob;
    contentType = compressed.blob.type || 'image/jpeg';
  }

  const { data: uploadData, error } = await supabase.storage
    .from(bucket)
    .upload(cleanPath, uploadBlob, {
      cacheControl: '3600',
      upsert: true,
      contentType,
    });

  if (error) {
    console.error(`[Supabase Storage Upload Failed] bucket="${bucket}", path="${cleanPath}":`, error);
    throw new Error(`فشل رفع الملف إلى Supabase Storage (${bucket}): ${error.message}`);
  }

  const storedPath = uploadData?.path || cleanPath;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storedPath);
  if (!urlData?.publicUrl) {
    const urlError = new Error(`تعذر استخراج الرابط العام للملف المرفوع في (${bucket})`);
    console.error('[Supabase Storage getPublicUrl Error]', { bucket, storedPath, urlError });
    throw urlError;
  }

  return {
    publicUrl: urlData.publicUrl,
    path: storedPath,
    error: null,
    isFallback: false,
  };
}

/**
 * Uploads a Base64 data URL (such as a webcam selfie snapshot) directly to Supabase Storage.
 */
export async function uploadSupabaseDataUrl(
  bucket: StorageBucketName | string,
  filePath: string,
  dataUrl: string,
  options?: UploadStorageOptions
): Promise<{ publicUrl: string; path: string; error: null; isFallback: false }> {
  const blob = dataUrlToBlob(dataUrl);
  return uploadSupabaseFile(bucket, filePath, blob, options);
}

export type SupabaseConnectionStatus = 'connected' | 'needs_tables' | 'offline';

export interface SupabaseHealth {
  status: SupabaseConnectionStatus;
  message: string;
  checkedAtMs: number;
}

// In-memory / local fallback cache to ensure zero frontend downtime
const LOCAL_STORAGE_PREFIX = 'meftah_supabase_';

function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(val));
  } catch { }
}

export const SUPABASE_SCHEMA_HINT =
  'جداول Supabase غير موجودة بعد. افتح SQL Editor في مشروع kaajbwzqamhaqvusiivm والصق محتوى supabase/schema.sql ثم نفّذه. المفتاح العام لا يستطيع إنشاء الجداول بنفسه.';

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || Boolean(error.message?.includes('Could not find the table'));
}

function assertNoError(
  error: { code?: string; message?: string } | null,
  action: string
): void {
  if (!error) return;
  if (isMissingTableError(error)) {
    throw new Error(SUPABASE_SCHEMA_HINT);
  }
  throw new Error(`${action}: ${error.message || 'unknown Supabase error'}`);
}

export function emptyWallet(userId: string): TenantWalletRecord {
  return {
    uid: userId,
    balanceEgp: 0,
    totalDepositedEgp: 0,
    lockedEscrowEgp: 0,
    hasActiveDeposit: false,
    lastUpdatedMs: Date.now(),
    transactions: [],
  };
}

/**
 * Health check probe to determine whether Supabase is reachable and if tables are provisioned.
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealth> {
  try {
    const { error } = await supabase.from('apartments').select('id').limit(1);
    if (!error) {
      return {
        status: 'connected',
        message: 'متصل بقاعدة بيانات Supabase الحقيقية بنجاح',
        checkedAtMs: Date.now(),
      };
    }

    if (isMissingTableError(error)) {
      return {
        status: 'needs_tables',
        message: SUPABASE_SCHEMA_HINT,
        checkedAtMs: Date.now(),
      };
    }

    return {
      status: 'offline',
      message: error.message,
      checkedAtMs: Date.now(),
    };
  } catch (err) {
    return {
      status: 'offline',
      message: err instanceof Error ? err.message : String(err),
      checkedAtMs: Date.now(),
    };
  }
}

// ==============================================================================
// 1. PROFILES & USER ACCOUNTS SERVICE
// ==============================================================================
export async function getSupabaseProfile(userId: string): Promise<UserAccountData | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      assertNoError(error, 'قراءة الملف الشخصي');
    }
    if (!data) return null;

    const userData: UserAccountData = {
      uid: data.id,
      displayName: data.display_name || data.email?.split('@')[0] || 'مستخدم',
      email: data.email,
      phone: data.phone || '',
      role: data.role || 'tenant',
      photoUrl: data.photo_url || undefined,
      isLandlordVerified: Boolean(data.is_landlord_verified),
      isTenantVerified: Boolean(data.is_tenant_verified),
      createdAtMs: new Date(data.created_at).getTime(),
    };

    setLocal(`user_${userId}`, userData);
    return userData;
  } catch (err) {
    if (err instanceof Error && err.message === SUPABASE_SCHEMA_HINT) throw err;
    return getLocal<UserAccountData | null>(`user_${userId}`, null);
  }
}

export async function getSupabaseProfileByEmail(email: string): Promise<UserAccountData | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      uid: data.id,
      displayName: data.display_name || cleanEmail.split('@')[0] || 'مستخدم',
      email: data.email,
      phone: data.phone || '',
      role: data.role || 'tenant',
      photoUrl: data.photo_url || undefined,
      isLandlordVerified: Boolean(data.is_landlord_verified),
      isTenantVerified: Boolean(data.is_tenant_verified),
      createdAtMs: new Date(data.created_at).getTime(),
    };
  } catch {
    return null;
  }
}

export async function upsertSupabaseProfile(user: UserAccountData): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.uid,
      email: user.email,
      display_name: user.displayName,
      phone: user.phone,
      role: user.role === 'landlord' ? 'landlord' : 'tenant',
      photo_url: user.photoUrl ?? null,
      is_landlord_verified: user.isLandlordVerified,
      is_tenant_verified: user.isTenantVerified,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  assertNoError(error, 'حفظ الملف الشخصي');
  setLocal(`user_${user.uid}`, user);
}

export async function updateSupabaseKycStatus(
  userId: string,
  kyc: {
    isLandlordVerified?: boolean;
    isTenantVerified?: boolean;
    nationalIdNumber?: string;
    nationalIdFrontUrl?: string;
    nationalIdBackUrl?: string;
    ownershipDocUrl?: string;
    facialLivenessVerified?: boolean;
    facialMatchScore?: number;
  }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof kyc.isLandlordVerified === 'boolean') payload.is_landlord_verified = kyc.isLandlordVerified;
    if (typeof kyc.isTenantVerified === 'boolean') payload.is_tenant_verified = kyc.isTenantVerified;
    if (kyc.nationalIdNumber) payload.national_id_number = kyc.nationalIdNumber;
    if (kyc.nationalIdFrontUrl) payload.national_id_front_url = kyc.nationalIdFrontUrl;
    if (kyc.nationalIdBackUrl) payload.national_id_back_url = kyc.nationalIdBackUrl;
    if (kyc.ownershipDocUrl) payload.ownership_doc_url = kyc.ownershipDocUrl;
    if (typeof kyc.facialLivenessVerified === 'boolean') payload.facial_liveness_verified = kyc.facialLivenessVerified;
    if (typeof kyc.facialMatchScore === 'number') payload.facial_match_score = kyc.facialMatchScore;

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
    assertNoError(error, 'تحديث توثيق الهوية');
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('تحديث توثيق الهوية فشل');
  }
}

// ==============================================================================
// 2. APARTMENTS / PROPERTIES SERVICE
// ==============================================================================
export function mapRowToApartmentRecord(row: Record<string, unknown>): ApartmentRecord {
  return normalizeApartmentRecord(
    {
      ownerId: row.owner_id,
      ownerDisplayName: row.owner_display_name,
      ownerPhone: row.owner_phone,
      title: row.title,
      description: row.description,
      category: row.category,
      billingMode: row.billing_mode,
      monthlyRentEgp: Number(row.monthly_rent_egp) || 1000,
      dailyRateEgp: Number(row.daily_rate_egp) || 0,
      studentBedsCount: Number(row.student_beds_count) || 0,
      studentPricePerBedEgp: Number(row.student_price_per_bed_egp) || 0,
      governorate: row.governorate,
      district: row.district,
      lat: Number(row.lat) || 30.0444,
      lng: Number(row.lng) || 31.2357,
      bedrooms: Number(row.bedrooms) || 1,
      bathrooms: Number(row.bathrooms) || 1,
      areaSqm: Number(row.area_sqm) || 50,
      furnishing: row.furnishing || 'furnished',
      imageUrl: row.image_url,
      imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined,
      imageKey: row.image_key || 'zamalek_nile',
      hasVirtualTour: Boolean(row.has_virtual_tour),
      virtualTourUrl: row.virtual_tour_url,
      panorama360Key: row.panorama_360_key || 'none',
      verificationStatus: row.verification_status || 'verified',
      availabilityStatus: row.availability_status || 'available',
      commissionRatePct: Number(row.commission_rate_pct) || 10,
      baseCurrency: 'EGP',
      baseMonthlyPrice: Number(row.monthly_rent_egp) || 1000,
      baseDailyPrice: Number(row.daily_rate_egp) || 0,
      baseStudentBedPrice: Number(row.student_price_per_bed_egp) || 0,
    },
    String(row.id),
    true
  );
}

export async function fetchSupabaseApartments(): Promise<ApartmentRecord[]> {
  try {
    const { data, error } = await supabase
      .from('apartments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) return [];
      assertNoError(error, 'جلب العقارات');
    }

    const records = (data || []).map((row) => mapRowToApartmentRecord(row as Record<string, unknown>));
    setLocal('cached_apartments', records);
    return records;
  } catch (err) {
    if (err instanceof Error && err.message === SUPABASE_SCHEMA_HINT) return [];
    const cached = getLocal<ApartmentRecord[]>('cached_apartments', []);
    return cached;
  }
}

export async function createSupabaseApartment(record: ApartmentRecord): Promise<ApartmentRecord> {
  const row = {
    id: record.id,
    owner_id: record.ownerId,
    owner_display_name: record.ownerDisplayName,
    owner_phone: record.ownerPhone || '01012345678',
    title: record.title,
    description: record.description,
    category: record.category,
    billing_mode: record.billingMode,
    monthly_rent_egp: record.monthlyRentEgp,
    daily_rate_egp: record.dailyRateEgp,
    student_beds_count: record.studentBedsCount,
    student_price_per_bed_egp: record.studentPricePerBedEgp,
    governorate: record.governorate,
    district: record.district,
    lat: record.lat,
    lng: record.lng,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    area_sqm: record.areaSqm,
    furnishing: record.furnishing,
    image_key: record.imageKey,
    image_url: record.imageUrl || record.imageUrls?.[0] || null,
    has_virtual_tour: record.hasVirtualTour,
    virtual_tour_url: record.virtualTourUrl || record.panorama360DataUrl || null,
    panorama_360_key: record.panorama360Key || 'none',
    verification_status: record.verificationStatus,
    availability_status: record.availabilityStatus,
    commission_rate_pct: record.commissionRatePct,
  };

  const rowWithGallery = {
    ...row,
    image_urls: record.imageUrls && record.imageUrls.length > 0 ? record.imageUrls : null,
  };

  let { error } = await supabase.from('apartments').upsert(rowWithGallery, { onConflict: 'id' });
  if (error && error.message?.includes('image_urls')) {
    const retry = await supabase.from('apartments').upsert(row, { onConflict: 'id' });
    error = retry.error;
  }
  assertNoError(error, 'حفظ العقار');

  const current = getLocal<ApartmentRecord[]>('cached_apartments', []);
  setLocal('cached_apartments', [record, ...current.filter((item) => item.id !== record.id)]);

  return record;
}

export async function deleteSupabaseApartment(aptId: string): Promise<boolean> {
  const { error } = await supabase.from('apartments').delete().eq('id', aptId);
  assertNoError(error, 'حذف العقار');
  const current = getLocal<ApartmentRecord[]>('cached_apartments', []);
  setLocal(
    'cached_apartments',
    current.filter((a) => a.id !== aptId)
  );
  return true;
}

export async function updateSupabaseApartmentVerificationStatus(
  aptId: string,
  status: 'verified' | 'rejected'
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('apartments')
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq('id', aptId)
      .select('id');

    if (error) {
      assertNoError(error, 'تحديث حالة العقار');
    } else if (!data || data.length === 0) {
      const existingShowcase = SHOWCASE_APARTMENTS.find((s) => s.id === aptId);
      if (existingShowcase) {
        await createSupabaseApartment({
          ...existingShowcase,
          verificationStatus: status,
        });
      }
    }

    const current = getLocal<ApartmentRecord[]>('cached_apartments', []);
    setLocal(
      'cached_apartments',
      current.map((a) => (a.id === aptId ? { ...a, verificationStatus: status } : a))
    );
  } catch (err) {
    console.warn('[Supabase Apartments] Verification update warning:', err);
  }
}

export async function updateSupabaseApartmentDetails(
  aptId: string,
  updates: Partial<ApartmentRecord>
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.billingMode !== undefined) row.billing_mode = updates.billingMode;
    if (updates.monthlyRentEgp !== undefined) row.monthly_rent_egp = updates.monthlyRentEgp;
    if (updates.dailyRateEgp !== undefined) row.daily_rate_egp = updates.dailyRateEgp;
    if (updates.studentPricePerBedEgp !== undefined) row.student_price_per_bed_egp = updates.studentPricePerBedEgp;
    if (updates.studentBedsCount !== undefined) row.student_beds_count = updates.studentBedsCount;
    if (updates.furnishing !== undefined) row.furnishing = updates.furnishing;
    if (updates.verificationStatus !== undefined) row.verification_status = updates.verificationStatus;
    if (updates.availabilityStatus !== undefined) row.availability_status = updates.availabilityStatus;
    if (updates.commissionRatePct !== undefined) row.commission_rate_pct = updates.commissionRatePct;
    if (updates.governorate !== undefined) row.governorate = updates.governorate;
    if (updates.district !== undefined) row.district = updates.district;
    if (updates.bedrooms !== undefined) row.bedrooms = updates.bedrooms;
    if (updates.bathrooms !== undefined) row.bathrooms = updates.bathrooms;
    if (updates.areaSqm !== undefined) row.area_sqm = updates.areaSqm;

    const { data, error } = await supabase
      .from('apartments')
      .update(row)
      .eq('id', aptId)
      .select('id');

    if (error || !data || data.length === 0) {
      const existingShowcase = SHOWCASE_APARTMENTS.find((s) => s.id === aptId);
      if (existingShowcase) {
        await createSupabaseApartment({
          ...existingShowcase,
          ...updates,
        });
      } else if (error) {
        assertNoError(error, 'تحديث تفاصيل العقار');
      }
    }

    const current = getLocal<ApartmentRecord[]>('cached_apartments', []);
    setLocal(
      'cached_apartments',
      current.map((a) => (a.id === aptId ? { ...a, ...updates } : a))
    );
  } catch (err) {
    console.error('[Supabase Apartments] Update failed:', err);
    throw err;
  }
}

// ==============================================================================
// 2.1 PLATFORM SETTINGS & GLOBAL CONFIG SYNC (SUPABASE REALTIME)
// ==============================================================================
export const globalSettingsChannel = supabase.channel('meftah_settings_sync');
globalSettingsChannel.subscribe();

export async function broadcastSupabasePlatformSettings(
  settings: PlatformSettingsRecord
): Promise<void> {
  try {
    await globalSettingsChannel.send({
      type: 'broadcast',
      event: 'settings_update',
      payload: settings,
    });
  } catch (err) {
    console.warn('[Supabase Broadcast] Settings broadcast warning:', err);
  }
}

export async function fetchSupabasePlatformSettings(): Promise<PlatformSettingsRecord | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ownership_doc_url, display_name')
      .eq('id', '__platform_settings__')
      .maybeSingle();

    if (error || !data) {
      return getLocal<PlatformSettingsRecord | null>('platform_settings', null);
    }

    const rawJson = data.ownership_doc_url || data.display_name;
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson);
    const normalized = normalizePlatformSettings(parsed);
    setLocal('platform_settings', normalized);
    return normalized;
  } catch (err) {
    console.warn('[Supabase Settings] Could not fetch settings:', err);
    return getLocal<PlatformSettingsRecord | null>('platform_settings', null);
  }
}

export async function saveSupabasePlatformSettings(
  settings: PlatformSettingsRecord
): Promise<void> {
  try {
    const jsonStr = JSON.stringify(settings);
    setLocal('platform_settings', settings);

    const { error } = await supabase.from('profiles').upsert(
      {
        id: '__platform_settings__',
        email: 'system.settings@meftahmisr.com',
        display_name: 'Platform Global Settings',
        phone: '01000000000',
        role: 'tenant',
        ownership_doc_url: jsonStr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[Supabase Settings] Upsert warning:', error.message);
    }
  } catch (err) {
    console.warn('[Supabase Settings] Save warning:', err);
  }
}

export async function fetchSupabaseBannedUsers(): Promise<BannedUserRecord[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ownership_doc_url')
      .eq('id', '__banned_users__')
      .maybeSingle();

    if (!error && data?.ownership_doc_url) {
      const parsed = JSON.parse(data.ownership_doc_url) as BannedUserRecord[];
      if (Array.isArray(parsed)) {
        setLocal('banned_users', parsed);
        return parsed;
      }
    }
  } catch {}
  return getLocal<BannedUserRecord[]>('banned_users', []);
}

export async function banSupabaseUser(record: BannedUserRecord): Promise<BannedUserRecord[]> {
  const existing = await fetchSupabaseBannedUsers();
  const nextList: BannedUserRecord[] = [
    record,
    ...existing.filter((b) => b.userId !== record.userId),
  ];
  setLocal('banned_users', nextList);

  try {
    // 1. Save ban list into Supabase profiles config row
    await supabase.from('profiles').upsert(
      {
        id: '__banned_users__',
        email: 'system.bans@meftahmisr.com',
        display_name: 'Platform Banned Users',
        phone: '01000000001',
        role: 'tenant',
        ownership_doc_url: JSON.stringify(nextList),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    // 2. Hide all listings owned by banned user in Supabase
    if (record.hideListings) {
      await supabase
        .from('apartments')
        .update({ verification_status: 'rejected', updated_at: new Date().toISOString() })
        .eq('owner_id', record.userId);
    }
  } catch (err) {
    console.warn('[Supabase Ban] Warning:', err);
  }
  return nextList;
}

export async function unbanSupabaseUser(userId: string): Promise<BannedUserRecord[]> {
  const existing = await fetchSupabaseBannedUsers();
  const nextList = existing.filter((b) => b.userId !== userId);
  setLocal('banned_users', nextList);

  try {
    await supabase.from('profiles').upsert(
      {
        id: '__banned_users__',
        email: 'system.bans@meftahmisr.com',
        display_name: 'Platform Banned Users',
        phone: '01000000001',
        role: 'tenant',
        ownership_doc_url: JSON.stringify(nextList),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('[Supabase Unban] Warning:', err);
  }
  return nextList;
}

// Auto-seed initial apartments into Supabase if table is currently empty
export async function autoSeedSupabaseApartments(): Promise<void> {
  try {
    const { count, error } = await supabase
      .from('apartments')
      .select('id', { count: 'exact', head: true });

    if (error || count === null) return;
    if (count === 0) {
      const rows = SHOWCASE_APARTMENTS.map((record) => ({
        id: record.id,
        owner_id: record.ownerId,
        owner_display_name: record.ownerDisplayName,
        owner_phone: record.ownerPhone || '01012345678',
        title: record.title,
        description: record.description,
        category: record.category,
        billing_mode: record.billingMode,
        monthly_rent_egp: record.monthlyRentEgp,
        daily_rate_egp: record.dailyRateEgp,
        student_beds_count: record.studentBedsCount,
        student_price_per_bed_egp: record.studentPricePerBedEgp,
        governorate: record.governorate,
        district: record.district,
        lat: record.lat,
        lng: record.lng,
        bedrooms: record.bedrooms,
        bathrooms: record.bathrooms,
        area_sqm: record.areaSqm,
        furnishing: record.furnishing,
        image_key: record.imageKey,
        has_virtual_tour: record.hasVirtualTour,
        panorama_360_key: record.panorama360Key || 'none',
        verification_status: 'verified',
        availability_status: 'available',
        commission_rate_pct: 10,
      }));

      const { error: seedError } = await supabase.from('apartments').upsert(rows, { onConflict: 'id' });
      assertNoError(seedError, 'تهيئة العقارات');
    }
  } catch (err) {
    console.warn('[Supabase Apartments] Seed skipped:', err);
  }
}

// ==============================================================================
// 3. BOOKINGS & ESCROW SERVICE
// ==============================================================================
export async function fetchSupabaseBookings(userId: string): Promise<BookingRecord[]> {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .or(`tenant_id.eq.${userId},landlord_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) return [];
      assertNoError(error, 'جلب الحجوزات');
    }
    if (Array.isArray(data)) {
      const mapped = data.map((b) =>
        normalizeBookingRecord(
          {
            id: b.id,
            apartmentId: b.apartment_id,
            apartmentTitle: b.apartment_title || 'حجز شقة',
            tenantId: b.tenant_id,
            tenantDisplayName: b.tenant_name || 'مستأجر موثق',
            landlordId: b.landlord_id,
            rentalUnit: b.rental_unit,
            unitsCount: b.units_count,
            totalRentEgp: Number(b.total_rent_egp),
            escrowAmountEgp: Number(b.escrow_amount_egp),
            commissionAmountEgp: Number(b.commission_amount_egp),
            platformCommissionEgp: Number(b.commission_amount_egp || 0),
            landlordNetEgp: Math.max(0, Number(b.total_rent_egp) - Math.round(Number(b.commission_amount_egp || 0) / 2)),
            status: b.status,
            paymentMethod: b.payment_method,
            createdAt: { toMillis: () => new Date(b.created_at).getTime() },
            paymentReference: b.reference_number || '',
            governorate: 'القاهرة',
            leaseMonths: Number(b.units_count) || 1,
            monthlyRentEgp: Number(b.total_rent_egp) || 0,
          },
          b.id
        )
      );

      setLocal(`bookings_${userId}`, mapped);
      return mapped;
    }
    return [];
  } catch (err) {
    if (err instanceof Error && err.message === SUPABASE_SCHEMA_HINT) return [];
    return getLocal<BookingRecord[]>(`bookings_${userId}`, []);
  }
}

export async function createSupabaseBooking(record: BookingRecord): Promise<BookingRecord> {
  const firstMonthPricing = computeEjarEscrowPricing(
    record.unitPriceEgp || record.monthlyRentEgp || record.totalRentEgp,
    record.totalRentEgp
  );
  const row = {
    id: record.id,
    apartment_id: record.apartmentId,
    apartment_title: record.apartmentTitle || 'حجز شقة',
    tenant_id: record.tenantId,
    tenant_name: record.tenantDisplayName || 'مستأجر',
    landlord_id: record.landlordId,
    rental_unit: record.rentalUnit,
    units_count: record.unitsCount,
    total_rent_egp: record.totalRentEgp,
    escrow_amount_egp: record.escrowAmountEgp || firstMonthPricing.onlineDueTotalEgp,
    commission_amount_egp: record.commissionAmountEgp || firstMonthPricing.onlineDueTotalEgp,
    status: record.status || 'escrow_paid',
    payment_method: record.paymentMethod,
    reference_number: record.paymentReference || '',
    created_at: new Date(record.createdAtMs).toISOString(),
  };

  const { error } = await supabase.from('bookings').upsert(row, { onConflict: 'id' });
  assertNoError(error, 'حفظ الحجز');

  const current = getLocal<BookingRecord[]>(`bookings_${record.tenantId}`, []);
  setLocal(`bookings_${record.tenantId}`, [record, ...current]);

  return record;
}

// ==============================================================================
// 4. WALLET & TRANSACTIONS SERVICE
// ==============================================================================
export async function fetchSupabaseWallet(userId: string): Promise<TenantWalletRecord> {
  const fallbackWallet = emptyWallet(userId);

  try {
    // 1. Fetch wallet record
    const { data: wData, error: wErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 2. Fetch transactions
    const { data: txData, error: txErr } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (wErr && isMissingTableError(wErr)) return fallbackWallet;
    if (wErr && wErr.code !== 'PGRST116') {
      assertNoError(wErr, 'جلب المحفظة');
    }

    if (!wData) {
      const { error: createErr } = await supabase.from('wallets').upsert(
        {
          id: `wal_${userId}`,
          user_id: userId,
          balance_egp: 0,
          locked_escrow_egp: 0,
          total_deposited_egp: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (createErr && !isMissingTableError(createErr)) {
        assertNoError(createErr, 'إنشاء المحفظة');
      }
      return fallbackWallet;
    }

    if (wData) {
      const txs: WalletTransactionRecord[] = (!txErr && Array.isArray(txData))
        ? txData.map((t) => ({
          id: t.id,
          type: t.type,
          amountEgp: Number(t.amount_egp) || 0,
          description: t.description || 'معاملة رصيد',
          createdAtMs: new Date(t.created_at).getTime(),
          paymentMethod: t.payment_method,
          referenceNumber: t.reference_number,
          receiptScreenshotUrl: t.receipt_screenshot_url,
          status: t.status || 'confirmed',
          confirmedAtMs: t.confirmed_at ? new Date(t.confirmed_at).getTime() : undefined,
        }))
        : [];

      const walletRecord: TenantWalletRecord = {
        uid: userId,
        balanceEgp: Number(wData.balance_egp) || 0,
        lockedEscrowEgp: Number(wData.locked_escrow_egp) || 0,
        totalDepositedEgp: Number(wData.total_deposited_egp) || 0,
        hasActiveDeposit: Number(wData.balance_egp) >= 500,
        lastUpdatedMs: new Date(wData.updated_at).getTime(),
        transactions: txs,
      };

      setLocal(`wallet_${userId}`, walletRecord);
      return walletRecord;
    }

    return fallbackWallet;
  } catch (err) {
    if (err instanceof Error && err.message === SUPABASE_SCHEMA_HINT) return fallbackWallet;
    return getLocal<TenantWalletRecord>(`wallet_${userId}`, fallbackWallet);
  }
}

export async function recordSupabaseDeposit(
  userId: string,
  amountEgp: number,
  method: PaymentMethodType,
  reference: string,
  screenshotUrl?: string
): Promise<WalletTransactionRecord> {
  const isAuto = !screenshotUrl;
  const newTx: WalletTransactionRecord = {
    id: `tx_${Date.now()}`,
    type: 'deposit',
    amountEgp,
    description: screenshotUrl
      ? `إيداع عبر ${method} (بانتظار تأكيد الإيصال)`
      : `شحن محفظة عبر ${method}`,
    createdAtMs: Date.now(),
    paymentMethod: method,
    referenceNumber: reference,
    receiptScreenshotUrl: screenshotUrl,
    status: isAuto ? 'confirmed' : 'pending_confirmation',
    confirmedAtMs: isAuto ? Date.now() : undefined,
  };

  const { error: txError } = await supabase.from('wallet_transactions').insert({
    id: newTx.id,
    wallet_id: `wal_${userId}`,
    user_id: userId,
    type: 'deposit',
    amount_egp: amountEgp,
    description: newTx.description,
    payment_method: method,
    reference_number: reference,
    receipt_screenshot_url: screenshotUrl,
    status: newTx.status,
    confirmed_at: isAuto ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  });
  assertNoError(txError, 'تسجيل الإيداع');

  if (isAuto) {
    // Auto-credit wallet
    const { data: currentWallet } = await supabase
      .from('wallets')
      .select('balance_egp, locked_escrow_egp, total_deposited_egp')
      .eq('user_id', userId)
      .single();

    const nextBal = (Number(currentWallet?.balance_egp) || 0) + amountEgp;
    const nextTotal = (Number(currentWallet?.total_deposited_egp) || 0) + amountEgp;

    const { error: walletError } = await supabase.from('wallets').upsert(
      {
        id: `wal_${userId}`,
        user_id: userId,
        balance_egp: nextBal,
        locked_escrow_egp: Number(currentWallet?.locked_escrow_egp) || 0,
        total_deposited_egp: nextTotal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    assertNoError(walletError, 'تحديث رصيد المحفظة');
  }

  return newTx;
}

export async function approveSupabaseDeposit(
  txId: string,
  userId: string,
  amountEgp: number
): Promise<void> {
  const { error: txError } = await supabase
    .from('wallet_transactions')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', txId);
  assertNoError(txError, 'اعتماد الإيداع');

  const { data: w, error: readError } = await supabase
    .from('wallets')
    .select('balance_egp, locked_escrow_egp, total_deposited_egp')
    .eq('user_id', userId)
    .single();
  assertNoError(readError, 'قراءة المحفظة');

  const { error: walletError } = await supabase.from('wallets').upsert(
    {
      id: `wal_${userId}`,
      user_id: userId,
      balance_egp: (Number(w?.balance_egp) || 0) + amountEgp,
      locked_escrow_egp: Number(w?.locked_escrow_egp) || 0,
      total_deposited_egp: (Number(w?.total_deposited_egp) || 0) + amountEgp,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  assertNoError(walletError, 'إضافة الرصيد');
}

export async function lockSupabaseEscrow(
  userId: string,
  amountEgp: number,
  apartmentId: string,
  apartmentTitle: string
): Promise<void> {
  const { data: w, error: readError } = await supabase
    .from('wallets')
    .select('balance_egp, locked_escrow_egp, total_deposited_egp')
    .eq('user_id', userId)
    .single();
  assertNoError(readError, 'قراءة المحفظة');

  const balance = Number(w?.balance_egp) || 0;
  if (balance < amountEgp) {
    throw new Error('الرصيد المتاح غير كافٍ لخصم وديعة الضمان 10%');
  }

  const txId = `tx_${Date.now()}`;
  const { error: txError } = await supabase.from('wallet_transactions').insert({
    id: txId,
    wallet_id: `wal_${userId}`,
    user_id: userId,
    type: 'booking_escrow_hold',
    amount_egp: amountEgp,
    description: `حجز وديعة ضمان 10% — ${apartmentTitle}`,
    payment_method: 'wallet_balance',
    reference_number: apartmentId,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  assertNoError(txError, 'تسجيل وديعة الضمان');

  const { error: walletError } = await supabase.from('wallets').upsert(
    {
      id: `wal_${userId}`,
      user_id: userId,
      balance_egp: balance - amountEgp,
      locked_escrow_egp: (Number(w?.locked_escrow_egp) || 0) + amountEgp,
      total_deposited_egp: Number(w?.total_deposited_egp) || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  assertNoError(walletError, 'تجميد وديعة الضمان');
}
