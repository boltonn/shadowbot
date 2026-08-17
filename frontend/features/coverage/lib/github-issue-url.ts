// Mirrors the backend's build_coverage_issue_url (integrations/github.py) — GitHub's "new
// issue" form takes a prefill via query params, no API call needed.

const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "boltonn/shadowbot";
const COVERAGE_LABEL = "coverage-request";

export function buildCoverageIssueUrl(params: { place?: string; point?: { lon: number; lat: number } }): string {
  const { place, point } = params;
  const title = place ? `Add routing coverage: ${place}` : "Add routing coverage";
  const bodyLines = ["Requesting fast, pre-compiled Valhalla routing coverage for:", `- Place: ${place || "unspecified"}`];
  if (point) {
    bodyLines.push(`- Coordinates: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
  }

  const search = new URLSearchParams({ title, body: bodyLines.join("\n"), labels: COVERAGE_LABEL });
  return `https://github.com/${GITHUB_REPO}/issues/new?${search.toString()}`;
}
