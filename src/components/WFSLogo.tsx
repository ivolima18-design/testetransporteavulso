import React from 'react';

interface WFSLogoProps {
  className?: string;
  alt?: string;
}

export const WFSLogo: React.FC<WFSLogoProps> = ({
  className = 'h-10 w-auto',
  alt = 'WFS - Worldwide Flight Services - A SATS Company',
}) => {
  return (
    <img
      src="/wfs-logo.svg.png"
      alt={alt}
      className={`object-contain select-none flex-shrink-0 ${className}`}
      loading="eager"
      onError={(e) => {
        const target = e.currentTarget;
        if (target.src.endsWith('/wfs-logo.svg.png')) {
          target.src = '/wfs-logo.svg';
        }
      }}
    />
  );
};
