# Light Clients — Config from Core & Intelligence Routing

Status: **design** · Applies to Merlin and Nimue (the bodies). Core is the source of truth.

---

## ★ North Star

> **We are building a configuration-free network for the 99%.**

Configuration is the tax the technical class charges everyone else for the privilege of
participating. Every "paste your API key," "port-forward your router," "configure your
settings," "type the server address" is a checkpoint where the 99% closes the tab. The
entire architecture is the systematic removal of those checkpoints. A config-free node is
one a *person* can run — not just an admin — which is the precondition for *enough Merlins*
to exist for the circle-of-life economics to close. **The network can't be for everyone if
joining it requires being a sysadmin.**

### The Design Law (ranks alongside ponytail)

> **If a feature requires the user to configure something, it isn't done.**
> Either Core hands it down, or the system infers it, or it doesn't ship.

Corollary: "LEO unavailable — configure API keys" is not a missing feature — it is a **bug
against the thesis**. The fix is never "make configuring easier"; it is "remove the need to
configure." We don't patch the settings-save; we delete the reason to save.

Each thing this architecture removes is the same wall coming down:
- "Paste your API key" → Ollama-default / Core-routed intelligence
- "Port-forward your router" → the Cloudflare tunnel that dials *out*
- "Configure your settings" → config comes from Core; the client just *is*
- "Type the server address" → the federation directory finds it
- "Sort and tag your photos" → heuristic ingestion builds the catalog
- "Set up your model" → work routes to where the VRAM already is

---

## 1. Principle

> Merlin and Nimue are **light clients**. They hold **no durable config of their own
> and no model keys**. Configuration comes from **Core**. Intelligence comes from
> **local Ollama** or is **routed through Core/federation** — and a client is both a
> **supplier** and a **consumer** of intelligence on the mesh.

This kills two whole classes of problem at once:
- the "paste a Gemini key in Settings" flow (and the settings-didn't-persist / schema-drift
  bugs that come with per-client config), and
- the dead-end where a client can't think because nobody pasted a key.

It also generalizes the federation rule *"a token-poor node dispatches thinking to a peer"*
down to the device: a **battery-poor or keyless phone dispatches thinking to the PC or to Core.**

---

## 2. Config from Core

- **Boot:** client identifies to Core (federation id) → pulls its **config bag** (the
  Oqtane-style Settings spine). Local storage is a **cache with a TTL**, never the source
  of truth.
- **No secrets on the client.** A light client never holds provider API keys. Model access
  is either **keyless-local** (Ollama) or **brokered by Core** (Core holds keys / routes the
  call). The client asks Core "give me my config + how to think," not "let me store a key."
- **Effect:** the Keys & Config page stops being a place you *enter* secrets and becomes a
  place you *see* what Core handed down (read-mostly). Settings-persistence bugs become
  irrelevant because the client isn't the writer.

```
client boot → GET Core /config?node=<id>  →  { settings, intelligence: { mode, endpoints } }
            → cache locally (TTL)          →  render read-mostly
```

## 3. Intelligence routing

Two sources, chosen per request (prompt, tools, effort):

| Source | When | Properties |
|---|---|---|
| **Local Ollama** | default; small/fast/triage work | sovereign, offline, free, keyless, on-device (private) |
| **Federation-routed via Core** | local can't serve (no Ollama, model too big, needs the good model) | proxied/relayed; Core brokers keys + dispatches to a capable peer |

**The client is dual-role:**
- **Supplier** — advertises its capacity (Ollama models present, GPU) in the federation
  **heartbeat**; can accept routed work from peers (Folding@home for cognition).
- **Consumer** — when local can't serve, dispatches the request up to Core, which routes it
  to a capable node and relays the answer back.

This rides rails Core already has: the federation **heartbeat** (capacity advertisement),
**`/federation/dispatch-work`**, and **`/federation/skills/invoke`**.

## 4. Where it plugs into the existing brain

`leoProviders.ts` is already a provider abstraction with a neutral message format. The arc adds:
- an **Ollama provider** (keyless, local, fast) — *this alone makes Merlin's LEO chat work
  with zero config when Ollama is running*, and is the cleanest fix for "LEO unavailable —
  configure API keys."
- a **Core-routed provider** (sends the neutral request to Core, gets a relayed completion).
- an **IntelligenceRouter** that selects: **local Ollama first → Core-route fallback.**

The brain (`leoBrain`) is untouched — it still takes an injected provider config. Only the
*selection* of provider becomes mesh-aware.

## 5. Degradation ladder

```
local Ollama up         → answer locally (fast, free, private)
local down, Core up     → route to Core → capable peer → relay back
Core unreachable        → cerebellum only (reflexes + event log keep working; cortex sleeps)
```

The event loop (see EVENT_LOOP.md) means a keyless/offline client is never *dead* — it still
records every action; only the *thinking* degrades gracefully.

## 6. Privacy posture (deferred, but noted)

Local Ollama keeps context **on-device**. Routing sends context **off-device** to Core/peers.
Kenneth has deferred privacy for now → routing is fair game. When privacy returns, the stance
is: **local-first, route only with consent, redact what's routed.** Building Ollama-default
keeps us honest by construction.

---

## 7. Slice plan (ponytail order)

1. **Ollama provider** in `leoProviders` (keyless, local). Smallest fast model for default
   (e.g. `qwen2.5:3b` / `llama3.2:3b`). **Immediately revives LEO chat with no key** — the
   real fix for the screenshot, and it makes Ollama-default true for anyone who downloads it.
2. **Config-from-Core bootstrap** — client pulls its config bag from Core on boot; local
   becomes a TTL cache; Keys & Config goes read-mostly.
3. **IntelligenceRouter** — local-Ollama-first → Core-route fallback; advertise Ollama
   capacity in the heartbeat (**supplier** role).
4. **Consume routed intelligence** — dispatch to Core when local can't serve (**consumer**
   role); relay the completion back into `leoBrain`.

Slice 1 is the highest-leverage and the laziest: one provider adapter turns "LEO unavailable"
into "LEO thinking, locally, for free, with zero config."
