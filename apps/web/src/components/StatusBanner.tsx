type Props = {
  message: string;
  tone: "neutral" | "success" | "error";
};

export function StatusBanner({ message, tone }: Props) {
  return <div className={`status-banner ${tone}`}>{message}</div>;
}
