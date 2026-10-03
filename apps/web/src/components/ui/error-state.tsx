export function ErrorState({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}
