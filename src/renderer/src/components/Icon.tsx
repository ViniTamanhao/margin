export function Icon({
  name
}: {
  name: 'folder' | 'files' | 'settings' | 'close'
}): React.JSX.Element {
  const paths = {
    folder: 'M3 7V5h6l2 2h10v12H3V7Zm0 3h18',
    files: 'M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7M9 16h7',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    close: 'm6 6 12 12M6 18 18 6'
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
