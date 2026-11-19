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
  notFound: {
    title: "Nicht gefunden",
    text: "Unter dieser Adresse gibt es nichts.",
    back: "Zu den Drucken",
  },
};
