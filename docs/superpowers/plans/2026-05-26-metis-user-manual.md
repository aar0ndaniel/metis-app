# Metis User Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a full, detailed Word manual that teaches general users how to use Metis for PLS-SEM workflows from setup through reporting.

**Architecture:** The manual will combine local Metis product behavior, project memory, landing-page docs, and method guidance paraphrased from the Hair et al and SEMinR markdown chapter folders. Screenshots will be captured from the running Metis Vite app and embedded as figures with concise captions.

**Tech Stack:** Metis Vite app at `http://127.0.0.1:5173`; Codex Browser screenshots; bundled Python runtime with `python-docx`; Documents skill render/QA workflow.

---

### Task 1: Confirm Sources and Evidence

**Files:**
- Read: `C:\Users\aaron\dev\metis\PROJECT_MEMORY.md`
- Read: `C:\Users\aaron\dev\landingpage\docs.html`
- Read: `C:\Users\aaron\dev\Hair_Book_Chapters_MD\*.md`
- Read: `C:\Users\aaron\dev\SEMinR_Book_Chapters_MD\*.md`

- [ ] **Step 1: Confirm local source inventory**

Run:

```powershell
rg --files C:\Users\aaron\dev\Hair_Book_Chapters_MD C:\Users\aaron\dev\SEMinR_Book_Chapters_MD C:\Users\aaron\dev\metis C:\Users\aaron\dev\landingpage
```

Expected: Source markdown, app files, project memory, and landing docs are discoverable.

- [ ] **Step 2: Extract chapter-level concepts**

Use the local markdown sources to map concepts to manual chapters:

```text
SEM foundations -> introduction and model basics
Path specification and data -> workspace, import, model canvas
PLS estimation -> run settings and calculation flow
Reflective measurement -> construct setup and measurement results
Formative measurement -> formative setup, weights, VIF, bootstrapping
Structural assessment -> path coefficients, R2, f2, VIF, fit, diagnostics
Mediation/moderation -> model patterns and bootstrap interpretation
Advanced methods -> IPMA, NCA, cIPMA, prediction-oriented cautions
```

Expected: The manual uses the chapters as guidance without copying their prose.

- [ ] **Step 3: Keep the tone guardrails**

Apply these writing constraints:

```text
Use plain, specific sentences.
Avoid promotional claims and generic importance language.
Avoid "not only ... but" patterns, false ranges, rule-of-three padding, and inflated ecosystem claims.
Use straight quotes and normal punctuation where possible.
Describe what Metis does, when to use it, and what the user should check.
```

Expected: The manual sounds like a practical software manual, not AI marketing copy.

### Task 2: Capture Screenshot Assets

**Files:**
- Create folder: `C:\Users\aaron\dev\metis_manual_assets\screenshots`
- Use app: `http://127.0.0.1:5173`

