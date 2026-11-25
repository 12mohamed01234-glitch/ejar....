import React from 'react';
import { useI18n } from '../lib/i18n';

interface EjarLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
  light?: boolean;
}

export const EjarLogo: React.FC<EjarLogoProps> = ({
  size = 'md',
  showWordmark = true,
  showSubtitle = false,
  subtitle,
  className = '',
  light = false,
}) => {
  const { t } = useI18n();

  const iconDimensions =
    size === 'xs'
      ? 'w-6 h-6'
      : size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
      ? 'w-12 h-12'
      : size === 'xl'
      ? 'w-14 h-14'
      : 'w-10 h-10';

  const wordmarkSize =
    size === 'xs'
      ? 'text-sm'
      : size === 'sm'
      ? 'text-base sm:text-lg'
      : size === 'lg'
      ? 'text-2xl sm:text-3xl'
      : size === 'xl'
      ? 'text-3xl sm:text-4xl'
      : 'text-xl sm:text-2xl';

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      {/* Official Ejar Egypt Emblem */}
      <img
        src="/ejar-emblem.png"
        alt={t('إيجار مصر', 'Rent Egypt')}
        className={`${iconDimensions} rounded-full object-cover shrink-0 shadow-xs transition-transform`}
      />

      {/* Unified Wordmark */}
      {showWordmark && (
        <div className="flex flex-col text-start leading-none">
          <span
            className={`font-display ${wordmarkSize} font-black tracking-tight ${
              light ? 'text-white' : 'text-slate-900'
            }`}
          >
            {t('إيجار مصر', 'Rent Egypt')}
          </span>
          {showSubtitle && (
            <span
              className={`text-[10px] font-mono tracking-widest font-bold uppercase mt-0.5 ${
                light ? 'text-blue-200' : 'text-blue-700'
              }`}
            >
              {subtitle || 'RENT EGYPT'}
            </span>
          )}
        </div>
      )}
    </span>
  );
};

export default EjarLogo;
