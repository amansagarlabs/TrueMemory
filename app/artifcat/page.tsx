import { redirect } from "next/navigation";

export default function ArtifactTypoRedirect() {
  redirect("/artifacts");
}
