import ButtonSpinner from "@/components/ButtonSpinner";

export default function AuthLoading() {
  return (
    <div className="dg-auth-loading" role="status" aria-label="Loading">
      <ButtonSpinner color="var(--dg-color-brand)" size={32} />
    </div>
  );
}
