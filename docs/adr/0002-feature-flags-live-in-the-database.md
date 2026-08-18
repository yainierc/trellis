# ADR 0002 — Feature flags live in the database

- **Status:** accepted
- **Date:** 2026-08-18
- **Supersedes:** none

## Context

Work that ships behind a switch needs somewhere to keep the switch. The choice is not neutral: it
determines how fast a bad release can be stopped, who is allowed to stop it, and how a test controls
the condition it is testing.

## Decision

**Feature flag state lives in the product's own database. There is no external flag service.**

One source of truth, read through the application's own data access, owned and operated by the same
team that owns the schema.

## Considered and refused

**An external flag service** (LaunchDarkly, Flagsmith, or similar). Refused. It buys percentage
rollouts, targeting and an audit trail out of the box, and it costs an external dependency in the
request path of a control whose entire purpose is to work during an incident — an outage there
becomes an outage here. It also adds a second identity surface, a per-seat cost, and a copy of
product data leaving the estate.

**Flags in configuration or environment variables.** Refused, and this one is disqualifying rather
than a trade-off: changing them requires a deploy. The reason to have a flag at all is to change
behaviour *without* deploying. A flag you must ship to flip is a build-time constant with extra
ceremony.

Recorded rather than merely decided, because both of these are reasonable-sounding and will be
proposed again by someone who was not in the room. `core.md` §9: a mechanism considered and refused
is recorded as refused with its reason, and that record is the only thing stopping it from returning
as a fresh idea.

## Consequences

These are the costs the decision actually carries. They are listed because a decision recorded
without its consequences reads as free, and this one is not.

**1. Flag state is environment state, not code.** A test cannot assert conditional behaviour without
first seeding the flag. So a contract's `done_when` that exercises a flagged path must set the flag
as part of the criterion, and the wave's cross-cutting verification must state how flag state is
established before it runs — see `0001-e2e-belongs-to-the-wave.md`, which is why the spec template
asks for it explicitly.

**2. The cache TTL is the real rollback time.** Reading the flag per request will need caching. The
moment a cache sits in front of it, turning a flag off takes as long as that cache takes to expire.
A five-minute TTL means a five-minute incident floor, whatever the runbook claims. Every spec that
declares a flag must state the kill path *and its latency*, not just the kill path.

**3. Flipping a flag in production is a human gate.** Functionally it is a deploy: it changes what
users experience, without review, instantly. `core.md` §4 already covers it under "any deploy", and
it is worth saying out loud because a database update does not feel like a deploy to the person
typing it. No agent flips a production flag, however green the build is.

**4. The audit trail is not free.** An external service records who changed what and when. A table
does not, unless the schema is designed for it from the start — who set it, when, and to what.
Retrofitting that after the first contested incident is expensive and always incomplete.

**5. Percentage rollouts and cohort targeting are not included.** If the product ever needs them,
they are software to be built and maintained here, not a checkbox. That is a fair price for
independence, and it should be paid knowingly rather than discovered.

## Scope

This ADR fixes *where* flags live. It says nothing about the table shape, the read API, the naming
convention or the caching implementation — all of which are stack-specific and belong in a rule pack
layered through the profile's `rules.packs`. The core plugin does not know that a database exists.

**Accepted is not validated.** This decision owes evidence: the first real incident where a flag has
to be turned off under pressure is what will confirm the kill path and its latency are what this
record claims.
