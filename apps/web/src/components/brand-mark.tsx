type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11 3h30l12 12v41a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Z"
        fill="#f2f0f5"
        stroke="#30404e"
        strokeWidth="2"
      />
      <path
        d="M11 4h5v56h-5a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z"
        fill="#7aa9d5"
      />
      <path
        d="M41 3v8a4 4 0 0 0 4 4h8L41 3Z"
        fill="#7aa9d5"
      />
      <text
        x="18"
        y="37"
        fill="#17171b"
        fontFamily="'Avenir Next', 'Segoe UI', Arial, sans-serif"
        fontSize="24"
        fontWeight="800"
      >
        A
      </text>
      <text
        x="31"
        y="46"
        fill="#17171b"
        fontFamily="'Avenir Next', 'Segoe UI', Arial, sans-serif"
        fontSize="24"
        fontWeight="800"
      >
        A
      </text>
      <path d="M19 49h28" stroke="#7aa9d5" strokeLinecap="square" strokeWidth="3" />
      <path d="M19 54h23" stroke="#85808d" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}
