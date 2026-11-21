-- ==============================================================================
-- MEFTAH MISR — SUPABASE COMPLETE DATABASE SCHEMA
-- Project: https://kaajbwzqamhaqvusiivm.supabase.co
-- Generated for: Meftah Misr Real Estate & Escrow Rental Platform
-- ==============================================================================

-- 1. PROFILES & USERS TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('landlord', 'tenant')) DEFAULT 'tenant',
  photo_url TEXT,
  is_landlord_verified BOOLEAN NOT NULL DEFAULT false,
  is_tenant_verified BOOLEAN NOT NULL DEFAULT false,
  national_id_number TEXT,
  national_id_front_url TEXT,
  national_id_back_url TEXT,
  ownership_doc_url TEXT,
  facial_liveness_verified BOOLEAN NOT NULL DEFAULT false,
  facial_match_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. APARTMENTS & PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.apartments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_display_name TEXT NOT NULL DEFAULT '',
  owner_phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('family_apartment', 'student_housing', 'hotel_room', 'industrial_factory', 'whole_house')) DEFAULT 'family_apartment',
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('monthly_only', 'daily_or_monthly')) DEFAULT 'monthly_only',
  monthly_rent_egp NUMERIC NOT NULL DEFAULT 1000,
  daily_rate_egp NUMERIC NOT NULL DEFAULT 0,
  student_beds_count INTEGER NOT NULL DEFAULT 0,
  student_price_per_bed_egp NUMERIC NOT NULL DEFAULT 0,
  governorate TEXT NOT NULL DEFAULT 'القاهرة',
  district TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL DEFAULT 30.0444,
  lng DOUBLE PRECISION NOT NULL DEFAULT 31.2357,
  bedrooms INTEGER NOT NULL DEFAULT 1,
  bathrooms INTEGER NOT NULL DEFAULT 1,
  area_sqm NUMERIC NOT NULL DEFAULT 50,
  furnishing TEXT NOT NULL CHECK (furnishing IN ('furnished', 'semi_furnished', 'unfurnished')) DEFAULT 'furnished',
  image_url TEXT,
  image_key TEXT DEFAULT 'zamalek_nile',
  has_virtual_tour BOOLEAN NOT NULL DEFAULT false,
  virtual_tour_url TEXT,
  panorama_360_key TEXT DEFAULT 'none',
  verification_status TEXT NOT NULL CHECK (verification_status IN ('pending_review', 'verified', 'rejected')) DEFAULT 'verified',
  availability_status TEXT NOT NULL CHECK (availability_status IN ('available', 'rented')) DEFAULT 'available',
  commission_rate_pct NUMERIC NOT NULL DEFAULT 10,
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BOOKINGS TABLE (Escrow & Rental Bookings)
CREATE TABLE IF NOT EXISTS public.bookings (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  apartment_title TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL DEFAULT '',
  tenant_phone TEXT NOT NULL DEFAULT '',
  landlord_id TEXT NOT NULL,
  rental_unit TEXT NOT NULL CHECK (rental_unit IN ('month', 'day', 'student_bed')) DEFAULT 'month',
  units_count INTEGER NOT NULL DEFAULT 1,
  beds_booked INTEGER NOT NULL DEFAULT 0,
  total_rent_egp NUMERIC NOT NULL DEFAULT 0,
  escrow_amount_egp NUMERIC NOT NULL DEFAULT 0,
  commission_amount_egp NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'awaiting_payment', 'escrow_paid', 'completed', 'cancelled')) DEFAULT 'escrow_paid',
  payment_method TEXT NOT NULL DEFAULT 'card_meeza',
  reference_number TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. WALLETS TABLE (User Financial Balance & Escrow)
CREATE TABLE IF NOT EXISTS public.wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  balance_egp NUMERIC NOT NULL DEFAULT 0,
  locked_escrow_egp NUMERIC NOT NULL DEFAULT 0,
  total_deposited_egp NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WALLET TRANSACTIONS TABLE (Deposits, Receipts, Deductions)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'booking_deduction', 'booking_escrow_hold', 'refund', 'bonus')) DEFAULT 'deposit',
  amount_egp NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  payment_method TEXT DEFAULT 'instapay',
  reference_number TEXT,
  receipt_screenshot_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')) DEFAULT 'confirmed',
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- POLICIES: Secure RLS — public read only where needed, writes restricted to authenticated owners
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public profiles write" ON public.profiles;
CREATE POLICY "Authenticated users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Public apartments read" ON public.apartments;
CREATE POLICY "Public apartments read" ON public.apartments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public apartments write" ON public.apartments;
CREATE POLICY "Authenticated owners manage own apartments" ON public.apartments
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Public bookings read" ON public.bookings;
CREATE POLICY "Public bookings read" ON public.bookings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public bookings write" ON public.bookings;
CREATE POLICY "Authenticated users manage own bookings" ON public.bookings
  FOR ALL USING (auth.uid() = tenant_id OR auth.uid() = landlord_id)
  WITH CHECK (auth.uid() = tenant_id OR auth.uid() = landlord_id);

