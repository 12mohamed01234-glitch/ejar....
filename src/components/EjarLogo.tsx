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
      ? 'w-7 h-7'
      : size === 'lg'
      ? 'w-10 h-10'
      : size === 'xl'
      ? 'w-12 h-12'
      : 'w-8 h-8';

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
      {/* Official Unified Ejar Emblem Icon */}
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={`${iconDimensions} shrink-0 drop-shadow-xs transition-transform`}
      >
        {/* Royal Sapphire Architectural Rounded Square */}
        <rect width="40" height="40" rx="11" fill="#1D4ED8" />
        <rect
          x="1"
          y="1"
          width="38"
          height="38"
          rx="10"
          stroke="#FFFFFF"
          strokeOpacity="0.2"
        />

        {/* Modern Egyptian Architectural Arch Doorway in Crisp White */}
        <path
          d="M11 32V20.5C11 14.4 15.2 9.8 20 8C24.8 9.8 29 14.4 29 20.5V32H24.6V21C24.6 17.4 22.6 14.5 20 13.2C17.4 14.5 15.4 17.4 15.4 21V32H11Z"
          fill="#FFFFFF"
        />

        {/* Golden Key Centered Inside the Portal Arch */}
        <circle cx="20" cy="19.5" r="2.75" fill="#FBBF24" />
        <path
          d="M18.9 21.8H21.1V29.5H23.1V31.5H21.1V32H18.9V21.8Z"
          fill="#FBBF24"
        />
      </svg>

      {/* Unified Wordmark */}
      {showWordmark && (
        <div className="flex flex-col text-start leading-none">
          <span
            className={`font-display ${wordmarkSize} font-black tracking-tight ${
              light ? 'text-white' : 'text-slate-900'
            }`}
          >
            {t('إيجار', 'Ejar')}
          </span>
          {showSubtitle && (
            <span
              className={`text-[10px] font-mono tracking-widest font-bold uppercase mt-0.5 ${
                light ? 'text-blue-200' : 'text-blue-700'
              }`}
            >
              {subtitle || 'EJAR.COM'}
            </span>
          )}
        </div>
      )}
    </span>
  );
};

export default EjarLogo;
