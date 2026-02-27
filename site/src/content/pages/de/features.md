---
title: Funktionen
subtitle: Alles, was eine Krisenreaktionsplattform braucht, in einem Open-Source-Paket. Sprache, SMS, WhatsApp, Signal und verschluesselte Berichte -- gebaut auf Cloudflare Workers ohne Server zu verwalten.
---

## Multi-Anbieter-Telefonie

**5 Sprachanbieter** -- Waehlen Sie aus Twilio, SignalWire, Vonage, Plivo oder selbst gehostetem Asterisk. Konfigurieren Sie Ihren Anbieter in der Admin-Oberflaeche oder waehrend des Einrichtungsassistenten. Wechseln Sie den Anbieter jederzeit ohne Codeaenderungen.

**WebRTC-Browseranrufe** -- Freiwillige koennen Anrufe direkt im Browser ohne Telefon entgegennehmen. Anbieterspezifische WebRTC-Token-Generierung fuer Twilio, SignalWire, Vonage und Plivo. Konfigurierbare Anrufpraeferenz pro Freiwilligem (Telefon, Browser oder beides).

## Anrufweiterleitung

**Paralleles Klingeln** -- Wenn ein Anrufer anruft, klingeln alle diensthabenden, nicht besetzten Freiwilligen gleichzeitig. Der erste Freiwillige, der abnimmt, erhaelt den Anruf; das Klingeln bei den anderen stoppt sofort.

**Schichtbasierte Planung** -- Erstellen Sie wiederkehrende Schichten mit bestimmten Tagen und Zeitbereichen. Weisen Sie Freiwillige Schichten zu. Das System leitet Anrufe automatisch an die Diensthabenden weiter.

**Warteschlange mit Wartemusik** -- Wenn alle Freiwilligen besetzt sind, kommen Anrufer in eine Warteschlange mit konfigurierbarer Wartemusik. Die Wartezeit ist einstellbar (30-300 Sekunden). Wenn niemand antwortet, werden Anrufe an die Mailbox weitergeleitet.

**Mailbox-Fallback** -- Anrufer koennen eine Sprachnachricht (bis zu 5 Minuten) hinterlassen, wenn kein Freiwilliger antwortet. Sprachnachrichten werden via Whisper AI transkribiert und fuer die Admin-Pruefung verschluesselt.

## Verschluesselte Notizen

**Ende-zu-Ende-verschluesselte Notizen** -- Freiwillige schreiben Notizen waehrend und nach Anrufen. Notizen werden client-seitig mit ECIES (secp256k1 + XChaCha20-Poly1305) verschluesselt, bevor sie den Browser verlassen. Der Server speichert nur Chiffretext.

**Doppelte Verschluesselung** -- Jede Notiz wird zweimal verschluesselt: einmal fuer den Freiwilligen, der sie geschrieben hat, und einmal fuer den Administrator. Beide koennen unabhaengig entschluesseln. Niemand sonst kann den Inhalt lesen.

**Benutzerdefinierte Felder** -- Administratoren definieren benutzerdefinierte Felder fuer Notizen: Text, Zahl, Auswahl, Checkbox, Textbereich. Felder werden zusammen mit dem Notizinhalt verschluesselt.

**Entwurfs-Autospeicherung** -- Notizen werden automatisch als verschluesselte Entwuerfe im Browser gespeichert. Wenn die Seite neu laedt oder der Freiwillige wegnavigiert, bleibt die Arbeit erhalten. Entwuerfe werden beim Abmelden geloescht.

## KI-Transkription

**Whisper-gesteuerte Transkription** -- Anrufaufnahmen werden mit Cloudflare Workers AI und dem Whisper-Modell transkribiert. Die Transkription erfolgt serverseitig, dann wird das Transkript vor der Speicherung verschluesselt.

**Steuerungsmoeglickeiten** -- Der Administrator kann die Transkription global aktivieren/deaktivieren. Freiwillige koennen sie individuell abschalten. Beide Steuerungen sind unabhaengig.

**Verschluesselte Transkripte** -- Transkripte verwenden dieselbe ECIES-Verschluesselung wie Notizen. Gespeichert wird nur Chiffretext.

## Spam-Mitigierung

**Sprach-CAPTCHA** -- Optionale Sprach-Bot-Erkennung: Anrufer hoeren eine zufaellige 4-stellige Zahl und muessen sie auf der Tastatur eingeben. Blockiert automatisierte Anrufe, waehrend es fuer echte Anrufer zugaenglich bleibt.

**Rate-Limiting** -- Gleitfenster-Rate-Limiting pro Telefonnummer, persistiert im Durable Object-Speicher. Ueberlebt Worker-Neustarts. Konfigurierbare Schwellenwerte.

**Echtzeit-Sperrlisten** -- Administratoren verwalten Telefonnummer-Sperrlisten mit Einzeleintrag oder Massenimport. Sperren werden sofort wirksam. Gesperrte Anrufer hoeren eine Ablehnungsnachricht.

