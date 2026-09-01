/**
 * Supervisor exit codes and durable state-machine phases for system hot-update.
 */

/** Supervisor should activate pending version then restart the process. */
export const OPPTRIX_EXIT_RESTART_APPLY = 42

/** Soft restart after first-boot upgrade hooks complete. */
export const OPPTRIX_EXIT_RESTART_POST_HOOK = 43

/** Supervisor should restart after a rollback activation. */
export const OPPTRIX_EXIT_RESTART_ROLLBACK = 44

export type SystemUiPhase =
  | 'normal'
  | 'wizard_apply'
  | 'first_boot_hooks'
  | 'failed'

export type FirstBootUpgradePhase =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'

/** Marker file inside a slot that identifies a ready Opptrix runtime tree. */
export const RUNTIME_MARKER_FILENAME = 'opptrix-runtime.json'

/**
 * Relative path (posix-style) to the server entry used when no marker is present.
 * Verified with path.join on the host so Windows separators are correct at check time.
 */
export const SERVER_ENTRY_SEGMENTS = ['apps', 'server', 'dist', 'index.js'] as const