- [ ] **Step 1: Verify app server**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:5173 -TimeoutSec 5
```

Expected: HTTP 200 from the Vite development server.

- [ ] **Step 2: Capture first-launch and setup screens**

Capture:

```text
setup-wizard.png
installer-preview.png
workspace-home.png
```

Expected: Screenshots show installation/setup and the first real app surface.

- [ ] **Step 3: Capture workflow screens**

Capture:

```text
dataset-import.png
data-view.png
model-canvas.png
construct-properties.png
analysis-menu.png
pls-settings.png
bootstrap-settings.png
plspredict-settings.png
advanced-analysis.png
results-view.png
tark-report.png
preferences.png
```

Expected: Images cover the parts users need to understand the manual.

- [ ] **Step 4: Review screenshots**

Check every screenshot for:

```text
Readable text
No blank app state unless it is intentionally documenting an empty first screen
No loading spinners
No modal clipped offscreen
No unrelated browser chrome
```

Expected: Screenshots are suitable for embedding in a Word manual.

### Task 3: Draft the Manual Content

**Files:**
- Create: `C:\Users\aaron\dev\Metis User Manual - Detailed.docx`
- Optional build script: `C:\Users\aaron\dev\build_metis_manual.py`

- [ ] **Step 1: Use a manual structure**

Draft these chapters:

```text
1. About Metis
2. Installation and first launch
3. Workspaces, models, datasets, and results
4. Importing and checking data
5. Building a model on the canvas
6. Reflective and formative measurement models
7. Running PLS-SEM
8. Reading PLS-SEM results
9. Bootstrapping
10. Mediation
11. Moderation
12. PLSpredict
13. Advanced analysis: IPMA, NCA, and cIPMA
14. Tark reporting
15. Exporting, R scripts, preferences, and troubleshooting
16. Glossary and source notes
```

Expected: The manual starts with practical use and introduces method concepts only when the user needs them.

- [ ] **Step 2: Write procedures as numbered steps**

Use numbered procedures for workflows:

```text
Create a workspace
Import a dataset
Create a model
Add constructs and indicators
Run PLS-SEM
Run bootstrap
Run PLSpredict
Run advanced analysis
Create a Tark report
Export results
```

Expected: A new user can follow the manual from start to finish.

- [ ] **Step 3: Add cautions where method misuse is common**

Include practical cautions:

```text
PLS-SEM does not prove causality by itself.
Sample size still matters.
Thresholds are guidelines, not automatic pass/fail rules.
Do not delete indicators only to improve numbers.
Reflective and formative constructs are assessed differently.
Bootstrapping can vary slightly across runs.
Tark prepares report-ready output; it does not write the research argument.
```

Expected: The manual helps users avoid common interpretation mistakes.

### Task 4: Build the Word Document

**Files:**
- Create: `C:\Users\aaron\dev\Metis User Manual - Detailed.docx`

- [ ] **Step 1: Apply a restrained document style**

Use:

```text
US Letter portrait
1 inch margins
Arial or Aptos/Calibri body
Black headings
Black body text
No color tables
No decorative colors
Simple figure captions
Real Word heading styles
Automatic table of contents placeholder or static contents list
```

Expected: The document follows the user's request for black headings and black body text.

- [ ] **Step 2: Embed screenshots with captions**

For each included screenshot:

```text
Insert image at readable width.
Add "Figure N. ..." caption.
Keep caption close to image.
Avoid placing a screenshot immediately before a page break if it leaves a large gap.
```

Expected: The manual is usable as a printed or shared Word document.

- [ ] **Step 3: Add glossary and source notes**

Include source notes:

```text
Metis project memory and app screens
Metis public documentation page
Hair et al markdown chapter folder
SEMinR markdown chapter folder
```

Expected: Readers know the manual is based on Metis behavior plus PLS-SEM method guidance.

### Task 5: Verify the Manual

**Files:**
- Verify: `C:\Users\aaron\dev\Metis User Manual - Detailed.docx`
- Render output: `C:\Users\aaron\dev\metis_manual_render`

- [ ] **Step 1: Structural QA**

Check:

```text
Document opens as a DOCX package.
Heading styles are present.
Images are embedded.
No tables are used unless needed for a concise checklist or glossary.
No hidden tracked changes or comments.
No copied long source passages.
```

Expected: The document is structurally sound.

- [ ] **Step 2: Render QA**

Run the Documents skill renderer:

```powershell
C:\Users\aaron\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe C:\Users\aaron\.codex\plugins\cache\openai-primary-runtime\documents\26.521.10419\skills\documents\render_docx.py "C:\Users\aaron\dev\Metis User Manual - Detailed.docx" --output_dir C:\Users\aaron\dev\metis_manual_render
```

Expected: Page PNGs are created if LibreOffice is available.

- [ ] **Step 3: Fallback if rendering is unavailable**

If LibreOffice is missing, perform structural QA and disclose:

```text
The DOCX was created and structurally checked, but visual render QA could not be completed because LibreOffice/soffice is not installed or not discoverable.
```

Expected: The final answer is accurate about verification.
