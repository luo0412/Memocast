# Markdown Should Be Programmable: An Inline Annotation DSL for Notes

> I'm running a Show HN for a programmatic annotation DSL I've been building inside an Electron note app.
> Repo: <https://github.com/luo0412/coolma>
> PRs welcome.

---

## TL;DR

In my note app, you can write this:

```
This is normal text and @nice() gets you this highlighted.
```

…and the `nice` echo hijacks the DOM before it, wrapping it in `<mark>`. No HTML embedding, no plugins, no block types — one line of Markdown that hijacks the layout of the paragraph above it.

I've shipped 16 built-in echo cards and I'm trying to bootstrap an ecosystem around this DSL.

---

## The Problem

Markdown won. It became the default format for READMEs, blog posts, API docs, AI prompts, and most knowledge bases. Twenty years after Gruber, it's everywhere.

But Markdown hit a ceiling: **it's declarative but not programmable.**

You can say *"this is a heading, this is a list, this is a blockquote"* — but you can't say *"when the user clicks this heading, fold the section below."* You can embed `<details>` HTML, but that breaks portability (it dies on GitHub Issues, in terminals, in some note apps). You can install an Obsidian plugin, but plugins are external processes with their own learning curve (Vue/Svelte, build tooling, manifest config) — most authors can't reach them.

I see three existing routes, and none of them satisfy me:

| Route | Example | Limitation |
| --- | --- | --- |
| **HTML embedding** | GitHub README, Typora | Breaks portability |
| **Block-type extensions** | Notion, Sub-pages, Databases | Author is locked into the app |
| **Plugin systems** | Obsidian Dataview, Quarto | Steep learning curve; authors can't write plugins |

**I think there's a fourth route: inline annotation DSLs.**

---

## The DSL: `@xxx{props}()`

The shape is simple:

```
@echo-name{props JSON}()
```

`@xxx` is a token; `{props}` is an optional JSON object of parameters (the segment is optional); `()` is mandatory — it carries the `prompt` and closes the annotation. Echoes then operate on nearby DOM nodes — typically the previous sibling.

Three quick examples:

```
Today is nice @growth{scope: "siblings"}()
```

→ The paragraph grows in with a "blooming" animation.

```
Less important line @ignore{opacity: 0.3}()
```

→ The paragraph becomes 30% opaque.

```
@shatter{target: "block"}()
```

→ Every other echo in the block is muted.

This is **author-controlled DOM hijacking**. Not styling. Not block types. Behavior.

---

## 16 Built-in Cards

I shipped 16 echo cards in three tiers:

**Plain behavior** — `nice`, `todo`, `diff`, `ad`, `ref`, `ignore`, `peek`

**Visual decoration** — `growth` (spring growth animation), `twinbloom` (clone previous line as placeholder), `calamity` (random gothic gradient on nearby text), `disperse` (looser layout), `skywalk` (theme switch)

