# Delegation

How to decide whether to hand work to a subagent, and what that actually costs.

Kept out of [CLAUDE.md](CLAUDE.md) deliberately: this file is only ever needed
by a top-level session at the moment it is about to delegate, and subagents --
which never delegate -- were paying for it on every cold boot. CLAUDE.md holds
the roster and the non-negotiables; the reasoning lives here.

**Read this before the first delegation in a session.**

## The three agents

| Agent | Model | For |
|---|---|---|
| `developer` | Sonnet | An already-scoped change. Reads, edits, tests, commits on the current branch. |
| `qa` | Haiku | Running the existing checks and reporting them. Read-only apart from mechanical fixes outside `src/sim/`. |
| `architect` | Opus | Escalation *upward* from a cheaper session: a hard design question, or an independent review. No Write or Edit -- it advises. |

There is no fourth: the CTO is *this session*, whatever model it was started
with, and no configuration can make a top-level session change model per task.

A `model:` in frontmatter is absolute, so a Sonnet session still gets Sonnet
work and Haiku checks, and can still reach Opus through `architect`. The Agent
tool's `model` parameter overrides frontmatter for one call.

## Delegation does not save tokens

It is worth being exact about this, because the obvious framing is wrong.
Delegating a task almost always *increases* total tokens spent: the subagent
pays a cold boot of roughly seven thousand tokens -- CLAUDE.md is the largest
single part of it, at about 2.9k, and splitting this file out of it is what
brought that down -- and then re-derives context this session already has.
Three delegations measured across one session cost 121k tokens for work that
would have run perhaps 45-60k done here.

What delegation actually buys is two things:

1. **Unit price.** Those tokens are Sonnet and Haiku tokens rather than Opus
   ones.
2. **Context that does not recur.** Every request re-sends the whole
   conversation, so a token spent in *this* session is re-billed on every
   later turn, while a token a subagent spends is paid once. This is the larger
   effect, and it is why noisy output is the strongest reason to delegate: a
   `npm run diversity` sweep is fifteen thousand tokens of output that would
   ride along in every subsequent request, in exchange for the five numbers
   actually wanted.

So the test is not "is this task big enough to be worth delegating". It is:

- **Is the output noisy?** Long, high-volume runs whose result is a handful of
  numbers -- `npm test`, `npm run diversity`, `npm run sim -- --all-waves`.
  That is `qa`. Not for a quick check: a cold boot to avoid reading fifty lines
  is a net loss.
- **Is the input fully specifiable?** If the brief can be written completely
  before any work starts, the work does not need this session's judgement while
  it happens. That is `developer`. The tell is that writing the brief feels
  like writing a specification rather than like thinking out loud.

**There is a floor under both tests, and it is not about line count.** A task
can be perfectly specifiable and still not worth delegating: renaming a symbol
across three files is a complete brief and an obvious waste of a cold boot. Two
checks catch this:

- **If the brief would take longer to write than the work would take to do,
  keep it.** Writing a good brief is most of the thinking; at that point the
  delegation is buying only the typing.
- **Is the file already open in this session?** Line count is a poor proxy for
  cost -- a large change across files never read here can be cheaper to hand
  over than a small one in a file already in context, where the marginal cost
  of doing it is nearly zero.

Coordination is never free either: every delegation ends with this session
reading the diff, so its true cost is the subagent's tokens *plus* a review
here. Of the three delegations measured above, one needed a correction
afterwards and another needed documentation the brief had not thought to ask
for. Budget for that rather than treating the handover as the end.

**Neither test met? Keep it.** This session is allowed to do its own work, and
should prefer to when deciding *what* to do is most of the task. Ambiguity
costs more delegated than done -- a subagent given an underspecified brief will
resolve the ambiguity by guessing, and the guess arrives as finished code.
Reviewing a wrong guess costs more than the work saved. A review, an
investigation, a design call, or a small edit in a file already in context are
all fine to keep, and no obligation to delegate overrides that.

Balance retuning is never delegated. It runs through the `balance-pass` skill
in this session, because the diversity verdict is a judgement call about the
game's identity rather than a number to report.

**Delegated work is not finished until this session has read the diff.**

## Which model runs the CTO session

`architect` only earns its cold boot from a *cheaper* session -- asking it from
an Opus session is paying seven thousand tokens for a peer's opinion. So the
configuration implies a choice, and it is worth making deliberately:

- **Opus CTO** (what CLAUDE.md assumes elsewhere): `architect`
  is reserved for when independence matters more than model tier -- a genuine
  second opinion on a substantial change.
- **Sonnet CTO reaching up through `architect`**: materially cheaper per
  session, and the reason the escalation path exists at all. The risk is that a
  cheaper session has to *notice* it needs help, which is exactly the judgement
  it is cheaper at.

