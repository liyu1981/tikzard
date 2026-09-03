# JSXGraph Migration Evaluation

## 1. What We Have Now (TikZ/TikZJax)

### Architecture
- **Engine**: `@rod2ik/tikzjax` — WebAssembly-based in-browser TikZ compiler
- **Pipeline**: User writes LaTeX → `script[type="text/tikz"]` → WASM worker pool compiles → DOM mutation → SVG appears
- **Boot cost**: Dynamic script load + WASM initialization (status "booting" → "ready")
- **Render cost**: WASM compilation per edit (debounced 600ms), 45s timeout
- **Failure mode**: Binary — compiles or doesn't; error messages come from TeX engine, often cryptic

### Agent Integration Surface
| Layer | What exists | Complexity |
|---|---|---|
| **Renderer hook** (`useTikzRenderer`) | DOM script injection, MutationObserver for SVG, WASM boot + timeout | ~120 lines, 4 useEffect chains |
| **Compile logs** (`compile-logs.ts`) | Intercept console during WASM run, push structured logs | Separate module |
| **Tools** (`tools.ts`) | 9 tools: get/set source, render status, version save, packages/libraries, skill loading | ~280 lines |
| **Skills** (4 bundled) | Core style, domain packages, function plots, node diagrams | ~4 SKILL.md files |
| **System prompt** | ~600 tokens of TikZ-specific instructions (format rules, package list, compilation caveats) | Embedded in i18n JSON |
| **Bridge** (`editor-mutations.ts`) | Agent → React state interface for code/packages/libraries | Interface + implementation |
| **Packages/libraries metadata** | 8 packages + ~12 library IDs with validation | Separate module |

### Pain Points
1. **Compilation is opaque**: Agent writes TikZ → waits → binary pass/fail → reads cryptic TeX errors → retries. No incremental feedback.
2. **System prompt is loaded with caveats**: "Never write `\usepackage`", "Never suggest packages outside the 8", "Always send complete tikzpicture", "No preamble". These exist because TikZJax is fragile.
3. **No interactivity**: Output is a static SVG. No dragging, no live-update, no constraint testing. Agent cannot verify its own output visually.
4. **Render latency**: WASM compile cycle means 1–3s feedback loop per edit.
5. **Package/library management**: Entire subsystem (tools + UI + validation) exists solely to work around `\usepackage` failures in TikZJax.

---

## 2. What JSXGraph Offers

### Core Capabilities
- **Pure JavaScript** — no WASM, no workers, no compilation step
- **Interactive geometry**: Points, lines, circles, polygons, gliders, intersections, reflections, rotations
- **Function plotting**: `board.create('functiongraph', [f])` — plots any JS function
- **Data visualization**: Charts, bar charts, scatter plots
- **Constraint-based**: Elements defined by geometric dependencies (midpoint, perpendicular, glider on curve) — relationships survive dragging
- **Immediate rendering**: `JXG.JSXGraph.initBoard()` → board ready in <50ms
- **Export**: SVG, PNG, PDF via built-in methods
- **Dual license**: MIT or LGPL — permissive for embedding
- **npm**: `jsxgraph@1.13.2`, actively maintained (last publish 2 weeks ago)

### What's Different from TikZ
| Dimension | TikZ/TikZJax | JSXGraph |
|---|---|---|
| Language | LaTeX (domain-specific) | JavaScript (general) |
| Compilation | WASM TeX engine | Direct JS execution |
| Interactivity | None (static SVG) | Full (drag, constraints, live labels) |
| Render time | 1–3s (WASM compile) | <50ms (JS execution) |
| Error feedback | TeX engine errors (cryptic) | JS console errors (standard) |
| AI code generation | LaTeX — LLMs know it well | JavaScript — LLMs know it very well |
| AI verification | Cannot self-test output | Can read board state, test invariants |
| Domain packages | 8 specialized (circuitikz, chemfig...) | Built-in: geometry, plotting, data viz |
| Learning curve | High (LaTeX + TikZ syntax) | Medium (JS + JSXGraph API) |

---

## 3. AI Assistant Fitness Analysis

### Current System: TikZ

**Strengths for AI:**
- LLMs have extensive training data on TikZ/LaTeX
- TikZ is the "lingua franca" of academic figure generation
- Declarative syntax maps well to natural language descriptions

