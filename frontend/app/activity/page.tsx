"use client";

// Activity is the focused entry point used by the command palette and the
// dashboard cards. Reuse the authenticated dashboard data loaders so the
// route cannot drift into a second, inconsistent API implementation.
export { default } from "@/app/dashboard/page";
