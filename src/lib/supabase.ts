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
  } catch {}
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
    has_virtual_tour: record.hasVirtualTour,
    panorama_360_key: record.panorama360Key || 'none',
    verification_status: record.verificationStatus,
    availability_status: record.availabilityStatus,
    commission_rate_pct: record.commissionRatePct,
  };

  const { error } = await supabase.from('apartments').upsert(row, { onConflict: 'id' });
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
    const { error, count } = await supabase
      .from('apartments')
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq('id', aptId);

    if (count === 0) {
      const existingShowcase = SHOWCASE_APARTMENTS.find((s) => s.id === aptId);
      if (existingShowcase) {
        await createSupabaseApartment({
          ...existingShowcase,
          verificationStatus: status,
        });
      }
    } else if (error) {
      assertNoError(error, 'تحديث حالة العقار');
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

    const { error, count } = await supabase
      .from('apartments')
      .update(row)
      .eq('id', aptId);

    if (count === 0 || error) {
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
            landlordNetEgp: Number(b.total_rent_egp) - Number(b.commission_amount_egp || 0),
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
    escrow_amount_egp: record.escrowAmountEgp || Math.round(record.totalRentEgp * 0.1),
    commission_amount_egp: record.commissionAmountEgp || Math.round(record.totalRentEgp * 0.1),
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
