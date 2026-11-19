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
  notFound: {
    title: "Nicht gefunden",
    text: "Unter dieser Adresse gibt es nichts.",
    back: "Zu den Drucken",
  },
};