**Benutzerdefinierte IVR-Ansagen** -- Nehmen Sie benutzerdefinierte Sprachansagen fuer jede unterstuetzte Sprache auf. Das System verwendet Ihre Aufnahmen fuer IVR-Ablaeufe und faellt auf Text-zu-Sprache zurueck, wenn keine Aufnahme existiert.

## Mehrkanaliges Messaging

**SMS** -- Ein- und ausgehende SMS-Nachrichten ueber Twilio, SignalWire, Vonage oder Plivo. Auto-Antwort mit konfigurierbaren Willkommensnachrichten. Nachrichten fliessen in die Konversationsansicht mit Verlauf.

**WhatsApp Business** -- Verbindung ueber die Meta Cloud API (Graph API v21.0). Vorlagennachricht-Unterstuetzung fuer das Initiieren von Konversationen innerhalb des 24-Stunden-Nachrichtenfensters. Mediennachricht-Unterstuetzung fuer Bilder, Dokumente und Audio.

**Signal** -- Datenschutzorientiertes Messaging ueber eine selbst gehostete signal-cli-rest-api-Bridge. Gesundheitsueberwachung mit Graceful Degradation. Sprachnachricht-Transkription via Workers AI Whisper.

**Konversationen mit Verlauf** -- Alle Nachrichtenkanaele fliessen in eine einheitliche Konversationsansicht. Nachrichtenblasen mit Zeitstempeln und Richtungsanzeigern. Echtzeit-Updates via WebSocket.

## Verschluesselte Berichte

**Berichterstatter-Rolle** -- Eine dedizierte Rolle fuer Personen, die Hinweise oder Berichte einreichen. Berichterstatter sehen eine vereinfachte Oberflaeche mit nur Berichten und Hilfe. Eingeladen ueber denselben Ablauf wie Freiwillige, mit Rollenauswahl.

**Verschluesselte Einreichungen** -- Der Berichtsinhalt wird mit ECIES verschluesselt, bevor er den Browser verlaesst. Klartext-Titel fuer Triage, verschluesselter Inhalt fuer Datenschutz. Dateianbhaenge werden separat verschluesselt.

**Berichts-Workflow** -- Kategorien zum Organisieren von Berichten. Statusverfolgung (offen, beansprucht, geloest). Administratoren koennen Berichte beanspruchen und mit verschluesselten Antworten im Verlauf reagieren.

## Admin-Dashboard

**Einrichtungsassistent** -- Gefuehrte mehrstufige Einrichtung bei der ersten Admin-Anmeldung. Waehlen Sie, welche Kanaele aktiviert werden sollen (Sprache, SMS, WhatsApp, Signal, Berichte), konfigurieren Sie Anbieter und legen Sie Ihren Hotline-Namen fest.

**Erste-Schritte-Checkliste** -- Dashboard-Widget, das den Einrichtungsfortschritt verfolgt: Kanalkonfiguration, Freiwilligen-Onboarding, Schichterstellung.

**Echtzeit-Monitoring** -- Sehen Sie aktive Anrufe, wartende Anrufer, Konversationen und Freiwilligen-Status in Echtzeit via WebSocket. Metriken werden sofort aktualisiert.

**Freiwilligenverwaltung** -- Fuegen Sie Freiwillige mit generierten Schluesselpaaren hinzu, verwalten Sie Rollen (Freiwilliger, Administrator, Berichterstatter), sehen Sie den Online-Status. Einladungslinks fuer Selbstregistrierung mit Rollenauswahl.

**Audit-Protokollierung** -- Jeder entgegengenommene Anruf, jede erstellte Notiz, gesendete Nachricht, eingereichte Bericht, geaenderte Einstellung und Admin-Aktion wird protokolliert. Paginierter Betrachter fuer Administratoren.

**Anrufverlauf** -- Durchsuchbarer, filterbarer Anrufverlauf mit Datumsbereichen, Telefonnummernsuche und Freiwilligenzuweisung. DSGVO-konformer Datenexport.

**In-App-Hilfe** -- FAQ-Abschnitte, rollenspezifische Anleitungen, Schnellreferenzkarten fuer Tastenkuerzel und Sicherheit. Zugaenglich ueber die Seitenleiste und die Befehlspalette.

## Freiwilligen-Erfahrung

**Befehlspalette** -- Druecken Sie Strg+K (oder Cmd+K auf Mac) fuer sofortigen Zugriff auf Navigation, Suche, schnelle Notizerstellung und Themenwechsel. Admin-exklusive Befehle werden nach Rolle gefiltert.

**Echtzeit-Benachrichtigungen** -- Eingehende Anrufe loesen einen Browser-Klingelton, Push-Benachrichtigung und blinkenden Tab-Titel aus. Schalten Sie jeden Benachrichtigungstyp unabhaengig in den Einstellungen ein oder aus.

