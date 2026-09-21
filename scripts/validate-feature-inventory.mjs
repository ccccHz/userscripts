import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const statuses = new Set([
  "inventory",
  "planned",
  "implementing",
  "verifying",
  "done",
  "deferred",
  "rejected",
]);
const priorities = new Set(["P0", "P1", "P2", "P3"]);
const decisions = new Set(["rewrite", "reuse", "research", "defer", "reject"]);
const deviationStatuses = new Set(["proposed", "approved", "rejected"]);

export function validateFeatureInventory(inventory) {
  const errors = [];
  if (inventory.schemaVersion !== 3) errors.push("schemaVersion must be 3");
  if (!inventory.baselinePolicy || typeof inventory.baselinePolicy !== "object")
    errors.push("baselinePolicy is required");
  if (!Array.isArray(inventory.experienceProfiles))
    errors.push("experienceProfiles must be an array");
  if (!Array.isArray(inventory.features)) return [...errors, "features must be an array"];

  const ids = new Set();
  for (const [index, feature] of inventory.features.entries()) {
    const path = `features[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature.id ?? ""))
      errors.push(`${path}.id must be a kebab-case id`);
    if (ids.has(feature.id)) errors.push(`${path}.id is duplicated`);
    ids.add(feature.id);
    if (!feature.name) errors.push(`${path}.name is required`);
    if (!priorities.has(feature.priority)) errors.push(`${path}.priority is invalid`);
    if (!statuses.has(feature.status)) errors.push(`${path}.status is invalid`);
    if (!decisions.has(feature.decision)) errors.push(`${path}.decision is invalid`);
    if (!feature.notes) errors.push(`${path}.notes is required`);
    if (!feature.contract || typeof feature.contract !== "object") {
      errors.push(`${path}.contract is required`);
      continue;
    }
    for (const key of ["behavior", "interaction", "persistence"]) {
      if (!feature.contract[key]) errors.push(`${path}.contract.${key} is required`);
    }
    if (!Array.isArray(feature.contract.deviations)) {
      errors.push(`${path}.contract.deviations must be an array`);
    } else {
      for (const [deviationIndex, deviation] of feature.contract.deviations.entries()) {
        const deviationPath = `${path}.contract.deviations[${deviationIndex}]`;
        if (!deviation || typeof deviation !== "object") {
          errors.push(`${deviationPath} must be an object`);
          continue;
        }
        if (!deviationStatuses.has(deviation.status))
          errors.push(`${deviationPath}.status is invalid`);
        for (const key of ["baseline", "proposal", "reason", "objective", "fallback"]) {
          if (!deviation[key]) errors.push(`${deviationPath}.${key} is required`);
        }
        if (deviation.status === "approved" && !deviation.decisionRecord)
          errors.push(`${deviationPath}.decisionRecord is required when approved`);
      }
    }
  }

  for (const [index, profile] of (inventory.experienceProfiles ?? []).entries()) {
    const path = `experienceProfiles[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.id ?? ""))
      errors.push(`${path}.id must be a kebab-case id`);
    if (!profile.name) errors.push(`${path}.name is required`);
    if (!statuses.has(profile.status)) errors.push(`${path}.status is invalid`);
    if (!Array.isArray(profile.featureIds) || profile.featureIds.length === 0)
      errors.push(`${path}.featureIds must be a non-empty array`);
    for (const featureId of profile.featureIds ?? []) {
      if (!ids.has(featureId)) errors.push(`${path}.featureIds references unknown feature ${featureId}`);
    }
    if (!profile.contract?.experience) errors.push(`${path}.contract.experience is required`);
    if (!Array.isArray(profile.contract?.preserved))
      errors.push(`${path}.contract.preserved must be an array`);
    if (!Array.isArray(profile.contract?.stateMatrix))
      errors.push(`${path}.contract.stateMatrix must be an array`);
    if (!Array.isArray(profile.contract?.deviations))
      errors.push(`${path}.contract.deviations must be an array`);
  }
  return errors;
}

export async function readAndValidateFeatureInventory(root = workspaceRoot) {
  const file = join(
    root,
    "packages/douyu-web-enhancer/docs/migration/features.json",
  );
  const inventory = JSON.parse(await readFile(file, "utf8"));
  return { file, inventory, errors: validateFeatureInventory(inventory) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await readAndValidateFeatureInventory();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
