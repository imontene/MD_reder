/** Process exit codes, as documented in docs/PLAN_MAESTRO.md §3. */
export const ExitCode = {
  Ok: 0,
  Usage: 1,
  Render: 2,
  BrowserNotFound: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
