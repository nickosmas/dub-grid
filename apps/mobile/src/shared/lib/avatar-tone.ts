export type AvatarTone = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarTone(seed: string): AvatarTone {
  const hue = hashCode(seed) % 360;
  return {
    backgroundColor: `hsl(${hue}, 70%, 92%)`,
    borderColor: `hsl(${hue}, 70%, 85%)`,
    color: `hsl(${hue}, 70%, 35%)`,
  };
}
