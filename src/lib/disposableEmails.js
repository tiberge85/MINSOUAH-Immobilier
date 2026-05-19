// Disposable / temporary email domain blocklist.
// Used as a fast first gate — Abstract API (if configured) runs a deeper check.
const DISPOSABLE = new Set([
  // ── Guerrilla Mail family ─────────────────────────────────────────────────
  'guerrillamail.com','guerrillamail.de','guerrillamail.info',
  'guerrillamail.org','guerrillamail.net','guerrillamail.biz',
  'guerrillamailblock.com','sharklasers.com','grr.la','spam4.me',
  // ── Yopmail family ────────────────────────────────────────────────────────
  'yopmail.com','yopmail.fr','yopmail.pp.ua','cool.fr.nf','jetable.fr.nf',
  'courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  // ── Mailinator family ─────────────────────────────────────────────────────
  'mailinator.com','mailinator.net','mailinator.org','mailinator2.com',
  'maillinator.com','notmailinator.com','tmailinator.com','suremail.info',
  // ── Trashmail family ─────────────────────────────────────────────────────
  'trashmail.com','trashmail.me','trashmail.net','trashmail.at',
  'trashmail.io','trashmail.gq','trashmail.xyz','trashmailer.com',
  'trashemail.de','trashdevil.com','trashdevil.de','trash-mail.com',
  'trash-mail.de','trash-mail.ga','trash-amil.com',
  // ── 10minutemail family ───────────────────────────────────────────────────
  '10minutemail.com','10minutemail.net','10minutemail.org',
  '10minutemail.de','10minutemail.co.za','10min.email',
  '20minutemail.com','minuteinbox.com',
  // ── Temp-mail family ─────────────────────────────────────────────────────
  'temp-mail.org','temp-mail.io','temp-mail.ru',
  'tempmail.com','tempmail.net','tempmail.org',
  'tempmail.de','tempmail.eu','tempmail.it','tempmail2.com',
  'tempr.email','tempemail.com','tempemail.net','tempemail.co.za',
  'tempi.email','tempimail.com','tempinbox.com','tempinbox.co.uk',
  'tempthe.net','tempymail.com','mytemp.email','mytempemail.com',
  'tempalias.com','tempe-mail.com','tempail.com','mail-temp.com',
  'email-temp.com','temporaryemail.com','temporaryemail.net',
  'temporarymail.gq','temporarymail.net','temporarymail.us',
  'temporaryforwarding.com','temporaryinbox.com',
  'temporarioemail.com.br','emailtemporaire.com',
  'emailtemporaire.fr','emailtemporar.com',
  // ── Throwaway family ─────────────────────────────────────────────────────
  'throwaway.email','throwam.com','throam.com',
  // ── Discard / disposable generic ─────────────────────────────────────────
  'dispostable.com','discard.email','discardmail.com','discardmail.de',
  'disposableaddress.com','disposableinbox.com','disposablemail.com',
  'maildrop.cc','mailnesia.com','mailnull.com','mailnull.net',
  'fakeinbox.com','fakeinbox.info','fakemail.fr','fakemailz.com',
  'mailscrap.com','mailexpire.com','mailsac.com','inboxbear.com',
  'getnada.com','getairmail.com',
  // ── SpamGourmet / SpamFree family ─────────────────────────────────────────
  'spamgourmet.com','spamgourmet.net','spamgourmet.org',
  'spamfree24.org','spamfree.eu','spamoff.de',
  'spamherelots.com','spamhereplease.com',
  'spambox.us','spambox.info','spamhole.com',
  'spamthisplease.com','spamtrap.ro','spamtraps.net',
  'spamty.eu','spamstack.net','spamslicer.com',
  'spamspot.com','spammotel.com','spamkill.info',
  'spaml.com','spaml.de','spam.la','spam.su',
  'spaminator.de','spamify.com','spamgrav.com',
  'spamcero.com','spamcon.org','spamcorptastic.com',
  'spamcowboy.com','spamcowboy.net','spamcowboy.org',
  'spamday.com','spamdecoy.net','spameater.com','spamex.com',
  'spambob.com','spambob.net','spambob.org',
  'spamcannon.com','spamcannon.net',
  // ── Mailtome / Wegwerf (German disposables) ───────────────────────────────
  'wegwerfadresse.de','wegwerfadressse.de','wegwerfemail.de',
  'wegwerfemail.net','wegwerfemail.org','wegwerfmail.de',
  'wegwerfmail.info','wegwerfmail.net','wegwerfmail.org',
  'maileimer.de','mailsucker.net','muell.email','nwldx.com',
  'zehnminuten.de','zehnminutenmail.de','einrot.com',
  'meinspamschutz.de','schutzmaileu.de','sofort-mail.de',
  'meltmail.com','messagebeamer.de','smashmail.de',
  'sneakmail.de','delikkt.de','trsw.de','dontsendmespam.de',
  'anon-mail.de','antispam.de','antispam24.de',
  // ── Self-destruct / burn-after-reading ────────────────────────────────────
  'selfdestructingmail.com','willselfdestruct.com',
  'burnthespam.info','burn.email',
  // ── Misc well-known services ──────────────────────────────────────────────
  'binkmail.com','bobmail.info','filzmail.com','jnxjn.com',
  'kurzepost.de','mailin8r.com','mailme.lv',
  'mintemail.com','mt2009.com','mt2014.com',
  'obobbo.com','pookmail.com','sco.lt',
  'tafmail.com','tempomail.fr','trbvm.com','trbvn.com',
  'yapped.net','zoemail.net','zoemail.org','mailseal.de',
  'dispostable.com','maildrop.cc',
  'jetable.net','jetable.org','jetable.pp.ua','jetable.com',
  'recursor.net','recyclemail.dk','regbypass.com','rejectmail.com',
  'mailcat.biz','mailcatch.com','maileater.com','mailfa.tk',
  'mailfreeonline.com','mailguard.me','mailimate.com',
  'mailincubator.com','mailismagic.com','mailme.gq','mailme.ir',
  'mailme24.com','mailmetrash.com','mailmoat.com','mailnew.com',
  'mailorg.org','mailpick.biz','mailproxsy.com','mailquack.com',
  'mailrock.biz','mailshell.com','mailshuttle.com',
  'mailslapping.com','mailslite.com','mailtemp.info','mailtemp.net',
  'mailtemporaire.com','mailtemporaire.fr','mailtome.de',
  'mailtothis.com','mailzilla.com','mailzilla.org',
  'mohmal.com','mailbidon.com','mailbucket.org',
  'mailblocks.com','mailblocks.us',
  // ── More random disposables ────────────────────────────────────────────────
  'clrmail.com','dayrep.com','devnullmail.com','dodgeit.com',
  'dodgit.com','dodgit.org','domozmail.com','dontreg.com',
  'drdrb.com','drdrb.net','dump-email.info','dumpmail.de',
  'dumpyemail.com','e4ward.com','emaildienst.de','emailgo.de',
  'emailias.com','emailinfive.com','emailmiser.com',
  'emz.net','ephemail.net','etranquil.com','etranquil.net',
  'etranquil.org','explodemail.com','eyepaste.com',
  'fastacura.com','fastchevy.com','fastnissan.com',
  'fivemail.de','fixmail.tk','fleckens.hu','frapmail.com',
  'freemail.ms','fuckingduh.com','fudgerub.com','garliclife.com',
  'get1mail.com','get2mail.fr','getonemail.com','gishpuppy.com',
  'givmail.com','glitch.sx','guestnote.com','gustr.com',
  'hatespam.org','hmamail.com','hopemail.biz','hulapla.de',
  'ieatspam.eu','ieatspam.info','ignoremail.com','ihasapc.com',
  'imails.info','inoutmail.de','inoutmail.eu','inoutmail.info',
  'inoutmail.net','intempmail.com','iroid.com','it2mail.com',
  'iwi.net','jourrapide.com','jupimail.com','kasmail.com',
  'kaspop.com','killmail.com','killmail.net','kir.ch.tc',
  'klassmaster.com','klassmaster.net','klassmaster.ru','klzlk.com',
  'koszmail.pl','kozow.com','laoeq.com','letthemeatspam.com',
  'lhsdv.com','lifebyfood.com','link2mail.net','litedrop.com',
  'loh.pp.ua','lortemail.dk','mailbidon.com',
  'makemetheking.com','manybrain.com','mcache.net',
  'mierdamail.com','moburl.com','myspamless.com',
  'netzidiot.de','noblepioneer.com','nodezines.com',
  'nogmailspam.info','nomail.pw','nomail.xl.cx','nomail2me.com',
  'nomorespamemails.com','nonspam.eu','nonspammer.de',
  'null.net','ogosms.com','onewaymail.com','oopi.org',
  'opayq.com','opentrash.com','orgmbx.cc',
  'owlpic.com','passinbox.com','pimpedupmyspace.com',
  'plexolan.de','pjjkp.com','plsnomail.com','pmmail.com',
  'pojok.ml','poofy.org','pop3.xyz','postinbox.com',
  'postpro.net','privy-mail.com','privy-mail.de','proxymail.eu',
  'prtnx.com','prtz.eu','punkass.com',
  'razemail.com','recode.me','rklips.com','rklips.org',
  'rkomo.com','rmqkr.net','ro.lt','rppkn.com','rtrtr.com',
  's0ny.net','safetymail.info','safetypost.de','sanctorum.us',
  'saynotospams.com','secure-mail.biz','sendspamhere.com',
  'shieldedmail.com','shiftmail.com','shitmail.me','shitmail.org',
  'shitware.nl','shortmail.net','sibmail.com','slipry.net',
  'slopsbox.com','slushmail.com','smellfear.com','sminkymail.com',
  'snakemail.com','sneakemail.com','snkmail.com','sofimail.com',
  'sogetthis.com','sohai.ml','speed.1s.fr','spikio.com',
  'sraka.xyz','ssoia.com','stopspam.org','stuffmail.de',
  'svk.jp','sweetxxx.de','tagyourself.com','tailsunder.com',
  'tdeos.com','tempalias.com','tinyurl83.com','tittbit.in',
  'tizi.com','toiea.com','tokem.co','toomail.biz',
  'tr.voila.fr','tradermail.info','trickmail.net',
  'truckermen.com','ttirv.com','ttirv.net','ttymail.com',
  'turual.com','twinmail.de','tycoonmail.com','tyldd.com',
  'uglyapp.com','uroid.com','urqex.com','us.af',
  'venompen.com','veryrealemail.com','viditag.com',
  'viewcastmedia.com','viewcastmedia.net','viewcastmedia.org',
  'vkcode.ru','vomoto.com','vpn.st','vsimcard.com','vubby.com',
  'walala.org','walkmail.net','walkmail.ru','wallm.com',
  'webemail.me','whyspam.me','wickmail.net',
  'willhackforfood.biz','winemaven.info','wkdl.com',
  'wolfmail.ml','wolfsmail.tk','wox.cc','wuzupmail.net',
  'xagloo.com','xemaps.com','xents.com','xmaily.com',
  'xoxy.net','xyzfree.net','yert.ye.vc','yogamaven.com',
  'ypmail.webarnak.fr.eu.org','yuurok.com','z1p.biz',
  'za.com','zebins.com','zebins.eu','zetmail.com',
  'zippymail.info','zsero.com','zxcv.com','zxcvbnm.com',
  'zymuying.com','zzz.com','1pad.de','avenuemail.in',
  'bugmenot.com','nomail.com','nomail.fr',
  // ── Common "test" inputs ──────────────────────────────────────────────────
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

// Full async validation: static blocklist + optional Abstract API check.
// Returns { valid: boolean, reason?: 'disposable' | 'undeliverable' | 'format' }
// Fails open on API errors so a network hiccup never blocks legitimate users.
export async function validateEmailFull(email) {
  if (!email || !email.includes('@')) return { valid: false, reason: 'format' };

  // 1. Static blocklist (instant, zero cost)
  if (isDisposableEmail(email)) {
    return { valid: false, reason: 'disposable' };
  }

  // 2. Abstract API (only when VITE_ABSTRACT_API_KEY is set)
  const apiKey = import.meta.env.VITE_ABSTRACT_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.is_disposable_email?.value === true) {
          return { valid: false, reason: 'disposable' };
        }
        if (data.deliverability === 'UNDELIVERABLE') {
          return { valid: false, reason: 'undeliverable' };
        }
      }
    } catch {
      // API unreachable — fail open so legitimate users aren't blocked
    }
  }

  return { valid: true };
}
