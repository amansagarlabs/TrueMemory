import type { Metadata } from "next";
import { TrueBotWorkspace } from "./workspace";
import "./truebot.css";

export const metadata: Metadata = { title: "TrueBot | Hosted agent workspace", description: "Create agents and run tasks with persistent TrueMemory context." };
export default function TrueBotPage() { return <TrueBotWorkspace />; }
