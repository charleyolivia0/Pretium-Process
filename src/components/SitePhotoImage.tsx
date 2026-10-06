import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { isLikelyHeicFormat, resolveDisplayImageUrl } from "../utils/heicImage";

type SitePhotoImageProps = {
  src: string;
  alt: string;
  mimeType?: string;
  fileName?: string;
  style?: CSSProperties;
  retryKey?: number;
  draggable?: boolean;
  onLoad?: () => void;
  onError?: () => void;
};

export function SitePhotoImage({
  src,
  alt,
  mimeType,
  fileName,
  style,
  retryKey = 0,
  draggable,
  onLoad,
  onError,
}: SitePhotoImageProps) {
  const url = src.trim();
  const likelyHeic = isLikelyHeicFormat(mimeType, fileName);

  const [displaySrc, setDisplaySrc] = useState<string | null>(() => {
    if (!url) return null;
    if (likelyHeic) return null;
    return url;
  });
  const [preparing, setPreparing] = useState(likelyHeic && !!url);
  const [heicFallback, setHeicFallback] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setHeicFallback(false);
  }, [url, mimeType, fileName, retryKey]);

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      setDisplaySrc(null);
      setPreparing(false);
      onErrorRef.current?.();
      return;
    }

    const convertUpfront = likelyHeic || heicFallback;
    if (!convertUpfront) {
      setDisplaySrc(url);
      setPreparing(false);
      return;
    }

    setPreparing(true);
    setDisplaySrc(null);
    resolveDisplayImageUrl(url, mimeType, fileName, { retryKey })
      .then((resolved) => {
        if (!cancelled) {
          setDisplaySrc(resolved);
          setPreparing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplaySrc(null);
          setPreparing(false);
          onErrorRef.current?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, mimeType, fileName, retryKey, likelyHeic, heicFallback]);

  const handleImgError = useCallback(() => {
    if (!heicFallback && url && likelyHeic) {
      setHeicFallback(true);
      return;
    }
    onError?.();
  }, [heicFallback, url, likelyHeic, onError]);

  if (preparing) {
    return (
      <div
        aria-busy="true"
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--surface-muted)",
          color: "var(--text-secondary)",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.75rem",
          fontWeight: 600,
        }}
      >
        Preparing…
      </div>
    );
  }

  if (!displaySrc) return null;

  return (
    <img
      src={displaySrc}
      alt={alt}
      draggable={draggable}
      style={style}
      onLoad={onLoad}
      onError={handleImgError}
    />
  );
}
