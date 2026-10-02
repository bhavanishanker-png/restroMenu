"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/tables/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { StaffMember, StaffRole } from "@/types";

type RoleMeta = {
  label: string;
  plural: string;
  icon: string;
  /** What the role can open in QBite. */
  access: string;
  /** How the role signs in. */
  signIn: string;
  pill: string;
};

// The icon and label carry the role; the tint only reinforces it.
const ROLES: Record<StaffRole, RoleMeta> = {
  owner: {
    label: "Owner",
    plural: "Owners",
    icon: "workspace_premium",
    access: "Everything, including settings, billing rules and team changes.",
    signIn: "Email & password",
    pill: "border-brand-border bg-brand-subtle text-brand-text",
  },
  manager: {
    label: "Manager",
    plural: "Managers",
    icon: "manage_accounts",
    access: "Menu, tables & QR, reports and orders. Can view the team.",
    signIn: "Email & password",
    pill: "border-outline-variant bg-surface-container-high text-on-surface",
  },
  kitchen: {
    label: "Kitchen",
    plural: "Kitchen",
    icon: "skillet",
    access: "The kitchen display and live orders.",
    signIn: "4-digit PIN",
    pill: "border-warning/40 bg-warning-container text-on-warning-container",
  },
  waiter: {
    label: "Waiter",
    plural: "Waiters",
    icon: "room_service",
    access: "Live orders and table requests on the floor.",
    signIn: "4-digit PIN",
    pill: "border-success/30 bg-success-container text-on-success-container",
  },
};

/** Roles an owner can create — mirrors the enum on POST /api/staff. */
const CREATABLE_ROLES: StaffRole[] = ["waiter", "kitchen", "manager"];

type RoleFilter = StaffRole | "all";

const FILTERS: { value: RoleFilter; label: string; icon: string }[] = [
  { value: "all", label: "Everyone", icon: "groups" },
  { value: "manager", label: "Managers", icon: ROLES.manager.icon },
  { value: "kitchen", label: "Kitchen", icon: ROLES.kitchen.icon },
  { value: "waiter", label: "Waiters", icon: ROLES.waiter.icon },
];

/** Mirrors loginPasswordSchema in lib/staff-accounts.ts (server-only). */
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  initialStaff: StaffMember[];
  /** Only owners may add or remove staff (POST/DELETE /api/staff are owner-only). */
  canManage: boolean;
  currentStaffId: string;
};

function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined shrink-0", className)}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function RolePill({ role }: { role: StaffRole }) {
  const meta = ROLES[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        meta.pill
      )}
    >
      <Icon name={meta.icon} size={14} />
      {meta.label}
    </span>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1 text-body-xs font-medium text-error">
      <Icon name="error" size={16} />
      {children}
    </p>
  );
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SignInCell({ s }: { s: StaffMember }) {
  const usesPin = s.role === "kitchen" || s.role === "waiter";
  // A manager added before email sign-in existed has no login at all; say so
  // where the owner will see it, with the fix one tap away (Edit).
  const missing = usesPin ? !s.hasPin : s.authUserId === null;
  if (missing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-container px-2 py-0.5 text-xs font-semibold text-on-warning-container">
        <Icon name="warning" size={14} />
        Can&apos;t sign in yet
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon name={usesPin ? "dialpad" : "mail"} size={16} />
      <span className="truncate">{usesPin ? "4-digit PIN" : s.loginEmail ?? "Email & password"}</span>
    </span>
  );
}

