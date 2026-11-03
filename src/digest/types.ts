// Plan morning-digest § 1. The shape every part of the digest builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
  // Parsed lines by status, for the status board.
  counts: Record<RunStatus, number>;
};

// null when runs/<night>.jsonl doesn't exist; an empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
