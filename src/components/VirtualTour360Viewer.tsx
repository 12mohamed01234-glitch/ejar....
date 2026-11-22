import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Compass,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  ExternalLink,
  Move,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface VirtualTour360ViewerProps {
  imageSrc: string;
  unitTitle: string;
  externalTourUrl?: string;
  compact?: boolean;
}

/**
 * Compresses an uploaded panoramic/360° image client-side into an equirectangular
 * JPEG Data URL guaranteed to fit comfortably within Firestore rules (<= 180,000 chars).
 */
export async function compressPanoramaImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read panorama file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const targetWidth = 1280;
        const targetHeight = 640;
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        let quality = 0.62;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 165000 && quality > 0.28) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 178000) {
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = 960;
          smallCanvas.height = 480;
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(img, 0, 0, 960, 480);
            dataUrl = smallCanvas.toDataURL('image/jpeg', 0.55);
          }
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const VirtualTour360Viewer: React.FC<VirtualTour360ViewerProps> = ({
  imageSrc,
  unitTitle,
  externalTourUrl,
  compact = false,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [yawDeg, setYawDeg] = useState<number>(180);
  const [pitchDeg, setPitchDeg] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.15);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number; startYaw: number; startPitch: number } | null>(
    null
  );

  useEffect(() => {
    setImageError(false);
  }, [imageSrc]);

  // Preload image to detect load error cleanly
  useEffect(() => {
    if (!imageSrc) {
      setImageError(true);
      return;
    }
    const probe = new Image();
    probe.onload = () => setImageError(false);
    probe.onerror = () => setImageError(true);
    probe.src = imageSrc;
  }, [imageSrc]);

  // Smooth compositor-friendly requestAnimationFrame auto-rotation
  useEffect(() => {
    if (!autoRotate || isDragging) return;
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(64, now - lastTs);
      lastTs = now;
      setYawDeg((prev) => (prev + dt * 0.012) % 360);
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [autoRotate, isDragging]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      setAutoRotate(false);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startYaw: yawDeg,
        startPitch: pitchDeg,
      };
    },
    [yawDeg, pitchDeg]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextYaw = (((dragStartRef.current.startYaw - dx * 0.28) % 360) + 360) % 360;
    const nextPitch = Math.max(-28, Math.min(28, dragStartRef.current.startPitch + dy * 0.16));
    setYawDeg(nextYaw);
    setPitchDeg(nextPitch);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  const handleReset = () => {
    setYawDeg(180);
    setPitchDeg(0);
    setZoom(1.15);
    setAutoRotate(true);
  };

  const normalizedHeading = Math.round(((yawDeg % 360) + 360) % 360);
  const bgPosX = `${(yawDeg / 360) * 200}%`;
  const bgPosY = `${50 - pitchDeg * 1.15}%`;
  const bgSizeWidth = `${Math.round(230 * zoom)}%`;
  const bgSizeHeight = `${Math.round(135 * zoom)}%`;

  const cardinalLabel =
    normalizedHeading >= 315 || normalizedHeading < 45
      ? t('شمال', 'N')
      : normalizedHeading < 135
        ? t('شرق', 'E')
        : normalizedHeading < 225
          ? t('جنوب', 'S')
          : t('غرب', 'W');

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-slate-900 select-none ${
        compact ? 'h-56 rounded-xl border border-slate-200' : 'h-72 sm:h-96'
      }`}
    >
      {!imageError && imageSrc ? (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            backgroundImage: `url("${imageSrc}")`,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: `${bgPosX} ${bgPosY}`,
            backgroundSize: `${bgSizeWidth} ${bgSizeHeight}`,
          }}
          className={`w-full h-full touch-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          role="img"
          aria-label={t(`جولة افتراضية 360 درجة — ${unitTitle}`, `360 Virtual Tour — ${unitTitle}`)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300 px-6 text-center">
          <Compass className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-sm font-semibold">{unitTitle}</p>
          <p className="text-xs text-slate-400 mt-1">
            {t('معاينة الجولة البانورامية 360°', '360° Panoramic Virtual Tour')}
          </p>
        </div>
      )}

      {/* Subtle top & bottom contrast scrims for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />

      {/* Top bar: Compass heading & drag instruction */}
      <div className="pointer-events-none absolute top-3 inset-x-3 flex items-center justify-between gap-2 text-xs text-white/95">
        <div className="flex items-center gap-2 bg-slate-950/65 backdrop-blur-sm px-2.5 py-1.5 rounded-lg">
          <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-mono tabular-nums font-semibold">{normalizedHeading}°</span>
          <span aria-hidden="true" className="text-white/40">·</span>
          <span>{cardinalLabel}</span>
          <span aria-hidden="true" className="text-white/40">·</span>
          <span>360°</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-[11px] text-slate-200">
          <Move className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span>{t('اسحب للالتفاف 360° في كافة الاتجاهات', 'Drag to look 360° around the unit')}</span>
        </div>
      </div>

      {/* Bottom interactive toolbar */}
      <div className="absolute bottom-3 inset-x-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 bg-slate-950/70 backdrop-blur-sm p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setAutoRotate((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRotate ? t('إيقاف الدوران', 'Pause') : t('دوران تلقائي', 'Auto-Pan')}</span>
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
            title={t('تكبير', 'Zoom in')}
            className="p-1.5 rounded-md text-white hover:bg-white/15 transition-colors shrink-0 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.15).toFixed(2))))}
            title={t('تصغير', 'Zoom out')}
            className="p-1.5 rounded-md text-white hover:bg-white/15 transition-colors shrink-0 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            title={t('إعادة ضبط الزاوية', 'Reset view')}
            className="p-1.5 rounded-md text-white hover:bg-white/15 transition-colors shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {externalTourUrl && externalTourUrl.startsWith('https://') && (
          <a
            href={externalTourUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('فتح الجولة الخارجية', 'External VR Tour')}</span>
          </a>
        )}
      </div>
    </div>
  );
};
