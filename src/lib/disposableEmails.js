// Known disposable / temporary email domains.
// Not exhaustive — use as a best-effort gate alongside Firebase email verification.
const DISPOSABLE = new Set([
  // Most widely used services
  'mailinator.com','guerrillamail.com','guerrillamail.de','guerrillamail.info',
  'guerrillamail.org','guerrillamail.net','guerrillamail.biz',
  'yopmail.com','yopmail.fr','yopmail.pp.ua',
  'trashmail.com','trashmail.me','trashmail.net','trashmail.at','trashmail.io',
  'sharklasers.com','grr.la','spam4.me',
  'dispostable.com','maildrop.cc','discard.email',
  'fakeinbox.com','mailnesia.com','mailnull.com',
  'tempr.email','tempmail.net','tempmail.com','tempmail.org',
  'temp-mail.org','temp-mail.io','temp-mail.ru',
  'throwaway.email','throwam.com',
  '10minutemail.com','10minutemail.net','10minutemail.org','10minutemail.de','10min.email',
  'mailexpire.com','spambox.us','trashdevil.com','mailscrap.com',
  'mytrashmail.com','anon-mail.de','spamfree24.org',
  'jetable.fr.nf','jetable.net','jetable.org',
  'spamgourmet.com','spamherelots.com','spamhereplease.com',
  'binkmail.com','bobmail.info','filzmail.com','jnxjn.com',
  'kurzepost.de','mailin8r.com','mailme.lv',
  'mintemail.com','mt2009.com','mt2014.com','nwldx.com',
  'obobbo.com','pookmail.com','sco.lt',
  'tafmail.com','tempomail.fr','temporaryinbox.com',
  'trbvm.com','yapped.net',
  'zehnminuten.de','zehnminutenmail.de','zoemail.net',
  'mailsac.com','inboxbear.com',
  'getnada.com','getairmail.com',
  'spamoff.de','emailsensei.com',
  // Common "test" domains people type manually
  'test.com','test.fr','test.ci','test.net','test.org',
  'example.com','example.net','example.org',
  'fake.com','fake.fr','fakemail.com',
  'noemail.com','noemail.fr','nomail.com','nomail.fr',
]);

export function isDisposableEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.toLowerCase().split('@')[1];
  return DISPOSABLE.has(domain);
}
