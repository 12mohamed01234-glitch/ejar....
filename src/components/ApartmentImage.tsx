import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { APARTMENT_IMAGES, ImageKey } from '../lib/validation';

interface ApartmentImageProps {
  imageKey: ImageKey;
  alt: string;
  className?: string;
}

export const ApartmentImage: React.FC<ApartmentImageProps> = ({
  imageKey,
  alt,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const asset = APARTMENT_IMAGES[imageKey] ?? APARTMENT_IMAGES.zamalek_nile;

  if (failed || !asset?.src) {
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
      src={asset.src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
};
