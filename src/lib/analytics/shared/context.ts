/**
 * Shared analytics page loader: workspace + actor + reporting period +
 * analytics service, resolved once per request. Every /analytics route
 * uses this — no page assembles its own access logic.
 */

import { getActorContext, type ActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization, type MembershipGrant } from "@/lib/authz/authz";
import { getPeriodContext, type PeriodOption } from "@/lib/period/server";
import { getWorkspaceContext, type WorkspaceContext } from "@/lib/workspace/server";
import { AnalyticsService } from "../queries/service";
import type { AnalyticsWindow } from "./types";

export type AnalyticsPageContext =
  | { state: "no_workspace" }
  | { state: "no_actor" }
  | { state: "denied" }
  | { state: "no_period"; workspace: WorkspaceContext; periodOptions: PeriodOption[] }
  | {
      state: "ready";
      workspace: WorkspaceContext;
      actor: ActorContext;
      memberships: MembershipGrant[];
      organizationId: string;
      organizationName: string;
      period: PeriodOption;
      window: AnalyticsWindow;
      service: AnalyticsService;
      can: (permission: Parameters<typeof hasPermissionInOrganization>[2]) => boolean;
    };

export async function loadAnalyticsContext(): Promise<AnalyticsPageContext> {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    return { state: "no_workspace" };
  }
  const organizationId = workspace.selection.organizationId;
  const actor = await getActorContext();
  if (!actor) return { state: "no_actor" };
  if (!hasPermissionInOrganization(workspace.memberships, organizationId, "analytics:read")) {
    return { state: "denied" };
  }
  const periodContext = await getPeriodContext(workspace);
  if (!periodContext.selected) {
    return {
      state: "no_period",
      workspace,
      periodOptions: periodContext.options,
    };
  }
  const serviceOrDenied = await AnalyticsService.create(actor, organizationId);
  if ("denied" in serviceOrDenied) return { state: "denied" };
  const service = serviceOrDenied;
  const window = service.periodWindow(periodContext.selected.id);
  if (!window) return { state: "no_period", workspace, periodOptions: periodContext.options };
  return {
    state: "ready",
    workspace,
    actor,
    memberships: workspace.memberships,
    organizationId,
    organizationName: workspace.selected?.name ?? "",
    period: periodContext.selected,
    window,
    service,
    can: (permission) =>
      hasPermissionInOrganization(workspace.memberships, organizationId, permission),
  };
}
