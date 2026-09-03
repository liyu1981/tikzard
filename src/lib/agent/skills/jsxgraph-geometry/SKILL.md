---
name: jsxgraph-geometry
description: Recipes for geometric constructions in JSXGraph — triangles, circles, polygons, angles, perpendiculars, bisectors, and classic constructions. Use when the user asks for geometric figures, proofs, or construction diagrams.
---

# Geometric Constructions

JSXGraph is built for interactive geometry. Every element can be dragged, and dependent elements follow automatically.

## Basic Shapes

### Triangle
```javascript
var A = board.create('point', [0, 0], { name: 'A' });
var B = board.create('point', [4, 0], { name: 'B' });
var C = board.create('point', [2, 3], { name: 'C' });
var tri = board.create('polygon', [A, B, C], {
  fillColor: 'lightblue',
  fillOpacity: 0.3
});
```

### Circle
```javascript
// Center + point on circle
var O = board.create('point', [0, 0], { name: 'O' });
var P = board.create('point', [2, 0], { name: 'P' });
var circ = board.create('circle', [O, P], { strokeColor: 'blue' });

// Center + radius
var circ2 = board.create('circle', [[0, 0], 2], {
  strokeColor: 'red',
  strokeDasharray: [5, 5]
});
```

### Ellipse
```javascript
board.create('ellipse', [F1, F2, 5], { strokeColor: 'green' });
```

### Arc
```javascript
board.create('arc', [center, start, end], { strokeColor: 'orange' });
```

## Lines and Rays

### Line through two points
```javascript
board.create('line', [A, B], { strokeColor: 'black' });
```

### Segment
```javascript
board.create('segment', [A, B], { strokeColor: 'gray' });
```

### Ray
```javascript
board.create('ray', [A, B], { strokeColor: 'purple' });
```

### Perpendicular
```javascript
var perp = board.create('perpendicular', [lineAB, C]);
```

### Parallel
```javascript
board.create('parallel', [lineAB, pointC]);
```

### Angle bisector
```javascript
board.create('bisector', [A, B, C]);
```

## Measurements

### Angle
```javascript
var angle = board.create('angle', [A, B, C], {
  radius: 1,
  fillColor: 'yellow',
  fillOpacity: 0.3
});
// Access value: angle.Value() (in radians)
```

### Distance
```javascript
// Display as text
board.create('text', [
  function() { return (A.X() + B.X()) / 2; },
  function() { return (A.Y() + B.Y()) / 2 + 0.3; },
  function() { return 'd = ' + JXG.Math.distance(A.coords.usrCoords.slice(1), B.coords.usrCoords.slice(1)).toFixed(2); }
]);
```

### Midpoint
```javascript
var M = board.create('midpoint', [A, B], { name: 'M' });
```

## Classic Constructions

### Perpendicular bisector
```javascript
var M = board.create('midpoint', [A, B]);
board.create('perpendicular', [lineAB, M]);
```

### Circumcircle
```javascript
board.create('circumcircle', [A, B, C]);
```

### Incircle
```javascript
board.create('incircle', [A, B, C]);
```

### Perpendicular from point to line
```javascript
board.create('perpendicular', [line, point]);
```

## Styling Elements

```javascript
board.create('point', [1, 1], {
  name: 'A',
  face: 'o',           // 'o', 'x', '+', '[]', '<>', '团'
  size: 4,
  strokeColor: 'red',
  fillColor: 'red',
  withLabel: true,
  label: { fontSize: 14, offset: [5, 5] }
});
```

## Invariant Checking

After building, always verify:
- If points are dragged, do circles/lines follow?
- Do angles stay correct?
- Are labels updating?

Use `verify_invariants` to test:
```javascript
// Is P always on the circle?
Math.abs(JXG.Math.distance([O.X(), O.Y()], [P.X(), P.Y()]) - radius) < 0.001
```
