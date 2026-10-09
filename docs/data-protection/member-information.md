# Telling members their data goes into Ricambi

**This is the obligation most likely to be missed, because it falls on the Club and not on the
platform.** Ricambi never collects a roster from a member: an Administrator types it in or
imports the Club's own list. The member did not hand their name to Ricambi and may not know it
is there. They have to be told — at the latest when the data is first used to write to them,
which is the invitation (Art. 13 and 14 GDPR).

A draft for the association to adopt — see [README](README.md). The wording below is for the
Club to reuse; replace the placeholders, and check the periods against the running system's
privacy statement, which is the authority for them.

## When to use it

1. **On the membership form**, paper or online, for anyone joining from now on.
2. **With the renewal notice**, once, for everybody who joined before the platform existed.
3. **Before the first roster import** — a one-off message to all current members if neither of
   the above reaches them first.

The invitation e-mail Ricambi sends is not a substitute: by the time it arrives the data is
already in.

## What goes into the platform

Three things, and the wording says so because it is true: the roster import reads a **name**,
an **e-mail address** and the **date the Membership is paid through**, and ignores every other
column. Do not promise less, and do not let the list of what is transferred grow without
changing this text.

## For the membership form — German

The Club's own papers are German; this is the Club's text, not the platform's.

> **Mitgliederbereich „Ricambi“**
>
> Als Mitglied erhalten Sie Zugang zu Ricambi, dem Ersatzteilarchiv des Vereins unter
> `<RICAMBI_URL>`. Dafür übertragen wir Ihren Namen, Ihre E-Mail-Adresse und das Datum, bis zu
> dem Ihr Mitgliedsbeitrag bezahlt ist, in dieses System. Weitere Angaben aus der
> Mitgliederverwaltung werden nicht übertragen. Sie erhalten per E-Mail eine Einladung, mit der
> Sie selbst ein Passwort festlegen.
>
> Verantwortlich ist `<CLUB>`, `<CLUB_ADDRESS>`. Die Verarbeitung dient der Durchführung Ihrer
> Mitgliedschaft (Art. 6 Abs. 1 lit. b DSGVO). Das System wird in unserem Auftrag von
> Dienstleistern in der EU betrieben, die in der Datenschutzerklärung genannt sind.
>
> Endet Ihre Mitgliedschaft, wird Ihr Zugang gesperrt und Ihr Konto nach `<RETENTION_YEARS>`
> Jahren automatisch gelöscht; auf Wunsch löschen wir es sofort. Beiträge, die Sie im Archiv
> veröffentlicht haben, bleiben erhalten und erscheinen dann ohne Ihren Namen. Aufzeichnungen
> über gezahlte Mitgliedsbeiträge bewahren wir wegen der gesetzlichen Aufbewahrungspflichten
> `<PAYMENT_RECORD_RETENTION_YEARS>` Jahre auf.
>
> Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und
> Datenübertragbarkeit sowie das Recht, sich bei einer Datenschutzaufsichtsbehörde zu
> beschweren. Ansprechpartner: `<DATA_PROTECTION_CONTACT>`, `<DATA_PROTECTION_EMAIL>`. Die
> vollständige Datenschutzerklärung finden Sie unter `<RICAMBI_URL>/privacy`.

## For the membership form — English

> **The members' archive, "Ricambi"**
>
> As a member you have access to Ricambi, the Club's parts archive, at `<RICAMBI_URL>`. To give
> you that access we enter your name, your e-mail address and the date your membership fee is
> paid through into that system. Nothing else from our membership records is transferred. You
> will receive an invitation by e-mail and choose your own password.
>
> The controller is `<CLUB>`, `<CLUB_ADDRESS>`. The data is processed to carry out your
> membership (Art. 6(1)(b) GDPR). The system is run on our behalf by service providers in the
> EU, who are named in the privacy statement.
>
> When your membership ends your access stops, and your account is deleted automatically after
> `<RETENTION_YEARS>` years; on request we delete it at once. Contributions you have published
> in the archive are kept and then appear without your name. Records of membership fees paid
> are kept for `<PAYMENT_RECORD_RETENTION_YEARS>` years, as the law on accounting records
> requires.
>
> You have the right to access, rectification, erasure, restriction of processing and data
> portability, and the right to complain to a data-protection supervisory authority. Contact:
> `<DATA_PROTECTION_CONTACT>`, `<DATA_PROTECTION_EMAIL>`. The full privacy statement is at
> `<RICAMBI_URL>/privacy`.

## For existing members, with the renewal notice

> Neu: Der Verein stellt seinen Mitgliedern das Ersatzteilarchiv „Ricambi“ zur Verfügung. Damit
> Sie Zugang erhalten, übertragen wir Ihren Namen, Ihre E-Mail-Adresse und das Datum, bis zu dem
> Ihr Beitrag bezahlt ist, in dieses System — sonst nichts. Wenn Sie das nicht möchten, genügt
> eine Nachricht an `<CLUB_OFFICE_EMAIL>` vor dem `<IMPORT_DATE>`; Sie erhalten dann keinen
> Zugang, Ihre Mitgliedschaft bleibt davon unberührt. Einzelheiten: `<RICAMBI_URL>/privacy`.

> New: the Club is making its parts archive, "Ricambi", available to members. To give you
> access we enter your name, your e-mail address and the date your fee is paid through into
> that system — nothing else. If you would rather we did not, a message to
> `<CLUB_OFFICE_EMAIL>` before `<IMPORT_DATE>` is enough; you will then have no access, and your
> membership is otherwise unaffected. Details: `<RICAMBI_URL>/privacy`.

Somebody who says no is left out of the file that is imported. Nothing in Ricambi needs to
know they exist.
