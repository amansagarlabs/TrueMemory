import { redirect } from "next/navigation";

export default function CodingPage() {
  // Coding is disabled for now and will return in a later upgrade.
  redirect("/chat");
}
