const PEPPER = 'minsouah_v1:';

export async function hashPwd(plain) {
  if (!plain) return '';
  if (plain.startsWith('sha256:')) return plain;
  const data = new TextEncoder().encode(PEPPER + plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPwd(inputPlain, stored) {
  if (!stored || !inputPlain) return false;
  if (stored.startsWith('sha256:')) {
    return (await hashPwd(inputPlain)) === stored;
  }
  return inputPlain === stored;
}
