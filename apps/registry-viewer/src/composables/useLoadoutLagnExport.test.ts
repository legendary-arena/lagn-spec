import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ref } from "vue";
import { validate } from "@legendary-arena/lagn";
import { useLoadoutLagnExport } from "./useLoadoutLagnExport";
import type { MatchSetupDocument } from "@legendary-arena/registry/setupContract";

// why: playerCount is 1 so the draft is consistent with the export's default
// LAGN variant (Classic → "solo"), which the variant/player_count export guard
// requires to seat exactly one player. Tests that switch the variant to Custom
// (→ "cooperative") bump playerCount to 2 to stay consistent.
function createValidDraft(): MatchSetupDocument {
  return {
    schemaVersion: "1.0",
    setupId: "setup-test",
    createdAt: "2026-06-12T00:00:00Z",
    createdBy: "player",
    seed: "a1b2c3d4e5f6g7h8",
    playerCount: 1,
    expansions: ["base"],
    heroSelectionMode: "GROUP_STANDARD",
    composition: {
      schemeId: "scheme-plot",
      mastermindId: "mastermind-loki",
      villainGroupIds: ["villain-brotherhood"],
      henchmanGroupIds: ["henchman-dark-minions"],
      heroDeckIds: ["hero-iron-man"],
      bystandersCount: 30,
      woundsCount: 30,
      officersCount: 30,
      sidekicksCount: 0,
    },
  };
}

function createIncompleteDraft(): MatchSetupDocument {
  return {
    schemaVersion: "1.0",
    setupId: "setup-incomplete",
    createdAt: "2026-06-12T00:00:00Z",
    createdBy: "player",
    seed: "a1b2c3d4e5f6g7h8",
    playerCount: 2,
    expansions: ["base"],
    heroSelectionMode: "GROUP_STANDARD",
    composition: {
      schemeId: "", // missing
      mastermindId: "mastermind-loki",
      villainGroupIds: ["villain-brotherhood"],
      henchmanGroupIds: ["henchman-dark-minions"],
      heroDeckIds: ["hero-iron-man"],
      bystandersCount: 30,
      woundsCount: 30,
      officersCount: 30,
      sidekicksCount: 0,
    },
  };
}

test("UUID generation produces valid v4 format", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const uuid = api.gameId.value;
  const uuidv4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(uuid, uuidv4Pattern, "game_id should be a valid UUID v4");
});

test("UUID generation produces unique values on regenerate", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const first = api.gameId.value;
  api.regenerateGameId();
  const second = api.gameId.value;

  assert.notEqual(first, second, "regenerateGameId() should produce a different UUID");
});

test("composition maps to LAGN setup correctly", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const built = api.buildLagnFile();
  assert(built, "buildLagnFile should return a file for valid composition");

  const parsed = JSON.parse(built.file);
  assert.equal(parsed.setup.mastermind.id, "mastermind-loki");
  assert.equal(parsed.setup.scheme.id, "scheme-plot");
  assert.deepEqual(parsed.setup.villain_groups, [{ id: "villain-brotherhood", name: "" }]);
  assert.deepEqual(parsed.setup.henchmen_groups, [{ id: "henchman-dark-minions", name: "" }]);
  assert.deepEqual(parsed.setup.heroes, [{ id: "hero-iron-man", name: "" }]);
  assert.equal(parsed.setup.bystanders_count, 30);
  assert.equal(parsed.setup.wounds_count, 30);
  assert.equal(parsed.setup.shield_officers_count, 30);
  assert.equal(parsed.setup.sidekicks_count, 0);
});

test("variant/outcome selection required for validation", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  // Valid defaults: classic (solo) + victory + 1 player
  assert(api.isValid.value, "isValid should be true with default variant/outcome");

  // why: switching to Custom (→ cooperative) also requires seating at least 2
  // players, so bump playerCount alongside the variant to stay consistent with
  // the variant/player_count export guard.
  draft.value.playerCount = 2;
  api.variant.value = "custom";
  assert(api.isValid.value, "isValid should remain true for a consistent cooperative + 2-player export");

  api.outcome.value = "loss";
  assert(api.isValid.value, "isValid should remain true when outcome changes to loss");
});

test("loss_condition set when outcome='loss'", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  api.outcome.value = "loss";
  const built = api.buildLagnFile();
  assert(built, "buildLagnFile should return file when outcome is loss");

  const parsed = JSON.parse(built.file);
  assert.equal(parsed.result.loss_condition, "deck_exhausted");
});

test("valid composition + outcome passes validation", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  api.variant.value = "classic";
  api.outcome.value = "victory";

  assert(api.isValid.value, "valid draft should pass validation");
  assert.equal(
    api.validationErrors.value.length,
    0,
    "valid draft should have no validation errors",
  );

  const built = api.buildLagnFile();
  assert(built, "buildLagnFile should succeed for valid draft");
  const result = validate(JSON.parse(built.file));
  assert(result.valid, "parsed LAGN should pass @legendary-arena/lagn validator");
});

