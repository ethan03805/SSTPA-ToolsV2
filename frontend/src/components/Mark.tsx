// The SSTPA Tools mark (docs/DESIGN.md): a drafted control loop — controller
// and controlled process joined by circulating control action and feedback.
// Replaces the heritage logo in all chrome; the logo itself appears only in
// the Product & License dialog.
// 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="3" width="14" height="6" rx="1.6" />
      <rect x="5" y="15" width="14" height="6" rx="1.6" />
      <path d="M16.2 9.4v4.2" />
      <path d="m14.4 11.9 1.8 1.9 1.8-1.9" />
      <path d="M7.8 14.6v-4.2" />
      <path d="m6 12.1 1.8-1.9 1.8 1.9" />
    </svg>
  );
}
