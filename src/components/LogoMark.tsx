/** Logo greater-than chevron motif (❯❯❯❯) used in the Pretium Process brand. */
const LOGO_MARK = "❯❯❯❯";

const defaultStyle: React.CSSProperties = {
  letterSpacing: "-0.05em",
  opacity: 0.9,
};

export function LogoMark({
  style,
  className,
  light,
}: {
  style?: React.CSSProperties;
  className?: string;
  /** Use on dark backgrounds (e.g. sidebar) for better contrast */
  light?: boolean;
}) {
  return (
    <span
      className={className}
      style={{
        ...defaultStyle,
        ...(light ? { color: "rgba(255, 255, 255, 0.95)" } : {}),
        ...style,
      }}
      aria-hidden
    >
      {LOGO_MARK}
    </span>
  );
}
