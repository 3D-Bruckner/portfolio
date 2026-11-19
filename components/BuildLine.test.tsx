import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BuildStatus } from "@/backend";
import { BuildLineSlot, lineStatus } from "./BuildLine";

/** Everything the stream has sent so far, without waiting for what is still suspended. */
async function firstChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

async function restOf(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = "";
  for (let r = await reader.read(); !r.done; r = await reader.read()) text += new TextDecoder().decode(r.value);
  return text;
}

describe("the build line", () => {
  it("buildLineNeverWaits: the page streams with a placeholder while GitHub hasn't answered, and the line follows", async () => {
    let answer!: (s: BuildStatus) => void;
    const status = new Promise<BuildStatus>((resolve) => (answer = resolve));
    const stream = await renderToReadableStream(
      // In a header, as the layout has it.
      <header>
        <BuildLineSlot lang="de" status={status} />
      </header>,
    );
    const reader = stream.getReader();
    // The shell is out although the status is still unknown: the page doesn't wait for it.
    expect(await firstChunk(reader)).toContain("Stand der Website wird abgefragt");
    answer({ pending: true });
    const rest = await restOf(reader);
    expect(rest).toContain("Website wird in Kürze aktualisiert");
  });

  it("failedStartSaysSo: a dispatch that failed (and is pending a retry) says it couldn't be started", async () => {
    const stream = await renderToReadableStream(<BuildLineSlot lang="de" status={Promise.resolve({ pending: true, lastError: "401" } as BuildStatus)} />);
    expect(await restOf(stream.getReader())).toContain("ließ sich nicht starten");
  });

  it("a status that fails to load can't reject: the line says it couldn't be read", async () => {
    const status = lineStatus(Promise.reject(new Error("database is locked")));
    await expect(status).resolves.toBeUndefined();
    const stream = await renderToReadableStream(<BuildLineSlot lang="en" status={status} />);
    expect(await restOf(stream.getReader())).toContain("The website&#x27;s state couldn&#x27;t be read");
  });
});
