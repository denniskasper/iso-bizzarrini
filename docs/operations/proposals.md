# Proposals on Integration

On Integration, somebody the developer has let propose works out a Fix or an Idea in a
conversation with Claude, and hands the finished Proposal over. This note says how Integration is
given what the conversation needs. Production never has it: it refuses to start with the key set
(ADR 0012, as amended).

## What the conversation is had with

Integration's conversation runs on the **`api-key` method**: Claude Sonnet 5.5, at `high`
effort, through the Anthropic API, with the conversation's own key in
`PROPOSALS_ANTHROPIC_API_KEY`. With the key set, that is the method; `PROPOSALS_METHOD` need not
be set. Without it, nobody is shown Propose, and the status says why.

The key is **not** the one catalog reading uses (`ANTHROPIC_API_KEY`). The two are billed and
limited apart, so a long conversation can never stop a Catalog run, nor the other way round.

Every request carries the playbook and the glossary, the product spec and the ADRs of the
Version running, which the image is built with. Those are cached for an hour, so an author who
takes their time does not pay to send them again each turn.

**What it costs.** About 30,000 tokens of documents, written to the cache once and read back on
every later turn, are half of it; the conversation itself and the answers are the rest. A Fix or
an Idea of about eight answers and a screenshot or two comes to roughly **$0.35**, and **$0.13**
more each time the author comes back after more than an hour, when the cache is written again.
Ten to twenty conversations a month: about **$4–8**.

An **Administrator** sees the estimates on the **Proposals** page: this month's and last month's,
by the month each request was made in, how many conversations and what one comes to, and each
Proposal's own beside it. Nobody else let propose sees any of it, and there is nothing to see on
the developer's subscription, which is not billed by the request. A Draft discarded afterwards
still counts in its month. Set `PROPOSALS_MONTHLY_LIMIT_USD` to the workspace's limit to show
this month against it; Ricambi is told the limit and cannot read it, so change both together.

Each request says what it used in the server's log, as `A Proposal’s conversation used`: input,
cache-write, cache-read and output tokens, and `estimatedUsd` at the list prices in
`CONVERSATION_PRICES` (`apps/api/src/proposals/claude-api-conversation-method.ts`). Check the
estimate against those lines, and the prices against the provider's list when the model changes.

## In Development, on the developer's own subscription

On the developer's machine the conversation can run on the **`subscription` method** instead:
the same model, playbook, documents and finished Proposal, through the Claude Agent SDK on the
Claude Code login already on the machine, with every tool switched off, so it can only talk. It
costs no API money; it draws on the plan's limits.

1. Sign in to Claude Code with the subscription: `claude auth login`.
2. Leave `PROPOSALS_ANTHROPIC_API_KEY` unset. With both the key and a login, neither is used.
3. Start the API (`pnpm dev`). Its log says `Proposals are open`, or `Proposals are closed` and
   why.

It accepts only that login. A token in `CLAUDE_CODE_OAUTH_TOKEN` is refused, and every key and
token is taken out of Claude Code's environment, so a server, which has no signed-in Claude Code,
can never run Proposals on somebody's subscription (ADR 0012, as amended). The Agent SDK is a
development dependency and is not in the image.

## Giving Integration the key

1. **A workspace of its own.** In the Anthropic Console of `<ANTHROPIC_ORGANISATION>`, create a
   workspace for developing Ricambi, `<PROPOSALS_WORKSPACE>`. Nothing else uses it.
2. **A monthly limit.** Give the workspace a monthly spend limit of **$25** to start with: a busy
   month's conversations, several times over. That limit is what stops the conversation, and its cost is known in advance.
3. **The key.** Create an API key in that workspace, and nowhere else. It is shown once.
4. **The secret.** In Dokploy, open the Integration service's environment editor and add
   `PROPOSALS_ANTHROPIC_API_KEY=<the key>`, and beside it `PROPOSALS_MONTHLY_LIMIT_USD=25`, the
   limit from step 2. Never on the Club's Production service, which would
   refuse to start; never in this repository, a commit, an issue or a chat (`AGENTS.md`,
   Security).
5. **Deploy**, and check that Propose appears for somebody let propose.

To withdraw it, delete the key in the Console and remove the line from the environment editor.

## When the month's limit is spent

The provider refuses the conversation until the month turns. Somebody proposing is told that
Proposals are **paused until next month**, and what they wrote is kept. That is not a fault, and
it is told apart from the conversation being **unavailable**, which is: a refused key, the API
not reached, or the model declining to answer. The server's log says which.

Raising the limit in the Console lets the conversation carry on at once.

## The Processor record

Anthropic receives what is said in a conversation, and the screenshots shown in it, to answer.
It is recorded as a **Processor for developing Ricambi** in the
[record of processing](../data-protection/record-of-processing.md), under Proposals, with its
agreement kept beside the Club's others. It is not a Processor of Production. Whether it also
belongs in Production's Privacy statement is the Club's to decide.