function StaffRow({
  s,
  isYou,
  canManage,
  onEdit,
  onDelete,
}: {
  s: StaffMember;
  isYou: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = ROLES[s.role];

  return (
    <li className="flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-4">
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-outline-variant bg-surface-container font-display text-sm font-bold text-on-surface"
          aria-hidden="true"
        >
          {initialsOf(s.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-on-surface">
            <span className="truncate">{s.name}</span>
            {isYou && (
              <span className="shrink-0 rounded-full border border-outline-variant px-1.5 text-[11px] font-semibold text-on-surface-variant">
                You
              </span>
            )}
          </p>
          <p className="truncate text-body-xs text-on-surface-variant">
            {s.phone ? (
              <span className="font-mono tabular-nums">{s.phone}</span>
            ) : (
              "No phone added"
            )}
            {/* On phones the role and sign-in columns collapse into this line. */}
            <span className="md:hidden"> · {meta.label}</span>
          </p>
          <p className="mt-1 text-body-xs text-on-surface-variant md:hidden">
            <SignInCell s={s} />
          </p>
        </div>
      </div>

      <div className="hidden md:block">
        <RolePill role={s.role} />
      </div>

      <div className="hidden min-w-0 items-center text-body-sm text-on-surface-variant md:flex">
        <SignInCell s={s} />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1">
        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={`Edit ${s.name}`}
            className="h-11 w-11"
          >
            <Icon name="edit" size={20} />
          </Button>
        )}
        {canManage && s.role !== "owner" ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Remove ${s.name}`}
            className="h-11 w-11 hover:bg-error-container hover:text-on-error-container"
          >
            <Icon name="person_remove" size={20} />
          </Button>
        ) : (
          // Keeps the columns aligned when there is no action.
          <span className="hidden h-11 w-11 md:block" aria-hidden="true" />
        )}
      </div>
    </li>
  );
}

const EMPTY_FORM = {
  name: "",
  phone: "",
  role: "waiter" as StaffRole,
  pin: "",
  email: "",
  password: "",
};

type StaffForm = typeof EMPTY_FORM;

type ApiError = { error?: { message?: string } };

export function StaffManager({ initialStaff, canManage, currentStaffId }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** null = adding a new person; otherwise the person being edited. */
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function setField<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    setFormError(null);
  }

  const isEdit = editing !== null;
  const isOwnerRow = editing?.role === "owner";
  const needsPin = form.role === "kitchen" || form.role === "waiter";
  const isManager = form.role === "manager";

  // What already exists for the person being edited. A floor worker who is
  // moved to manager has no email login yet; a manager moved to the floor has
  // no PIN — in both cases the new credential becomes required.
  const keepsPin = isEdit && editing.hasPin && editing.role !== "manager";
  const hasLogin = isEdit && editing.authUserId !== null;
  const pinRequired = needsPin && !keepsPin;
  const loginRequired = isManager && !hasLogin;

  // Same rules as the zod schemas on POST /api/staff and PATCH
  // /api/staff/[id], shown inline so the owner does not have to decode a toast.
  const errors = {
    name: form.name.trim() === "" ? "Enter the staff member's name." : null,
    phone:
      form.phone !== "" && form.phone.length !== 10
        ? "Enter all 10 digits, or leave it empty."
        : null,
    pin:
      needsPin && (pinRequired || form.pin !== "") && form.pin.length !== 4
        ? pinRequired
          ? "Choose a 4-digit PIN they'll use to sign in."
          : "A new PIN must be 4 digits, or leave it empty to keep the current one."
        : null,
    email:
      isManager && (loginRequired || form.email !== (editing?.loginEmail ?? "")) &&
      !EMAIL_RE.test(form.email.trim())
        ? "Enter the email they'll sign in with."
        : null,
    password:
      isManager && (loginRequired || form.password !== "") && form.password.length < PASSWORD_MIN
        ? loginRequired
          ? `Set a temporary password of at least ${PASSWORD_MIN} characters.`
          : `A new password needs at least ${PASSWORD_MIN} characters, or leave it empty.`
        : null,
  };
  const hasErrors = Object.values(errors).some((e) => e !== null);

  function openAdd(role?: StaffRole) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, role: role ?? EMPTY_FORM.role });
    setAttempted(false);
    setShowPassword(false);
    setFormError(null);
    setSheetOpen(true);
  }

  function openEdit(member: StaffMember) {
    setEditing(member);
    setForm({
      name: member.name,
      phone: member.phone ?? "",
      role: member.role,
      pin: "",
      email: member.loginEmail ?? "",
      password: "",
    });
    setAttempted(false);
    setShowPassword(false);
    setFormError(null);
    setSheetOpen(true);
  }

  /** PATCH body with only what changed, so an untouched field is never rewritten. */
  function editChanges(member: StaffMember): Record<string, string | null> {
    const changes: Record<string, string | null> = {};
    const name = form.name.trim();
    const phone = form.phone.trim() || null;
    if (name !== member.name) changes.name = name;
    if (phone !== member.phone) changes.phone = phone;
    if (member.role !== "owner" && form.role !== member.role) changes.role = form.role;
    if (needsPin && form.pin !== "") changes.pin = form.pin;
    if (isManager) {
      const email = form.email.trim().toLowerCase();
      if (email !== (member.loginEmail ?? "")) changes.email = email;
      if (form.password !== "") changes.password = form.password;
    }
    return changes;
  }

  const pendingChanges = isEdit ? editChanges(editing) : null;
  // "No changes" only when nothing is missing either: a manager who can't
  // sign in yet must be able to press Save and see which fields to fill in.
  const nothingToSave =
    pendingChanges !== null &&
    Object.keys(pendingChanges).length === 0 &&
    !loginRequired &&
    !pinRequired;

  async function submit() {
    setAttempted(true);
    if (hasErrors || nothingToSave) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = isEdit
        ? await fetch(`/api/staff/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pendingChanges),
          })
        : await fetch("/api/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name.trim(),
              phone: form.phone.trim() || null,
              role: form.role,
              pin: needsPin ? form.pin : undefined,
              email: isManager ? form.email.trim().toLowerCase() : undefined,
              password: isManager ? form.password : undefined,
            }),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        // Shown in the sheet, next to the fields it is about (e.g. "That
        // email already has a QBite login"), rather than in a passing toast.
        setFormError(body.error?.message ?? (isEdit ? "Failed to save changes." : "Failed to create staff member."));
        return;
      }
      const { staff: saved } = (await res.json()) as { staff: StaffMember };
      setStaff((p) => (isEdit ? p.map((m) => (m.id === saved.id ? saved : m)) : [...p, saved]));
      setSheetOpen(false);
      toast.success(isEdit ? `${saved.name} updated.` : `${saved.name} added.`);
    } catch (err) {
      console.error(isEdit ? "[staff] update failed" : "[staff] create failed", err);
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(member: StaffMember) {
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/staff/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove staff member.");
        return;
      }
      setStaff((p) => p.filter((s) => s.id !== member.id));
      toast.success(`${member.name} removed.`);
      setRemoving(null);
    } catch (err) {
      // Used to be an unhandled rejection with no feedback at all.
      console.error("[staff] remove failed", err);
      toast.error("Couldn't reach the server. They have not been removed.");
    } finally {
      setRemoveBusy(false);
    }
  }

  const countFor = (f: RoleFilter) =>
    f === "all" ? staff.length : staff.filter((s) => s.role === f).length;
  const visible = filter === "all" ? staff : staff.filter((s) => s.role === filter);
  // Only the owner exists — the team itself is still empty.
  const teamIsEmpty = staff.every((s) => s.role === "owner");

  return (
    <div className="flex flex-col gap-4 p-margin-mobile md:p-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-level-1 sm:flex-row sm:items-center">
        <div
          role="radiogroup"
          aria-label="Filter by role"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-fast",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline hover:text-on-surface"
                )}
              >
                <Icon name={f.icon} size={16} />
                {f.label}
                <span className="tabular-nums opacity-70">{countFor(f.value)}</span>
              </button>
            );
          })}
        </div>
        {canManage && (
          <Button variant="brand" size="touch" className="sm:ml-auto" onClick={() => openAdd()}>
            <Icon name="person_add" />
            Add staff
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-body-sm text-on-surface-variant">
          <Icon name="lock" size={16} className="mt-0.5" />
          You can see the team, but only the owner can add, edit or remove staff.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        {/* Staff list */}
        <section
          aria-label="Team members"
          className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-level-1"
        >
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant md:grid">
            <span>Name</span>
            <span>Role</span>
            <span>Signs in with</span>
            {/* Edit + remove are two 44px buttons with a 4px gap. */}
            <span className={canManage ? "w-[92px]" : "w-11"}><span className="sr-only">Actions</span></span>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl border border-outline-variant bg-surface-container text-on-surface-variant"
                aria-hidden="true"
              >
                <Icon name={filter === "all" ? "group_add" : ROLES[filter].icon} size={28} />
              </span>
              <div className="space-y-1">
                <p className="font-display text-title text-on-surface">
                  {filter === "all" ? "No one on the team yet" : `No ${ROLES[filter].plural.toLowerCase()} yet`}
                </p>
                <p className="mx-auto max-w-sm text-body-sm text-on-surface-variant">
                  {filter === "all"
                    ? "Add your kitchen and floor staff so they can sign in to the kitchen display with a PIN."
                    : `Add ${filter === "kitchen" ? "kitchen staff" : `a ${ROLES[filter].label.toLowerCase()}`} to give them ${ROLES[filter].access.charAt(0).toLowerCase()}${ROLES[filter].access.slice(1)}`}
                </p>
              </div>
              {canManage ? (
                <Button
                  variant="brand"
                  size="touch"
                  onClick={() => openAdd(filter === "all" ? undefined : filter)}
                >
                  <Icon name="person_add" />
                  {filter === "all" ? "Add your first staff member" : `Add ${ROLES[filter].label.toLowerCase()}`}
                </Button>
              ) : (
                <Button variant="outline" size="touch" onClick={() => setFilter("all")}>
                  Show everyone
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {visible.map((s) => (
                <StaffRow
                  key={s.id}
                  s={s}
                  isYou={s.id === currentStaffId}
                  canManage={canManage}
                  onEdit={() => openEdit(s)}
                  onDelete={() => setRemoving(s)}
                />
              ))}
            </ul>
          )}

          {filter === "all" && teamIsEmpty && canManage && visible.length > 0 && (
            <div className="flex flex-col items-start gap-3 border-t border-outline-variant bg-surface-container-low px-4 py-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-body-sm text-on-surface-variant">
                It&apos;s just you so far. Add kitchen and floor staff so they can sign in with a PIN.
              </p>
              <Button variant="outline" size="touch" onClick={() => openAdd()}>
                <Icon name="person_add" />
                Add staff
              </Button>
            </div>
          )}
        </section>

        {/* Role explanations */}
        <aside className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-level-1">
          <h2 className="font-display text-title text-on-surface">Roles &amp; access</h2>
          <p className="mt-0.5 text-body-xs text-on-surface-variant">What each person can open, and how they sign in.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {(Object.keys(ROLES) as StaffRole[]).map((role) => (
              <li key={role} className="flex gap-3">
                <span
                  className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl border", ROLES[role].pill)}
                  aria-hidden="true"
                >
                  <Icon name={ROLES[role].icon} size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{ROLES[role].label}</p>
                  <p className="text-body-xs text-on-surface-variant">{ROLES[role].access}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-body-xs text-on-surface-variant">
                    <Icon name={role === "kitchen" || role === "waiter" ? "dialpad" : "mail"} size={14} />
                    {ROLES[role].signIn}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* Add / edit staff sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b border-outline-variant bg-surface-container-low px-5 pb-4 pt-5 text-left">
            <SheetTitle className="pr-8 font-display text-headline-sm">
              {isEdit ? `Edit ${editing.name}` : "Add staff member"}
            </SheetTitle>
            <SheetDescription className="text-body-sm">
              {isEdit
                ? "Changes apply the next time they sign in. Leave PIN and password empty to keep the current ones."
                : "They'll appear here straight away. Kitchen and waiter staff sign in with a PIN; managers with an email and password."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-5 py-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                autoFocus
                maxLength={80}
                placeholder="e.g. Ravi Kumar"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                aria-invalid={attempted && errors.name !== null}
                aria-describedby={attempted && errors.name ? "staff-name-error" : undefined}
                className={cn("h-11", attempted && errors.name && "border-error")}
              />
              {attempted && errors.name && <FieldError id="staff-name-error">{errors.name}</FieldError>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-phone">
                Phone <span className="font-normal text-on-surface-variant">(optional)</span>
              </Label>
              <Input
                id="staff-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="10-digit mobile"
                value={form.phone}
                onChange={(e) =>
                  setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                aria-invalid={attempted && errors.phone !== null}
                aria-describedby={attempted && errors.phone ? "staff-phone-error" : undefined}
                className={cn("h-11 font-mono tabular-nums", attempted && errors.phone && "border-error")}
              />
              {attempted && errors.phone && <FieldError id="staff-phone-error">{errors.phone}</FieldError>}
            </div>

            {isOwnerRow ? (
              // The owner's role is fixed (PATCH rejects it): the owner row is
              // the only way into settings and team changes.
              <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                <RolePill role="owner" />
                <p className="text-body-xs text-on-surface-variant">
                  The owner&apos;s role and sign-in can&apos;t be changed here.
                </p>
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium text-on-surface">Role</legend>
                <RadioGroup
                  value={form.role}
                  onValueChange={(v) => setField("role", v as StaffRole)}
                  className="gap-2"
                >
                  {CREATABLE_ROLES.map((role) => {
                    const meta = ROLES[role];
                    const selected = form.role === role;
                    return (
                      <Label
                        key={role}
                        htmlFor={`role-${role}`}
                        className={cn(
                          "flex min-h-[60px] cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal transition-colors duration-fast",
                          selected
                            ? "border-brand-border bg-brand-subtle"
                            : "border-outline-variant hover:bg-surface-container-low"
                        )}
                      >
                        <RadioGroupItem id={`role-${role}`} value={role} />
                        <Icon name={meta.icon} size={22} className={selected ? "text-brand-text" : "text-on-surface-variant"} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-on-surface">{meta.label}</span>
                          <span className="block text-body-xs text-on-surface-variant">{meta.access}</span>
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </fieldset>
            )}

            {needsPin && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-pin" className="flex items-center gap-1">
                  <Icon name="dialpad" size={16} />
                  {keepsPin ? "New PIN" : "Sign-in PIN"}
                  {keepsPin && <span className="font-normal text-on-surface-variant">(optional)</span>}
                </Label>
                <Input
                  id="staff-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="••••"
                  value={form.pin}
                  onChange={(e) =>
                    setField("pin", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  aria-invalid={attempted && errors.pin !== null}
                  aria-describedby={attempted && errors.pin ? "staff-pin-error" : "staff-pin-hint"}
                  className={cn("h-11 w-40 font-mono tracking-[0.5em]", attempted && errors.pin && "border-error")}
                />
                {attempted && errors.pin ? (
                  <FieldError id="staff-pin-error">{errors.pin}</FieldError>
                ) : (
                  <p id="staff-pin-hint" className="text-body-xs text-on-surface-variant">
                    {keepsPin
                      ? "Leave empty to keep their current PIN. Enter 4 digits to reset it."
                      : "4 digits. They enter it on the kitchen or waiter screen."}
                  </p>
                )}
              </div>
            )}

            {isManager && !isOwnerRow && (
              <fieldset className="flex flex-col gap-4 rounded-xl border border-outline-variant p-3">
                <legend className="flex items-center gap-1 px-1 text-sm font-medium text-on-surface">
                  <Icon name="mail" size={16} />
                  Email sign-in
                </legend>
                {isEdit && !hasLogin && (
                  <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-container px-3 py-2 text-body-xs text-on-warning-container">
                    <Icon name="warning" size={16} className="mt-px" />
                    {editing.role === "manager"
                      ? "This manager has no way to sign in yet. Set an email and password to give them access."
                      : "Managers sign in with an email and password instead of a PIN."}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-email">Email</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="manager@restaurant.com"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    aria-invalid={attempted && errors.email !== null}
                    aria-describedby={attempted && errors.email ? "staff-email-error" : undefined}
                    className={cn("h-11", attempted && errors.email && "border-error")}
                  />
                  {attempted && errors.email && <FieldError id="staff-email-error">{errors.email}</FieldError>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-password">
                    {hasLogin ? "New password" : "Temporary password"}
                    {hasLogin && <span className="font-normal text-on-surface-variant"> (optional)</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      id="staff-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setField("password", e.target.value)}
                      aria-invalid={attempted && errors.password !== null}
                      aria-describedby={attempted && errors.password ? "staff-password-error" : "staff-password-hint"}
                      className={cn("h-11 pr-12", attempted && errors.password && "border-error")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-md text-on-surface-variant hover:text-on-surface"
                    >
                      <Icon name={showPassword ? "visibility_off" : "visibility"} size={20} />
                    </button>
                  </div>
                  {attempted && errors.password ? (
                    <FieldError id="staff-password-error">{errors.password}</FieldError>
                  ) : (
                    <p id="staff-password-hint" className="text-body-xs text-on-surface-variant">
                      {hasLogin
                        ? "Leave empty to keep their current password."
                        : `At least ${PASSWORD_MIN} characters. Share it with them in person; they sign in at the staff login page.`}
                    </p>
                  )}
                </div>
              </fieldset>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-outline-variant bg-surface-container-lowest px-5 py-4">
            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                <Icon name="error" size={18} className="mt-px" />
                {formError}
              </p>
            )}
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={saving || nothingToSave}
            >
              <Icon name={isEdit ? "save" : "person_add"} />
              {saving
                ? isEdit ? "Saving…" : "Adding…"
                : isEdit
                  ? nothingToSave ? "No changes" : "Save changes"
                  : "Add staff member"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => { if (!o) setRemoving(null); }}
        icon="person_remove"
        title={`Remove ${removing?.name ?? "this person"}?`}
        description={
          <p>
            They won&apos;t be able to sign in again. Orders they handled are kept.
          </p>
        }
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={removeBusy}
        onConfirm={() => { if (removing) void deactivate(removing); }}
      />
    </div>
  );
}
