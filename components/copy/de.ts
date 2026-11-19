// The UI's words in German, typed against the English module: a string missing here fails the typecheck.
import type { Copy } from "./en";

export const de: Copy = {
  app: {
    name: "upload",
    description: "Hier kommen die Drucke von 3dbruckner.de hinein.",
  },
  language: {
    label: "Sprache",
    names: { en: "English", de: "Deutsch" },
  },
  home: {
    title: "Drucke",
    empty: "Noch nichts da.",
  },
  photos: {
    signedOut: "Bitte zuerst anmelden.",
    noPrint: "Diesen Druck gibt es nicht (mehr).",
    noFile: "Mit dem Hochladen kam kein Foto an.",
    notAccepted: "Bitte als JPEG hochladen",
    unreadable: "Dieses Foto lässt sich nicht lesen. Bitte als JPEG hochladen",
    tooLarge: "Dieses Foto ist zu groß.",
    incomplete: "Das Foto kam nicht vollständig an. Bitte noch einmal versuchen.",
  },
  signIn: {
    title: "Anmelden",
    intro: "Anmelden können nur die Personen, die hier freigegeben sind.",
    email: "E-Mail-Adresse",
    sendCode: "Code zuschicken",
    sending: "Wird gesendet…",
    sent: (email: string) => `Wir haben einen Code und einen Link an ${email} geschickt. Öffne den Link oder gib den Code hier ein.`,
    code: "Code",
    checkCode: "Mit dem Code anmelden",
    otherAddress: "Andere Adresse verwenden",
    passkey: "Mit Passkey anmelden",
    viaProvider: (label: string) => `Mit ${label} anmelden`,
    or: "oder",
    failedSend: "Der Code ließ sich nicht verschicken. Bitte gleich noch einmal versuchen.",
    wrongCode: "Dieser Code stimmt nicht oder ist abgelaufen. Bitte einen neuen anfordern.",
    passkeyFailed: "Die Anmeldung mit Passkey hat nicht geklappt. Nimm einen Code oder versuche es noch einmal.",
    refused: {
      email_not_allowed: "Mit dieser Adresse kann man sich hier nicht anmelden.",
      email_not_verified: "Der Anbieter hat diese Adresse nicht bestätigt, deshalb kann sie nicht zum Anmelden dienen.",
      link: "Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Bitte einen neuen Code anfordern.",
      other: "Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen.",
      byProvider: (label: string) => `${label} hat die Anmeldung abgelehnt.`,
    },
  },
  consent: {
    title: "Zugriff erlauben?",
    unknownClient: "Eine App, die diese Instanz nicht kennt,",
    asks: (client: string, email: string) => `${client} möchte als ${email} handeln.`,
    recorded: "Was sie tut, wird in deinem Namen festgehalten, mit ihrem Namen.",
    allow: "Erlauben",
    deny: "Ablehnen",
    failed: "Das hat nicht geklappt. Fang in der App, die dich hierher geschickt hat, noch einmal an.",
  },
  mail: {
    subject: (code: string) => `${code} ist dein Anmeldecode für 3D Bruckner Upload`,
    body: (code: string, link: string | undefined) =>
      [
        `Dein Anmeldecode für 3D Bruckner Upload: ${code}`,
        ...(link ? ["", "Oder melde dich mit diesem Link an:", link] : []),
        "",
        "Code und Link gelten ein paar Minuten. Wenn du sie nicht angefordert hast, ignoriere diese Mail.",
      ].join("\n"),
  },
  notFound: {
    title: "Nicht gefunden",
    text: "Unter dieser Adresse gibt es nichts.",
    back: "Zu den Drucken",
  },
};
