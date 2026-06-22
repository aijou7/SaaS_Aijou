type AijouLogoProps = {
  className?: string;
  size?: number;
  title?: string;
};

/**
 * Aijou's mark combines a chat bubble with a small signal spark: conversations
 * made clearer and more useful by AI.
 */
export function AijouLogo({ className, size = 32, title }: AijouLogoProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="9" fill="#1D4ED8" />
      <path
        d="M8.5 11.6C8.5 10.164 9.664 9 11.1 9H18.2C19.636 9 20.8 10.164 20.8 11.6V16.1C20.8 17.536 19.636 18.7 18.2 18.7H14.05L10.65 21.35V18.55C9.405 18.32 8.5 17.229 8.5 15.92V11.6Z"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M23.5 6V10M21.5 8H25.5" stroke="#7DD3FC" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}
