import assert from "node:assert/strict";
import test from "node:test";

import {
  ensurePlayerAudioOnOpen,
  ensurePlayerUnmuted,
} from "../src/audio.js";

test("clicks the volume button when the muted slider class is present", () => {
  const volumeButton = fakeVolumeButton({ mutedClass: true });
  const document = fakeDocument({ volumeButton });

  assert.deepEqual(ensurePlayerUnmuted(document), {
    buttonFound: true,
    clicked: true,
  });
  assert.equal(volumeButton.clickCount, 1);
});

test("uses the video muted state as a fallback", () => {
  const volumeButton = fakeVolumeButton();
  const video = { muted: true, volume: 1 };
  const document = fakeDocument({
    volumeButton,
    video,
  });

  ensurePlayerUnmuted(document);

  assert.equal(volumeButton.clickCount, 1);
  assert.equal(video.muted, false);
});

test("restores the previous slider volume when clicking does not do so", () => {
  const volumeButton = fakeVolumeButton({
    mutedClass: true,
    previousVolumeHeight: "12%",
  });
  const video = { muted: true, volume: 0 };

  ensurePlayerUnmuted(fakeDocument({ volumeButton, video }));

  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.12);
});

test("does not click when the player already has sound", () => {
  const volumeButton = fakeVolumeButton();
  const document = fakeDocument({
    volumeButton,
    video: { muted: false, volume: 0.5 },
  });

  assert.deepEqual(ensurePlayerUnmuted(document), {
    buttonFound: true,
    clicked: false,
  });
  assert.equal(volumeButton.clickCount, 0);
});

test("waits for the initial player state to settle and checks it once", async () => {
  const volumeButton = fakeVolumeButton({ mutedClass: true });
  const video = { muted: true, volume: 1 };
  const document = fakeDocument({ volumeButton: null });
  const delays = [];

  const result = await ensurePlayerAudioOnOpen({
    document,
    sleep: async (delay) => {
      delays.push(delay);
      if (delay === 100) {
        document.volumeButton = volumeButton;
        document.video = video;
      }
    },
  });

  assert.deepEqual(result, { buttonFound: true, clicked: true });
  assert.deepEqual(delays, [100, 500]);
  assert.equal(volumeButton.clickCount, 1);
});

test("does not keep checking after the initial settled state", async () => {
  const volumeButton = fakeVolumeButton();
  const document = fakeDocument({
    volumeButton,
    video: { muted: false, volume: 0.5 },
  });
  const delays = [];

  assert.deepEqual(
    await ensurePlayerAudioOnOpen({
      document,
      sleep: async (delay) => delays.push(delay),
    }),
    { buttonFound: true, clicked: false },
  );
  assert.deepEqual(delays, [500]);
  assert.equal(volumeButton.clickCount, 0);
});

function fakeDocument({ volumeButton = null, video = null } = {}) {
  return {
    body: {},
    volumeButton,
    video,
    querySelector(selector) {
      if (selector === ".douyin-player-icon.douyin-player-volume") {
        return this.volumeButton;
      }
      if (selector === "video") return this.video;
      return null;
    },
  };
}

function fakeVolumeButton({
  mutedClass = false,
  previousVolumeHeight = "",
} = {}) {
  return {
    clickCount: 0,
    mutedClass,
    querySelector(selector) {
      if (
        selector ===
          ".douyin-player-volume-slider.douyin-player-muted" &&
        this.mutedClass
      ) {
        return {};
      }
      if (selector === ".douyin-player-volume-slider-thumb") {
        return { style: { height: previousVolumeHeight } };
      }
      return null;
    },
    click() {
      this.clickCount += 1;
    },
  };
}
