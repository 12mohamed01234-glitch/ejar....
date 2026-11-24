import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { APARTMENT_IMAGES, ImageKey } from '../lib/validation';

interface ApartmentImageProps {
  imageKey?: ImageKey;
  imageUrl?: string;
  alt: string;
  className?: string;
}

export const ApartmentImage: React.FC<ApartmentImageProps> = ({
  imageKey = 'zamalek_nile',
  imageUrl,
  alt,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const asset = APARTMENT_IMAGES[imageKey] ?? APARTMENT_IMAGES.zamalek_nile;
  const targetSrc = !failed && imageUrl ? imageUrl : asset?.src;

  if (failed || !targetSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-blue-900/10 text-slate-600 p-6 text-center ${className}`}
      >
        <Building2 className="w-8 h-8 mb-2 text-blue-700/75" />
        <span className="text-xs font-medium line-clamp-2 max-w-[220px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={targetSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
