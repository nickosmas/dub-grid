/** Medium 20px initials in a 48px avatar, with a legible floor for tiny lock markers. */
export function getAvatarTypography(diameter: number) {
  return {
    fontSize: Math.max(9, Math.round((diameter * 20) / 48)),
    fontWeight: 500 as const,
    lineHeight: 1,
  };
}
