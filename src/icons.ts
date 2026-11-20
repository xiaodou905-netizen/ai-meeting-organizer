const paths = {
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 12h7m-7 4h5"/>',
  book: '<path d="M4 5h6c1.3 0 2 .6 2 1.5C12 5.6 12.7 5 14 5h6v14h-6c-1.3 0-2 .6-2 1.5 0-.9-.7-1.5-2-1.5H4z"/><path d="M12 7v13"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  transcript: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18m-11 0v10"/>',
  insert: '<path d="M13 3H5v17h14V9zM13 3v6h6M8 14h6m-3-3v6"/>',
  erase: '<path d="m9 18-6-6 9-9 8 8-7 7zm0-12 8 8M8 20h13"/>',
  organize: '<path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  summary: '<path d="M5 5h14M5 10h14M5 15h14M5 20h8"/>',
  decision: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12 2.5 2.5 5-5"/>',
  task: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m7.5 12 3 3 6-6"/>',
  question: '<path d="M20 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 16-5Z"/><path d="M10 9a2 2 0 1 1 3 1.7c-.8.4-1 1-1 1.6m0 2.4v.1"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/>',
  check: '<path d="m4.5 12 5.2 5.2L20 7"/>',
  alert: '<path d="m12 3 10 17H2zM12 9v4m0 3v.1"/>',
  retry: '<path d="M3 5v6h6"/><path d="M4 10a8 8 0 1 1 0 6"/>',
  enter: '<path d="M20 4v9H4m5-5-5 5 5 5"/>',
} as const;

export type IconName = keyof typeof paths;
export const icon = (name: IconName) => `<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
