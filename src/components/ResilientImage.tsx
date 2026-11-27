import React, { useState } from 'react';
import { Flag } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#EDF1F7] via-[#F4F6F9] to-[#DCE3EF] text-[#003087] p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Flag className="w-8 h-8 mb-3 opacity-60" />
        <span className="font-display text-xl font-semibold text-center">{fallbackTitle}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
