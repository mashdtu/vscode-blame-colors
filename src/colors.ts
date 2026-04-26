export function authorHue(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++)
    h = (Math.imul(31, h) + email.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 360) + 60) % 360;
}