**Composable** — `shatter` (mute other echoes), `mindsteal` (override other echoes' effects), `scapegoat` (catch errors in scope), `lucky` (trigger AI proofread on click)

Yes, the names are dramatic. They come from Chinese xianxia fiction. More on that in the limits section — it's an intentional choice.

---

## Echoes Can Hijack Echoes

The most non-obvious design: `shatter` and `mindsteal` let one echo modify another echo's behavior.

```
This line should bloom. @growth{trigger: "manual"}()
But shatter mutes it. @shatter{target: "block"}()
```

→ The growth animation never plays, because shatter mutes it inside the same block.

```
Original growth. @growth{trigger: "manual"}()
Overridden growth. @mindsteal{mode: "override", targets: "growth"}()
```

→ Mindsteal rewrites the growth animation — the spring becomes flames.

This is **programming-level control over DOM behavior**. Not just styles.

---

## Architecture (for the curious)

Every echo is a string-shaped JS module:

```javascript
export default {
  type: 'echo-chant',         // echo / echo-chant / echo-tbd
  field: 'nice',
  title: 'nice',
  version: 1,
  props: {},

  render (props = {}) {
    return '<span class="ag-rune ag-rune--nice" data-echo-chant-id="nice">nice</span>'
  },

  afterRender (node, props) {
    const $rune = $(node)  // jQuery, deliberately
    const $prev = $rune.prev()
    if ($prev.length) $prev.wrap('<mark class="ag-rune-nice-highlight"></mark>')
  }
}
```

The lifecycle:

1. **Parse** — find `@xxx{props}()` in the Markdown source → token + resolved props + prompt
2. **Compile** — `new Function(prelude + source)` → definition object
3. **Render** — `definition.render(props)` → HTML string injected into Markdown output
4. **Mount** — `definition.afterRender(node, props)` → hijack DOM
5. **Cleanup** — return cleanup fn; revert DOM on edit / destroy

The runtime lives in plain JS in `src/components/echo/echoRuntime.js`. No Vue, no React, no build magic.

The handler uses jQuery — yes, in 2026. It's a deliberate choice for DOM ergonomics; my tests lock that contract.

---

## Test Moat

I'm not shipping this naked. There are 11 Jest suites (~557 tests) locking the contracts:

- `runtime-props.test.js` — props merge order, fallback paths, graceful skip
- `jquery-echo-compile.test.js` — top-level structure of all 16 built-ins
- `jquery-afterrender.test.js` — handler uses jQuery directly, no native fallback
- `main-builtin-echoes.test.js` — IPC payload contract

Any change has to keep these green.

---

## Limits (in good faith)

I don't want to oversell. Known problems:

- **Desktop-only.** The whole thing lives inside an Electron + Vue 2 app (coolma). You can't use it in VSCode or Typora yet. *That's stage 1 work: extract `@coolma/echo-runtime` and `@coolma/rune-sdk` as standalone npm packages.*
- **The naming is dramatic.** `growth`/`shatter`/`mindsteal`/`scapegoat` come from xianxia fiction. I made this choice intentionally — creative tools should have personality, not `ag-rune-target-block-override-mode-disabled` engineering names. But it's a debatable choice.
- **1-maintainer project.** ~3 commits/day on average. No review SLA, no Discord, no docs beyond the rule files.
- **Muya edge cases.** When `props` contain special characters, the editor sometimes parses the token as plain text.

### FAQ prep: "How is this different from MDX?"

> You're almost certainly going to get this question in the comments. Here's the prepared response:

> **One-liner:** MDX is an *engineering* layer that embeds React components into Markdown. echo is a *behavorial* layer that adds inline annotations to plain Markdown. They target different scenarios.
>
> MDX shines for complex components (charts, forms, 3D) — but it requires React + a build step. echo shines for inline behaviors (highlight, collapse, motion) — zero runtime, plain text, copy-paste portable.
>
> **They aren't competitors.** MDX can't touch the personal-notes + portability niche; echo can't touch the serious-docs + complex-component niche. Detailed comparison: `_todo/MD-echo-vs-mdx-分析-202607.md` (Chinese, but the structure is language-agnostic).

Tone rules:

- **Don't initiate** — don't mention MDX in the post body itself
- **Don't pick a fight** — when answering, frame as "different scenarios", not "we're better"
- **Don't predict MDX's roadmap** — avoid flame-bait
- **Link the longer doc** — keep the comment thread short, move the fight to the analysis file

---

## What I'm Asking For

This is the part where I'm being honest about why I'm posting this:

I'm not asking you to install coolma. I'm not asking you to use the product. I'm trying to answer one question:

> **Does anyone want this DSL to exist as an ecosystem — or am I building a feature in a vacuum?**

If you read this far and feel *"yes, this direction is interesting,"* please leave one of:

1. **A comment** — "I want to write one" is enough; I just need to know strangers care
2. **An issue** — `[echo idea]` with a card you'd want to see
3. **A PR** — write a new card in 30 lines of JS; reference `echoBuiltinsNice.js` for the shape

If I get **5 or more "I want to write one" signals in 30 days**, I'll extract the SDK and write proper developer docs. If I don't, I'll know this was a personal project that didn't have legs.

Either outcome is fine — but I'd rather learn the answer now than in 12 months.

---

## Repo

<https://github.com/luo0412/coolma>

- 16 built-in echoes: `src/components/echo/echoBuiltins/`
- Runtime: `src/components/echo/echoRuntime.js`
- 14 rune templates: `src/components/rune/runeTemplates/`
- 11 Jest suites: `tests/unit/echo/`

PRs welcome. Slow but real.

— luo0412