test("missing mastermindId fails validation", () => {
  const draft = ref(createIncompleteDraft());
  const api = useLoadoutLagnExport(draft);

  assert(!api.isValid.value, "incomplete draft (missing schemeId) should fail validation");
  assert(
    api.validationErrors.value.length > 0,
    "incomplete draft should have validation errors",
  );
});

test("empty villainGroupIds fails validation", () => {
  const draft = ref(createValidDraft());
  draft.value.composition.villainGroupIds = [];
  const api = useLoadoutLagnExport(draft);

  assert(
    !api.isValid.value,
    "draft with empty villainGroupIds should fail validation",
  );
  assert(
    api.validationErrors.value.length > 0,
    "draft with empty villainGroupIds should have validation errors",
  );
});

test("exported file includes $schema URI", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const built = api.buildLagnFile();
  assert(built, "buildLagnFile should return file");

  const parsed = JSON.parse(built.file);
  assert.equal(
    parsed.$schema,
    "https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json",
    "$schema must be the canonical hardcoded URL",
  );
});

test("filename format: game-{id}.lagn.json", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const filename = api.exportFilename();
  assert.match(
    filename,
    /^game-[0-9a-f-]{36}\.lagn\.json$/i,
    "filename should match pattern game-{uuid}.lagn.json",
  );
});

test("exportToJsonBlob returns valid Blob with correct MIME type", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  const blob = api.exportToJsonBlob();
  assert.equal(blob.type, "application/json", "Blob should have application/json MIME type");
  assert(blob.size > 0, "Blob should not be empty");
});

test("variant/outcome changes trigger re-validation", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  // Start valid (classic/solo + 1 player)
  assert(api.isValid.value, "should start valid");

  // why: a consistent variant change (Custom → cooperative) needs >= 2 players,
  // so move both together; the export guard keeps variant and seat count coupled.
  draft.value.playerCount = 2;
  api.variant.value = "custom";
  assert(api.isValid.value, "consistent cooperative + 2-player export should stay valid");

  // Changing outcome should not invalidate
  api.outcome.value = "loss";
  assert(api.isValid.value, "changing outcome should not invalidate");

  // Making draft invalid should invalidate
  draft.value.composition.mastermindId = "";
  assert(!api.isValid.value, "emptying mastermindId should invalidate");
});

test("lossReason computed property always returns 'unavailable'", () => {
  const draft = ref(createValidDraft());
  const api = useLoadoutLagnExport(draft);

  assert.equal(api.lossReason.value, "unavailable", "lossReason should always be 'unavailable'");

  api.outcome.value = "loss";
  assert.equal(api.lossReason.value, "unavailable", "lossReason should remain 'unavailable'");
});

test("solo variant with more than one player fails the export guard", () => {
  const draft = ref(createValidDraft());
  draft.value.playerCount = 2;
  const api = useLoadoutLagnExport(draft);

  // Default variant is Classic (→ "solo"); 2 seats contradicts solo.
  assert(
    !api.isValid.value,
    "a solo loadout with player count 2 must fail the export guard",
  );
  assert(
    api.validationErrors.value.some((error) => error.includes('variant is "solo"')),
    "the guard error should explain the solo/player-count contradiction",
  );
  assert.equal(
    api.buildLagnFile(),
    null,
    "buildLagnFile must refuse to produce an unstartable solo file",
  );
});

test("cooperative variant with a single player fails the export guard", () => {
  const draft = ref(createValidDraft());
  draft.value.playerCount = 1;
  const api = useLoadoutLagnExport(draft);
  api.variant.value = "custom"; // → "cooperative", which needs >= 2 players

  assert(
    !api.isValid.value,
    "a cooperative loadout with player count 1 must fail the export guard",
  );
  assert(
    api.validationErrors.value.some((error) =>
      error.includes('variant is "cooperative"'),
    ),
    "the guard error should explain the cooperative/player-count contradiction",
  );
});

test("consistent variant and player count pass the export guard", () => {
  // Solo + 1 player.
  const soloDraft = ref(createValidDraft());
  const soloApi = useLoadoutLagnExport(soloDraft);
  assert(soloApi.isValid.value, "solo + 1 player should pass the guard");

  // Cooperative + 2 players.
  const coopDraft = ref(createValidDraft());
  coopDraft.value.playerCount = 2;
  const coopApi = useLoadoutLagnExport(coopDraft);
  coopApi.variant.value = "custom";
  assert(coopApi.isValid.value, "cooperative + 2 players should pass the guard");
});
