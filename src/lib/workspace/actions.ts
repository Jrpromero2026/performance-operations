"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WORKSPACE_COOKIE } from "./constants";
import { resolveWorkspaceSelection, selectionToCookieValue } from "./resolver";
import { getWorkspaceContext } from "./server";

const switchSchema = z.object({
  workspace: z.string().min(1).max(100),
});

/**
 * Switch the active workspace.
 *
 * The requested value is untrusted: it is re-validated against the user's
 * server-loaded access before the cookie is written, so a forged ID can only
 * ever resolve back to a workspace the user is allowed to see.
 */
export async function switchWorkspace(formData: FormData): Promise<void> {
  const parsed = switchSchema.safeParse({
    workspace: formData.get("workspace"),
  });
  if (!parsed.success) return;

  const context = await getWorkspaceContext();
  const selection = resolveWorkspaceSelection(parsed.data.workspace, {
    organizationIds: context.options.map((o) => o.id),
    defaultOrganizationId: null,
    canAccessAll: context.canAccessAll,
  });

  const cookieValue = selectionToCookieValue(selection);
  const cookieStore = await cookies();
  if (cookieValue === null) {
    cookieStore.delete(WORKSPACE_COOKIE);
  } else {
    cookieStore.set(WORKSPACE_COOKIE, cookieValue, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath("/", "layout");
}
