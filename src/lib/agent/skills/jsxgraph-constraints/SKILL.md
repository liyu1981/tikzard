---
name: jsxgraph-constraints
description: Constraint-based design patterns for JSXGraph — how to create constructions where geometric relationships survive dragging. Use when building interactive geometry, dynamic figures, or constructions where points are moved by the user.
---

# Constraint-Based Design

JSXGraph constructions should be **dynamic**: relationships between elements survive dragging. This guide shows how to avoid the #1 mistake — static constructions with fixed coordinates.

## The Core Rule

**Only use free points where the user is actually supposed to have full freedom.** Define every other element through geometric dependencies so the construction behaves like one made in a dynamic geometry system.

## Free vs. Dependent Elements

### Free elements (user drags freely)
```javascript
var A = board.create('point', [0, 0], { name: 'A' });
var B = board.create('point', [4, 0], { name: 'B' });
```

### Dependent elements (computed from parents)
```javascript
// Midpoint — moves when A or B moves
var M = board.create('midpoint', [A, B], { name: 'M' });

// Perpendicular line — follows A and B
var perp = board.create('perpendicular', [lineAB, C], {
  strokeColor: 'red'
});

// Glider — constrained to a curve
var P = board.create('glider', [1, 2, curve], { name: 'P' });

// Intersection — recomputes when parents change
var I = board.create('intersection', [curve1, curve2, 0]);
```

## Common Patterns

### Right triangle (Thales circle)
```javascript
var A = board.create('point', [0, 0], { name: 'A' });
var B = board.create('point', [4, 0], { name: 'B' });
var c = board.create('circle', [
    function() { return [(A.X() + B.X()) / 2, (A.Y() + B.Y()) / 2]; },
    A
]);
var C = board.create('glider', [1, 2, c], { name: 'C' });
// Angle at C is ALWAYS 90° — drag A, B, or C to verify
```

### Parallel lines
```javascript
var L = board.create('line', [A, B]);
var M = board.create('point', [2, 2]);
var parallel = board.create('parallel', [L, M]);
```

### Reflection
```javascript
var reflected = board.create('reflection', [P, line]);
```

### Locus
```javascript
var locus = board.create('locus', [P, 200]);
```

## Verification

After creating a construction, mentally check:
1. If each draggable point is moved, do all stated properties still hold?
2. Are there any elements that would "detach" from their parents?
3. Are labels updating live?

Use the `verify_invariants` tool to test programmatically:
```javascript
// Check angle ABC is 90°
Math.abs(JXG.Math.rad(A, B, C) * 180 / Math.PI - 90) < 0.001
```
