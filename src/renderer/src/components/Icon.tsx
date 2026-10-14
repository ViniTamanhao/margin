export function Icon({
  name
}: {
  name: 'folder' | 'files' | 'settings' | 'close'
}): React.JSX.Element {
  const paths = {
    folder: 'M3 7V5h6l2 2h10v12H3V7Zm0 3h18',
    files: 'M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7M9 16h7',
    settings:
      'M10.61 2.10L13.39 2.10L13.71 4.59L16.03 5.55L18.02 4.01L19.99 5.98L18.45 7.97L19.41 10.29L21.90 10.61L21.90 13.39L19.41 13.71L18.45 16.03L19.99 18.02L18.02 19.99L16.03 18.45L13.71 19.41L13.39 21.90L10.61 21.90L10.29 19.41L7.97 18.45L5.98 19.99L4.01 18.02L5.55 16.03L4.59 13.71L2.10 13.39L2.10 10.61L4.59 10.29L5.55 7.97L4.01 5.98L5.98 4.01L7.97 5.55L10.29 4.59ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
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
