import { describe, expect, it } from "vitest";
import { BEHAVIOR_MANIFEST, hash8 } from "@/src/ai/behaviorManifest";
import { describeToolCatalog } from "@/src/ai/tools/registry";

describe("behavior manifest", () => {
  it("hashes the same content consistently", () => {
    expect(hash8("same")).toBe(hash8("same"));
    expect(BEHAVIOR_MANIFEST.tools).toBe(hash8(describeToolCatalog()));
  });

  it("changes the tools hash when a description changes", () => {
    const catalog = describeToolCatalog();
    expect(hash8(catalog.replace("Creates a brand-new plan", "Creates a revised plan"))).not.toBe(BEHAVIOR_MANIFEST.tools);
  });
});
