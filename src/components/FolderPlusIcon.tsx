/**
 * Folder-with-plus glyph for “create folder” actions (accessibility via parent aria-label).
 */
export function FolderPlusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h11a2 2 0 0 1 2 2z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  );
}