**Weaknesses for AI:**
- **No feedback loop**: Agent writes code, waits for compile, reads error. Cannot inspect its own output.
- **Opaque errors**: TeX error messages are notoriously unfriendly; agent must pattern-match on cryptic output
- **Caveat-laden prompts**: System prompt is 30%+ "never do X" rules that exist because the WASM engine is fragile
- **No self-verification**: Agent cannot drag a point to check if a construction is correct
- **Binary success**: Compile succeeds or fails. No partial feedback ("this part looks right, but that part is wrong").

### JSXGraph: What Changes

**Strengths for AI (improved):**
1. **Immediate feedback**: Agent writes JS, board renders in <50ms. No compile wait.
2. **Self-verification possible**: Agent can call `board.getAllObjects()`, read element coordinates, test geometric relationships programmatically.
3. **Standard errors**: JS console errors are well-structured; agent can read stack traces.
4. **Simpler prompt**: No "never write `\usepackage`" rules. No package/library management subsystem. Just "write JSXGraph JavaScript."
5. **Constraint testing**: Agent can verify invariants: "is angle ABC always 90°?" by reading `B.X()`, `B.Y()` etc.
6. **Interactive output**: Agent can create constructions where users drag points — the "dynamic geometry" promise that JSXGraph's AI best practices emphasize.

**Weaknesses for AI (new risks):**
1. **API hallucination**: JSXGraph's AI best practices explicitly warn about this — "AI models occasionally invent JSXGraph methods or attributes that don't exist." Mitigated by smaller API surface + tool use.
2. **Less training data**: Fewer JSXGraph examples in training corpora vs. TikZ. But JSXGraph's JS API is more intuitive.
3. **Constraint pitfalls**: The #1 mistake per JSXGraph AI best practices is creating "static" constructions with fixed coordinates instead of true dependencies. This is exactly the kind of thing an agent can be coached to avoid.

### The Critical Question: Can the Agent Self-Test?

**With TikZ**: No. Agent writes LaTeX → compile → pass/fail → try again. No inspection.

**With JSXGraph**: Yes. Agent can:
```javascript
// After creating a construction, verify invariants:
const A = board.objects.A;
const B = board.objects.B;
const C = board.objects.C;
const angle = Math.atan2(C.Y()-B.Y(), C.X()-B.X()) - Math.atan2(A.Y()-B.Y(), A.X()-B.X());
console.log(Math.abs(angle * 180 / Math.PI - 90) < 0.001 ? "INVARIANT HOLDS" : "INVARIANT BROKEN");
```

This is a fundamental improvement. The agent goes from "throw code over the wall and hope" to "write, test, verify, iterate."

---

## 4. System Complexity Comparison

### Current System: High Hidden Complexity
```
┌─────────────────────────────────────────────────┐
│  Agent System Prompt (~600 tokens)              │
│  ├─ Format rules ("exactly one tikzpicture")    │
│  ├─ 8-package whitelist                         │
│  ├─ 12-library whitelist                        │
│  ├─ "Never" caveats (5+ rules)                  │
│  └─ Compilation workflow instructions           │
├─────────────────────────────────────────────────┤
│  Tools (9 tools, ~280 lines)                    │
│  ├─ get/set source                              │
│  ├─ get/set packages (validation logic)         │
│  ├─ get/set libraries (validation logic)        │
│  ├─ render status                               │
│  ├─ version save                                │
│  └─ skill loading                               │
├─────────────────────────────────────────────────┤
│  Renderer (120 lines, 4 useEffect chains)       │
│  ├─ WASM boot sequence                          │
│  ├─ Script injection + DOM mutation             │
│  ├─ MutationObserver for SVG detection          │
│  └─ Timeout handling (45s)                      │
├─────────────────────────────────────────────────┤
│  Compile Logs (intercept WASM console output)   │
├─────────────────────────────────────────────────┤
│  Package/Library Metadata (validation, hints)   │
├─────────────────────────────────────────────────┤
│  Skills (4 SKILL.md files, ~400 lines)          │
│  ├─ Core style guide                            │
│  ├─ Domain package recipes                      │
│  ├─ Function plot recipes (no pgfplots!)        │
│  └─ Node diagram recipes                        │
└─────────────────────────────────────────────────┘
```

