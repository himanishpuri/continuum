import clsx from "clsx";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700", className)}>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400", className)} role="status" aria-live="polite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600 dark:border-slate-700 dark:border-t-teal-400" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900/50 dark:bg-rose-950/30" role="alert">
      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-rose-700 underline underline-offset-2 dark:text-rose-300">
          Try again
        </button>
      )}
    </div>
  );
}
