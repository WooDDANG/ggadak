# Decision Timeline

`GET /api/v1/decisions/timeline` requires a guild the authenticated member can access. `groupBy` supports `month` (default), `topic`, `channel`, and `category`. `timezone` is an IANA timezone (default `UTC`); month labels use that zone. Optional `from` and `to` are ISO 8601 instants, with an inclusive lower bound and exclusive upper bound. Filtering occurs in SQLite by `guildId`, confirmed lifecycle, and the nullable indexed `confirmedAt` projection before rows are returned.

Items are ordered by confirmation instant descending, then string ID ascending. Groups retain the order of their newest item, and each group uses that same item order. The response includes `groupBy`, `timezone`, `totalElements`, and groups with their keys, counts, and Decision Cards. Empty queries return zero groups and a count of zero. The frontend uses the browser's resolved IANA timezone and can switch among every supported grouping.

`confirmedAt` is an additive projection of `Decision.decisionConfirmedDate`. The migration copies only recorded timestamps from `domainJson`; null and absent historical values remain null. Records without a confirmation date are omitted from the timeline and count, and remain available through the regular Decision Card list and detail APIs. No date is inferred from creation time or replacement history. Replacement preserves the predecessor's recorded confirmation instant while its lifecycle becomes `SUPERSEDED`, so it is no longer part of the confirmed timeline.

The timeline and card detail requests both enforce guild membership. The view opens the existing full detail API for a selected card so evidence, Action Items, and the Discord source remain available.
