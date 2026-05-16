import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseKioskConfig } from "./kioskMode.ts";

describe("parseKioskConfig", () => {
  it("returns defaults for an empty query string", () => {
    const config = parseKioskConfig("");
    assert.equal(config.isKiosk, false);
    assert.equal(config.isDebug, false);
    assert.equal(config.cycleIntervalMs, 15_000);
  });

  it("detects kiosk mode from ?kiosk=1", () => {
    const config = parseKioskConfig("?kiosk=1");
    assert.equal(config.isKiosk, true);
  });

  it("does not activate kiosk for ?kiosk=0", () => {
    const config = parseKioskConfig("?kiosk=0");
    assert.equal(config.isKiosk, false);
  });

  it("detects debug mode from ?debug=1", () => {
    const config = parseKioskConfig("?debug=1");
    assert.equal(config.isDebug, true);
  });

  it("combines kiosk and debug flags", () => {
    const config = parseKioskConfig("?kiosk=1&debug=1");
    assert.equal(config.isKiosk, true);
    assert.equal(config.isDebug, true);
  });

  it("accepts a custom interval", () => {
    const config = parseKioskConfig("?interval=20000");
    assert.equal(config.cycleIntervalMs, 20_000);
  });

  it("clamps interval to minimum of 5000ms", () => {
    const config = parseKioskConfig("?interval=1000");
    assert.equal(config.cycleIntervalMs, 5_000);
  });

  it("ignores non-numeric interval", () => {
    const config = parseKioskConfig("?interval=abc");
    assert.equal(config.cycleIntervalMs, 15_000);
  });

  it("ignores negative interval", () => {
    const config = parseKioskConfig("?interval=-5000");
    assert.equal(config.cycleIntervalMs, 15_000);
  });
});
