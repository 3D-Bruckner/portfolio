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
  signIn: {
    title: "Sign in",
    intro: "Only the people this instance allows can sign in.",
    email: "Email address",
    sendCode: "Send me a code",
    sending: "Sending…",
    sent: (email: string) => `We sent a sign-in code to ${email}. Enter it here.`,
    code: "Code",
    checkCode: "Sign in with the code",
    otherAddress: "Use another address",
    passkey: "Sign in with a passkey",
    viaProvider: (label: string) => `Sign in with ${label}`,
    or: "or",
    failedSend: "The code couldn't be sent. Please try again in a moment.",
    wrongCode: "That code is wrong or has expired. Request a new one.",
    passkeyFailed: "Signing in with a passkey didn't work. Use a code instead, or try again.",
    providerFailed: (label: string) => `Signing in with ${label} didn't start. Please try again.`,
    refused: {
      email_not_allowed: "This address may not sign in here.",
      email_not_verified: "The provider didn't confirm this address, so it can't be used to sign in.",
      link: "This sign-in link has expired or was used already. Request a new code.",
      other: "Signing in didn't work. Please try again.",
      byProvider: (label: string) => `${label} refused the sign-in.`,
    },
  },
  consent: {
    title: "Allow access?",
    unknownClient: "An app this instance doesn't know",
    asks: (client: string, email: string) => `${client} wants to act as ${email}.`,
    recorded: "What it does is recorded in your name, with its name.",
    allow: "Allow",
    deny: "Deny",
    failed: "That didn't work. Start again from the app that sent you here.",
  },
  // The sign-in mail (next-app-kit's texts), in the language the page was in when the code was asked for.
  mail: {
    subject: (code: string) => `${code} is your sign-in code for 3D Bruckner Upload`,
    body: (code: string, link: string | undefined) =>
      [
        `Your sign-in code for 3D Bruckner Upload: ${code}`,
        ...(link ? ["", "Or sign in with this link:", link] : []),
        "",
        "The code and the link are valid for a few minutes. If you didn't ask for them, ignore this mail.",
      ].join("\n"),
  },
  notFound: {
    title: "Not found",
    text: "There is nothing at this address.",
    back: "To the prints",
  },
};

export type Copy = typeof en;
