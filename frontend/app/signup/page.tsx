import AuthForm from "@/components/auth/AuthForm";
import AuthPageShell from "@/components/auth/AuthPageShell";

export default function SignUpPage() {
  return (
    <AuthPageShell>
      <AuthForm mode="signup" />
    </AuthPageShell>
  );
}
