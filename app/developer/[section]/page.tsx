import { notFound } from "next/navigation";
import { ConsolePage } from "../_components/console-page";
import { sections } from "../_components/console-data";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  return <ConsolePage key={section} section={section} />;
}
