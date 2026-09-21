# Archived source agreement

`archive/` contains immutable historical reference snapshots. Read these files to establish historical behavior, source locations, defaults, and implementation details, but do not edit, format, build over, or modernize the archived source in place.

All new implementation belongs under `packages/`. If an archive defect or ambiguity is discovered, record it in the consuming package's documentation instead of changing the snapshot.

Do not add generated dependencies such as `node_modules/`. Large recovery-only history bundles remain outside the primary repository unless the user explicitly chooses a separate artifact-storage mechanism.
