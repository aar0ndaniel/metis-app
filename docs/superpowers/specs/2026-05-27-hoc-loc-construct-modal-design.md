# HOC/LOC Construct Modal Project Memory

**Date:** 2026-05-27  
**Timestamp:** 2026-05-27 17:16:20 +00:00  
**Product area:** Metis model canvas, construct settings modal, higher-order construct modeling  
**Status:** Project memory note. Pencil redesign and implementation spec are pending user reference image and approval.

## Source Request

The user wants Metis to solve the Facebook second-order construct question by redesigning the construct modal first in Pencil, then later implementing the approved behavior in Metis.

## Core Idea

Metis should let a construct remain lower order by default, but expose a checkbox in the construct modal that marks the construct as a higher-order construct (HOC).

When the HOC checkbox is inactive:

- The construct behaves as a normal lower-order construct (LOC).
- The existing measurement model behavior remains: Reflective or Formative.

When the HOC checkbox is active:

- The construct is treated as a higher-order construct.
- The user still chooses the HOC measurement type: Reflective or Formative.
- The connected lower-order constructs determine the combined higher-order type:
  - HOC Reflective + LOC/sub-dimension reflective relationship implies reflective-reflective.
  - HOC Reflective + LOC/sub-dimension formative relationship implies reflective-formative.
  - HOC Formative + LOC/sub-dimension reflective relationship implies formative-reflective.
  - HOC Formative + LOC/sub-dimension formative relationship implies formative-formative.

## Main UX Problem

The direction of arrows between a HOC and LOCs can imply a measurement type that conflicts with the measurement type selected in the modal.

Example:

- The user selects a HOC measurement type of Reflective.
- Reflective HOC paths should go from HOC to LOC.
- But the user draws LOC to HOC arrows, which visually suggests a Formative HOC.

Metis needs to decide how to handle this mismatch without silently changing the user's model.

## Preferred Warning Flow To Explore

Before Metis switches arrows or changes measurement type, it should warn the user.

The warning should explain the mismatch carefully:

> `{construct hoc}` has a `{reflective}` measurement type selected, but the current paths suggest otherwise.

The warning should offer two clear actions:

- Keep Reflective
- Switch to Formative

This warning should prevent silent automatic correction and give the user control.

## Alternative Flow To Consider

When the HOC checkbox is active, the modal could let the user select LOCs directly. Metis would then draw the correct arrows automatically.

Concern: this could add friction because the user may not remember the full list of LOCs already on the canvas.

This option should still be explored in the Pencil redesign, but the warning-first approach may better fit the user's concern.

## Modal Redesign Notes

The new modal should make these states visible:

- Lower-order construct by default.
- Higher-order construct checkbox or toggle.
- HOC measurement type selection.
- Connected LOC/sub-dimension summary.
- Path direction compatibility warning when selected HOC type and drawn arrows conflict.
- Two-action conflict resolution: keep selected type or switch type.

The user will provide a reference image before the Pencil design is created.

## Open Questions

- Should Metis store explicit HOC metadata on constructs, or infer HOC status from HOC/LOC paths?
- Should HOC-LOC paths be stored as normal structural paths, separate measurement paths, or a new relation type?
- Should arrow correction happen immediately after the warning, or only when the user applies modal changes?
- Should the modal show all LOC candidates, only connected LOCs, or both?
- How should the R/seminr payload represent second-order constructs once the UI model is approved?

## Do Not Implement Yet

Do not implement this behavior until:

- The Pencil modal redesign is approved.
- The HOC/LOC data model is specified.
- The warning and arrow-correction behavior is explicitly approved.
- Relevant `ModelCanvas`, payload, tests, and R backend surfaces are inspected again immediately before changes.
