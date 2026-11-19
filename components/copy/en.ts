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
  photos: {
    signedOut: "Please sign in first.",
    noPrint: "This print doesn't exist (any more).",
    noFile: "No photo came with the upload.",
    notAccepted: "Please upload it as a JPEG",
    unreadable: "This photo can't be read. Please upload it as a JPEG",
    tooLarge: "This photo is too large.",
    incomplete: "The photo didn't arrive completely. Please try again.",
  },
  notFound: {
    title: "Not found",
    text: "There is nothing at this address.",
    back: "To the prints",
  },
};

export type Copy = typeof en;
