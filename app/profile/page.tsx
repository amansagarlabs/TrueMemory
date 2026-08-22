"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Key,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Save,
  ShieldCheck,
  Building2,
  LinkIcon,
  Bell,
  Eye,
  EyeOff,
  AlertTriangle,
  Trash2,
  X,
  Camera,
  Settings,
  Zap,
  FileText,
  MessageSquare,
  Users,
  ExternalLink,
  CreditCard,
} from "lucide-react";

import { clearAuthSession, isAuthenticated, loadAuthUser, saveAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { PaperDither, type DitherShape } from "@/components/ui/paper-dither";
import { DitherAvatar } from "@/components/dither-avatar";
import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";
import { useToast } from "@/hooks/use-toast";
import { updateProfile } from "@/services/auth";

const AVATAR_KEY = "kontext-dither-avatar";

const avatars: Array<{
  id: string;
  label: string;
  shape: DitherShape;
  colorBack: string;
  colorFront: string;
  scale: number;
}> = [
  { id: "signal", label: "Signal", shape: "wave", colorBack: "#090806", colorFront: "#f06418", scale: 0.82 },
  { id: "memory", label: "Memory", shape: "warp", colorBack: "#090806", colorFront: "#f6e879", scale: 0.9 },
  { id: "orbit", label: "Orbit", shape: "swirl", colorBack: "#090806", colorFront: "#8c82ff", scale: 0.74 },
  { id: "source", label: "Source", shape: "ripple", colorBack: "#090806", colorFront: "#67d9bd", scale: 0.86 },
];

type ProfileTab = "overview" | "edit" | "security" | "preferences";

const tabs: Array<{ id: ProfileTab; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Settings aria-hidden="true" className="size-4" /> },
  { id: "edit", label: "Edit Profile", icon: <Pencil aria-hidden="true" className="size-4" /> },
  { id: "security", label: "Security", icon: <ShieldCheck aria-hidden="true" className="size-4" /> },
  { id: "preferences", label: "Preferences", icon: <Bell aria-hidden="true" className="size-4" /> },
];

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(() => (isAuthenticated() ? loadAuthUser() : null));
  const [selectedAvatar, setSelectedAvatar] = useState(() => {
    if (typeof window === "undefined") return avatars[0].id;
    return localStorage.getItem(AVATAR_KEY) || avatars[0].id;
  });
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteKeyword, setDeleteKeyword] = useState("");

  // Edit form state
  const [editForm, setEditForm] = useState(() => ({
    full_name: user?.full_name || "",
    username: user?.username || "",
    bio: (user as (AuthUser & { bio?: string }) | null)?.bio || "",
    company: (user as (AuthUser & { company?: string }) | null)?.company || "",
    location: (user as (AuthUser & { location?: string }) | null)?.location || "",
    website: (user as (AuthUser & { website?: string }) | null)?.website || "",
  }));

  // Security form state
  const [securityForm, setSecurityForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false });

  // Preferences state
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: false,
    weeklyDigest: true,
    productUpdates: true,
    marketingEmails: false,
    showEmail: false,
    showActivity: true,
  });

  useEffect(() => {
    if (!user) router.replace("/login?redirect=/profile");
  }, [router, user]);

  const passwordStrength = useMemo(() => {
    const pw = securityForm.newPassword;
    let strength = 0;
    if (pw.length >= 8) strength++;
    if (/[A-Z]/.test(pw)) strength++;
    if (/[0-9]/.test(pw)) strength++;
    if (/[^A-Za-z0-9]/.test(pw)) strength++;
    return strength;
  }, [securityForm.newPassword]);

  if (!user) return null;

  const selected = avatars.find((avatar) => avatar.id === selectedAvatar) || avatars[0];
  const displayName = user.full_name || user.username || user.email.split("@")[0];

  function chooseAvatar(id: string) {
    setSelectedAvatar(id);
    localStorage.setItem(AVATAR_KEY, id);
    setShowAvatarPicker(false);
  }

  function signOut() {
    clearAuthSession();
    router.push("/login");
    router.refresh();
  }

  async function handleSaveProfile() {
    if (!user) return;
    setProfileSaving(true);
    try {
      const updatedUser = await updateProfile(editForm);
      saveAuthUser(updatedUser);
      setUser(updatedUser);
      setIsEditing(false);
      toast.success("Profile updated", {
        description: "Your profile and Profile memory are now in sync.",
      });
    } catch (error) {
      toast.error("Profile update failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  function handlePasswordChange() {
    if (securityForm.newPassword !== securityForm.confirmPassword) return;
    setSecurityForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    toast.success("Password updated", {
      description: "Your new password is now active.",
    });
  }

  function handleDeleteAccount() {
    if (deleteKeyword.toLowerCase() !== "delete") return;
    clearAuthSession();
    localStorage.clear();
    router.push("/");
  }

  const stats = [
    { label: "Documents", value: "12", icon: <FileText aria-hidden="true" className="size-4" /> },
    { label: "Conversations", value: "48", icon: <MessageSquare aria-hidden="true" className="size-4" /> },
    { label: "Workspaces", value: "3", icon: <Users aria-hidden="true" className="size-4" /> },
    { label: "API Calls", value: "1.2k", icon: <Zap aria-hidden="true" className="size-4" /> },
  ];

  const connectedPlatforms = [
    { name: "Kontext Memory", connected: true, color: "#f6e879" },
    { name: "Kontext Crawl", connected: true, color: "#67d9bd" },
    { name: "AmanAgentLab", connected: false, color: "#8c82ff" },
    { name: "Kontext Web", connected: false, color: "#f06418" },
  ];

  return (
    <AuthenticatedAppShell>
    <div className="theme-surface-page min-h-screen bg-[var(--chat-background)] text-[var(--chat-foreground)]">
      <div className="mx-auto w-full max-w-[1360px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
        <header className="flex items-center justify-between gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.07] hover:text-white">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Dashboard
          </Link>
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.03em]">
            <span aria-hidden="true" className="size-6 rounded-full bg-[linear-gradient(135deg,#fff5a5,#f6e66c_42%,#f27a28)]" />
            kontext
          </Link>
        </header>

        <section className="relative mt-7 overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0a08] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <PaperDither
            className="inset-y-0 right-0 w-[58%] opacity-75"
            dark={{ colorBack: "#0c0a0800", colorFront: selected.colorFront }}
            light={{ colorBack: "#fffaf6", colorFront: "#d86516" }}
            eager
            maxPixelCount={900 * 460}
            scale={selected.scale}
            shape="warp"
            size={2.2}
            speed={0.16}
            type="4x4"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#0c0a08_0%,rgba(12,10,8,0.94)_48%,rgba(12,10,8,0.18)_100%)]" />
          <div className="relative z-10 flex max-w-2xl items-center gap-5 sm:gap-7">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                className="group relative block"
                aria-label="Change avatar"
              >
                <DitherAvatar avatar={selected} className="size-24 shrink-0 sm:size-32" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
                  <Camera aria-hidden="true" className="size-6 text-white" />
                </span>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6e879]">Personal context</p>
              <h1 className="mt-3 truncate font-heading text-3xl font-medium tracking-[-0.05em] sm:text-5xl">{displayName}</h1>
              <p className="mt-2 truncate text-sm text-white/45">{user.email}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href="/subscription"
                  aria-label={`${user.plan} plan. ${user.plan === "free" ? "Upgrade subscription" : "Manage subscription"}`}
                  className="group inline-flex min-h-8 items-center overflow-hidden rounded-full border border-[#f6e879]/25 bg-[#f6e879]/10 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f6e879] transition hover:border-[#f6e879]/55 hover:bg-[#f6e879]/15"
                >
                  <span className="px-3">{user.plan} plan</span>
                  <span className="flex min-h-8 items-center gap-1.5 border-l border-[#f6e879]/20 bg-[#f6e879] px-3 font-sans text-[10px] font-semibold normal-case tracking-normal text-[#171814] transition group-hover:bg-[#fff5a5]">
                    {user.plan === "free" ? "Upgrade" : "Manage"}
                    <ArrowRight aria-hidden="true" className="size-3" />
                  </span>
                </Link>
                <Link
                  href="/credits"
                  className="group inline-flex min-h-8 items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.03] font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 transition hover:border-[#f6e879]/30 hover:bg-[#f6e879]/8 hover:text-[#f6e879]"
                >
                  <span className="px-3">Credits</span>
                  <span className="flex min-h-8 items-center gap-1.5 border-l border-white/10 bg-white/[0.04] px-3 font-sans text-[10px] font-semibold normal-case tracking-normal text-white/75 transition group-hover:bg-[#f6e879] group-hover:text-[#171814]">
                    View
                    <ArrowRight aria-hidden="true" className="size-3" />
                  </span>
                </Link>
                {(user as AuthUser & { location?: string }).location && (
                  <span className="inline-flex items-center gap-1 text-xs text-white/40">
                    <MapPin aria-hidden="true" className="size-3" />
                    {(user as AuthUser & { location?: string }).location}
                  </span>
                )}
                {(user as AuthUser & { company?: string }).company && (
                  <span className="inline-flex items-center gap-1 text-xs text-white/40">
                    <Building2 aria-hidden="true" className="size-3" />
                    {(user as AuthUser & { company?: string }).company}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-[#f6e879]/10 text-[#f6e879]"
                    : "text-white/50 hover:bg-white/[0.05] hover:text-white/70"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <Link
              href="/subscription"
              className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium text-white/50 transition hover:bg-[#f6e879]/[0.06] hover:text-[#f6e879]"
            >
              <CreditCard aria-hidden="true" className="size-4" />
              Subscription
            </Link>
            <div className="my-2 hidden h-px bg-white/[0.08] lg:block" />
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium text-red-400/70 transition hover:bg-red-400/[0.08] hover:text-red-300"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </button>
          </aside>

          <div className="min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-5">
                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Activity</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Your stats</h2>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-black/25 p-4 text-center">
                        <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-[#f6e879]/10 text-[#f6e879]">
                          {stat.icon}
                        </div>
                        <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                        <p className="mt-1 text-xs text-white/40">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-5 lg:grid-cols-2">
                  <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#67d9bd]">Connected platforms</p>
                    <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Integrations</h2>
                    <div className="mt-4 space-y-2">
                      {connectedPlatforms.map((platform) => (
                        <div key={platform.name} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="size-2 rounded-full" style={{ backgroundColor: platform.color }} />
                            <span className="text-sm text-white/70">{platform.name}</span>
                          </div>
                          {platform.connected ? (
                            <span className="text-xs font-medium text-emerald-400">Connected</span>
                          ) : (
                            <Link href="/integrations" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/50 transition hover:border-[#f6e879]/30 hover:bg-[#f6e879]/[0.06] hover:text-[#f6e879]">
                              <LinkIcon aria-hidden="true" className="size-3" />
                              Connect
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                    <Link href="/integrations" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/50 transition hover:border-[#f6e879]/30 hover:bg-[#f6e879]/[0.06] hover:text-[#f6e879]">
                      Manage all integrations
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </Link>
                  </section>

                  <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c82ff]">Dither identity</p>
                    <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Choose your signal</h2>
                    <p className="mt-1 text-xs text-white/40">Your selected avatar is stored on this device.</p>
                    <div role="radiogroup" aria-label="Choose a dither avatar" className="mt-4 grid grid-cols-2 gap-2">
                      {avatars.map((avatar) => {
                        const active = selectedAvatar === avatar.id;
                        return (
                          <button key={avatar.id} type="button" role="radio" aria-checked={active} onClick={() => chooseAvatar(avatar.id)} className={`relative flex items-center gap-3 rounded-xl border p-3 transition ${active ? "border-[#f6e879]/70 bg-[#f6e879]/[0.06]" : "border-white/[0.08] bg-black/25 hover:border-white/20"}`}>
                            <DitherAvatar avatar={avatar} className="size-10 shrink-0" />
                            <span className={`text-sm font-medium ${active ? "text-[#f6e879]" : "text-white/50"}`}>{avatar.label}</span>
                            {active ? <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-[#f6e879] text-[#171814]"><Check aria-hidden="true" className="size-2.5" /></span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeTab === "edit" && (
              <div className="space-y-5">
                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Personal information</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Edit your profile</h2>
                      <p className="mt-1 text-sm text-white/40">Update your personal details and public profile.</p>
                    </div>
                    {!isEditing ? (
                      <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:border-[#f6e879]/30 hover:bg-[#f6e879]/[0.06] hover:text-[#f6e879]">
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.07]">
                          <X aria-hidden="true" className="size-4" />
                          Cancel
                        </button>
                        <button type="button" disabled={profileSaving} onClick={() => void handleSaveProfile()} className="inline-flex items-center gap-2 rounded-xl border border-[#f6e879]/30 bg-[#f6e879]/10 px-4 py-2.5 text-sm font-medium text-[#f6e879] transition hover:bg-[#f6e879]/20 disabled:cursor-wait disabled:opacity-60">
                          <Save aria-hidden="true" className="size-4" />
                          {profileSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Full name" value={editForm.full_name} onChange={(v) => setEditForm({ ...editForm, full_name: v })} disabled={!isEditing} placeholder="John Doe" />
                      <FormField label="Username" value={editForm.username} onChange={(v) => setEditForm({ ...editForm, username: v })} disabled={!isEditing} placeholder="johndoe" />
                    </div>
                    <FormField label="Bio" value={editForm.bio} onChange={(v) => setEditForm({ ...editForm, bio: v })} disabled={!isEditing} placeholder="Tell us about yourself..." multiline />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Company" value={editForm.company} onChange={(v) => setEditForm({ ...editForm, company: v })} disabled={!isEditing} placeholder="Acme Inc." icon={<Building2 aria-hidden="true" className="size-4" />} />
                      <FormField label="Location" value={editForm.location} onChange={(v) => setEditForm({ ...editForm, location: v })} disabled={!isEditing} placeholder="San Francisco, CA" icon={<MapPin aria-hidden="true" className="size-4" />} />
                    </div>
                    <FormField label="Website" value={editForm.website} onChange={(v) => setEditForm({ ...editForm, website: v })} disabled={!isEditing} placeholder="https://example.com" icon={<Globe aria-hidden="true" className="size-4" />} />
                    <FormField label="Email" value={user.email} disabled icon={<Mail aria-hidden="true" className="size-4" />} />
                  </div>
                </section>

                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f06418]">Dither identity</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Choose your signal</h2>
                  <p className="mt-1 text-sm text-white/40">Your selected avatar is stored on this device.</p>
                  <div role="radiogroup" aria-label="Choose a dither avatar" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {avatars.map((avatar) => {
                      const active = selectedAvatar === avatar.id;
                      return (
                        <button key={avatar.id} type="button" role="radio" aria-checked={active} onClick={() => chooseAvatar(avatar.id)} className={`relative flex flex-col items-center gap-3 rounded-[16px] border p-3 transition ${active ? "border-[#f6e879]/70 bg-[#f6e879]/[0.06]" : "border-white/[0.08] bg-black/25 hover:border-white/20"}`}>
                          <DitherAvatar avatar={avatar} className="size-20" />
                          <span className={`text-xs font-medium ${active ? "text-[#f6e879]" : "text-white/50"}`}>{avatar.label}</span>
                          {active ? <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#f6e879] text-[#171814]"><Check aria-hidden="true" className="size-3" /></span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-5">
                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#67d9bd]">Security</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Change password</h2>
                  <p className="mt-1 text-sm text-white/40">Ensure your account remains secure with a strong password.</p>

                  <div className="mt-6 max-w-md space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/60">Current password</label>
                      <div className="relative mt-1.5">
                        <input
                          type={showPasswords.current ? "text" : "password"}
                          value={securityForm.currentPassword}
                          onChange={(e) => setSecurityForm({ ...securityForm, currentPassword: e.target.value })}
                          className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-10 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#67d9bd]/50 focus:ring-1 focus:ring-[#67d9bd]/25"
                          placeholder="Enter current password"
                        />
                        <button type="button" onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                          {showPasswords.current ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/60">New password</label>
                      <div className="relative mt-1.5">
                        <input
                          type={showPasswords.new ? "text" : "password"}
                          value={securityForm.newPassword}
                          onChange={(e) => setSecurityForm({ ...securityForm, newPassword: e.target.value })}
                          className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 pr-10 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#67d9bd]/50 focus:ring-1 focus:ring-[#67d9bd]/25"
                          placeholder="Enter new password"
                        />
                        <button type="button" onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                          {showPasswords.new ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      {securityForm.newPassword && (
                        <div className="mt-2 flex gap-1.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition ${i <= passwordStrength ? (passwordStrength <= 2 ? "bg-red-400" : passwordStrength === 3 ? "bg-yellow-400" : "bg-emerald-400") : "bg-white/10"}`} />
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-xs text-white/30">Min 8 characters, use uppercase, numbers, and symbols.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/60">Confirm new password</label>
                      <input
                        type="password"
                        value={securityForm.confirmPassword}
                        onChange={(e) => setSecurityForm({ ...securityForm, confirmPassword: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#67d9bd]/50 focus:ring-1 focus:ring-[#67d9bd]/25"
                        placeholder="Confirm new password"
                      />
                      {securityForm.confirmPassword && securityForm.newPassword !== securityForm.confirmPassword && (
                        <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handlePasswordChange}
                      disabled={!securityForm.currentPassword || !securityForm.newPassword || securityForm.newPassword !== securityForm.confirmPassword || passwordStrength < 2}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#67d9bd]/30 bg-[#67d9bd]/10 px-5 py-2.5 text-sm font-medium text-[#67d9bd] transition hover:bg-[#67d9bd]/20 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Key aria-hidden="true" className="size-4" />
                      Update password
                    </button>
                  </div>
                </section>

                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c82ff]">Two-factor authentication</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">2FA</h2>
                  <p className="mt-1 text-sm text-white/40">Add an extra layer of security to your account.</p>
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ShieldCheck aria-hidden="true" className="size-5 text-white/40" />
                      <div>
                        <p className="text-sm font-medium text-white/70">Authenticator app</p>
                        <p className="text-xs text-white/35">Not configured</p>
                      </div>
                    </div>
                    <button type="button" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-[#8c82ff]/30 hover:text-[#8c82ff]">
                      Enable
                    </button>
                  </div>
                </section>

                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f06418]">Sessions</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Active sessions</h2>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white/70">Current session</p>
                        <p className="text-xs text-white/35">Chrome on Windows</p>
                      </div>
                      <span className="text-xs text-emerald-400">Active</span>
                    </div>
                  </div>
                  <button type="button" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2.5 text-sm font-medium text-red-300/70 transition hover:bg-red-400/[0.12] hover:text-red-300">
                    Sign out all other sessions
                  </button>
                </section>
              </div>
            )}

            {activeTab === "preferences" && (
              <div className="space-y-5">
                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f6e879]">Notifications</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Notification preferences</h2>
                  <p className="mt-1 text-sm text-white/40">Choose how you want to be notified.</p>

                  <div className="mt-6 space-y-1">
                    <ToggleRow label="Email notifications" description="Receive notifications via email" checked={preferences.emailNotifications} onChange={(v) => setPreferences({ ...preferences, emailNotifications: v })} />
                    <ToggleRow label="Push notifications" description="Receive push notifications in browser" checked={preferences.pushNotifications} onChange={(v) => setPreferences({ ...preferences, pushNotifications: v })} />
                    <ToggleRow label="Weekly digest" description="Summary of your activity each week" checked={preferences.weeklyDigest} onChange={(v) => setPreferences({ ...preferences, weeklyDigest: v })} />
                    <ToggleRow label="Product updates" description="News about features and improvements" checked={preferences.productUpdates} onChange={(v) => setPreferences({ ...preferences, productUpdates: v })} />
                    <ToggleRow label="Marketing emails" description="Tips, offers, and inspiration" checked={preferences.marketingEmails} onChange={(v) => setPreferences({ ...preferences, marketingEmails: v })} />
                  </div>
                </section>

                <section className="rounded-[20px] border border-white/[0.08] bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#67d9bd]">Privacy</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Privacy settings</h2>
                  <p className="mt-1 text-sm text-white/40">Control who can see your information.</p>

                  <div className="mt-6 space-y-1">
                    <ToggleRow label="Show email" description="Display your email on your public profile" checked={preferences.showEmail} onChange={(v) => setPreferences({ ...preferences, showEmail: v })} />
                    <ToggleRow label="Show activity" description="Display your activity stats publicly" checked={preferences.showActivity} onChange={(v) => setPreferences({ ...preferences, showActivity: v })} />
                  </div>
                </section>

                <section className="rounded-[20px] border border-red-400/20 bg-[#10100f] p-5 sm:p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-red-400">Danger zone</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-red-300/80">Delete account</h2>
                  <p className="mt-1 text-sm text-white/40">Permanently delete your account and all associated data.</p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-400/10 bg-red-400/[0.04] px-4 py-3">
                    <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-red-400/60" />
                    <p className="text-sm text-white/50">This action is irreversible. All your data will be permanently removed.</p>
                  </div>
                  <button type="button" onClick={() => { setShowDeleteConfirm(true); setDeleteKeyword(""); }} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-5 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/20">
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete account
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAvatarPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAvatarPicker(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#10100f] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Choose your avatar</h3>
              <button type="button" onClick={() => setShowAvatarPicker(false)} className="text-white/40 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <div role="radiogroup" aria-label="Choose a dither avatar" className="mt-5 grid grid-cols-2 gap-3">
              {avatars.map((avatar) => {
                const active = selectedAvatar === avatar.id;
                return (
                  <button key={avatar.id} type="button" role="radio" aria-checked={active} onClick={() => chooseAvatar(avatar.id)} className={`relative flex flex-col items-center gap-3 rounded-[16px] border p-4 transition ${active ? "border-[#f6e879]/70 bg-[#f6e879]/[0.06]" : "border-white/[0.08] bg-black/25 hover:border-white/20"}`}>
                    <DitherAvatar avatar={avatar} className="size-24" />
                    <span className={`text-sm font-medium ${active ? "text-[#f6e879]" : "text-white/50"}`}>{avatar.label}</span>
                    {active ? <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[#f6e879] text-[#171814]"><Check aria-hidden="true" className="size-3" /></span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-red-400/20 bg-[#10100f] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-400/10">
                <AlertTriangle aria-hidden="true" className="size-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-300">Delete account</h3>
                <p className="text-sm text-white/40">This action is irreversible</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/50">
              All your data will be permanently removed. Type <span className="font-mono font-semibold text-red-300">delete</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteKeyword}
              onChange={(e) => setDeleteKeyword(e.target.value)}
              placeholder='Type "delete" to confirm'
              className="mt-4 w-full rounded-xl border border-red-400/20 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-red-400/50 focus:ring-1 focus:ring-red-400/25"
              onKeyDown={(e) => { if (e.key === "Enter" && deleteKeyword.toLowerCase() === "delete") handleDeleteAccount(); }}
              autoFocus
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteKeyword(""); }}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.07]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteKeyword.toLowerCase() !== "delete"}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-400/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AuthenticatedAppShell>
  );
}

function FormField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  icon,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/60">{label}</label>
      <div className="relative mt-1.5">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25">
            {icon}
          </span>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            className={`w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#f6e879]/50 focus:ring-1 focus:ring-[#f6e879]/25 disabled:opacity-50 ${icon ? "pl-10" : ""}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/25 outline-none transition focus:border-[#f6e879]/50 focus:ring-1 focus:ring-[#f6e879]/25 disabled:opacity-50 ${icon ? "pl-10" : ""}`}
          />
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 transition hover:border-white/[0.12]">
      <div>
        <p className="text-sm font-medium text-white/70">{label}</p>
        <p className="text-xs text-white/35">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ${
          checked
            ? "border-[#f6e879]/60 bg-[#f6e879] shadow-[0_0_12px_rgba(246,232,121,0.3)]"
            : "border-white/35 bg-[#3a3a3a]"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] block h-[18px] w-[18px] rounded-full bg-[#e0e0e0] shadow-md transition-transform duration-200 ${
            checked ? "translate-x-[20px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
