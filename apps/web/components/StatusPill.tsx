interface Props {
  value: string | null | undefined;
}

export function StatusPill({ value }: Props) {
  const v = (value ?? 'UNKNOWN').toUpperCase();
  const className = `pill pill-${v}`;
  return <span className={className}>{v}</span>;
}