DROP POLICY IF EXISTS "Public wallets read" ON public.wallets;
DROP POLICY IF EXISTS "Public wallets write" ON public.wallets;
CREATE POLICY "Authenticated users read own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users manage own wallet" ON public.wallets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public transactions read" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Public transactions write" ON public.wallet_transactions;
CREATE POLICY "Authenticated users read own transactions" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users manage own transactions" ON public.wallet_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INDEXES FOR MAXIMUM QUERY SPEED
CREATE INDEX IF NOT EXISTS idx_apartments_gov ON public.apartments(governorate);
CREATE INDEX IF NOT EXISTS idx_apartments_cat ON public.apartments(category);
CREATE INDEX IF NOT EXISTS idx_apartments_owner ON public.apartments(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON public.bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_landlord ON public.bookings(landlord_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);

-- SEED DATA: INITIAL REAL EGYPTIAN APARTMENTS
INSERT INTO public.apartments (
  id, owner_id, owner_display_name, owner_phone, title, description, category, billing_mode,
  monthly_rent_egp, daily_rate_egp, student_beds_count, student_price_per_bed_egp,
  governorate, district, lat, lng, bedrooms, bathrooms, area_sqm, furnishing,
  image_key, has_virtual_tour, panorama_360_key, verification_status, availability_status, commission_rate_pct
) VALUES
(
  'apt_zamalek_01', 'owner_zamalek', 'م. حسام الدين الألفي', '01001122334',
  'شقة نيلية فاخرة في الزمالك — شارع أبو الفدا إطلالة بانورامية',
  'شقة معمارية فريدة تطل مباشرة على النيل بدون حواجب رؤية في قلب الزمالك، مفروشة بالكامل بأثاث كلاسيكي راقٍ ومكيفة مركزياً.',
  'family_apartment', 'monthly_only', 32000, 0, 0, 0,
  'القاهرة', 'الزمالك — شارع أبو الفدا', 30.0626, 31.2197, 3, 2, 210, 'furnished',
  'zamalek_nile', true, 'cairo_nile_360', 'verified', 'available', 10
),
(
  'apt_new_cairo_02', 'owner_new_cairo', 'د. نهى عبد الرحمن', '01122334455',
  'بنتهاوس مودرن بالتجمع الخامس — قرب الجامعة الأمريكية',
  'وحدة معمارية مشمسة بتراس خاص 65 متر في حي اللوتس بالتجمع الخامس، متاحة للإيجار العائلي أو لسكن طلاب الجامعة الأمريكية بتسعير منفصل لكل سرير.',
  'family_apartment', 'monthly_only', 26000, 0, 4, 7000,
  'القاهرة', 'التجمع الخامس — حي اللوتس', 30.0188, 31.4913, 3, 3, 235, 'furnished',
  'new_cairo_penthouse', true, 'new_cairo_penthouse_360', 'verified', 'available', 10
),
(
  'apt_alex_corniche_03', 'owner_alex', 'أ. طارق عبد العليم', '01233445566',
  'شقة أول صف على البحر — كورنيش الإسكندرية ستانلي',
  'شقة بواجهة زجاجية كاملة ترى البحر المفتوح وكوبري ستانلي، مجهزة للتشغيل اليومي والشهري شاملة الأجهزة الذكية والإنترنت فائق السرعة.',
  'family_apartment', 'daily_or_monthly', 19500, 1500, 0, 0,
  'الإسكندرية', 'ستانلي — كورنيش الإسكندرية', 31.2357, 29.9512, 2, 2, 175, 'furnished',
  'alexandria_corniche', false, 'none', 'verified', 'available', 10
),
(
  'apt_sheikh_zayed_04', 'owner_zayed', 'كابتن محمود الشناوي', '01044556677',
  'دوبلكس بحديقة داخلية في الشيخ زايد — بيفرلي هيلز',
  'دوبلكس فاخر دور أرضي وأول مع حديقة مشجرة 120 متر داخل كمبوند بيفرلي هيلز، مدخل خاص وموقف سيارتين مغطى، تشطيب سوبر لوكس.',
  'whole_house', 'monthly_only', 28000, 0, 0, 0,
  'الجيزة', 'الشيخ زايد — بيفرلي هيلز', 30.0384, 30.9782, 4, 3, 260, 'semi_furnished',
  'sheikh_zayed_duplex', false, 'none', 'verified', 'available', 10
),
(
  'apt_maadi_garden_05', 'owner_maadi', 'م. ياسمين سراج الدين', '01555667788',
  'شقة هادئة وسط الأشجار في سرايات المعادي — دجلة',
  'شقة عائلية مشمسة وراقية بالدور الثاني في سرايات المعادي الهادئة، أرضيات باركيه طبيعي وقريبة من المدارس الدولية ونادي المعادي.',
  'family_apartment', 'monthly_only', 22000, 0, 0, 0,
  'القاهرة', 'المعادي — سرايات المعادي', 29.9592, 31.2758, 3, 2, 185, 'furnished',
  'maadi_garden', false, 'none', 'verified', 'available', 10
),
(
  'htl_cairo_suite_11', 'owner_hotel_cairo', 'إدارة أجنحة النيل الفندقية', '01066778899',
  'جناح فندقي تنفيذي مطل على النيل — جاردن سيتي',
  'جناح فندقي مرخص بفرش خمس نجوم وإطلالة مباشرة على النيل، متاح للحجز اليومي السريع أو للإقامة الشهرية التنفيذية شامل الغرف والهاوس كيبنج.',
  'hotel_room', 'daily_or_monthly', 78000, 3800, 0, 0,
  'القاهرة', 'جاردن سيتي — كورنيش النيل', 30.0365, 31.2312, 1, 1, 68, 'furnished',
  'hotel_cairo_suite', true, 'hotel_suite_360', 'verified', 'available', 10
)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apartments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.apartments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
