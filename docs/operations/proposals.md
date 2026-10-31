# Proposals on Integration

On Integration, somebody the developer has let propose works out a Fix or an Idea in a
conversation with Claude, and hands the finished Proposal over. This note says how Integration is
given what the conversation needs. Production never has it: it refuses to start with the key set
(ADR 0012, as amended).

## What the conversation is had with

Integration's conversation runs on the **`api-key` method**: Claude Opus 5.5, at its default
effort, through the Anthropic API, with the conversation's own key in
`PROPOSALS_ANTHROPIC_API_KEY`. With the key set, that is the method; `PROPOSALS_METHOD` need not
be set. Without it, nobody is shown Propose, and the status says why.

The key is **not** the one catalog reading uses (`ANTHROPIC_API_KEY`). The two are billed and
limited apart, so a long conversation can never stop a Catalog run, nor the other way round.

Every request carries the playbook and the glossary, the product spec and the ADRs of the
Version running, which the image is built with. Those are cached for an hour, so an author who
takes their time does not pay to send them again each turn. Expect roughly $1–3 a conversation.

## Giving Integration the key

1. **A workspace of its own.** In the Anthropic Console of `<ANTHROPIC_ORGANISATION>`, create a
   workspace for developing Ricambi, `<PROPOSALS_WORKSPACE>`. Nothing else uses it.
2. **A monthly limit.** Give the workspace a monthly spend limit of the equivalent of **€20** to
   start with. That limit is what stops the conversation, and its cost is known in advance.
3. **The key.** Create an API key in that workspace, and nowhere else. It is shown once.
4. **The secret.** In Dokploy, open the Integration service's environment editor and add
   `PROPOSALS_ANTHROPIC_API_KEY=<the key>`. Never on the Club's Production service, which would
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
