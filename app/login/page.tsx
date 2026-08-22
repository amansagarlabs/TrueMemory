import AuthForm from "@/components/auth/AuthForm";
import AuthPageShell from "@/components/auth/AuthPageShell";

export default function LoginPage() {
  return (
    <AuthPageShell>
      <AuthForm mode="login" />
    </AuthPageShell>
  );
}
