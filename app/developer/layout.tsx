import { ConsoleShell } from "./_components/console-shell";
import "./console.css";
export default function Layout({ children }: { children: React.ReactNode }) { return <ConsoleShell>{children}</ConsoleShell>; }
