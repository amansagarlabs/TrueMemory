import { redirect } from "next/navigation";

export default function CodingWorkspacePage() {
  // Coding is disabled for now and will return in a later upgrade.
  redirect("/chat");
}
