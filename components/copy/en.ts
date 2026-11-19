// The UI's words in English, the reference every other language is typed against (conventions: code/language). Components take their
// words from here through copyFor(lang) or useCopy(), never text of their own.
export const en = {
  app: {
    name: "upload",
    description: "Where 3dbruckner.de's prints are put in.",
  },
  language: {
    label: "Language",
    names: { en: "English", de: "Deutsch" },
  },
  home: {
    title: "Prints",
    empty: "Nothing here yet.",
  },
  notFound: {
    title: "Not found",
    text: "There is nothing at this address.",
    back: "To the prints",
  },
};

export type Copy = typeof en;
