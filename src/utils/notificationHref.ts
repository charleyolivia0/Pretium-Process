export type NotificationRoutingFields = {
  link?: string | null;
  projectId?: string | null;
  bookingId?: string | null;
  incidentId?: string | null;
};

export function notificationHref(n: NotificationRoutingFields): string | undefined {
  const link = n.link?.trim();
  if (link) return link;
  if (n.projectId) {
    if (n.incidentId) return `/safety/project/${n.projectId}/incidents`;
    return `/projects/${n.projectId}`;
  }
  if (n.bookingId) return "/boardroom";
  return undefined;
}
