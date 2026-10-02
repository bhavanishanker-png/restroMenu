import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Email/password sign-in for managers, backed by Supabase Auth.
 *
 * Owners and managers sign in with Supabase Auth (plan.md); the login route
 * finds their staff row by `auth_user_id`. Adding a manager used to create
 * only the staff row, so the new manager had no way to sign in at all. The
 * owner now sets an email and a temporary password when adding or editing a
 * manager, and the account is created here with the service role.
 *
 * A password the owner sets, rather than an emailed invite: invites need SMTP
 * configured on the Supabase project, and this works without it. Swap in
 * `auth.admin.inviteUserByEmail` once email delivery is set up.
 *
 * Server-only — imports the service-role client.
 */

export const MANAGER_PASSWORD_MIN = 8;

export const loginEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
export const loginPasswordSchema = z
  .string()
  .min(MANAGER_PASSWORD_MIN, `Password must be at least ${MANAGER_PASSWORD_MIN} characters.`)
  .max(72, "Password must be 72 characters or fewer.");

export type AccountErrorCode = "EMAIL_TAKEN" | "WEAK_PASSWORD" | "INVALID_EMAIL" | "AUTH_FAILED";

export type AccountResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: AccountErrorCode; message: string; status: number };

function fail(code: AccountErrorCode, message: string, status: number): AccountResult<never> {
  return { ok: false, code, message, status };
}

/** Maps a Supabase Auth admin error to something an owner can act on. */
function mapAuthError(error: { code?: string; message: string }): AccountResult<never> {
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
    case "conflict":
      return fail("EMAIL_TAKEN", "That email already has a QBite login. Use a different one.", 409);
    case "weak_password":
      return fail("WEAK_PASSWORD", error.message || "Choose a stronger password.", 400);
    case "email_address_invalid":
    case "validation_failed":
      return fail("INVALID_EMAIL", "Enter a valid email address.", 400);
    default:
      console.error("[staff-accounts] auth admin call failed", error);
      return fail("AUTH_FAILED", "Couldn't set up the sign-in account. Try again.", 502);
  }
}

/** Creates a confirmed email/password login. Returns the new auth user id. */
export async function createLoginAccount(
  email: string,
  password: string
): Promise<AccountResult<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // The owner is vouching for this address; there is no inbox round-trip.
    email_confirm: true,
  });
  if (error) return mapAuthError(error);
  if (!data.user) return fail("AUTH_FAILED", "Couldn't set up the sign-in account. Try again.", 502);
  return { ok: true, value: data.user.id };
}

/** Changes the email and/or password of an existing login. */
export async function updateLoginAccount(
  authUserId: string,
  changes: { email?: string; password?: string }
): Promise<AccountResult<null>> {
  const attributes: { email?: string; password?: string; email_confirm?: boolean } = {};
  if (changes.email !== undefined) {
    attributes.email = changes.email;
    attributes.email_confirm = true;
  }
  if (changes.password !== undefined) attributes.password = changes.password;
  if (Object.keys(attributes).length === 0) return { ok: true, value: null };

  const supabase = createServerClient();
  const { error } = await supabase.auth.admin.updateUserById(authUserId, attributes);
  if (error) return mapAuthError(error);
  return { ok: true, value: null };
}

/**
 * Undo for createLoginAccount when the staff row that should point at it
 * fails to save. Logged rather than thrown: the caller is already returning
 * an error, and an orphaned auth user with no staff row cannot sign in.
 */
export async function deleteLoginAccount(authUserId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) {
    console.error("[staff-accounts] rollback failed; orphaned auth user", authUserId, error);
  }
}

/**
 * Email for each auth user id. A lookup that fails maps to no entry, so the
 * Staff page still renders and shows "No email login" for that person —
 * logged, not swallowed.
 */
export async function getLoginEmails(authUserIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (authUserIds.length === 0) return emails;

  const supabase = createServerClient();
  const results = await Promise.all(
    authUserIds.map(async (id) => ({ id, res: await supabase.auth.admin.getUserById(id) }))
  );
  for (const { id, res } of results) {
    if (res.error) {
      console.error("[staff-accounts] email lookup failed", id, res.error);
      continue;
    }
    if (res.data.user?.email) emails.set(id, res.data.user.email);
  }
  return emails;
}
