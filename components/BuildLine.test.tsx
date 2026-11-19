import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BuildStatus } from "@/backend";
import { BuildLineSlot } from "./BuildLine";

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
});
