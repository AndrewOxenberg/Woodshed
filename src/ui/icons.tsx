// Small inline icons. All are decorative; buttons carry their own labels.
const base = { width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': true, focusable: false } as const;

export const IconPlay = () => (
  <svg {...base}><path d="M6 3.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 6 3.8Z" fill="currentColor" /></svg>
);
export const IconPause = () => (
  <svg {...base}><rect x="4.5" y="3.5" width="4" height="13" rx="1" fill="currentColor" /><rect x="11.5" y="3.5" width="4" height="13" rx="1" fill="currentColor" /></svg>
);
export const IconRestart = () => (
  <svg {...base}><rect x="3.5" y="4" width="2.2" height="12" rx="1" fill="currentColor" /><path d="M16 4.6v10.8a.7.7 0 0 1-1.1.6l-7.6-5.4a.7.7 0 0 1 0-1.2l7.6-5.4a.7.7 0 0 1 1.1.6Z" fill="currentColor" /></svg>
);
export const IconClose = () => (
  <svg {...base}><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
export const IconStar = ({ filled }: { filled: boolean }) => (
  <svg {...base}><path d="m10 2.6 2.3 4.7 5.1.7-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.6 8l5.1-.7L10 2.6Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
export const IconBack = () => (
  <svg {...base}><path d="M11.5 4.5 6 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IconTrash = () => (
  <svg {...base}><path d="M4.5 6h11M8 6V4.2h4V6m-6 0 .6 9.3c0 .4.4.7.8.7h5.2c.4 0 .8-.3.8-.7L14 6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
