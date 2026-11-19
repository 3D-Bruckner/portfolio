// Photos picked on the prints list ("Start with photos") waiting for the new draft's page: the list makes the draft, puts the files here
// and opens the page, whose PhotoUploader takes them (with its progress and retry). Module memory of the browser tab, which survives the
// app's own navigation; a reload in between only loses the waiting photos, never the draft.
const waiting = new Map<string, File[]>();

export function handOver(printId: string, files: File[]): void {
  waiting.set(printId, files);
}

export function takeOver(printId: string): File[] {
  const files = waiting.get(printId) ?? [];
  waiting.delete(printId);
  return files;
}
