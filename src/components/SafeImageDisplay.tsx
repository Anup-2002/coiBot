import React, { useState, useEffect } from "react";
import { Image as ImageIcon } from "lucide-react";

export const SafeImageDisplay: React.FC<{
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}> = ({ src, fallbackSrc, alt, className }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(false);
    setFailed(false);
    setFallbackAttempt(0);
  }, [src]);

  const handleImgError = () => {
    if (fallbackAttempt === 0 && fallbackSrc && currentSrc !== fallbackSrc) {
      setFallbackAttempt(1);
      setCurrentSrc(fallbackSrc);
    } else if (fallbackAttempt === 1) {
      setFallbackAttempt(2);
      setCurrentSrc(`/uploads/marketing_images/${encodeURIComponent(alt)}`);
    } else {
      setFailed(true);
    }
  };

  const retryLoad = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFailed(false);
    setLoaded(false);
    setFallbackAttempt(0);
    const sep = src.includes("?") ? "&" : "?";
    setCurrentSrc(`${src}${sep}retry=${Date.now()}`);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-900 overflow-hidden">
      {!loaded && !failed && (
        <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-1.5 p-2 z-10 pointer-events-none">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <span className="text-[9px] font-mono text-slate-400">Loading...</span>
        </div>
      )}
      {!failed ? (
        <img
          src={currentSrc}
          alt={alt}
          loading="lazy"
          className={`${className || "w-full h-full object-cover"} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={handleImgError}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-2 text-center text-slate-500 w-full h-full bg-slate-950">
          <ImageIcon className="h-5 w-5 text-slate-600 mb-1" />
          <span className="text-[9px] font-mono text-slate-400 truncate max-w-full px-1">{alt}</span>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-1 text-[9px] font-mono text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
          >
            Retry load
          </button>
        </div>
      )}
    </div>
  );
};

