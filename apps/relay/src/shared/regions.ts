export const SES_REGIONS = [
  { id: "ap-south-1", label: "Mumbai (ap-south-1)" },
  { id: "us-east-1", label: "N. Virginia (us-east-1)" },
] as const;
export type SesRegion = (typeof SES_REGIONS)[number]["id"];
export const SES_REGION_IDS = SES_REGIONS.map((r) => r.id) as [SesRegion, ...SesRegion[]];
export const isSesRegion = (region: string): region is SesRegion => SES_REGIONS.some((r) => r.id === region);
