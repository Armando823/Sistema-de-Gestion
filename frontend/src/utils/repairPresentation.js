export function statusClass(status) {
  return `status-${status.toLowerCase().replaceAll(" ", "-")}`;
}
