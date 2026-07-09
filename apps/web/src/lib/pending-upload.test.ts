// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  stashPendingUploadFiles,
  subscribePendingUploadFiles,
  takePendingUploadFiles,
} from "./pending-upload";

function makeFile(name: string): File {
  return new File(["x"], name);
}

beforeEach(() => {
  takePendingUploadFiles();
});

describe("pending upload stash", () => {
  it("queues stashed files until they are taken, then clears", () => {
    stashPendingUploadFiles([makeFile("a.epub")]);
    stashPendingUploadFiles([makeFile("b.epub")]);

    const taken = takePendingUploadFiles();
    expect(taken.map((f) => f.name)).toEqual(["a.epub", "b.epub"]);
    expect(takePendingUploadFiles()).toEqual([]);
  });

  it("ignores empty stashes", () => {
    stashPendingUploadFiles([]);
    expect(takePendingUploadFiles()).toEqual([]);
  });

  it("delivers straight to a subscriber instead of queueing", () => {
    const received = vi.fn();
    const unsubscribe = subscribePendingUploadFiles(received);

    const file = makeFile("live.epub");
    stashPendingUploadFiles([file]);

    expect(received).toHaveBeenCalledWith([file]);
    expect(takePendingUploadFiles()).toEqual([]);
    unsubscribe();
  });

  it("queues again after the subscriber unsubscribes", () => {
    const received = vi.fn();
    const unsubscribe = subscribePendingUploadFiles(received);
    unsubscribe();

    stashPendingUploadFiles([makeFile("queued.epub")]);
    expect(received).not.toHaveBeenCalled();
    expect(takePendingUploadFiles().map((f) => f.name)).toEqual(["queued.epub"]);
  });

  it("keeps the newest subscriber when an old unsubscribe fires late", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribePendingUploadFiles(first);
    const unsubscribeSecond = subscribePendingUploadFiles(second);

    unsubscribeFirst(); // stale unsubscribe must not detach the newer subscriber

    stashPendingUploadFiles([makeFile("c.epub")]);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    unsubscribeSecond();
  });
});