### JSXGraph System: Lower Complexity
```
┌─────────────────────────────────────────────────┐
│  Agent System Prompt (~300 tokens)               │
│  ├─ JSXGraph API overview (board, elements)     │
│  ├─ Constraint-based design rules               │
│  └─ Self-verification instructions              │
├─────────────────────────────────────────────────┤
│  Tools (5 tools, ~120 lines)                    │
│  ├─ get/set source                              │
│  ├─ render status (trivial: board exists?)      │
│  ├─ verify invariants (NEW: agent self-test)    │
│  ├─ version save                                │
│  └─ skill loading                               │
├─────────────────────────────────────────────────┤
│  Renderer (30 lines, 1 useEffect)               │
│  ├─ Import jsxgraph npm package                 │
│  ├─ JXG.JSXGraph.initBoard()                   │
│  └─ board.removeBoard() on cleanup             │
├─────────────────────────────────────────────────┤
│  No compile logs needed (JS errors are natural) │
├─────────────────────────────────────────────────┤
│  No package/library management needed           │
├─────────────────────────────────────────────────┤
│  Skills (2-3 SKILL.md files, ~200 lines)        │
│  ├─ Constraint-based design guide               │
│  ├─ Function plot recipes                       │
│  └─ (geometry recipes — native to JSXGraph)     │
└─────────────────────────────────────────────────┘
```

### Quantified Reduction

| Component | TikZ Now | JSXGraph | Change |
|---|---|---|---|
| System prompt tokens | ~600 | ~300 | **-50%** |
| Agent tools | 9 | 5-6 | **-33%** |
| Renderer code | 120 lines | 30 lines | **-75%** |
| Compile infrastructure | 3 modules | 0 | **-100%** |
| Package/library management | 1 module + UI | 0 | **-100%** |
| Skills | 4 files | 2-3 files | **-30%** |
| "Never do X" rules | 5+ | 0-1 | **-90%** |

---

## 5. Migration Plan (If Approved)

### Phase 1: Parallel Engine (1-2 weeks)
- Add `jsxgraph` npm dependency
- Create `use-jsxgraph-renderer.ts` hook alongside `use-tikz-renderer.ts`
- Create `JsxGraphWorkbench` component as alternative to `TikzWorkbench`
- Keep TikZ as fallback during transition

### Phase 2: Agent Integration (1 week)
- Simplify agent tools (remove package/library tools, add `verify_invariants` tool)
- Rewrite system prompt for JSXGraph
- Update skills: replace 4 TikZ skills with 2-3 JSXGraph skills
- Add agent self-verification loop

### Phase 3: Editor + UX (1 week)
- Replace code editor: LaTeX syntax → JavaScript syntax
- Add interactive preview (drag points, live labels)
- Simplify compile logs → error console
- Remove package/library selectors from UI

### Phase 4: Migration + Cleanup (1 week)
- Migrate existing saved documents (LaTeX → JSXGraph JS)
- Remove TikZJax dependency and all TikZ-specific code
- Update i18n strings
- Full test pass

### Total estimate: 4-6 weeks

---

## 6. Recommendation

### Switch to JSXGraph — **YES, with caveats**

**Why:**
1. **Agent fitness improves dramatically**: Self-verification, immediate feedback, simpler prompts, no cryptic errors
2. **System complexity drops ~50%**: Fewer modules, fewer tools, shorter prompts, no compile infrastructure
3. **The #1 AI risk (hallucinated API) is manageable**: Smaller API surface, standard JS errors, can be mitigated with tool use and validation
4. **Interactive output is a product upgrade**: Users can drag points, test constructions — something TikZ can never offer
5. **JSXGraph's AI best practices exist**: The project has already thought deeply about AI authoring; we can adopt their guidance directly

**Caveats:**
1. **Lost LaTeX ecosystem**: circuitikz, chemfig, yquant, tikz-feynhand — these domain packages don't exist in JSXGraph. If the product needs Feynman diagrams or chemical structures, this is a blocker.
2. **Training data gap**: LLMs have less JSXGraph training data than TikZ. The agent will need more tool-assisted verification initially.
3. **User migration**: Existing users with TikZ knowledge face a learning curve. Consider a "TikZ → JSXGraph" translator as a bonus feature.

**The core question answered:** If we switch to JSXGraph, system complexity drops AND agent assistant fitness improves. The constraint-based, JavaScript-native, immediately-renderable nature of JSXGraph is fundamentally a better fit for AI-assisted authoring than a compile-on-every-change LaTeX WASM engine.
