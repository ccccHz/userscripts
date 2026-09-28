import assert from "node:assert/strict";
import test from "node:test";

import {
  readAndValidateFeatureInventory,
  validateFeatureInventory,
} from "../scripts/validate-feature-inventory.mjs";

test("DouyuEx migration inventory is valid and contains the agreed scope", async () => {
  const { inventory, errors } = await readAndValidateFeatureInventory();
  assert.deepEqual(errors, []);
  const ids = inventory.features.map(({ id }) => id);
  assert.deepEqual(ids, [...new Set(ids)]);
  assert.deepEqual(ids, [
    "compact-player",
    "chat-layout",
    "chat-decoration-cleanup",
    "transient-guidance-cleanup",
    "room-metrics",
    "chat-memory",
    "message-context-action-fallback",
    "danmaku-send-check",
    "highest-video-quality",
    "auto-web-fullscreen",
    "control-center",
    "volume-wheel",
    "live-timeshift-controls",
    "disable-offline-jump",
    "danmaku-availability",
    "page-socket-hook",
    "bag-info",
    "daily-sign-in",
  ]);
  assert.ok(inventory.baselinePolicy);
  assert.equal(inventory.experienceProfiles[0].id, "simplified-mode");
  assert.deepEqual(inventory.experienceProfiles[0].featureIds, [
    "compact-player",
    "chat-decoration-cleanup",
    "chat-layout",
    "transient-guidance-cleanup",
    "room-metrics",
  ]);
  assert.deepEqual(inventory.experienceProfiles[1].featureIds, [
    "chat-memory",
    "danmaku-send-check",
  ]);
  assert.equal(inventory.experienceProfiles[2].id, "player-arrival-fullscreen");
  assert.deepEqual(inventory.experienceProfiles[2].featureIds, [
    "auto-web-fullscreen",
    "compact-player",
  ]);
  for (const feature of inventory.features) {
    assert.ok(feature.contract.behavior);
    assert.ok(feature.contract.interaction);
    assert.ok(feature.contract.persistence);
    assert.ok(Array.isArray(feature.contract.deviations));
  }
});

test("migration inventory rejects duplicate and invalid feature records", () => {
  const errors = validateFeatureInventory({
    schemaVersion: 3,
    baselinePolicy: {},
    experienceProfiles: [],
    features: [
      { id: "bad id", priority: "P9", status: "unknown", decision: "copy" },
      { id: "bad id", priority: "P0", status: "planned", decision: "rewrite" },
    ],
  });
  assert.ok(errors.length >= 5);
});