**Freiwilligen-Praesenz** -- Administratoren sehen Echtzeit-Zaehler fuer Online-, Offline- und Pause-Freiwillige. Freiwillige koennen einen Pause-Schalter in der Seitenleiste umschalten, um eingehende Anrufe zu pausieren, ohne ihre Schicht zu verlassen.

**Tastenkuerzel** -- Druecken Sie ? um alle verfuegbaren Kuerzel zu sehen. Navigieren Sie zwischen Seiten, oeffnen Sie die Befehlspalette und fuehren Sie gaengige Aktionen aus, ohne die Maus zu beruehren.

**Notiz-Entwurfs-Autospeicherung** -- Notizen werden automatisch als verschluesselte Entwuerfe im Browser gespeichert. Wenn die Seite neu laedt oder der Freiwillige wegnavigiert, bleibt die Arbeit erhalten. Entwuerfe werden beim Abmelden aus dem localStorage geloescht.

**Verschluesselter Datenexport** -- Exportieren Sie Notizen als DSGVO-konforme verschluesselte Datei (.enc) mit dem Schluessel des Freiwilligen. Nur der urspruengliche Autor kann den Export entschluesseln.

**Dunkle/helle Themen** -- Wechseln Sie zwischen dunklem Modus, hellem Modus oder folgen Sie dem Systemthema. Praeferenz wird pro Sitzung gespeichert.

## Mehrsprachigkeit und Mobil

**12+ Sprachen** -- Vollstaendige UI-Uebersetzungen: Englisch, Spanisch, Chinesisch, Tagalog, Vietnamesisch, Arabisch, Franzoesisch, Haitianisches Kreol, Koreanisch, Russisch, Hindi, Portugiesisch und Deutsch. RTL-Unterstuetzung fuer Arabisch.

**Progressive Web App** -- Installierbar auf jedem Geraet ueber den Browser. Service Worker cached die App-Shell fuer den Offline-Start. Push-Benachrichtigungen fuer eingehende Anrufe.

**Mobile-First-Design** -- Responsives Layout, gebaut fuer Telefone und Tablets. Einklappbare Seitenleiste, beruehrungsfreundliche Steuerelemente und adaptive Layouts.

## Authentifizierung und Schluesselverwaltung

**PIN-geschuetzter lokaler Schluesselspeicher** -- Ihr geheimer Schluessel wird mit einer 6-stelligen PIN verschluesselt, unter Verwendung von PBKDF2 (600.000 Iterationen) + XChaCha20-Poly1305. Der rohe Schluessel beruehrt niemals sessionStorage oder irgendeine Browser-API -- er lebt nur in einem In-Memory-Closure, das beim Sperren genullt wird.

**Auto-Sperre** -- Der Schluesselmanager sperrt automatisch nach Inaktivitaets-Timeout oder wenn der Browser-Tab ausgeblendet wird. Geben Sie Ihre PIN erneut ein, um zu entsperren. Konfigurierbare Inaktivitaetsdauer.

**Geraeteverknuepfung** -- Richten Sie neue Geraete ein, ohne jemals Ihren geheimen Schluessel preiszugeben. Scannen Sie einen QR-Code oder geben Sie einen kurzen Bereitstellungscode ein. Verwendet ephemeren ECDH-Schluesselaustausch, um Ihr verschluesseltes Schluesselmaterial sicher zwischen Geraeten zu uebertragen. Bereitstellungsraeume laufen nach 5 Minuten ab.

**Wiederherstellungsschluessel** -- Waehrend des Onboardings erhalten Sie einen Wiederherstellungsschluessel im Base32-Format (128 Bit Entropie). Dies ersetzt den alten nsec-Anzeigeablauf. Obligatorischer verschluesselter Backup-Download, bevor Sie fortfahren koennen.

**Forward Secrecy pro Notiz** -- Jede Notiz wird mit einem einzigartigen Zufallsschluessel verschluesselt, der dann via ECIES fuer jeden autorisierten Leser umhuellt wird. Die Kompromittierung des Identitaetsschluessels offenbart keine vergangenen Notizen.

**Nostr-Schluesselpaar-Authentifizierung** -- Freiwillige authentifizieren sich mit Nostr-kompatiblen Schluesselpaaren (nsec/npub). BIP-340 Schnorr-Signaturverifikation. Keine Passwoerter, keine E-Mail-Adressen.

**WebAuthn-Passkeys** -- Optionale Passkey-Unterstuetzung fuer Multi-Geraete-Login. Registrieren Sie einen Hardware-Schluessel oder Biometrie, und melden Sie sich dann ohne Eingabe Ihres geheimen Schluessels an.

**Sitzungsverwaltung** -- Zweistufiges Zugriffsmodell: "authentifiziert aber gesperrt" (nur Session-Token) vs "authentifiziert und entsperrt" (PIN eingegeben, voller Krypto-Zugriff). 8-Stunden-Session-Tokens mit Inaktivitaetswarnungen.
